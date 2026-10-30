//! Per-endpoint history and rolling-window projection; addresses stay in here, frames carry opaque ids.

use std::collections::hash_map::RandomState;
use std::collections::{BTreeMap, HashMap};
use std::hash::BuildHasher;
use std::net::IpAddr;

use serde::Serialize;

use gnosis_vpn_lib::traffic::{Batch, Direction};

/// Completed seconds summed into each endpoint's total.
pub const WINDOW_SECONDS: u64 = 10;
/// Per side (wire and tunnel); quieter endpoints are counted, not listed.
pub const MAX_ENDPOINTS: usize = 48;

/// Bytes exchanged with one remote endpoint over the rolling window.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Endpoint {
    /// Keyed hash of the address, irreversible for the renderer.
    pub id: String,
    pub sent: u64,
    pub received: u64,
    /// Announced by a HOPR node; says nothing about which process exchanged the traffic.
    pub hopr_peer: bool,
    /// Destination inside the VPN tunnel rather than a next hop on the wire.
    pub tunnel: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Frame {
    pub window_seconds: u64,
    pub current_second: u64,
    /// Below `window_seconds` until capture has run for a full window.
    pub observed_seconds: u64,
    /// Wire endpoints first, then tunnel destinations, each busiest first.
    pub endpoints: Vec<Endpoint>,
    /// Endpoints with traffic in the window that did not fit into `endpoints`.
    pub omitted_endpoints: usize,
}

#[derive(Clone, Copy, Default)]
struct Totals {
    sent: u64,
    received: u64,
    hopr_peer: bool,
}

/// The same address as wire next hop and as tunnel destination is two endpoints.
type Key = (IpAddr, bool);

#[derive(Default)]
pub struct Model {
    /// Per-second totals per endpoint, including the second still being captured.
    buckets: BTreeMap<u64, HashMap<Key, Totals>>,
    current_second: u64,
    /// Randomly keyed, so ids differ between app runs and cannot be precomputed.
    ids: RandomState,
}

impl Model {
    /// Keeps the id hasher so a returning endpoint keeps its place on the globe.
    pub fn reset(&mut self) {
        self.buckets.clear();
        self.current_second = 0;
    }

    /// Refuses foreign protocol batches so a daemon/app mismatch surfaces instead of an empty view.
    pub fn ingest(&mut self, batch: &Batch) -> Result<(), String> {
        if let Some(reason) = super::incompatible_protocol(batch.protocol) {
            return Err(reason);
        }
        self.current_second = self.current_second.max(batch.elapsed_ms / 1000);

        let oldest = self.oldest_retained_second();
        for delta in &batch.deltas {
            if delta.second < oldest || delta.bytes == 0 {
                continue;
            }
            let totals = self
                .buckets
                .entry(delta.second)
                .or_default()
                .entry((delta.target, delta.tunnel))
                .or_default();
            totals.hopr_peer |= delta.hopr_peer;
            match delta.direction {
                Direction::Upstream => totals.sent = totals.sent.saturating_add(delta.bytes),
                Direction::Downstream => {
                    totals.received = totals.received.saturating_add(delta.bytes)
                }
            }
        }
        self.prune();
        Ok(())
    }

    fn oldest_retained_second(&self) -> u64 {
        self.current_second.saturating_sub(WINDOW_SECONDS)
    }

    fn prune(&mut self) {
        let oldest = self.oldest_retained_second();
        self.buckets.retain(|second, _| *second >= oldest);
    }

    fn id(&self, key: &Key) -> String {
        format!("{:016x}", self.ids.hash_one(key))
    }

    /// Leaves out the second still being captured so totals do not ramp up within a second.
    pub fn project(&self) -> Frame {
        let now = self.current_second;
        let first = now.saturating_sub(WINDOW_SECONDS);

        let mut totals: HashMap<Key, Totals> = HashMap::new();
        for (_, endpoints) in self.buckets.range(first..now) {
            for (key, bucket) in endpoints {
                let total = totals.entry(*key).or_default();
                total.sent = total.sent.saturating_add(bucket.sent);
                total.received = total.received.saturating_add(bucket.received);
                total.hopr_peer |= bucket.hopr_peer;
            }
        }

        let mut endpoints = Vec::new();
        let mut omitted_endpoints = 0;
        for tunnel in [false, true] {
            let mut side: Vec<Endpoint> = totals
                .iter()
                .filter(|((_, on_tunnel), total)| {
                    let on_this_side = *on_tunnel == tunnel;
                    // One-way traffic is no connection: a retry on a socket the VPN cut off, a probe, a scan.
                    let is_two_way = total.sent > 0 && total.received > 0;
                    on_this_side && is_two_way
                })
                .map(|(key, total)| Endpoint {
                    id: self.id(key),
                    sent: total.sent,
                    received: total.received,
                    hopr_peer: total.hopr_peer,
                    tunnel,
                })
                .collect();
            // Ties fall back to the id so the order is stable between frames.
            side.sort_unstable_by(|a, b| {
                (b.sent + b.received)
                    .cmp(&(a.sent + a.received))
                    .then_with(|| a.id.cmp(&b.id))
            });
            omitted_endpoints += side.len().saturating_sub(MAX_ENDPOINTS);
            side.truncate(MAX_ENDPOINTS);
            endpoints.extend(side);
        }

        Frame {
            window_seconds: WINDOW_SECONDS,
            current_second: now,
            observed_seconds: now - first,
            endpoints,
            omitted_endpoints,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use gnosis_vpn_lib::traffic::{Delta, PROTOCOL_VERSION};

    const A: &str = "203.0.113.9";
    const B: &str = "198.51.100.4";

    fn delta(second: u64, target: &str, direction: Direction, bytes: u64) -> Delta {
        Delta {
            second,
            target: target.parse().expect("ip"),
            direction,
            bytes,
            hopr_peer: false,
            tunnel: false,
        }
    }

    fn tunnel_exchange(second: u64, target: &str, bytes: u64) -> Vec<Delta> {
        exchange(second, target, bytes)
            .into_iter()
            .map(|delta| Delta {
                tunnel: true,
                ..delta
            })
            .collect()
    }

    fn peer_exchange(second: u64, target: &str, bytes: u64) -> Vec<Delta> {
        exchange(second, target, bytes)
            .into_iter()
            .map(|delta| Delta {
                hopr_peer: true,
                ..delta
            })
            .collect()
    }

    /// One exchange: `bytes` in each direction.
    fn exchange(second: u64, target: &str, bytes: u64) -> Vec<Delta> {
        vec![
            delta(second, target, Direction::Upstream, bytes),
            delta(second, target, Direction::Downstream, bytes),
        ]
    }

    fn batch(sequence: u64, elapsed_ms: u64, deltas: Vec<Delta>) -> Batch {
        Batch {
            protocol: PROTOCOL_VERSION,
            session_id: 1,
            sequence,
            elapsed_ms,
            deltas,
            dropped_batches: 0,
        }
    }

    #[test]
    fn deltas_for_one_endpoint_accumulate_across_the_window() {
        let mut model = Model::default();
        model
            .ingest(&batch(
                0,
                3000,
                vec![
                    delta(0, A, Direction::Upstream, 100),
                    delta(1, A, Direction::Upstream, 50),
                    delta(2, A, Direction::Downstream, 900),
                ],
            ))
            .expect("ingest");
        let frame = model.project();
        assert_eq!(frame.endpoints.len(), 1);
        assert_eq!(frame.endpoints[0].sent, 150);
        assert_eq!(frame.endpoints[0].received, 900);
    }

    #[test]
    fn endpoints_stay_separate_and_busiest_comes_first() {
        let mut model = Model::default();
        model
            .ingest(&batch(
                0,
                1000,
                vec![
                    delta(0, A, Direction::Upstream, 10),
                    delta(0, B, Direction::Downstream, 500),
                    delta(0, B, Direction::Upstream, 5),
                    delta(0, A, Direction::Downstream, 20),
                ],
            ))
            .expect("ingest");
        let frame = model.project();
        assert_eq!(frame.endpoints.len(), 2);
        assert_eq!(frame.endpoints[0].received, 500);
        assert_eq!(frame.endpoints[1].sent, 10);
        assert_eq!(frame.endpoints[1].received, 20);
        assert_ne!(frame.endpoints[0].id, frame.endpoints[1].id);
    }

    #[test]
    fn the_second_still_being_captured_is_left_out() {
        let mut model = Model::default();
        model
            .ingest(&batch(
                0,
                500,
                vec![
                    delta(0, A, Direction::Upstream, 100),
                    delta(0, A, Direction::Downstream, 40),
                ],
            ))
            .expect("ingest");
        let frame = model.project();
        assert_eq!(frame.observed_seconds, 0);
        assert!(frame.endpoints.is_empty());

        model
            .ingest(&batch(1, 1000, Vec::new()))
            .expect("heartbeat");
        let frame = model.project();
        assert_eq!(frame.observed_seconds, 1);
        assert_eq!(frame.endpoints[0].sent, 100);
    }

    #[test]
    fn traffic_older_than_the_window_drops_out() {
        let mut model = Model::default();
        model
            .ingest(&batch(
                0,
                2000,
                vec![
                    delta(0, A, Direction::Upstream, 100),
                    delta(0, A, Direction::Downstream, 1),
                    delta(1, B, Direction::Upstream, 200),
                    delta(1, B, Direction::Downstream, 1),
                ],
            ))
            .expect("ingest");
        assert_eq!(model.project().endpoints.len(), 2);

        // At second 11 the window covers seconds 1..=10, so A's only second is gone.
        model
            .ingest(&batch(1, 11_000, Vec::new()))
            .expect("heartbeat");
        let frame = model.project();
        assert_eq!(frame.observed_seconds, WINDOW_SECONDS);
        assert_eq!(frame.endpoints.len(), 1);
        assert_eq!(frame.endpoints[0].sent, 200);

        model
            .ingest(&batch(2, 12_000, Vec::new()))
            .expect("heartbeat");
        assert!(model.project().endpoints.is_empty());
    }

    #[test]
    fn deltas_older_than_retention_are_ignored() {
        let mut model = Model::default();
        model
            .ingest(&batch(0, 30_000, Vec::new()))
            .expect("heartbeat");
        model
            .ingest(&batch(
                1,
                30_000,
                vec![delta(5, A, Direction::Upstream, 100)],
            ))
            .expect("ingest");
        assert!(model.project().endpoints.is_empty());
    }

    #[test]
    fn frames_list_at_most_the_busiest_endpoints() {
        let mut model = Model::default();
        let deltas = (0..(MAX_ENDPOINTS as u64 + 3))
            .flat_map(|n| {
                let target = format!("10.0.{}.{}", n / 256, n % 256);
                [
                    delta(0, &target, Direction::Upstream, 100 + n),
                    delta(0, &target, Direction::Downstream, 1),
                ]
            })
            .collect();
        model.ingest(&batch(0, 1000, deltas)).expect("ingest");
        let frame = model.project();
        assert_eq!(frame.endpoints.len(), MAX_ENDPOINTS);
        assert_eq!(frame.omitted_endpoints, 3);
        // The three quietest are the ones left out.
        assert!(frame.endpoints.iter().all(|endpoint| endpoint.sent >= 103));
    }

    #[test]
    fn ids_are_stable_and_never_reveal_the_address() {
        let mut model = Model::default();
        model
            .ingest(&batch(0, 1000, exchange(0, A, 1)))
            .expect("ingest");
        let first = model.project().endpoints[0].id.clone();
        assert!(!first.contains(A), "{first}");
        assert!(!first.contains("203"), "{first}");

        model.reset();
        model
            .ingest(&batch(0, 1000, exchange(0, A, 1)))
            .expect("ingest");
        assert_eq!(model.project().endpoints[0].id, first);

        let mut other = Model::default();
        other
            .ingest(&batch(0, 1000, exchange(0, A, 1)))
            .expect("ingest");
        assert_ne!(other.project().endpoints[0].id, first);
    }

    #[test]
    fn endpoints_the_daemon_marked_as_hopr_peers_are_flagged() {
        let mut model = Model::default();
        let mut deltas = peer_exchange(0, A, 100);
        deltas.extend(exchange(0, B, 50));
        model.ingest(&batch(0, 1000, deltas)).expect("ingest");
        let frame = model.project();
        assert_eq!(frame.endpoints.len(), 2);
        assert_eq!(frame.endpoints[0].sent, 100);
        assert!(frame.endpoints[0].hopr_peer);
        assert!(!frame.endpoints[1].hopr_peer);
    }

    #[test]
    fn an_endpoint_marked_in_any_second_of_the_window_stays_flagged() {
        // The daemon's peer snapshot can change while the endpoint is in view.
        let mut model = Model::default();
        let mut deltas = peer_exchange(0, A, 10);
        deltas.extend(exchange(1, A, 10));
        model.ingest(&batch(0, 2000, deltas)).expect("ingest");
        assert!(model.project().endpoints[0].hopr_peer);
    }

    #[test]
    fn tunnel_destinations_are_listed_apart_from_wire_endpoints() {
        // The same address seen on the wire and inside the tunnel is two dots.
        let mut model = Model::default();
        let mut deltas = exchange(0, A, 100);
        deltas.extend(tunnel_exchange(0, A, 40));
        model.ingest(&batch(0, 1000, deltas)).expect("ingest");
        let frame = model.project();
        assert_eq!(frame.endpoints.len(), 2);
        let wire = frame.endpoints.iter().find(|e| !e.tunnel).expect("wire");
        let inside = frame.endpoints.iter().find(|e| e.tunnel).expect("tunnel");
        assert_eq!(wire.sent, 100);
        assert_eq!(inside.sent, 40);
        assert_ne!(wire.id, inside.id);
    }

    #[test]
    fn wire_endpoints_and_tunnel_destinations_each_keep_their_own_limit() {
        let mut model = Model::default();
        let mut deltas: Vec<Delta> = (0..(MAX_ENDPOINTS as u64 + 3))
            .flat_map(|n| exchange(0, &format!("10.0.{}.{}", n / 256, n % 256), 100 + n))
            .collect();
        deltas.extend(tunnel_exchange(0, B, 1));
        model.ingest(&batch(0, 1000, deltas)).expect("ingest");
        let frame = model.project();
        assert_eq!(
            frame.endpoints.iter().filter(|e| !e.tunnel).count(),
            MAX_ENDPOINTS
        );
        assert_eq!(frame.endpoints.iter().filter(|e| e.tunnel).count(), 1);
        assert_eq!(frame.omitted_endpoints, 3);
    }

    #[test]
    fn frames_never_serialize_an_address() {
        let mut model = Model::default();
        model
            .ingest(&batch(0, 1000, exchange(0, A, 1)))
            .expect("ingest");
        let json = serde_json::to_string(&model.project()).expect("serialize");
        assert!(!json.contains(A), "{json}");
    }

    #[test]
    fn one_way_traffic_is_not_an_endpoint() {
        // Unanswered packets, such as a server retrying on a socket a VPN cut off.
        let mut model = Model::default();
        let mut deltas = vec![
            delta(0, A, Direction::Downstream, 300),
            delta(0, B, Direction::Upstream, 1200),
        ];
        deltas.extend(exchange(0, "192.0.2.7", 50));
        model.ingest(&batch(0, 1000, deltas)).expect("ingest");
        let frame = model.project();
        assert_eq!(frame.endpoints.len(), 1, "{:?}", frame.endpoints);
        assert_eq!(frame.endpoints[0].sent, 50);
        assert_eq!(frame.omitted_endpoints, 0);
    }

    #[test]
    fn batches_from_another_protocol_are_refused() {
        let mut model = Model::default();
        let mut foreign = batch(0, 5000, vec![delta(4, A, Direction::Upstream, 10)]);
        foreign.protocol = PROTOCOL_VERSION + 1;
        let error = model.ingest(&foreign).expect_err("foreign protocol");
        assert!(error.contains("traffic protocol"), "{error}");
        assert_eq!(model.project().current_second, 0);
    }

    #[test]
    fn reset_clears_history() {
        let mut model = Model::default();
        model
            .ingest(&batch(0, 1000, vec![delta(0, A, Direction::Upstream, 10)]))
            .expect("ingest");
        model.reset();
        let frame = model.project();
        assert_eq!(frame.current_second, 0);
        assert_eq!(frame.observed_seconds, 0);
        assert!(frame.endpoints.is_empty());
    }
}
