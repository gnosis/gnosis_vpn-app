//! Retained per-endpoint traffic and rolling-window projection.
//!
//! The model owns what the daemon deliberately does not: a short history of
//! completed seconds per remote endpoint and the rolling window the globe shows.
//! Remote addresses stay inside this module. A frame names each endpoint only by
//! an opaque id that is stable for the life of the model and cannot be reversed
//! into an address.

use std::collections::hash_map::RandomState;
use std::collections::{BTreeMap, HashMap};
use std::hash::BuildHasher;
use std::net::IpAddr;

use serde::Serialize;

use super::protocol::{Batch, Direction, PROTOCOL_VERSION};

/// Completed seconds summed into each endpoint's total.
pub const WINDOW_SECONDS: u64 = 10;
/// Busiest endpoints a frame carries; quieter ones are counted, not listed.
pub const MAX_ENDPOINTS: usize = 48;

/// Bytes exchanged with one remote endpoint over the rolling window.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Endpoint {
    /// Opaque, stable for the life of the model. Not derived from the address in
    /// any way the renderer could reverse.
    pub id: String,
    pub sent: u64,
    pub received: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Frame {
    pub window_seconds: u64,
    pub current_second: u64,
    /// Completed seconds inside the window. Below `window_seconds` while capture
    /// has run for less than a full window.
    pub observed_seconds: u64,
    /// Endpoints with traffic in both directions in the window, busiest first.
    pub endpoints: Vec<Endpoint>,
    /// Endpoints with traffic in the window that did not fit into `endpoints`.
    pub omitted_endpoints: usize,
}

#[derive(Clone, Copy, Default)]
struct Totals {
    sent: u64,
    received: u64,
}

#[derive(Default)]
pub struct Model {
    /// Per-second totals per endpoint, including the second still being captured.
    buckets: BTreeMap<u64, HashMap<IpAddr, Totals>>,
    current_second: u64,
    /// Randomly keyed, so ids differ between app runs and cannot be precomputed.
    ids: RandomState,
}

impl Model {
    /// Forgets all traffic. Endpoint ids stay stable so a returning endpoint
    /// keeps its place on the globe.
    pub fn reset(&mut self) {
        self.buckets.clear();
        self.current_second = 0;
    }

    /// Applies one batch.
    ///
    /// A batch from another protocol version is refused so a daemon/app mismatch
    /// surfaces instead of producing an empty view.
    pub fn ingest(&mut self, batch: &Batch) -> Result<(), String> {
        if batch.protocol != PROTOCOL_VERSION {
            return Err(format!(
                "The Gnosis VPN service speaks traffic protocol {}, this app needs {}. Update the client and app together.",
                batch.protocol, PROTOCOL_VERSION
            ));
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
                .entry(delta.target)
                .or_default();
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

    fn id(&self, target: &IpAddr) -> String {
        format!("{:016x}", self.ids.hash_one(target))
    }

    /// Sums each endpoint's traffic over the last [`WINDOW_SECONDS`] completed
    /// seconds. The second still being captured is left out so totals do not
    /// ramp up within a second.
    ///
    /// Only endpoints that exchanged traffic in both directions are listed.
    /// One-way traffic is not a connection: a server retrying on a socket a VPN
    /// cut off, an unanswered probe, or an inbound scan.
    pub fn project(&self) -> Frame {
        let now = self.current_second;
        let first = now.saturating_sub(WINDOW_SECONDS);

        let mut totals: HashMap<IpAddr, Totals> = HashMap::new();
        for (_, endpoints) in self.buckets.range(first..now) {
            for (target, bucket) in endpoints {
                let total = totals.entry(*target).or_default();
                total.sent = total.sent.saturating_add(bucket.sent);
                total.received = total.received.saturating_add(bucket.received);
            }
        }

        let mut endpoints: Vec<Endpoint> = totals
            .iter()
            .filter(|(_, total)| total.sent > 0 && total.received > 0)
            .map(|(target, total)| Endpoint {
                id: self.id(target),
                sent: total.sent,
                received: total.received,
            })
            .collect();
        // Ties fall back to the id so the order is stable between frames.
        endpoints.sort_unstable_by(|a, b| {
            (b.sent + b.received)
                .cmp(&(a.sent + a.received))
                .then_with(|| a.id.cmp(&b.id))
        });
        let omitted_endpoints = endpoints.len().saturating_sub(MAX_ENDPOINTS);
        endpoints.truncate(MAX_ENDPOINTS);

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
    use super::super::protocol::Delta;
    use super::*;

    const A: &str = "203.0.113.9";
    const B: &str = "198.51.100.4";

    fn delta(second: u64, target: &str, direction: Direction, bytes: u64) -> Delta {
        Delta {
            second,
            target: target.parse().expect("ip"),
            direction,
            bytes,
        }
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
