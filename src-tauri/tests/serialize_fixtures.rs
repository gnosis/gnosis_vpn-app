use gnosis_vpn_app_lib::types;
use gnosis_vpn_lib::command::RouteHealthView;
use gnosis_vpn_lib::connection::destination::{Destination, HopRouting};
use gnosis_vpn_lib::prelude::Address;
use gnosis_vpn_lib::route_health::{
    ExitHealth, Health, LoadAvg, RouteHealthState, Slots, UnrecoverableReason, Versions,
};
use gnosis_vpn_lib::{command, connection};
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{Duration, SystemTime};

fn address() -> Address {
    Address::from([0xaau8; 20])
}

fn destination() -> Destination {
    let mut meta = HashMap::new();
    meta.insert("location".to_string(), "EU".to_string());
    Destination::new(
        "test-exit".to_string(),
        address(),
        HopRouting::try_from(1).unwrap(),
        meta,
    )
}

fn exit_health() -> ExitHealth {
    ExitHealth {
        checked_at: SystemTime::UNIX_EPOCH,
        versions: Versions {
            versions: vec!["v1".to_string()],
            latest: "v1".to_string(),
        },
        ping_rtt: Duration::from_millis(42),
        health: Health {
            slots: Slots {
                available: 10,
                connected: 1,
            },
            load_avg: LoadAvg {
                one: 0.1,
                five: 0.2,
                fifteen: 0.3,
                nproc: 4,
            },
        },
    }
}

fn status_base(run_mode: types::RunMode) -> types::StatusResponse {
    types::StatusResponse {
        run_mode,
        destinations: vec![],
        target_destination: None,
        connected: None,
        connecting: None,
        reconnecting: None,
        disconnecting: vec![],
    }
}

fn route_health_view(state: RouteHealthState) -> RouteHealthView {
    RouteHealthView {
        state,
        last_error: None,
        checking_since: None,
        consecutive_failures: 0,
    }
}

fn write(dir: &PathBuf, name: &str, val: &impl serde::Serialize) {
    let path = dir.join(name);
    let json = serde_json::to_string_pretty(val).expect("serialization failed");
    std::fs::write(&path, json).expect("failed to write fixture");
}

// Generates JSON fixture files from real Rust serde output so TypeScript Zod tests
// stay coupled to the actual wire format rather than hand-written guesses.
//
// Run `cargo test --test serialize_fixtures` after library type changes to regenerate.
// Then run `vitest` — a Zod mismatch means the schemas need updating.
#[test]
fn generate_fixtures() {
    let fixtures_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/services/fixtures");
    std::fs::create_dir_all(&fixtures_dir).expect("failed to create fixtures dir");

    write(
        &fixtures_dir,
        "status_not_running.json",
        &status_base(types::RunMode::NotRunning),
    );
    write(
        &fixtures_dir,
        "status_shutdown.json",
        &status_base(types::RunMode::Shutdown),
    );
    write(
        &fixtures_dir,
        "status_warmup.json",
        &status_base(types::RunMode::Warmup {
            status: types::CombinedHoprStatus::Initializing,
            last_error: None,
        }),
    );
    write(
        &fixtures_dir,
        "status_running.json",
        &status_base(types::RunMode::Running {
            funding_issues: None,
            hopr_status: None,
        }),
    );
    write(
        &fixtures_dir,
        "status_preparing_safe.json",
        &status_base(types::RunMode::PreparingSafe {
            node_address: "0x0000000000000000000000000000000000000000".to_string(),
            node_xdai: "0.0".to_string(),
            node_wxhopr: "0.0".to_string(),
            funding_tool: None,
            error: None,
            balance_recommendation: None,
        }),
    );
    write(
        &fixtures_dir,
        "status_deploying_safe.json",
        &status_base(types::RunMode::DeployingSafe {
            node_address: "0x0000000000000000000000000000000000000000".to_string(),
        }),
    );

    write(
        &fixtures_dir,
        "status_with_connections.json",
        &types::StatusResponse {
            run_mode: types::RunMode::NotRunning,
            destinations: vec![],
            target_destination: Some("test-exit".to_string()),
            connected: Some(command::ConnectedInfo {
                destination_id: "test-exit".to_string(),
                since: SystemTime::UNIX_EPOCH,
            }),
            connecting: Some(command::ConnectingInfo {
                destination_id: "test-exit".to_string(),
                since: SystemTime::UNIX_EPOCH,
                phase: connection::UpPhase::Init,
            }),
            reconnecting: Some(command::ReconnectingInfo {
                destination_id: "test-exit".to_string(),
                since: SystemTime::UNIX_EPOCH,
                phase: connection::UpPhase::Init,
            }),
            disconnecting: vec![command::DisconnectingInfo {
                destination_id: "test-exit".to_string(),
                since: SystemTime::UNIX_EPOCH,
                phase: connection::DownPhase::Disconnecting,
            }],
        },
    );

    // One DestinationState per RouteHealthState variant (all in one StatusResponse)
    // so the TypeScript test can parse a single fixture covering every state.
    let route_health_variants = vec![
        command::DestinationState {
            destination: destination(),
            route_health: Some(route_health_view(RouteHealthState::Routable)),
        },
        command::DestinationState {
            destination: destination(),
            route_health: Some(route_health_view(RouteHealthState::NeedsChannel)),
        },
        command::DestinationState {
            destination: destination(),
            route_health: Some(route_health_view(RouteHealthState::NeedsPeering {
                has_channel: false,
            })),
        },
        command::DestinationState {
            destination: destination(),
            route_health: Some(route_health_view(RouteHealthState::Unrecoverable {
                reason: UnrecoverableReason::NotAllowed,
            })),
        },
        command::DestinationState {
            destination: destination(),
            route_health: Some(route_health_view(RouteHealthState::ReadyToConnect {
                exit: exit_health(),
            })),
        },
        command::DestinationState {
            destination: destination(),
            route_health: Some(route_health_view(RouteHealthState::Connecting {
                exit: exit_health(),
                tunnel_ping_rtt: Some(Duration::from_millis(12)),
            })),
        },
        command::DestinationState {
            destination: destination(),
            route_health: None,
        },
    ];
    write(
        &fixtures_dir,
        "status_route_health_variants.json",
        &types::StatusResponse {
            run_mode: types::RunMode::NotRunning,
            destinations: route_health_variants,
            target_destination: None,
            connected: None,
            connecting: None,
            reconnecting: None,
            disconnecting: vec![],
        },
    );

    write(
        &fixtures_dir,
        "connect_destination_not_found.json",
        &command::ConnectResponse::DestinationNotFound,
    );
    write(
        &fixtures_dir,
        "connect_connecting.json",
        &command::ConnectResponse::Connecting(destination()),
    );
    write(
        &fixtures_dir,
        "connect_already_connected.json",
        &command::ConnectResponse::AlreadyConnected(destination()),
    );
    write(
        &fixtures_dir,
        "connect_waiting.json",
        &command::ConnectResponse::WaitingToConnect(destination(), RouteHealthState::Routable),
    );
    write(
        &fixtures_dir,
        "connect_unable.json",
        &command::ConnectResponse::UnableToConnect(destination(), RouteHealthState::NeedsChannel),
    );

    write(
        &fixtures_dir,
        "disconnect_not_connected.json",
        &command::DisconnectResponse::NotConnected,
    );
    write(
        &fixtures_dir,
        "disconnect_disconnecting.json",
        &command::DisconnectResponse::Disconnecting(destination()),
    );

    let balance_info = command::Info {
        node_address: address(),
        node_peer_id: "16Uiu2HAmTest".to_string(),
        safe_address: address(),
    };
    write(
        &fixtures_dir,
        "balance_response.json",
        &types::BalanceResponse {
            node: "0.0".to_string(),
            safe: "0.0".to_string(),
            channels_out: "0.0".to_string(),
            info: balance_info,
            funding_issues: None,
            ideal_balance: None,
            capacity_allocations: None,
        },
    );

    write(
        &fixtures_dir,
        "service_info.json",
        &command::InfoResponse {
            version: "0.91.0".to_string(),
            log_file: None,
            package_version: None,
        },
    );
}
