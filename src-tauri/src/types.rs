use gnosis_vpn_lib::balance;
use gnosis_vpn_lib::command::{self, HoprInitStatus, HoprStatus};

use serde::Serialize;

use std::fmt::{self, Display};

// Sanitized library responses — only types that need reshaping for the UI layer live here.
// For everything else, library types are used directly since their serde output already
// matches what the TypeScript Zod layer expects.

#[derive(Clone, Debug, Serialize)]
pub struct StatusResponse {
    pub run_mode: RunMode,
    pub destinations: Vec<command::DestinationState>,
    pub target_destination: Option<String>,
    pub connected: Option<command::ConnectedInfo>,
    pub connecting: Option<command::ConnectingInfo>,
    pub reconnecting: Option<command::ReconnectingInfo>,
    pub disconnecting: Vec<command::DisconnectingInfo>,
}

#[derive(Debug, Clone)]
pub enum ConnectionState {
    Connected(String),
    Connecting(String),
    Reconnecting(String),
    Disconnecting,
    Disconnected,
}

// Mirrors balance::Capacity but serializes stake as a raw hopli integer string,
// consistent with `node`, `safe`, and `channels_out`. The lib type uses
// serde_utils::balance which produces "1 wxHOPR" — unparseable by BigInt().
#[derive(Clone, Debug, Serialize)]
pub struct TauriCapacity {
    pub stake: String,
    pub expected_messages: u64,
    pub min_guaranteed_messages: u64,
    pub byte_capacity: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct TauriCapacityEntry {
    pub allocator: balance::CapacityAllocator,
    pub capacity: TauriCapacity,
}

#[derive(Clone, Debug, Serialize)]
pub struct BalanceResponse {
    pub node: String,
    pub safe: String,
    pub channels_out: String,
    pub info: command::Info,
    pub funding_issues: Option<Vec<balance::FundingIssue>>,
    pub ideal_balance: Option<balance::BalanceRecommendation>,
    pub capacity_allocations: Option<Vec<TauriCapacityEntry>>,
}

// RunMode merges the library's Init+Warmup variants and flattens two optional
// status enums into a single CombinedHoprStatus for simpler UI consumption.

#[derive(Clone, Debug, Serialize)]
pub enum RunMode {
    PreparingSafe {
        node_address: String,
        node_xdai: String,
        node_wxhopr: String,
        funding_tool: Option<String>,
        error: Option<String>,
        balance_recommendation: Option<balance::BalanceRecommendation>,
    },
    DeployingSafe {
        node_address: String,
    },
    Warmup {
        status: CombinedHoprStatus,
        last_error: Option<String>,
    },
    Running {
        funding_issues: Option<Vec<balance::FundingIssue>>,
        hopr_status: Option<CombinedHoprStatus>,
    },
    Shutdown,
    NotRunning,
}

#[derive(Clone, Debug, Serialize)]
pub enum CombinedHoprStatus {
    Initializing,
    ValidatingConfig,
    IdentifyingNode,
    ConnectingBlockchain,
    CreatingNode,
    StartingNode,
    Ready,
    Uninitialized,
    WaitingForFunds,
    CheckingBalance,
    ValidatingNetworkConfig,
    CheckingOnchainAddress,
    RegisteringSafe,
    AnnouncingNode,
    AwaitingKeyBinding,
    InitializingServices,
    Running,
    Terminated,
    Degraded,
    Failed,
}

// Conversions from library types to sanitized types

impl From<HoprStatus> for CombinedHoprStatus {
    fn from(status: HoprStatus) -> Self {
        match status {
            HoprStatus::Uninitialized => CombinedHoprStatus::Uninitialized,
            HoprStatus::WaitingForFunds => CombinedHoprStatus::WaitingForFunds,
            HoprStatus::CheckingBalance => CombinedHoprStatus::CheckingBalance,
            HoprStatus::ValidatingNetworkConfig => CombinedHoprStatus::ValidatingNetworkConfig,
            HoprStatus::CheckingOnchainAddress => CombinedHoprStatus::CheckingOnchainAddress,
            HoprStatus::RegisteringSafe => CombinedHoprStatus::RegisteringSafe,
            HoprStatus::AnnouncingNode => CombinedHoprStatus::AnnouncingNode,
            HoprStatus::AwaitingKeyBinding => CombinedHoprStatus::AwaitingKeyBinding,
            HoprStatus::InitializingServices => CombinedHoprStatus::InitializingServices,
            HoprStatus::Running => CombinedHoprStatus::Running,
            HoprStatus::Terminated => CombinedHoprStatus::Terminated,
            HoprStatus::Degraded => CombinedHoprStatus::Degraded,
            HoprStatus::Failed => CombinedHoprStatus::Failed,
        }
    }
}

impl From<HoprInitStatus> for CombinedHoprStatus {
    fn from(status: HoprInitStatus) -> Self {
        match status {
            HoprInitStatus::ValidatingConfig => CombinedHoprStatus::ValidatingConfig,
            HoprInitStatus::IdentifyingNode => CombinedHoprStatus::IdentifyingNode,
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
            command::RunMode::Init { last_error } => RunMode::Warmup {
                status: CombinedHoprStatus::Initializing,
                last_error,
            },
            command::RunMode::PreparingSafe {
                node_address,
                node_xdai,
                node_wxhopr,
                funding_tool,
                error,
                balance_recommendation,
            } => RunMode::PreparingSafe {
                node_address: node_address.to_checksum(),
                node_xdai: node_xdai.amount().to_string(),
                node_wxhopr: node_wxhopr.amount().to_string(),
                funding_tool,
                error,
                balance_recommendation,
            },
            command::RunMode::DeployingSafe { node_address } => RunMode::DeployingSafe {
                node_address: node_address.to_checksum(),
            },
            command::RunMode::Warmup {
                hopr_init_status,
                hopr_status,
                last_error,
            } => {
                let status = match (hopr_init_status, hopr_status) {
                    (None, None) => CombinedHoprStatus::Initializing,
                    (_, Some(hopr_status)) => hopr_status.into(),
                    (Some(hopr_init_status), _) => hopr_init_status.into(),
                };
                RunMode::Warmup { status, last_error }
            }
            command::RunMode::Running {
                funding_issues,
                hopr_status,
            } => RunMode::Running {
                funding_issues,
                hopr_status: hopr_status.map(|s| s.into()),
            },
            command::RunMode::Shutdown => RunMode::Shutdown,
            command::RunMode::NotRunning => RunMode::NotRunning,
        }
    }
}

impl From<command::BalanceResponse> for BalanceResponse {
    fn from(br: command::BalanceResponse) -> Self {
        let channels_out = br
            .channels_out
            .iter()
            .filter_map(|chout| match chout.balance {
                command::ChannelBalance::Completed { amount } => Some(amount),
                _ => None,
            })
            .sum::<balance::Balance<balance::WxHOPR>>()
            .amount()
            .to_string();
        let capacity_allocations = br.capacity_allocations.map(|entries| {
            entries
                .into_iter()
                .map(|e| TauriCapacityEntry {
                    allocator: e.allocator,
                    capacity: TauriCapacity {
                        stake: e.capacity.stake.amount().to_string(),
                        expected_messages: e.capacity.expected_messages,
                        min_guaranteed_messages: e.capacity.min_guaranteed_messages,
                        byte_capacity: e.capacity.byte_capacity,
                    },
                })
                .collect()
        });
        BalanceResponse {
            node: br.node.amount().to_string(),
            safe: br.safe.amount().to_string(),
            channels_out,
            info: br.info,
            funding_issues: br.funding_issues,
            ideal_balance: br.ideal_balance,
            capacity_allocations,
        }
    }
}

impl From<&StatusResponse> for ConnectionState {
    fn from(sr: &StatusResponse) -> Self {
        if let Some(ref info) = sr.connected {
            ConnectionState::Connected(info.destination_id.clone())
        } else if let Some(ref info) = sr.connecting {
            ConnectionState::Connecting(info.destination_id.clone())
        } else if let Some(ref info) = sr.reconnecting {
            ConnectionState::Reconnecting(info.destination_id.clone())
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
            ConnectionState::Reconnecting(dest) => write!(f, "Reconnecting to {}", dest),
            ConnectionState::Disconnecting => write!(f, "Disconnecting"),
            ConnectionState::Disconnected => write!(f, "Disconnected"),
        }
    }
}
