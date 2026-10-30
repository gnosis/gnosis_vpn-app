use gnosis_vpn_app_lib::settings::{FlagDisplay, Settings, SortOrder, UpdateChannel};
use gnosis_vpn_app_lib::toolkit::{CheckOutcome, CheckResult, EndOfLife, Manifest, ToolkitInfo};
use gnosis_vpn_app_lib::types;
use gnosis_vpn_app_lib::update_install::InstallStatus;
use gnosis_vpn_ipc as ipc;
use gnosis_vpn_ipc::{
    Address, ApiVersion, Balance, BalanceRecommendation, Balances, Capacity, CapacityAllocations,
    ChannelMaintenance, Connection, Destination, DestinationSource, DestinationStatus,
    ExitVersions, FundingLevel, FundingStatus, Geo, GeoSource, Health, Hops, LoadAvg, Meta,
    Overrides, ProbeResponse, ProbeState, ProbeView, QuickProbeCheck, QuickProbeResponse,
    QuickProbeState, RouteHealthState, RouteHealthView, RouteWalk, RunMode, Slots, Status,
    UnprobeResponse, UnrecoverableReason, WarmupStage, WxHopr, XDai,
};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

fn address() -> Address {
    Address::new([0xaa; 20])
}

fn destination() -> Destination {
    Destination {
        id: "test-exit".into(),
        meta: Meta::default(),
        geo: Some(Geo {
            country: "DE".parse().unwrap(),
            source: GeoSource::AnnouncedIp,
        }),
        address: address(),
        hops: Hops::try_from(1).unwrap(),
        gnosis_vpn_server: "172.30.0.1:8000".parse().unwrap(),
        wireguard_server: "172.30.0.1:51820".parse().unwrap(),
        source: DestinationSource::Configured,
        overrides: Overrides::default(),
    }
}

fn pinned_destination() -> Destination {
    let pinned = BTreeMap::from([("name".to_string(), "Frankfurt-1".to_string())]);
    let labels = [
        ("name".to_string(), "Frankfurt-1".to_string()),
        (
            "description".to_string(),
            "10Gbit uplink, no logs kept".to_string(),
        ),
    ];
    Destination {
        id: "pinned-exit".into(),
        meta: Meta::from_labels(labels),
        geo: None,
        source: DestinationSource::ConfiguredAndDiscovered,
        overrides: Overrides {
            configured_meta: pinned,
            configured_gnosis_vpn_server: None,
            configured_wireguard_server: None,
        },
        ..destination()
    }
}

fn health() -> Health {
    Health {
        slots: Slots {
            total: 16,
            available: 10,
            connected: 1,
        },
        load_avg: LoadAvg {
            one: 0.1,
            five: 0.2,
            fifteen: 0.3,
            nproc: 4,
        },
    }
}

fn versions() -> ExitVersions {
    ExitVersions {
        api: vec![ApiVersion::new(1)],
        server: Some(semver::Version::new(0, 7, 1)),
    }
}

fn paths_walk() -> RouteWalk {
    RouteWalk::Paths {
        walked_at: SystemTime::UNIX_EPOCH,
        count: 3,
        distinct_first_relays: 2,
        best_relays: vec![address()],
        best_value: 0.75,
        return_count: 2,
        return_best_relays: vec![address()],
        return_best_value: 0.5,
    }
}

fn quick_check() -> QuickProbeCheck {
    QuickProbeCheck {
        checked_at: SystemTime::UNIX_EPOCH,
        versions: versions(),
        api_version: Some(ApiVersion::new(1)),
        load: health(),
        status_rtt: Duration::from_millis(42),
    }
}

fn checked_probe() -> QuickProbeState {
    QuickProbeState::Checked(quick_check())
}

fn ready_probe() -> ProbeView {
    ProbeView {
        destination: "test-exit".into(),
        state: ProbeState::Ready,
        session_since: Some(SystemTime::UNIX_EPOCH),
        versions: Some(versions()),
        api_version: Some(ApiVersion::new(1)),
        ping_rtt: Some(Duration::from_millis(42)),
        load: Some(health()),
        checked_at: Some(SystemTime::UNIX_EPOCH),
        consecutive_failures: 0,
        last_error: None,
    }
}

fn running() -> RunMode {
    RunMode::Running {
        hopr_status: None,
        funding_status: None,
        channel_maintenance: ChannelMaintenance::Ok,
    }
}

fn balances(node: Balance<XDai>, safe: Balance<WxHopr>) -> Balances {
    Balances {
        node,
        safe,
        channels_out: vec![],
        info: ipc::NodeInfo {
            node_address: address(),
            node_peer_id: "16Uiu2HAmTest".into(),
            safe_address: address(),
        },
        capacity_allocations: None,
        ideal_balance: None,
        funding_status: None,
    }
}

fn status_base(run_mode: RunMode) -> Status {
    Status {
        run_mode,
        destinations: vec![],
        target: None,
        connection: Connection::Disconnected,
        disconnecting: vec![],
        probe: None,
    }
}

fn status_with_connection(connection: Connection) -> Status {
    Status {
        target: connection.destination().cloned(),
        connection,
        ..status_base(running())
    }
}

fn route_health_view(
    state: RouteHealthState,
    walk: Option<RouteWalk>,
    quick_probe: Option<QuickProbeState>,
) -> RouteHealthView {
    RouteHealthView {
        state,
        last_error: None,
        walk,
        quick_probe,
    }
}

fn dest_state(route_health: Option<RouteHealthView>) -> DestinationStatus {
    DestinationStatus {
        destination: destination(),
        route_health,
    }
}

fn ambiguous_candidates() -> Vec<ipc::DestinationId> {
    vec!["frankfurt-1".into(), "frankfurt-1-a4c2".into()]
}

fn write(dir: &Path, name: &str, val: &impl serde::Serialize) {
    let path = dir.join(name);
    let json = serde_json::to_string_pretty(val).expect("serialization failed");
    std::fs::write(&path, format!("{json}\n")).expect("failed to write fixture");
}

// Real serde output keeps the TypeScript Zod tests honest; regenerate with `cargo test --test serialize_fixtures`.
#[test]
fn generate_fixtures() {
    let fixtures_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/services/fixtures");
    std::fs::create_dir_all(&fixtures_dir).expect("failed to create fixtures dir");

    write(
        &fixtures_dir,
        "status_not_running.json",
        &status_base(RunMode::NotRunning),
    );
    write(
        &fixtures_dir,
        "status_shutdown.json",
        &status_base(RunMode::Shutdown),
    );
    write(
        &fixtures_dir,
        "status_init.json",
        &status_base(RunMode::Init { last_error: None }),
    );
    write(
        &fixtures_dir,
        "status_warmup.json",
        &status_base(RunMode::Warmup {
            stage: WarmupStage::WaitingForFunds,
            last_error: None,
        }),
    );
    write(
        &fixtures_dir,
        "status_running.json",
        &status_base(running()),
    );

    write(
        &fixtures_dir,
        "status_channel_maintenance_unavailable.json",
        &status_base(RunMode::Running {
            hopr_status: None,
            funding_status: None,
            channel_maintenance: ChannelMaintenance::Unavailable {
                since: SystemTime::UNIX_EPOCH,
            },
        }),
    );

    // A reconnect with no attempt in flight: the daemon holds the target and waits on route health.
    write(
        &fixtures_dir,
        "status_reconnect_waiting.json",
        &status_with_connection(Connection::Reconnecting {
            destination: "test-exit".into(),
            since: SystemTime::UNIX_EPOCH,
            phase: None,
        }),
    );

    write(
        &fixtures_dir,
        "status_preparing_safe.json",
        &status_base(RunMode::PreparingSafe {
            node_address: address(),
            node_xdai: Balance::zero(),
            node_wxhopr: Balance::zero(),
            funding_tool: None,
            error: None,
            balance_recommendation: None,
        }),
    );

    write(
        &fixtures_dir,
        "status_preparing_safe_with_recommendation.json",
        &status_base(RunMode::PreparingSafe {
            node_address: address(),
            node_xdai: Balance::from_wei(10_000_000_000_000_000), // 0.01 xDAI
            node_wxhopr: Balance::from_wei(500_000_000_000_000_000), // 0.5 wxHOPR
            funding_tool: None,
            error: None,
            balance_recommendation: Some(Box::new(BalanceRecommendation {
                wxhopr: Balance::from_wei(10_000_000_000_000_000_000), // 10 wxHOPR
                xdai: Balance::from_wei(100_000_000_000_000_000),      // 0.1 xDAI
                channel_stakes: Balance::from_wei(9_990_000_000_000_000_000), // 9.99 wxHOPR
                fee_to_start: Balance::from_wei(10_000_000_000_000_000), // 0.01 wxHOPR
                txs_to_start: 3,
                xdai_fee_per_tx: Balance::from_wei(100_000_000_000_000_000), // 0.1 xDAI
                topup_headroom: Balance::zero(),
            })),
        }),
    );

    write(
        &fixtures_dir,
        "status_deploying_safe.json",
        &status_base(RunMode::DeployingSafe {
            node_address: Address::new([0; 20]),
        }),
    );
    write(
        &fixtures_dir,
        "status_restarting.json",
        &status_base(RunMode::Restarting),
    );

    // Connected while the previous exit still tears down in the background, with a ready probe.
    write(
        &fixtures_dir,
        "status_connected.json",
        &Status {
            disconnecting: vec![ipc::Disconnecting {
                destination: "pinned-exit".into(),
                since: SystemTime::UNIX_EPOCH,
                phase: ipc::DisconnectPhase::UnregisterWg,
            }],
            probe: Some(ready_probe()),
            ..status_with_connection(Connection::Connected {
                destination: "test-exit".into(),
                since: SystemTime::UNIX_EPOCH,
                tunnel_ping_rtt: Some(Duration::from_millis(12)),
                stall: None,
            })
        },
    );
    write(
        &fixtures_dir,
        "status_connecting.json",
        &status_with_connection(Connection::Connecting {
            destination: "test-exit".into(),
            since: SystemTime::UNIX_EPOCH,
            phase: ipc::ConnectPhase::RegisterWg,
        }),
    );
    write(
        &fixtures_dir,
        "status_reconnecting.json",
        &status_with_connection(Connection::Reconnecting {
            destination: "test-exit".into(),
            since: SystemTime::UNIX_EPOCH,
            phase: Some(ipc::ConnectPhase::Init),
        }),
    );
    write(
        &fixtures_dir,
        "status_disconnecting.json",
        &Status {
            disconnecting: vec![ipc::Disconnecting {
                destination: "test-exit".into(),
                since: SystemTime::UNIX_EPOCH,
                phase: ipc::DisconnectPhase::Disconnecting,
            }],
            ..status_base(running())
        },
    );

    // Tunnel up but the data path stalled: counted ping failures short of the reconnect threshold.
    write(
        &fixtures_dir,
        "status_connected_stalled.json",
        &status_with_connection(Connection::Connected {
            destination: "test-exit".into(),
            since: SystemTime::UNIX_EPOCH,
            tunnel_ping_rtt: Some(Duration::from_millis(12)),
            stall: Some(ipc::TunnelStall {
                since: SystemTime::UNIX_EPOCH,
                failed_pings: 2,
                reconnect_at: 3,
            }),
        }),
    );

    // A probe session that has not produced a result yet: every optional is null.
    write(
        &fixtures_dir,
        "status_probe_opening.json",
        &Status {
            probe: Some(ProbeView {
                destination: "test-exit".into(),
                state: ProbeState::Opening,
                session_since: None,
                versions: None,
                api_version: None,
                ping_rtt: None,
                load: None,
                checked_at: None,
                consecutive_failures: 2,
                last_error: Some("timeout".to_string()),
            }),
            ..status_base(running())
        },
    );

    // One DestinationStatus per RouteHealthState/RouteWalk/QuickProbeState variant, in one fixture.
    let mut walk_timed_out = route_health_view(
        RouteHealthState::NotRoutable,
        Some(RouteWalk::NoPath {
            walked_at: SystemTime::UNIX_EPOCH,
            forward_count: 0,
            return_count: 0,
        }),
        None,
    );
    walk_timed_out.last_error = Some("walk timed out".to_string());
    let route_health_variants = vec![
        dest_state(Some(route_health_view(
            RouteHealthState::Routable,
            Some(paths_walk()),
            Some(checked_probe()),
        ))),
        // A 0-hop route has a single relay-less path.
        dest_state(Some(route_health_view(
            RouteHealthState::Routable,
            Some(RouteWalk::Paths {
                walked_at: SystemTime::UNIX_EPOCH,
                count: 1,
                distinct_first_relays: 0,
                best_relays: vec![],
                best_value: 1.0,
                return_count: 1,
                return_best_relays: vec![],
                return_best_value: 1.0,
            }),
            Some(QuickProbeState::Checking {
                since: SystemTime::UNIX_EPOCH,
                last: None,
            }),
        ))),
        dest_state(Some(walk_timed_out)),
        dest_state(Some(route_health_view(
            RouteHealthState::NotRoutable,
            Some(RouteWalk::NotAnnounced {
                walked_at: SystemTime::UNIX_EPOCH,
            }),
            None,
        ))),
        dest_state(Some(route_health_view(
            RouteHealthState::Unrecoverable {
                reason: UnrecoverableReason::NotAllowed,
            },
            None,
            None,
        ))),
        dest_state(Some(route_health_view(
            RouteHealthState::Unrecoverable {
                reason: UnrecoverableReason::IncompatibleApiVersion {
                    offered: vec![ApiVersion::new(2)],
                },
            },
            Some(paths_walk()),
            Some(QuickProbeState::Failed {
                checked_at: SystemTime::UNIX_EPOCH,
                error: "unsupported api".to_string(),
            }),
        ))),
        dest_state(Some(route_health_view(
            RouteHealthState::Unrecoverable {
                reason: UnrecoverableReason::CannotOpenSession {
                    error: "surb buffer too small".to_string(),
                },
            },
            Some(paths_walk()),
            None,
        ))),
        dest_state(None),
        DestinationStatus {
            destination: pinned_destination(),
            route_health: None,
        },
        // A re-check keeps what the previous one measured.
        dest_state(Some(route_health_view(
            RouteHealthState::Routable,
            Some(paths_walk()),
            Some(QuickProbeState::Checking {
                since: SystemTime::UNIX_EPOCH,
                last: Some(quick_check()),
            }),
        ))),
    ];
    write(
        &fixtures_dir,
        "status_route_health_variants.json",
        &Status {
            destinations: route_health_variants,
            ..status_base(RunMode::NotRunning)
        },
    );

    write(
        &fixtures_dir,
        "connect_destination_not_found.json",
        &ipc::ConnectResponse::DestinationNotFound,
    );
    write(
        &fixtures_dir,
        "connect_ambiguous.json",
        &ipc::ConnectResponse::DestinationAmbiguous {
            candidates: ambiguous_candidates(),
        },
    );
    write(
        &fixtures_dir,
        "connect_connecting.json",
        &ipc::ConnectResponse::Connecting {
            destination: Box::new(destination()),
        },
    );
    write(
        &fixtures_dir,
        "connect_already_connected.json",
        &ipc::ConnectResponse::AlreadyConnected {
            destination: Box::new(destination()),
        },
    );
    write(
        &fixtures_dir,
        "connect_waiting.json",
        &ipc::ConnectResponse::WaitingToConnect {
            destination: Box::new(destination()),
            route_health: RouteHealthState::Routable,
        },
    );
    write(
        &fixtures_dir,
        "connect_unable.json",
        &ipc::ConnectResponse::UnableToConnect {
            destination: Box::new(destination()),
            route_health: RouteHealthState::NotRoutable,
        },
    );

    write(
        &fixtures_dir,
        "disconnect_not_connected.json",
        &ipc::DisconnectResponse::NotConnected,
    );
    write(
        &fixtures_dir,
        "disconnect_disconnecting.json",
        &ipc::DisconnectResponse::Disconnecting {
            destination: Box::new(destination()),
        },
    );

    write(
        &fixtures_dir,
        "probe_probing.json",
        &ProbeResponse::Probing {
            destination: Box::new(destination()),
        },
    );
    write(
        &fixtures_dir,
        "probe_replaced.json",
        &ProbeResponse::Replaced {
            destination: Box::new(destination()),
            previous: Box::new(pinned_destination()),
        },
    );
    write(
        &fixtures_dir,
        "probe_already_probing.json",
        &ProbeResponse::AlreadyProbing {
            destination: Box::new(destination()),
        },
    );
    write(
        &fixtures_dir,
        "probe_in_use.json",
        &ProbeResponse::InUse {
            destination: Box::new(destination()),
        },
    );
    write(
        &fixtures_dir,
        "probe_unable.json",
        &ProbeResponse::UnableToProbe {
            destination: Box::new(destination()),
            route_health: RouteHealthState::NotRoutable,
        },
    );
    write(
        &fixtures_dir,
        "probe_not_ready.json",
        &ProbeResponse::NotReady,
    );
    write(
        &fixtures_dir,
        "probe_destination_not_found.json",
        &ProbeResponse::DestinationNotFound,
    );
    write(
        &fixtures_dir,
        "probe_ambiguous.json",
        &ProbeResponse::DestinationAmbiguous {
            candidates: ambiguous_candidates(),
        },
    );

    write(
        &fixtures_dir,
        "unprobe_closing.json",
        &UnprobeResponse::Closing {
            destination: Box::new(destination()),
        },
    );
    write(
        &fixtures_dir,
        "unprobe_in_use.json",
        &UnprobeResponse::InUse {
            destination: Box::new(destination()),
        },
    );
    write(
        &fixtures_dir,
        "unprobe_not_probing.json",
        &UnprobeResponse::NotProbing,
    );

    write(
        &fixtures_dir,
        "quick_probe_checking.json",
        &QuickProbeResponse::Checking {
            destination: Box::new(destination()),
        },
    );
    write(
        &fixtures_dir,
        "quick_probe_unable.json",
        &QuickProbeResponse::UnableToProbe {
            destination: Box::new(destination()),
            route_health: RouteHealthState::Unrecoverable {
                reason: UnrecoverableReason::NotAllowed,
            },
        },
    );
    write(
        &fixtures_dir,
        "quick_probe_already_probing.json",
        &QuickProbeResponse::AlreadyProbing {
            destination: Box::new(destination()),
        },
    );
    write(
        &fixtures_dir,
        "quick_probe_already_checking.json",
        &QuickProbeResponse::AlreadyChecking {
            destination: Box::new(destination()),
        },
    );
    write(
        &fixtures_dir,
        "quick_probe_not_ready.json",
        &QuickProbeResponse::NotReady,
    );
    write(
        &fixtures_dir,
        "quick_probe_destination_not_found.json",
        &QuickProbeResponse::DestinationNotFound,
    );
    write(
        &fixtures_dir,
        "quick_probe_ambiguous.json",
        &QuickProbeResponse::DestinationAmbiguous {
            candidates: ambiguous_candidates(),
        },
    );

    write(
        &fixtures_dir,
        "balance_response.json",
        &types::BalanceResponse::from(balances(Balance::zero(), Balance::zero())),
    );

    let node_xdai = Balance::from_wei(30_000_000_000_000_000); // 0.03 xDAI
    let safe_wxhopr = Balance::from_wei(1_000_000_000_000_000_000); // 1 wxHOPR

    write(
        &fixtures_dir,
        "balance_response_with_issues.json",
        &types::BalanceResponse::from(Balances {
            ideal_balance: Some(BalanceRecommendation {
                wxhopr: Balance::from_wei(2_000_000_000_000_000_000), // 2 wxHOPR
                xdai: Balance::from_wei(50_000_000_000_000_000),      // 0.05 xDAI
                channel_stakes: Balance::from_wei(2_000_000_000_000_000_000), // 2 wxHOPR
                fee_to_start: Balance::zero(), // key already bound while running
                txs_to_start: 0,
                xdai_fee_per_tx: Balance::from_wei(50_000_000_000_000_000), // 0.05 xDAI
                topup_headroom: Balance::zero(),
            }),
            funding_status: Some(FundingStatus {
                traffic: FundingLevel::Low,
                gas: FundingLevel::Low,
                wxhopr_deficit: Some(Balance::from_wei(1_000_000_000_000_000_000)), // 1 wxHOPR
                xdai_deficit: Some(Balance::from_wei(20_000_000_000_000_000)),      // 0.02 xDAI
                refill_shortfall: None,
            }),
            ..balances(node_xdai, safe_wxhopr)
        }),
    );

    // Funded to the ideal, but the Safe cannot cover the next channel top-up pass.
    write(
        &fixtures_dir,
        "balance_response_with_refill_shortfall.json",
        &types::BalanceResponse::from(Balances {
            funding_status: Some(FundingStatus {
                traffic: FundingLevel::Low,
                gas: FundingLevel::Good,
                wxhopr_deficit: None,
                xdai_deficit: None,
                refill_shortfall: Some(Balance::from_wei(500_000_000_000_000_000)), // 0.5 wxHOPR
            }),
            ..balances(node_xdai, safe_wxhopr)
        }),
    );

    // One open channel, the Safe, and wxHOPR on the node EOA not yet swept into the Safe.
    let capacity_allocations = CapacityAllocations {
        peer_allocations: BTreeMap::from([(
            address(),
            Capacity {
                stake: Balance::from_wei(500_000_000_000_000_000), // 0.5 wxHOPR
                expected_messages: 250,
                min_guaranteed_messages: 25,
                byte_capacity: 262_144,
            },
        )]),
        node: Capacity {
            stake: Balance::from_wei(250_000_000_000_000_000), // 0.25 wxHOPR
            expected_messages: 125,
            min_guaranteed_messages: 12,
            byte_capacity: 131_072,
        },
        safe: Capacity {
            stake: Balance::from_wei(2_000_000_000_000_000_000), // 2 wxHOPR
            expected_messages: 1000,
            min_guaranteed_messages: 100,
            byte_capacity: 1_048_576,
        },
    };
    write(
        &fixtures_dir,
        "balance_response_with_capacity.json",
        &types::BalanceResponse::from(Balances {
            capacity_allocations: Some(capacity_allocations),
            ..balances(node_xdai, safe_wxhopr)
        }),
    );

    write(
        &fixtures_dir,
        "service_info.json",
        &ipc::InfoResponse {
            version: semver::Version::new(0, 91, 0),
            log_file: None,
            package_version: None,
            worker_log_dir: Some(PathBuf::from("/home/alice/.local/state/gnosisvpn")),
        },
    );

    write(&fixtures_dir, "settings_default.json", &Settings::default());
    write(&fixtures_dir, "settings_full.json", &full_settings());

    // update-install-status event payloads (see updateInstall.test.ts)
    write(
        &fixtures_dir,
        "install_status_checking.json",
        &InstallStatus::Checking,
    );
    write(
        &fixtures_dir,
        "install_status_downloading.json",
        &InstallStatus::Downloading,
    );
    write(
        &fixtures_dir,
        "install_status_installing.json",
        &InstallStatus::Installing,
    );
    write(
        &fixtures_dir,
        "install_status_completed.json",
        &InstallStatus::Completed {
            new_version: "0.78.0".to_string(),
        },
    );
    write(
        &fixtures_dir,
        "install_status_failed.json",
        &InstallStatus::Failed {
            stage: "Download".to_string(),
            error: "connection reset".to_string(),
        },
    );

    // toolkit outputs as the app forwards them (see settingsStore.test.ts)
    write(
        &fixtures_dir,
        "toolkit_info.json",
        &ToolkitInfo {
            version: "0.4.0".to_string(),
            package_version: Some("0.78.0".to_string()),
        },
    );
    let manifest = fixture_manifest();
    let stable = manifest
        .channels
        .stable
        .clone()
        .expect("fixture manifest has a stable release");
    write(
        &fixtures_dir,
        "check_result_available.json",
        &CheckResult {
            channel: UpdateChannel::Stable,
            outcome: CheckOutcome::Available {
                current: "0.28.5".to_string(),
                release: Box::new(stable),
            },
            end_of_life: Some(fixture_end_of_life()),
            manifest: Some(manifest.clone()),
        },
    );
    write(
        &fixtures_dir,
        "check_result_up_to_date.json",
        &CheckResult {
            channel: UpdateChannel::Stable,
            outcome: CheckOutcome::UpToDate {
                current: "0.29.0".to_string(),
            },
            end_of_life: None,
            manifest: Some(manifest.clone()),
        },
    );
    write(
        &fixtures_dir,
        "check_result_no_release.json",
        &CheckResult {
            channel: UpdateChannel::Snapshot,
            outcome: CheckOutcome::NoReleaseForChannel {
                current: Some("2026.07.01+build.000001".to_string()),
                channel: UpdateChannel::Snapshot,
            },
            end_of_life: None,
            manifest: Some(manifest),
        },
    );
}

/// The manifest shared by the settings and check-result fixtures. Built by
/// deserializing, so it also checks the app accepts the published shape.
fn fixture_manifest() -> Manifest {
    serde_json::from_value(serde_json::json!({
        "schema_version": 2,
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
    .expect("valid manifest fixture")
}

/// Covers the `current` of the available fixtures, as the binary would only then send it.
fn fixture_end_of_life() -> EndOfLife {
    EndOfLife {
        version: "0.28.5".to_string(),
        ends_at: "2026-10-15T00:00:00Z".to_string(),
        reason: "GnosisVPN versions up to 0.28.5 rely on legacy HOPR endpoints that are being shut down.".to_string(),
    }
}

fn full_settings() -> Settings {
    let stable = fixture_manifest()
        .channels
        .stable
        .expect("fixture manifest has a stable release");

    Settings {
        preferred_location: Some("exit-1".to_string()),
        last_connected_destination: Some("exit-1".to_string()),
        connect_on_startup: true,
        start_minimized: true,
        update_check: true,
        exit_node_sort_order: SortOrder::Alpha,
        last_checked_at: Some(1_720_000_000_000),
        last_check_outcome: Some(CheckOutcome::Available {
            current: "0.28.5".to_string(),
            release: Box::new(stable),
        }),
        last_end_of_life: Some(fixture_end_of_life()),
        channel: Some(UpdateChannel::Snapshot),
        dismissed_update_version: Some("0.28.0".to_string()),
        installed_version: Some("0.28.5".to_string()),
        show_detailed_metrics: true,
        flag_display: FlagDisplay::Mono,
    }
}
