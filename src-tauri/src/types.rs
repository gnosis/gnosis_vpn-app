use gnosis_vpn_ipc as ipc;

use serde::Serialize;

use std::fmt::{self, Display};

// Only reshaped responses live here; everything else goes to the frontend as the ipc type.

#[derive(Debug, Clone)]
pub enum ConnectionState {
    Connected {
        destination_id: String,
        stalled: bool,
    },
    Connecting(String),
    Reconnecting(String),
    Disconnecting,
    Disconnected,
    /// The daemon refuses this user: another local user owns the worker.
    InUseByOtherUser,
    /// App-only: the daemon's socket is absent, so there is no status to derive a state from.
    ServiceNotRunning,
}

/// The balances as the service reports them, with the outgoing channels summed into one stake.
#[derive(Clone, Debug, Serialize)]
pub struct BalanceResponse {
    pub node: ipc::Balance<ipc::XDai>,
    pub safe: ipc::Balance<ipc::WxHopr>,
    pub channels_out: ipc::Balance<ipc::WxHopr>,
    pub info: ipc::NodeInfo,
    pub funding_status: Option<ipc::FundingStatus>,
    pub ideal_balance: Option<ipc::BalanceRecommendation>,
    pub capacity_allocations: Option<ipc::CapacityAllocations>,
}

impl From<ipc::Balances> for BalanceResponse {
    fn from(b: ipc::Balances) -> Self {
        BalanceResponse {
            node: b.node,
            safe: b.safe,
            channels_out: b.channels_out.iter().filter_map(|c| c.balance).sum(),
            info: b.info,
            funding_status: b.funding_status,
            ideal_balance: b.ideal_balance,
            capacity_allocations: b.capacity_allocations,
        }
    }
}

impl From<&ipc::Status> for ConnectionState {
    fn from(status: &ipc::Status) -> Self {
        match &status.connection {
            ipc::Connection::Connected {
                destination, stall, ..
            } => ConnectionState::Connected {
                destination_id: destination.to_string(),
                stalled: stall.is_some(),
            },
            ipc::Connection::Connecting { destination, .. } => {
                ConnectionState::Connecting(destination.to_string())
            }
            ipc::Connection::Reconnecting { destination, .. } => {
                ConnectionState::Reconnecting(destination.to_string())
            }
            ipc::Connection::Disconnected if !status.disconnecting.is_empty() => {
                ConnectionState::Disconnecting
            }
            ipc::Connection::Disconnected => ConnectionState::Disconnected,
        }
    }
}

impl Display for ConnectionState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ConnectionState::Connected {
                destination_id,
                stalled: false,
            } => {
                write!(f, "Connected to {destination_id}")
            }
            // Only the flag, not the counts: this string is the tray text and the state-change log key.
            ConnectionState::Connected {
                destination_id,
                stalled: true,
            } => {
                write!(f, "Connected to {destination_id} (stalled)")
            }
            ConnectionState::Connecting(dest) => write!(f, "Connecting to {}", dest),
            ConnectionState::Reconnecting(dest) => write!(f, "Reconnecting to {}", dest),
            ConnectionState::Disconnecting => write!(f, "Disconnecting"),
            ConnectionState::Disconnected => write!(f, "Disconnected"),
            ConnectionState::InUseByOtherUser => write!(f, "In use by another user"),
            ConnectionState::ServiceNotRunning => write!(f, "Service not running"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, SystemTime};

    fn connected_status(stall: Option<ipc::TunnelStall>) -> ipc::Status {
        ipc::Status {
            run_mode: ipc::RunMode::NotRunning,
            destinations: vec![],
            target: Some("x".into()),
            connection: ipc::Connection::Connected {
                destination: "x".into(),
                since: SystemTime::UNIX_EPOCH,
                tunnel_ping_rtt: Some(Duration::from_millis(12)),
                stall,
            },
            disconnecting: vec![],
            probe: None,
        }
    }

    #[test]
    fn connected_state_carries_the_stall_flag_into_the_tray_text() {
        let healthy = ConnectionState::from(&connected_status(None));
        assert_eq!(healthy.to_string(), "Connected to x");

        let stalled = ConnectionState::from(&connected_status(Some(ipc::TunnelStall {
            since: SystemTime::UNIX_EPOCH,
            failed_pings: 2,
            reconnect_at: 3,
        })));
        assert!(matches!(
            stalled,
            ConnectionState::Connected { stalled: true, .. }
        ));
        assert_eq!(stalled.to_string(), "Connected to x (stalled)");
    }

    #[test]
    fn channels_out_sums_only_the_known_balances() {
        let channel = |wei: Option<u128>| ipc::ChannelOut {
            address: ipc::Address::new([1; 20]),
            balance: wei.map(ipc::Balance::from_wei),
            matched_exit: None,
        };
        let balances = ipc::Balances {
            node: ipc::Balance::zero(),
            safe: ipc::Balance::zero(),
            channels_out: vec![channel(Some(2)), channel(None), channel(Some(3))],
            info: ipc::NodeInfo {
                node_address: ipc::Address::new([2; 20]),
                node_peer_id: "peer".into(),
                safe_address: ipc::Address::new([3; 20]),
            },
            capacity_allocations: None,
            ideal_balance: None,
            funding_status: None,
        };
        assert_eq!(BalanceResponse::from(balances).channels_out.wei(), 5);
    }
}
