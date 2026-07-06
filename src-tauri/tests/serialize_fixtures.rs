use gnosis_vpn_app_lib::settings::{Settings, SortOrder, UpdateChannel};
use gnosis_vpn_app_lib::types;
use gnosis_vpn_lib::balance::{
    Balance, BalanceRecommendation, Balances, Capacity, CapacityAllocator, FundingIssue, WxHOPR,
    XDai,
};
use gnosis_vpn_lib::check_update;
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

fn balance_info() -> command::Info {
    command::Info {
        node_address: address(),
        node_peer_id: "16Uiu2HAmTest".to_string(),
        safe_address: address(),
    }
}

fn zero_balances() -> Balances {
    Balances {
        node_xdai: Balance::<XDai>::zero(),
        safe_wxhopr: Balance::<WxHOPR>::zero(),
        channels_out: HashMap::new(),
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
    std::fs::write(&path, format!("{json}\n")).expect("failed to write fixture");
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

    // PreparingSafe — no balance_recommendation
    let preparing_safe_zero = types::RunMode::from(command::RunMode::PreparingSafe {
        node_address: address(),
        node_xdai: Balance::<XDai>::zero(),
        node_wxhopr: Balance::<WxHOPR>::zero(),
        funding_tool: None,
        error: None,
        balance_recommendation: None,
    });
    write(
        &fixtures_dir,
        "status_preparing_safe.json",
        &status_base(preparing_safe_zero),
    );

    // PreparingSafe — with a non-zero balance_recommendation
    // 10 wxHOPR = 10 * 10^18 wei, 0.1 xDAI = 10^17 wei
    let preparing_safe_with_rec = types::RunMode::from(command::RunMode::PreparingSafe {
        node_address: address(),
        node_xdai: Balance::<XDai>::from(10_000_000_000_000_000u64), // 0.01 xDAI
        node_wxhopr: Balance::<WxHOPR>::from(500_000_000_000_000_000u64), // 0.5 wxHOPR
        funding_tool: None,
        error: None,
        balance_recommendation: Some(BalanceRecommendation {
            wxhopr: Balance::<WxHOPR>::from(10_000_000_000_000_000_000u64), // 10 wxHOPR
            xdai: Balance::<XDai>::from(100_000_000_000_000_000u64),        // 0.1 xDAI
        }),
    });
    write(
        &fixtures_dir,
        "status_preparing_safe_with_recommendation.json",
        &status_base(preparing_safe_with_rec),
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

    // balance_response — all nulls, zero balances
    let balance_zero = types::BalanceResponse::from(command::BalanceResponse::build(
        &balance_info(),
        &zero_balances(),
        &HashMap::new(),
        None,
        None,
        None,
    ));
    write(&fixtures_dir, "balance_response.json", &balance_zero);

    // balance_response — with ideal_balance and a funding issue
    // 1 wxHOPR = 10^18 wei, 0.05 xDAI = 5 * 10^16 wei
    let balances_with_funds = Balances {
        node_xdai: Balance::<XDai>::from(30_000_000_000_000_000u64), // 0.03 xDAI
        safe_wxhopr: Balance::<WxHOPR>::from(1_000_000_000_000_000_000u64), // 1 wxHOPR
        channels_out: HashMap::new(),
    };
    let ideal = BalanceRecommendation {
        wxhopr: Balance::<WxHOPR>::from(2_000_000_000_000_000_000u64), // 2 wxHOPR
        xdai: Balance::<XDai>::from(50_000_000_000_000_000u64),        // 0.05 xDAI
    };
    let balance_with_issues = types::BalanceResponse::from(command::BalanceResponse::build(
        &balance_info(),
        &balances_with_funds,
        &HashMap::new(),
        None,
        Some(ideal),
        Some(vec![
            FundingIssue::NodeLowOnFunds,
            FundingIssue::SafeLowOnFunds,
        ]),
    ));
    write(
        &fixtures_dir,
        "balance_response_with_issues.json",
        &balance_with_issues,
    );

    // balance_response — with capacity_allocations (Safe + Peer)
    let mut capacity_map = HashMap::new();
    capacity_map.insert(
        CapacityAllocator::Safe,
        Capacity {
            stake: Balance::<WxHOPR>::from(2_000_000_000_000_000_000u64), // 2 wxHOPR
            expected_messages: 1000,
            min_guaranteed_messages: 100,
            byte_capacity: 1_048_576,
        },
    );
    capacity_map.insert(
        CapacityAllocator::Peer(address()),
        Capacity {
            stake: Balance::<WxHOPR>::from(500_000_000_000_000_000u64), // 0.5 wxHOPR
            expected_messages: 250,
            min_guaranteed_messages: 25,
            byte_capacity: 262_144,
        },
    );
    let balance_with_capacity = types::BalanceResponse::from(command::BalanceResponse::build(
        &balance_info(),
        &balances_with_funds,
        &HashMap::new(),
        Some(&capacity_map),
        None,
        None,
    ));
    write(
        &fixtures_dir,
        "balance_response_with_capacity.json",
        &balance_with_capacity,
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

    write(&fixtures_dir, "settings_default.json", &Settings::default());
    write(&fixtures_dir, "settings_full.json", &full_settings());
}

fn full_settings() -> Settings {
    // Built via deserialization so the manifest field types (Timestamp, Url,
    // ByteSize, Hash) don't require their crates as test dependencies;
    // from_value fails loudly if the wire format drifts.
    let manifest: check_update::Manifest = serde_json::from_value(serde_json::json!({
        "schema_version": 1,
        "generated_at": "2026-07-06T00:00:00Z",
        "channels": {
            "stable": {
                "version": "0.29.0",
                "published_at": "2026-07-01T12:00:00Z",
                "download_url": "https://download.gnosisvpn.io/app/0.29.0.AppImage",
                "size_bytes": 123456789,
                "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "artifact_signature": "sig",
                "release_notes": "notes",
                "min_os_version": "10.15",
                "min_app_version": "0.28.0"
            },
            "snapshot": null
        }
    }))
    .expect("valid manifest fixture");

    Settings {
        preferred_location: Some("exit-1".to_string()),
        connect_on_startup: true,
        start_minimized: true,
        update_check: true,
        exit_node_sort_order: SortOrder::Alpha,
        last_checked_at: Some(1_720_000_000_000),
        update_manifest: Some(manifest),
        channel: Some(UpdateChannel::Snapshot),
        dismissed_update_version: Some("0.28.0".to_string()),
        show_detailed_metrics: true,
    }
}
