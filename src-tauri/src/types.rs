use gnosis_vpn_lib::command::{self, HoprInitStatus, HoprStatus};
use gnosis_vpn_lib::route_health::RouteHealthState;
use gnosis_vpn_lib::{balance, connection, info};

use serde::Serialize;

use std::collections::HashMap;
use std::fmt::{self, Display};
// Sanitized library responses
#[derive(Clone, Debug, Serialize)]
pub struct StatusResponse {
    pub run_mode: RunMode,
    pub destinations: Vec<DestinationState>,
    pub connected: Option<String>,
    pub connecting: Option<ConnectingInfo>,
    pub disconnecting: Vec<DisconnectingInfo>,
}

#[derive(Clone, Debug, Serialize)]
pub struct ConnectingInfo {
    pub destination_id: String,
    pub phase: connection::up::Phase,
}

#[derive(Clone, Debug, Serialize)]
pub struct DisconnectingInfo {
    pub destination_id: String,
    pub phase: connection::down::Phase,
}

#[derive(Debug, Clone)]
pub enum ConnectionState {
    Connected(String),
    Connecting(String),
    Disconnecting,
    Disconnected,
}

#[derive(Debug, Serialize)]
pub enum ConnectResponse {
    AlreadyConnected(Destination),
    Connecting(Destination),
    WaitingToConnect(Destination, RouteHealthState),
    UnableToConnect(Destination, RouteHealthState),
    DestinationNotFound,
}

#[derive(Debug, Serialize)]
pub enum DisconnectResponse {
    Disconnecting(Destination),
    NotConnected,
}

#[derive(Clone, Debug, Serialize)]
pub struct TicketStats {
    pub ticket_price: String,
    pub winning_probability: f64,
}

#[derive(Debug, Serialize)]
pub struct BalanceResponse {
    pub node: String,
    pub safe: String,
    pub channels_out: String,
    pub info: Info,
    pub issues: Vec<balance::FundingIssue>,
    pub ticket_stats: TicketStats,
}

// Sanitized library structs

#[derive(Clone, Debug, Serialize)]
pub enum RunMode {
    /// Initial start, checking funds to run safe creation or find existing safe
    /// can jump to Warmup or DeployingSafe
    PreparingSafe {
        node_address: String,
        node_xdai: String,
        node_wxhopr: String,
        funding_tool: Option<String>,
        // came back from safe deployment with an error
        error: Option<String>,
        ticket_stats: Option<TicketStats>,
    },
    /// Safe deployment ongoing, enough funds, no existing safe
    DeployingSafe { node_address: String },
    /// Subsequent service start up in this state and after preparing safe
    Warmup { status: CombinedHoprStatus },
    /// Normal operation where connections can be made
    Running {
        funding: command::FundingState,
        hopr_status: Option<CombinedHoprStatus>,
    },
    /// Shutdown service
    Shutdown,
    /// Service not running (worker offline)
    NotRunning,
}

#[derive(Clone, Debug, Serialize)]
pub enum CombinedHoprStatus {
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

#[derive(Clone, Debug, Serialize)]
pub struct DestinationState {
    pub destination: Destination,
    pub route_health: Option<command::RouteHealthView>,
}

#[derive(Clone, Debug, Serialize)]
pub enum RoutingOptions {
    Hops(usize),
    IntermediatePath(Vec<String>),
}

#[derive(Clone, Debug, Serialize)]
pub struct Destination {
    pub id: String,
    pub meta: HashMap<String, String>,
    pub address: String,
    pub routing: RoutingOptions,
}

#[derive(Debug, Serialize)]
pub struct Info {
    pub node_address: String,
    pub node_peer_id: String,
    pub safe_address: String,
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

impl From<command::DestinationState> for DestinationState {
    fn from(ds: command::DestinationState) -> Self {
        DestinationState {
            destination: ds.destination.into(),
            route_health: ds.route_health,
        }
    }
}

impl From<HoprStatus> for CombinedHoprStatus {
    fn from(status: HoprStatus) -> Self {
        match status {
            HoprStatus::Uninitialized => CombinedHoprStatus::Uninitialized,
            HoprStatus::WaitingForFunds => CombinedHoprStatus::WaitingForFunds,
            HoprStatus::CheckingBalance => CombinedHoprStatus::CheckingBalance,
            HoprStatus::ValidatingNetworkConfig => CombinedHoprStatus::ValidatingNetworkConfig,
            HoprStatus::SubscribingToAnnouncements => {
                CombinedHoprStatus::SubscribingToAnnouncements
            }
            HoprStatus::RegisteringSafe => CombinedHoprStatus::RegisteringSafe,
            HoprStatus::AnnouncingNode => CombinedHoprStatus::AnnouncingNode,
            HoprStatus::AwaitingKeyBinding => CombinedHoprStatus::AwaitingKeyBinding,
            HoprStatus::InitializingServices => CombinedHoprStatus::InitializingServices,
            HoprStatus::Running => CombinedHoprStatus::Running,
            HoprStatus::Terminated => CombinedHoprStatus::Terminated,
        }
    }
}

impl From<HoprInitStatus> for CombinedHoprStatus {
    fn from(status: HoprInitStatus) -> Self {
        match status {
            HoprInitStatus::ValidatingConfig => CombinedHoprStatus::ValidatingConfig,
            HoprInitStatus::IdentifyingNode => CombinedHoprStatus::IdentifyingNode,
            HoprInitStatus::InitializingDatabase => CombinedHoprStatus::InitializingDatabase,
            HoprInitStatus::ConnectingBlockchain => CombinedHoprStatus::ConnectingBlockchain,
            HoprInitStatus::CreatingNode => CombinedHoprStatus::CreatingNode,
            HoprInitStatus::StartingNode => CombinedHoprStatus::StartingNode,
            HoprInitStatus::Ready => CombinedHoprStatus::Ready,
        }
    }
}

impl From<command::RunMode> for RunMode {
    fn from(rm: command::RunMode) -> Self {
        match rm {
            command::RunMode::Init => RunMode::Warmup {
                status: CombinedHoprStatus::Initializing,
            },
            command::RunMode::PreparingSafe {
                node_address,
                node_xdai,
                node_wxhopr,
                funding_tool,
                error,
                ticket_stats,
            } => RunMode::PreparingSafe {
                node_address: node_address.to_string(),
                node_xdai: node_xdai.amount().to_string(),
                node_wxhopr: node_wxhopr.amount().to_string(),
                funding_tool,
                error,
                ticket_stats: ticket_stats.map(|ts| TicketStats {
                    ticket_price: ts.ticket_price.amount().to_string(),
                    winning_probability: ts.winning_probability,
                }),
            },

            command::RunMode::DeployingSafe { node_address } => RunMode::DeployingSafe {
                node_address: node_address.to_string(),
            },
            command::RunMode::Warmup {
                hopr_init_status,
                hopr_status,
            } => match (hopr_init_status, hopr_status) {
                (None, None) => RunMode::Warmup {
                    status: CombinedHoprStatus::Initializing,
                },
                (_, Some(hopr_status)) => RunMode::Warmup {
                    status: hopr_status.into(),
                },
                (Some(hopr_init_status), _) => RunMode::Warmup {
                    status: hopr_init_status.into(),
                },
            },
            command::RunMode::Running {
                funding,
                hopr_status,
            } => RunMode::Running {
                funding,
                hopr_status: hopr_status.map(|s| s.into()),
            },
            command::RunMode::Shutdown => RunMode::Shutdown,
            command::RunMode::NotRunning => RunMode::NotRunning,
        }
    }
}

impl From<command::ConnectResponse> for ConnectResponse {
    fn from(cr: command::ConnectResponse) -> Self {
        match cr {
            command::ConnectResponse::AlreadyConnected(dest) => {
                ConnectResponse::AlreadyConnected(dest.into())
            }
            command::ConnectResponse::Connecting(dest) => ConnectResponse::Connecting(dest.into()),
            command::ConnectResponse::WaitingToConnect(dest, health_state) => {
                ConnectResponse::WaitingToConnect(dest.into(), health_state)
            }
            command::ConnectResponse::UnableToConnect(dest, health_state) => {
                ConnectResponse::UnableToConnect(dest.into(), health_state)
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
            .amount()
            .to_string();
        BalanceResponse {
            node: br.node.amount().to_string(),
            safe: br.safe.amount().to_string(),
            channels_out,
            info: br.info.into(),
            issues: br.issues,
            ticket_stats: TicketStats {
                ticket_price: br.ticket_price.amount().to_string(),
                winning_probability: br.winning_probability,
            },
        }
    }
}

impl From<&StatusResponse> for ConnectionState {
    fn from(sr: &StatusResponse) -> Self {
        if let Some(ref dest) = sr.connected {
            ConnectionState::Connected(dest.clone())
        } else if let Some(ref info) = sr.connecting {
            ConnectionState::Connecting(info.destination_id.clone())
        } else if !sr.disconnecting.is_empty() {
            ConnectionState::Disconnecting
        } else {
            ConnectionState::Disconnected
        }
    }
}

impl Display for ConnectionState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ConnectionState::Connected(dest) => write!(f, "Connected to {}", dest),
            ConnectionState::Connecting(dest) => write!(f, "Connecting to {}", dest),
            ConnectionState::Disconnecting => write!(f, "Disconnecting"),
            ConnectionState::Disconnected => write!(f, "Disconnected"),
        }
    }
}
