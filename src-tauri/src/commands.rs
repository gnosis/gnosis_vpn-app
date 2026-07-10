use gnosis_vpn_lib::command;
use gnosis_vpn_lib::route_health::RouteHealthState;
use gnosis_vpn_lib::socket::root as root_socket;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio_util::sync::CancellationToken;
use zstd::stream::Encoder;

use std::fs::File;
use std::io::{self, BufReader};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::task::spawn_blocking;
use tokio::time::{self, Instant};

use crate::icons::{self, TrayIconState};
use crate::tray;
use crate::types::{BalanceResponse, ConnectionState, StatusResponse};
use crate::{AppStateCache, BalancePollingHandle, StatusPollingHandle};

const COMPATIBLE_VERSIONS: &[&str] = &["0.93"];

fn is_version_compatible(version: &str) -> bool {
    COMPATIBLE_VERSIONS
        .iter()
        .any(|c| version.trim().starts_with(c))
}

#[tauri::command]
pub async fn check_update(
    skip_vpn: bool,
) -> Result<gnosis_vpn_lib::check_update::Manifest, String> {
    let client = reqwest::Client::new();
    let socket_path = PathBuf::from(root_socket::DEFAULT_PATH);
    let path_ref = if skip_vpn {
        None
    } else {
        Some(socket_path.as_path())
    };

    gnosis_vpn_lib::check_update::download(&client, path_ref)
        .await
        .map_err(|e| match e {
            gnosis_vpn_lib::check_update::Error::VpnNotConnected => "VpnNotConnected".to_string(),
            gnosis_vpn_lib::check_update::Error::Integrity(msg) => format!("Integrity: {msg}"),
            gnosis_vpn_lib::check_update::Error::Other(msg) => msg,
        })
}

async fn query_info() -> Result<command::InfoResponse, String> {
    let p = PathBuf::from(root_socket::DEFAULT_PATH);
    let resp = root_socket::process_cmd(&p, &command::Command::Info)
        .await
        .map_err(|e| e.to_string())?;
    match resp {
        command::Response::Info(info) => Ok(info),
        _ => Err("Unexpected response type".to_string()),
    }
}

async fn start_client_worker(keep_alive: Duration) -> Result<(), String> {
    let p = PathBuf::from(root_socket::DEFAULT_PATH);
    let resp = root_socket::process_cmd(&p, &command::Command::StartClient(keep_alive))
        .await
        .map_err(|e| e.to_string())?;
    match resp {
        command::Response::StartClient(_) => Ok(()),
        _ => Err("Unexpected response type".to_string()),
    }
}

#[tauri::command]
pub async fn connect(
    id: String,
    polling_state: State<'_, Mutex<StatusPollingHandle>>,
) -> Result<command::ConnectResponse, String> {
    let p = PathBuf::from(root_socket::DEFAULT_PATH);
    let cmd = command::Command::Connect(id);
    let resp = root_socket::process_cmd(&p, &cmd)
        .await
        .map_err(|e| e.to_string())?;
    match resp {
        command::Response::Connect(resp) => {
            if let Ok(guard) = polling_state.lock() {
                guard.trigger.notify_one();
            }
            Ok(resp)
        }
        _ => Err("Unexpected response type".to_string()),
    }
}

#[tauri::command]
pub async fn disconnect(
    polling_state: State<'_, Mutex<StatusPollingHandle>>,
) -> Result<command::DisconnectResponse, String> {
    let p = PathBuf::from(root_socket::DEFAULT_PATH);
    let cmd = command::Command::Disconnect;
    let resp = root_socket::process_cmd(&p, &cmd)
        .await
        .map_err(|e| e.to_string())?;
    match resp {
        command::Response::Disconnect(resp) => {
            if let Ok(guard) = polling_state.lock() {
                guard.trigger.notify_one();
            }
            Ok(resp)
        }
        _ => Err("Unexpected response type".to_string()),
    }
}

async fn query_balance() -> (Duration, Result<Option<BalanceResponse>, String>) {
    let p = PathBuf::from(root_socket::DEFAULT_PATH);
    let resp = root_socket::process_cmd(&p, &command::Command::Balance).await;
    match resp {
        Ok(command::Response::Balance(Ok(balance_resp))) => {
            (Duration::from_secs(60), Ok(Some(balance_resp.into())))
        }
        Ok(command::Response::Balance(Err(_))) => (Duration::from_secs(5), Ok(None)),
        Ok(command::Response::WorkerOffline) => (Duration::from_secs(5), Ok(None)),
        Ok(unexpected) => (
            Duration::from_secs(5),
            Err(format!("Unexpected balance response: {:?}", unexpected)),
        ),
        Err(e) => (Duration::from_secs(5), Err(e.to_string())),
    }
}

#[cfg(target_os = "macos")]
#[allow(unexpected_cfgs)]
#[tauri::command]
pub async fn set_app_icon(app: AppHandle, icon_name: String) -> Result<(), String> {
    use dispatch::Queue;
    use std::sync::mpsc;

    let icon_data = app
        .state::<icons::IconCache>()
        .app_icon_bytes(&icon_name)
        .ok_or_else(|| format!("Invalid icon name: {icon_name}"))?;

    spawn_blocking(move || {
        let (tx, rx) = mpsc::channel();

        Queue::main().exec_async(move || unsafe {
            use objc::runtime::Object;

            type ObjcObjectPtr = *mut Object;

            let result = (|| {
                let app: ObjcObjectPtr = msg_send![class!(NSApplication), sharedApplication];
                if app.is_null() {
                    return Err("Failed to get NSApplication".to_string());
                }

                let data_alloc: ObjcObjectPtr = msg_send![class!(NSData), alloc];
                let data: ObjcObjectPtr = msg_send![
                    data_alloc,
                    initWithBytes: icon_data.as_ptr() as *const std::os::raw::c_void
                    length: icon_data.len() as u64
                ];

                if data.is_null() {
                    return Err("Failed to create NSData".to_string());
                }

                let app_icon_alloc: ObjcObjectPtr = msg_send![class!(NSImage), alloc];
                let app_icon: ObjcObjectPtr = msg_send![app_icon_alloc, initWithData: data];
                if app_icon.is_null() {
                    return Err("Failed to create NSImage from data".to_string());
                }

                let _: () = msg_send![app, setApplicationIconImage: app_icon];

                Ok(())
            })();

            let _ = tx.send(result);
        });

        rx.recv()
            .map_err(|e| format!("Failed to receive result from main thread: {}", e))?
    })
    .await
    .map_err(|e| format!("set_app_icon: blocking task panicked: {e}"))?
}

#[cfg(target_os = "linux")]
#[tauri::command]
pub async fn set_app_icon(app: AppHandle, icon_name: String) -> Result<(), String> {
    let image = app
        .state::<icons::IconCache>()
        .app_icon_image(&icon_name)
        .ok_or_else(|| format!("Invalid icon name: {icon_name}"))?;

    let mut errors = Vec::new();

    if let Some(window) = app.get_webview_window("main") {
        if let Err(e) = window.set_icon(image.clone()) {
            errors.push(format!("Failed to set main window icon: {e}"));
        }
    }

    if let Some(window) = app.get_webview_window("settings") {
        if let Err(e) = window.set_icon(image) {
            errors.push(format!("Failed to set settings window icon: {e}"));
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}

#[tauri::command]
pub async fn compress_logs(log_path: String, dest_path: String) -> Result<(), String> {
    let log_file = PathBuf::from(log_path)
        .canonicalize()
        .map_err(|e| format!("Cannot resolve log file path: {e}"))?;

    let dest_path_buf = PathBuf::from(dest_path);
    let dest_parent = dest_path_buf
        .parent()
        .ok_or_else(|| "Destination path must include a parent directory".to_string())?;
    let dest_dir = dest_parent
        .canonicalize()
        .map_err(|e| format!("Cannot resolve destination directory: {e}"))?;
    let dest_file_name = dest_path_buf
        .file_name()
        .ok_or_else(|| "Destination path must include a file name".to_string())?;
    let dest_file_raw = dest_dir.join(dest_file_name);
    let dest_file = if dest_file_raw.extension().and_then(|e| e.to_str()) == Some("zst") {
        dest_file_raw.clone()
    } else {
        dest_file_raw.with_added_extension("zst")
    };

    spawn_blocking(move || {
        let input_file =
            File::open(log_file).map_err(|e| format!("Failed to open log file: {}", e))?;
        let output_file =
            File::create(dest_file).map_err(|e| format!("Failed to create output file: {}", e))?;

        let mut encoder = Encoder::new(&output_file, 5)
            .map_err(|e| format!("Failed to create zstd encoder: {}", e))?;
        io::copy(&mut BufReader::new(input_file), &mut encoder)
            .map_err(|e| format!("Failed to compress log file: {}", e))?;
        encoder
            .finish()
            .map_err(|e| format!("Failed to finalize compression: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("compress_logs: blocking task panicked: {e}"))?
}

pub async fn stop_client() -> Result<(), String> {
    let p = PathBuf::from(root_socket::DEFAULT_PATH);
    let cmd = command::Command::StopClient;
    let resp = root_socket::process_cmd(&p, &cmd)
        .await
        .map_err(|e| e.to_string())?;
    match resp {
        command::Response::StopClient(_resp) => Ok(()),
        _ => Err("Unexpected response type".to_string()),
    }
}

#[derive(Serialize)]
pub struct CachedState {
    pub status: Result<StatusResponse, String>,
    pub balance: Result<BalanceResponse, String>,
    pub service_info: Option<command::InfoResponse>,
}

fn flatten_cached<T>(v: Option<Result<Option<T>, String>>) -> Result<T, String> {
    match v {
        None | Some(Ok(None)) => Err("not available".to_string()),
        Some(Ok(Some(inner))) => Ok(inner),
        Some(Err(e)) => Err(e),
    }
}

#[tauri::command]
pub fn get_cached_state(cache: State<'_, AppStateCache>) -> CachedState {
    CachedState {
        status: flatten_cached(cache.status.borrow().clone()),
        balance: flatten_cached(cache.balance.borrow().clone()),
        service_info: cache.service_info.borrow().clone(),
    }
}

async fn spawn_polling_tasks(app_handle: AppHandle) -> Result<(), String> {
    let polling_state = app_handle.state::<Mutex<StatusPollingHandle>>();
    let bal_polling_state = app_handle.state::<Mutex<BalancePollingHandle>>();

    let prev_handle = {
        let mut guard = polling_state.lock().map_err(|e| e.to_string())?;
        guard.cancel.cancel();
        guard.cancel = CancellationToken::new();
        guard.handle.take()
    };
    if let Some(handle) = prev_handle {
        let _ = handle.await;
    }

    let prev_bal_handle = {
        let mut guard = bal_polling_state.lock().map_err(|e| e.to_string())?;
        guard.cancel.cancel();
        guard.cancel = CancellationToken::new();
        guard.handle.take()
    };
    if let Some(handle) = prev_bal_handle {
        let _ = handle.await;
    }

    let (cancel, trigger) = {
        let guard = polling_state.lock().map_err(|e| e.to_string())?;
        (guard.cancel.clone(), guard.trigger.clone())
    };

    let app = app_handle.clone();
    let join_handle = tauri::async_runtime::spawn(async move {
        let mut startup_connect_done = false;
        let tick_timeout = time::sleep(Duration::ZERO);
        tokio::pin!(tick_timeout);
        loop {
            tokio::select! {
                _ = cancel.cancelled() => {
                    println!("Status tick received cancellation signal, exiting...");
                    break;
                }
                _ = trigger.notified() => {
                    tick_timeout.as_mut().reset(Instant::now());
                }
                _ = tick_timeout.as_mut() => {
                    let (status_delay, result) = query_status().await;
                    tick_timeout.as_mut().reset(Instant::now() + status_delay);
                    if let Ok(Some(ref status)) = result {
                        let conn_state = status.into();

                        let icon_state = app.state::<Arc<Mutex<icons::IconState>>>();
                        let new_dock_icon = match icon_state.lock() {
                            Ok(mut guard) => guard.apply_status(&conn_state, &status.run_mode),
                            Err(e) => {
                                eprintln!("Failed to lock icon state: {}", e);
                                None
                            }
                        };

                        // during animation, the heartbeat logic owns app and tray icon changes
                        if !icons::is_animating_state(&conn_state) {
                            icons::update_tray_icon(&app, &app.state::<TrayIconState>(), &conn_state, icons::funds_level(&status.run_mode));

                            if let Some(icon_name) = new_dock_icon {
                                if let Err(e) = set_app_icon(app.clone(), icon_name).await {
                                    eprintln!("Failed to update app icon: {}", e);
                                }
                            }
                        }

                        let status_item = app.state::<tray::TrayStatusItem>();
                        if let Ok(guard) = status_item.0.lock() {
                            let _ = guard.set_text(conn_state.to_string());
                        };

                        let quit_label = match conn_state {
                            ConnectionState::Connected(_) | ConnectionState::Connecting(_) | ConnectionState::Reconnecting(_) => "Disconnect and Quit",
                            _ => "Quit",
                        };
                        let quit_item = app.state::<tray::TrayQuitItem>();
                        if let Ok(guard) = quit_item.0.lock() {
                            let _ = guard.set_text(quit_label);
                        };

                        if !startup_connect_done
                            && status.destinations.iter().any(|ds| is_positive_route_health(&ds.route_health))
                        {
                            startup_connect_done = true;
                            let settings = app.state::<crate::settings::SettingsStore>().current();
                            if settings.connect_on_startup {
                                if let Some(id) = pick_startup_target(&status.destinations, &settings.preferred_location) {
                                    let trigger_clone = trigger.clone();
                                    tauri::async_runtime::spawn(async move {
                                        let p = PathBuf::from(root_socket::DEFAULT_PATH);
                                        if let Err(e) = root_socket::process_cmd(&p, &command::Command::Connect(id)).await {
                                            eprintln!("connect on startup failed: {e}");
                                        }
                                        trigger_clone.notify_one();
                                    });
                                }
                            }
                        }
                    }
                    app.state::<AppStateCache>().status.send_replace(Some(result.clone()));
                    let _ = app.emit("status", result);
                }
            }
        }
    });

    {
        let mut guard = polling_state.lock().map_err(|e| e.to_string())?;
        guard.handle = Some(join_handle);
    }

    let bal_cancel = {
        let guard = bal_polling_state.lock().map_err(|e| e.to_string())?;
        guard.cancel.clone()
    };

    let app_bal = app_handle.clone();
    let bal_join_handle = tauri::async_runtime::spawn(async move {
        let tick_timeout = time::sleep(Duration::ZERO);
        tokio::pin!(tick_timeout);
        loop {
            tokio::select! {
                _ = bal_cancel.cancelled() => {
                    break;
                }
                _ = tick_timeout.as_mut() => {
                    let (delay, result) = query_balance().await;
                    tick_timeout.as_mut().reset(Instant::now() + delay);
                    app_bal.state::<AppStateCache>().balance.send_replace(Some(result.clone()));
                    let _ = app_bal.emit("balance", result);
                }
            }
        }
    });

    {
        let mut guard = bal_polling_state.lock().map_err(|e| e.to_string())?;
        guard.handle = Some(bal_join_handle);
    }

    Ok(())
}

pub async fn run_initialization_loop(app: AppHandle) {
    const RETRY_DELAY: Duration = Duration::from_secs(5);
    loop {
        let info = match query_info().await {
            Ok(i) => i,
            Err(e) => {
                let _ = app.emit(
                    "status",
                    Err::<Option<StatusResponse>, String>(format!(
                        "Failed to get service info: {e}"
                    )),
                );
                time::sleep(RETRY_DELAY).await;
                continue;
            }
        };

        if !is_version_compatible(&info.version) {
            let supported = COMPATIBLE_VERSIONS.join(", ");
            let _ = app.emit(
                "status",
                Err::<Option<StatusResponse>, String>(format!(
                    "Incompatible service version: {}. Supported versions: {supported}. \
                     If you just updated, please restart the app.",
                    info.version
                )),
            );
            time::sleep(RETRY_DELAY).await;
            continue;
        }

        if let Err(e) = start_client_worker(Duration::from_secs(10)).await {
            let _ = app.emit(
                "status",
                Err::<Option<StatusResponse>, String>(format!(
                    "Failed to start client worker: {e}"
                )),
            );
            time::sleep(RETRY_DELAY).await;
            continue;
        }

        if let Err(e) = spawn_polling_tasks(app.clone()).await {
            let _ = app.emit(
                "status",
                Err::<Option<StatusResponse>, String>(format!("Failed to start polling: {e}")),
            );
            time::sleep(RETRY_DELAY).await;
            continue;
        }

        let _ = app.emit("service_info", &info);
        app.state::<AppStateCache>()
            .service_info
            .send_replace(Some(info));
        break;
    }
}

async fn query_status() -> (Duration, Result<Option<StatusResponse>, String>) {
    let p = PathBuf::from(root_socket::DEFAULT_PATH);
    let resp = root_socket::process_cmd(&p, &command::Command::Status).await;
    match resp {
        Ok(command::Response::Status(status_resp)) => {
            let resp = StatusResponse {
                run_mode: status_resp.run_mode.into(),
                destinations: status_resp.destinations,
                target_destination: status_resp.target_destination,
                connected: status_resp.connected,
                connecting: status_resp.connecting,
                reconnecting: status_resp.reconnecting,
                disconnecting: status_resp.disconnecting,
            };

            if matches!(resp.run_mode, crate::types::RunMode::NotRunning) {
                let _ = start_client_worker(Duration::from_secs(10)).await;
                return (Duration::from_secs(5), Ok(Some(resp)));
            }

            let is_in_transition = resp.connecting.is_some() || resp.reconnecting.is_some();
            if is_in_transition {
                (Duration::from_millis(222), Ok(Some(resp)))
            } else {
                (Duration::from_secs(2), Ok(Some(resp)))
            }
        }
        Ok(command::Response::WorkerOffline) => {
            // socket-level response: worker process not running — try to restart it
            let _ = start_client_worker(Duration::from_secs(10)).await;
            (Duration::from_secs(5), Ok(None))
        }
        // Internal response sent by the root process to itself; never forwarded to the app.
        Ok(command::Response::ForceReconnectAcknowledged) => (Duration::from_secs(2), Ok(None)),
        Ok(unexpected) => (
            Duration::from_secs(2),
            Err(format!("Unexpected response type: {:?}", unexpected).to_string()),
        ),
        Err(e) => (Duration::from_secs(2), Err(e.to_string())),
    }
}

fn is_positive_route_health(rh: &Option<command::RouteHealthView>) -> bool {
    matches!(
        rh.as_ref().map(|v| &v.state),
        Some(RouteHealthState::ReadyToConnect { .. })
    )
}

fn startup_latency(rh: &Option<command::RouteHealthView>) -> Option<Duration> {
    match rh.as_ref().map(|v| &v.state)? {
        RouteHealthState::ReadyToConnect { exit } => Some(exit.ping_rtt),
        _ => None,
    }
}

fn pick_startup_target(
    destinations: &[command::DestinationState],
    preferred: &Option<String>,
) -> Option<String> {
    if let Some(id) = preferred {
        return Some(id.clone());
    }
    destinations
        .iter()
        .filter_map(|ds| {
            startup_latency(&ds.route_health).map(|ms| (ms, ds.destination.id.clone()))
        })
        .min_by_key(|(ms, _)| *ms)
        .map(|(_, id)| id)
}
