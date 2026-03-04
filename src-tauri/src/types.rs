use gnosis_vpn_lib::command::{self, HoprInitStatus, HoprStatus};
use gnosis_vpn_lib::{
    balance, connection, connectivity_health, destination_health, gvpn_client, info,
};

use serde::Serialize;

use std::collections::HashMap;
use std::time::SystemTime;

// Sanitized library responses

#[derive(Debug, Serialize)]
pub struct StatusResponse {
    pub run_mode: RunMode,
    pub destinations: Vec<DestinationState>,
}

#[derive(Debug, Serialize)]
pub enum ConnectResponse {
    Connecting(Destination),
    WaitingToConnect(Destination, ConnectivityHealth),
    UnableToConnect(Destination, ConnectivityHealth),
    DestinationNotFound,
}

#[derive(Debug, Serialize)]
pub enum DisconnectResponse {
    Disconnecting(Destination),
    NotConnected,
}

#[derive(Debug, Serialize)]
pub struct BalanceResponse {
    pub node: String,
    pub safe: String,
    pub channels_out: String,
    pub info: Info,
    pub issues: Vec<balance::FundingIssue>,
}

// Sanitized library structs

#[derive(Debug, Serialize)]
pub enum RunMode {
    /// Initial start, checking funds to run safe creation or find existing safe
    /// can jump to Warmup or DeployingSafe
    PreparingSafe {
        node_address: String,
        node_xdai: String,
        node_wxhopr: String,
        funding_tool: balance::FundingTool,
        // came back from safe deployment with an error
        safe_creation_error: Option<String>,
    },
    /// Safe deployment ongoing, enough funds, no existing safe
    DeployingSafe { node_address: String },
    /// Subsequent service start up in this state and after preparing safe
    Warmup { status: WarmupStatus },
    /// Normal operation where connections can be made
    Running { funding: command::FundingState },
    /// Shutdown service
    Shutdown,
}

#[derive(Debug, Serialize)]
pub enum WarmupStatus {
    // hopr construction not yet started
    Initializing,
    // Hopr init states
    ValidatingConfig,
    IdentifyingNode,
    InitializingDatabase,
    ConnectingBlockchain,
    CreatingNode,
    StartingNode,
    Ready,
    // Hopr running states
    Uninitialized,
    WaitingForFunds,
    CheckingBalance,
    ValidatingNetworkConfig,
    SubscribingToAnnouncements,
    RegisteringSafe,
    AnnouncingNode,
    AwaitingKeyBinding,
    InitializingServices,
    Running,
    Terminated,
}

#[derive(Debug, Serialize)]
pub struct DestinationState {
    pub destination: Destination,
    pub connection_state: command::ConnectionState,
    pub connectivity: ConnectivityHealth,
    pub exit_health: destination_health::DestinationHealth,
}

#[derive(Debug, Serialize)]
pub enum RoutingOptions {
    Hops(usize),
    IntermediatePath(Vec<String>),
}

#[derive(Debug, Serialize)]
pub struct Destination {
    pub id: String,
    pub meta: HashMap<String, String>,
    pub address: String,
    pub routing: RoutingOptions,
}

#[derive(Debug, Serialize)]
pub struct ConnectivityHealth {
    pub last_error: Option<String>,
    pub health: connectivity_health::Health,
    pub need: Need,
}

/// Requirements to be able to connect to this destination
/// This is statically derived at construction time from a destination's routing options.
#[derive(Debug, Serialize)]
pub enum Need {
    Channel(String),
    AnyChannel,
    Peering(String),
    Nothing,
}

#[derive(Debug, Serialize)]
pub struct Info {
    pub node_address: String,
    pub node_peer_id: String,
    pub safe_address: String,
}

#[derive(Debug, Serialize)]
pub enum DestinationHealth {
    Init,
    Running {
        since: SystemTime,
    },
    Failure {
        checked_at: SystemTime,
        error: String,
        previous_failures: u32,
    },
    Success {
        checked_at: SystemTime,
        health: gvpn_client::Health,
        total_time: f32,
        round_trip_time: f32,
    },
}

// Conversions from library types to sanitized types

impl From<connection::destination::RoutingOptions> for RoutingOptions {
    fn from(ro: connection::destination::RoutingOptions) -> Self {
        match ro {
            connection::destination::RoutingOptions::Hops(hops) => {
                RoutingOptions::Hops(hops.into())
            }
            connection::destination::RoutingOptions::IntermediatePath(path) => {
                RoutingOptions::IntermediatePath(path.into_iter().map(|a| a.to_string()).collect())
            }
        }
    }
}

impl From<connection::destination::Destination> for Destination {
    fn from(d: connection::destination::Destination) -> Self {
        Destination {
            id: d.id.clone(),
            meta: d.meta.clone(),
            address: d.address.to_string(),
            routing: d.routing.into(),
        }
    }
}

impl From<connectivity_health::ConnectivityHealth> for ConnectivityHealth {
    fn from(h: connectivity_health::ConnectivityHealth) -> Self {
        ConnectivityHealth {
            last_error: h.last_error.clone(),
            health: h.health.clone(),
            need: match h.need {
                connectivity_health::Need::Channel(c) => Need::Channel(c.to_string()),
                connectivity_health::Need::AnyChannel => Need::AnyChannel,
                connectivity_health::Need::Peering(p) => Need::Peering(p.to_string()),
                connectivity_health::Need::Nothing => Need::Nothing,
                // TODO refactor out
                connectivity_health::Need::DestinationMissing => Need::Nothing,
            },
        }
    }
}

impl From<destination_health::DestinationHealth> for DestinationHealth {
    fn from(h: destination_health::DestinationHealth) -> Self {
        match h {
            destination_health::DestinationHealth::Init => DestinationHealth::Init,
            destination_health::DestinationHealth::Running { since } => {
                DestinationHealth::Running { since }
            }
            destination_health::DestinationHealth::Failure {
                checked_at,
                error,
                previous_failures,
            } => DestinationHealth::Failure {
                checked_at,
                error,
                previous_failures,
            },
            destination_health::DestinationHealth::Success {
                checked_at,
                health,
                total_time,
                round_trip_time,
            } => DestinationHealth::Success {
                checked_at,
                health,
                total_time: total_time.as_secs_f32(),
                round_trip_time: round_trip_time.as_secs_f32(),
            },
        }
    }
}

impl From<command::DestinationState> for DestinationState {
    fn from(ds: command::DestinationState) -> Self {
        DestinationState {
            destination: ds.destination.into(),
            connection_state: ds.connection_state,
            connectivity: ds.connectivity.into(),
            exit_health: ds.exit_health,
        }
    }
}

impl From<command::RunMode> for RunMode {
    fn from(rm: command::RunMode) -> Self {
        match rm {
            command::RunMode::Init => RunMode::Warmup {
                status: WarmupStatus::Initializing,
            },
            command::RunMode::PreparingSafe {
                node_address,
                node_xdai,
                node_wxhopr,
                funding_tool,
                safe_creation_error,
            } => RunMode::PreparingSafe {
                node_address: node_address.to_string(),
                node_xdai: node_xdai.amount().to_string(),
                node_wxhopr: node_wxhopr.amount().to_string(),
                funding_tool,
                safe_creation_error,
            },

            command::RunMode::DeployingSafe { node_address } => RunMode::DeployingSafe {
                node_address: node_address.to_string(),
            },
            command::RunMode::Warmup {
                hopr_init_status,
                hopr_status,
            } => match (hopr_init_status, hopr_status) {
                (None, None) => RunMode::Warmup {
                    status: WarmupStatus::Initializing,
                },
                (_, Some(hopr_status)) => match hopr_status {
                    HoprStatus::Uninitialized => RunMode::Warmup {
                        status: WarmupStatus::Uninitialized,
                    },
                    HoprStatus::WaitingForFunds => RunMode::Warmup {
                        status: WarmupStatus::WaitingForFunds,
                    },
                    HoprStatus::CheckingBalance => RunMode::Warmup {
                        status: WarmupStatus::CheckingBalance,
                    },
                    HoprStatus::ValidatingNetworkConfig => RunMode::Warmup {
                        status: WarmupStatus::ValidatingNetworkConfig,
                    },
                    HoprStatus::SubscribingToAnnouncements => RunMode::Warmup {
                        status: WarmupStatus::SubscribingToAnnouncements,
                    },
                    HoprStatus::RegisteringSafe => RunMode::Warmup {
                        status: WarmupStatus::RegisteringSafe,
                    },
                    HoprStatus::AnnouncingNode => RunMode::Warmup {
                        status: WarmupStatus::AnnouncingNode,
                    },
                    HoprStatus::AwaitingKeyBinding => RunMode::Warmup {
                        status: WarmupStatus::AwaitingKeyBinding,
                    },
                    HoprStatus::InitializingServices => RunMode::Warmup {
                        status: WarmupStatus::InitializingServices,
                    },
                    HoprStatus::Running => RunMode::Warmup {
                        status: WarmupStatus::Running,
                    },
                    HoprStatus::Terminated => RunMode::Warmup {
                        status: WarmupStatus::Terminated,
                    },
                },
                (Some(hopr_init_status), _) => match hopr_init_status {
                    HoprInitStatus::ValidatingConfig => RunMode::Warmup {
                        status: WarmupStatus::ValidatingConfig,
                    },
                    HoprInitStatus::IdentifyingNode => RunMode::Warmup {
                        status: WarmupStatus::IdentifyingNode,
                    },
                    HoprInitStatus::InitializingDatabase => RunMode::Warmup {
                        status: WarmupStatus::InitializingDatabase,
                    },
                    HoprInitStatus::ConnectingBlockchain => RunMode::Warmup {
                        status: WarmupStatus::ConnectingBlockchain,
                    },
                    HoprInitStatus::CreatingNode => RunMode::Warmup {
                        status: WarmupStatus::CreatingNode,
                    },
                    HoprInitStatus::StartingNode => RunMode::Warmup {
                        status: WarmupStatus::StartingNode,
                    },
                    HoprInitStatus::Ready => RunMode::Warmup {
                        status: WarmupStatus::Ready,
                    },
                },
            },

            command::RunMode::Running {
                funding,
                hopr_status: _,
            } => RunMode::Running { funding },
            command::RunMode::Shutdown => RunMode::Shutdown,
        }
    }
}

impl From<command::StatusResponse> for StatusResponse {
    fn from(sr: command::StatusResponse) -> Self {
        StatusResponse {
            run_mode: sr.run_mode.into(),
            destinations: sr.destinations.into_iter().map(|d| d.into()).collect(),
        }
    }
}

impl From<command::ConnectResponse> for ConnectResponse {
    fn from(cr: command::ConnectResponse) -> Self {
        match cr {
            command::ConnectResponse::Connecting(dest) => ConnectResponse::Connecting(dest.into()),
            command::ConnectResponse::WaitingToConnect(dest, connectivity) => {
                ConnectResponse::WaitingToConnect(dest.into(), connectivity.into())
            }
            command::ConnectResponse::UnableToConnect(dest, connectivity) => {
                ConnectResponse::UnableToConnect(dest.into(), connectivity.into())
            }
            command::ConnectResponse::DestinationNotFound => ConnectResponse::DestinationNotFound,
        }
    }
}

impl From<command::DisconnectResponse> for DisconnectResponse {
    fn from(dr: command::DisconnectResponse) -> Self {
        match dr {
            command::DisconnectResponse::Disconnecting(dest) => {
                DisconnectResponse::Disconnecting(dest.into())
            }
            command::DisconnectResponse::NotConnected => DisconnectResponse::NotConnected,
        }
    }
}

impl From<info::Info> for Info {
    fn from(i: info::Info) -> Self {
        Info {
            node_address: i.node_address.to_string(),
            node_peer_id: i.node_peer_id,
            safe_address: i.safe_address.to_string(),
        }
    }
}

impl From<command::BalanceResponse> for BalanceResponse {
    fn from(br: command::BalanceResponse) -> Self {
        let channels_out = br
            .channels_out
            .iter()
            .filter_map(|chout| match chout.balance {
                command::ChannelBalance::Completed(b) => Some(b),
                _ => None,
            })
            .sum::<balance::Balance<balance::WxHOPR>>()
            .to_string();
        BalanceResponse {
            node: br.node.amount().to_string(),
            safe: br.safe.amount().to_string(),
            channels_out,
            info: br.info.into(),
            issues: br.issues,
        }
    }
}
