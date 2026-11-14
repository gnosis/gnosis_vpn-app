use gnosis_vpn_ipc as ipc;

use serde::Serialize;

use std::collections::BTreeMap;
use std::fmt::{self, Display};

use crate::exit_label::ExitNames;

// Only reshaped responses live here; everything else goes to the frontend as the ipc type.

/// The daemon's status with every listed exit's names by connect id, so the main window derives none itself.
#[derive(Clone, Debug, Serialize)]
pub struct NamedStatus {
    #[serde(flatten)]
    pub status: ipc::Status,
    pub exit_names: BTreeMap<String, ExitNames>,
}

impl From<ipc::Status> for NamedStatus {
    fn from(status: ipc::Status) -> Self {
        let exit_names = status
            .destinations
            .iter()
            .map(|d| (d.destination.id.to_string(), ExitNames::of(&d.destination)))
            .collect();
        NamedStatus { status, exit_names }
    }
}

/// An exit by its connect id, which logs keep for gnosis_vpn-ctl, and by the name the tray shows.
#[derive(Debug, Clone)]
pub struct Exit {
    pub id: String,
    pub label: String,
}

#[cfg(test)]
impl From<&str> for Exit {
    fn from(id: &str) -> Self {
        Exit {
            id: id.into(),
            label: id.into(),
        }
    }
}

#[derive(Debug, Clone)]
pub enum ConnectionState {
    Connected {
        exit: Exit,
        stalled: bool,
    },
    Connecting(Exit),
    Reconnecting(Exit),
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
            channels_out: b.channels_out.iter().map(|c| c.balance).sum(),
            info: b.info,
            funding_status: b.funding_status,
            ideal_balance: b.ideal_balance,
            capacity_allocations: b.capacity_allocations,
        }
    }
}

impl From<&NamedStatus> for ConnectionState {
    fn from(named: &NamedStatus) -> Self {
        let status = &named.status;
        // An exit missing from the list still has its id to show.
        let exit = |id: &ipc::DestinationId| {
            let id = id.to_string();
            let label = named
                .exit_names
                .get(&id)
                .map_or_else(|| id.clone(), ExitNames::label);
            Exit { id, label }
        };
        match &status.connection {
            ipc::Connection::Connected {
                destination, stall, ..
            } => ConnectionState::Connected {
                exit: exit(destination),
                stalled: stall.is_some(),
            },
            ipc::Connection::Connecting { destination, .. } => {
                ConnectionState::Connecting(exit(destination))
            }
            ipc::Connection::Reconnecting { destination, .. } => {
                ConnectionState::Reconnecting(exit(destination))
            }
            ipc::Connection::Disconnected if !status.disconnecting.is_empty() => {
                ConnectionState::Disconnecting
            }
            ipc::Connection::Disconnected => ConnectionState::Disconnected,
        }
    }
}

impl ConnectionState {
    /// The tray's line names the exit as the main window does; Display keeps the connect id.
    pub fn tray_text(&self) -> String {
        self.describe(|exit| &exit.label)
    }

    // Only the flag, not the counts: this string is the tray text and the state-change log key.
    fn describe(&self, exit_name: fn(&Exit) -> &str) -> String {
        match self {
            ConnectionState::Connected {
                exit,
                stalled: false,
            } => format!("Connected to {}", exit_name(exit)),
            ConnectionState::Connected {
                exit,
                stalled: true,
            } => format!("Connected to {} (stalled)", exit_name(exit)),
            ConnectionState::Connecting(exit) => format!("Connecting to {}", exit_name(exit)),
            ConnectionState::Reconnecting(exit) => format!("Reconnecting to {}", exit_name(exit)),
            ConnectionState::Disconnecting => "Disconnecting".into(),
            ConnectionState::Disconnected => "Disconnected".into(),
            ConnectionState::InUseByOtherUser => "In use by another user".into(),
            ConnectionState::ServiceNotRunning => "Service not running".into(),
        }
    }
}

/// The state-change log key, with the connect id gnosis_vpn-ctl takes.
impl Display for ConnectionState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.describe(|exit| &exit.id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, SystemTime};

    fn connected_status(stall: Option<ipc::TunnelStall>) -> NamedStatus {
        ipc::Status {
            run_mode: ipc::RunMode::NotRunning,
            destinations: vec![],
            target: Some("x".into()),
            connection: ipc::Connection::Connected {
                destination: "x".into(),
                since: SystemTime::UNIX_EPOCH,
                tunnel_ping_rtt: Some(Duration::from_millis(12)),
                stall,
                pix: None,
            },
            disconnecting: vec![],
            probe: None,
            pix_chunk_bytes: None,
            probing: None,
            recent: vec![],
        }
        .into()
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
        assert_eq!(stalled.tray_text(), "Connected to x (stalled)");
    }

    #[test]
    fn the_tray_names_a_listed_exit_while_the_log_key_keeps_its_connect_id() {
        let mut status = connected_status(None).status;
        status.destinations = vec![ipc::DestinationStatus {
            destination: crate::exit_label::tests::destination("x", Some("AU")),
            route_health: None,
        }];
        let state = ConnectionState::from(&NamedStatus::from(status));
        assert_eq!(state.tray_text(), "Connected to Australia #BeAed");
        assert_eq!(state.to_string(), "Connected to x");
    }

    #[test]
    fn channels_out_sums_every_channel() {
        let channel = |wei: u128| ipc::ChannelOut {
            address: ipc::Address::new([1; 20]),
            balance: ipc::Balance::from_wei(wei),
            matched_exit: None,
        };
        let balances = ipc::Balances {
            node: ipc::Balance::zero(),
            safe: ipc::Balance::zero(),
            channels_out: vec![channel(2), channel(3)],
            info: ipc::NodeInfo {
                node_address: ipc::Address::new([2; 20]),
                node_peer_id: "peer".into(),
                safe_address: ipc::Address::new([3; 20]),
            },
            capacity_allocations: None,
            ideal_balance: None,
            funding_status: None,
            pix_float: None,
        };
        assert_eq!(BalanceResponse::from(balances).channels_out.wei(), 5);
    }
}
