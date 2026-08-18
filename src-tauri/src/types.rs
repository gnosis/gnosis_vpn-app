use gnosis_vpn_lib::balance;
use gnosis_vpn_lib::command::{self, HoprInitStatus, HoprStatus};

use serde::Serialize;

use std::collections::HashMap;
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

// Mirrors balance::BalanceRecommendation but serializes amounts as raw hopli
// integer strings via .amount().to_string(). The lib type uses serde_utils::balance
// which produces "1 wxHOPR" — unparseable by BigInt().
#[derive(Clone, Debug, Serialize)]
pub struct TauriBalanceRecommendation {
    pub wxhopr: String,
    pub xdai: String,
    pub channel_stakes: String,
    pub fee_to_start: String,
    pub txs_to_start: u64,
    pub xdai_fee_per_tx: String,
}

impl From<balance::BalanceRecommendation> for TauriBalanceRecommendation {
    fn from(r: balance::BalanceRecommendation) -> Self {
        TauriBalanceRecommendation {
            wxhopr: r.wxhopr.amount().to_string(),
            xdai: r.xdai.amount().to_string(),
            channel_stakes: r.channel_stakes.amount().to_string(),
            fee_to_start: r.fee_to_start.amount().to_string(),
            txs_to_start: r.txs_to_start,
            xdai_fee_per_tx: r.xdai_fee_per_tx.amount().to_string(),
        }
    }
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

impl From<balance::Capacity> for TauriCapacity {
    fn from(c: balance::Capacity) -> Self {
        TauriCapacity {
            stake: c.stake.amount().to_string(),
            expected_messages: c.expected_messages,
            min_guaranteed_messages: c.min_guaranteed_messages,
            byte_capacity: c.byte_capacity,
        }
    }
}

// Mirror of balance::CapacityAllocations with stakes stringified; peer map
// keyed by checksum address strings.
#[derive(Clone, Debug, Serialize)]
pub struct TauriCapacityAllocations {
    pub peer_allocations: HashMap<String, TauriCapacity>,
    pub node: TauriCapacity,
    pub safe: TauriCapacity,
}

impl From<balance::CapacityAllocations> for TauriCapacityAllocations {
    fn from(a: balance::CapacityAllocations) -> Self {
        TauriCapacityAllocations {
            peer_allocations: a
                .peer_allocations
                .into_iter()
                .map(|(addr, c)| (addr.to_checksum(), c.into()))
                .collect(),
            node: a.node.into(),
            safe: a.safe.into(),
        }
    }
}

// Mirrors balance::FundingStatus but stringifies the deficits as raw hopli
// integer strings, consistent with the other balance fields.
#[derive(Clone, Debug, Serialize)]
pub struct TauriFundingStatus {
    pub traffic: balance::FundingLevel,
    pub gas: balance::FundingLevel,
    pub wxhopr_deficit: Option<String>,
    pub xdai_deficit: Option<String>,
}

impl From<balance::FundingStatus> for TauriFundingStatus {
    fn from(s: balance::FundingStatus) -> Self {
        TauriFundingStatus {
            traffic: s.traffic,
            gas: s.gas,
            wxhopr_deficit: s.wxhopr_deficit.map(|d| d.amount().to_string()),
            xdai_deficit: s.xdai_deficit.map(|d| d.amount().to_string()),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct BalanceResponse {
    pub node: String,
    pub safe: String,
    pub channels_out: String,
    pub info: command::Info,
    pub funding_status: Option<TauriFundingStatus>,
    pub ideal_balance: Option<TauriBalanceRecommendation>,
    pub capacity_allocations: Option<TauriCapacityAllocations>,
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
        balance_recommendation: Option<Box<TauriBalanceRecommendation>>,
    },
    DeployingSafe {
        node_address: String,
    },
    Warmup {
        status: CombinedHoprStatus,
        last_error: Option<String>,
    },
    Running {
        funding_status: Option<TauriFundingStatus>,
        hopr_status: Option<CombinedHoprStatus>,
    },
    Shutdown,
    Restarting,
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
                balance_recommendation: balance_recommendation
                    .map(|b| Box::new(TauriBalanceRecommendation::from(*b))),
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
                funding_status,
                hopr_status,
            } => RunMode::Running {
                funding_status: funding_status.map(Into::into),
                hopr_status: hopr_status.map(|s| s.into()),
            },
            command::RunMode::Shutdown => RunMode::Shutdown,
            command::RunMode::Restarting => RunMode::Restarting,
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
        let capacity_allocations = br.capacity_allocations.map(Into::into);
        BalanceResponse {
            node: br.node.amount().to_string(),
            safe: br.safe.amount().to_string(),
            channels_out,
            info: br.info,
            funding_status: br.funding_status.map(Into::into),
            ideal_balance: br.ideal_balance.map(Into::into),
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
