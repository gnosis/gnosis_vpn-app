//! The app's view of the root daemon's traffic capture API.
//!
//! These types mirror the JSON the daemon speaks (`gnosis_vpn_lib::traffic`).
//! They are declared here rather than imported so the app can talk to a released
//! daemon without pinning its build to an unreleased library commit; the daemon
//! stamps every batch with [`PROTOCOL_VERSION`] and mismatches are rejected.

use serde::{Deserialize, Serialize};

use std::net::IpAddr;

/// Must match the daemon's protocol version.
pub const PROTOCOL_VERSION: u16 = 5;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Interface {
    pub id: String,
    pub name: String,
    pub addresses: Vec<IpAddr>,
    pub is_default: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Direction {
    Upstream,
    Downstream,
}

/// Bytes observed for one remote endpoint and direction in one second. Several
/// deltas may cover the same second and endpoint; consumers add them.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct Delta {
    pub second: u64,
    pub target: IpAddr,
    pub direction: Direction,
    pub bytes: u64,
    /// The daemon found `target` among the addresses HOPR nodes announced.
    pub hopr_peer: bool,
    /// Seen inside the VPN tunnel: `target` is a destination, not a next hop.
    pub tunnel: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct Batch {
    pub protocol: u16,
    pub session_id: u64,
    pub sequence: u64,
    pub elapsed_ms: u64,
    pub deltas: Vec<Delta>,
    pub dropped_batches: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct ReadResponse {
    pub session_id: u64,
    pub batches: Vec<Batch>,
    pub cursor: u64,
    pub gap: bool,
    pub active: bool,
    pub ended: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct StartResponse {
    pub session_id: u64,
    pub interface: Interface,
    pub protocol: u16,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct StopResponse {
    pub stopped: bool,
}

/// Requests the app sends, serialized as the daemon's command enum.
#[derive(Serialize)]
pub enum Request<'a> {
    TrafficInterfaces,
    TrafficStart(&'a StartRequest),
    TrafficRead(&'a ReadRequest),
    TrafficStop(&'a StopRequest),
}

#[derive(Serialize)]
pub struct StartRequest {
    pub interface_id: String,
}

#[derive(Serialize)]
pub struct ReadRequest {
    pub session_id: u64,
    pub cursor: u64,
}

#[derive(Serialize)]
pub struct StopRequest {
    pub session_id: u64,
}

/// Responses the daemon sends, keyed by the same enum.
#[derive(Debug, Deserialize)]
pub enum Response {
    TrafficInterfaces(Vec<Interface>),
    TrafficStart(Result<StartResponse, String>),
    TrafficRead(ReadResponse),
    TrafficStop(StopResponse),
    /// The daemon refused the caller; it never reveals which check failed.
    TrafficDenied,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn requests_serialize_as_the_daemon_expects() {
        let start = serde_json::to_string(&Request::TrafficStart(&StartRequest {
            interface_id: "en0".to_string(),
        }))
        .expect("serialize");
        assert_eq!(r#"{"TrafficStart":{"interface_id":"en0"}}"#, start);

        let read = serde_json::to_string(&Request::TrafficRead(&ReadRequest {
            session_id: 2,
            cursor: 7,
        }))
        .expect("serialize");
        assert_eq!(r#"{"TrafficRead":{"session_id":2,"cursor":7}}"#, read);

        assert_eq!(
            r#""TrafficInterfaces""#,
            serde_json::to_string(&Request::TrafficInterfaces).expect("serialize")
        );
    }

    #[test]
    fn responses_parse_including_failures_and_denials() {
        let started: Response = serde_json::from_str(
            r#"{"TrafficStart":{"Ok":{"session_id":1,"interface":{"id":"en0","name":"en0","addresses":["192.0.2.2"],"is_default":true},"protocol":5}}}"#,
        )
        .expect("parse start");
        assert!(matches!(
            started,
            Response::TrafficStart(Ok(StartResponse { session_id: 1, .. }))
        ));

        let failed: Response = serde_json::from_str(
            r#"{"TrafficStart":{"Err":"cannot capture on en0: permission denied"}}"#,
        )
        .expect("parse failure");
        assert!(matches!(failed, Response::TrafficStart(Err(_))));

        let denied: Response = serde_json::from_str(r#""TrafficDenied""#).expect("parse denial");
        assert!(matches!(denied, Response::TrafficDenied));
    }

    #[test]
    fn batches_parse_with_snake_case_tags() {
        let batch: Batch = serde_json::from_str(
            r#"{"protocol":5,"session_id":1,"sequence":0,"elapsed_ms":1000,"dropped_batches":0,"deltas":[{"second":1,"target":"192.0.2.10","direction":"downstream","bytes":900,"hopr_peer":true,"tunnel":true}]}"#,
        )
        .expect("parse batch");
        assert_eq!(batch.deltas[0].direction, Direction::Downstream);
        assert_eq!(batch.deltas[0].bytes, 900);
        assert!(batch.deltas[0].hopr_peer);
        assert!(batch.deltas[0].tunnel);
        assert_eq!(
            batch.deltas[0].target,
            "192.0.2.10".parse::<IpAddr>().expect("ip")
        );
    }
}
