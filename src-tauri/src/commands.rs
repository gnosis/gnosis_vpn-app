use gnosis_vpn_lib::command;
use gnosis_vpn_lib::socket::root as root_socket;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio_util::sync::CancellationToken;
use zstd::stream::Encoder;

use std::fs::File;
use std::io::{self, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::task::spawn_blocking;
use tokio::time::{self, Instant};

use crate::icons::{self, TrayIconState};
use crate::tray;
use crate::types::{BalanceResponse, ConnectionState, StatusResponse};
use crate::{AppStateCache, BalancePollingHandle, PollingExit, StatusPollingHandle};

/// Semver requirements for compatible client versions, e.g. "0.93" (any 0.93.x) — never ">=" or ">", which would match all future versions and disable this check.
const COMPATIBLE_VERSIONS: &[&str] = &["0.95", "0.96"];

fn version_matches(version: &str, requirements: &[&str]) -> bool {
    let Ok(version) = semver::Version::parse(version.trim()) else {
        return false;
    };
    requirements.iter().any(|req| {
        semver::VersionReq::parse(req)
            .map(|req| req.matches(&version))
            .unwrap_or(false)
    })
}

fn is_version_compatible(version: &str) -> bool {
    version_matches(version, COMPATIBLE_VERSIONS)
}

/// Poll/retry loops repeat the same failure every few seconds; log it only when it changes.
pub(crate) fn warn_on_change(last: &mut Option<String>, msg: String) {
    if last.as_deref() != Some(msg.as_str()) {
        tracing::warn!("{msg}");
        *last = Some(msg);
    }
}

/// OS name for the frontend ("macos", "linux", …) — it has no runtime
/// platform signal of its own and needs one to branch update-install UX.
#[tauri::command]
pub fn get_platform() -> &'static str {
    std::env::consts::OS
}

#[tauri::command]
pub async fn check_update(
    skip_vpn: bool,
) -> Result<gnosis_vpn_lib::check_update::Manifest, String> {
    tracing::info!(target: "update", skip_vpn, "checking for update");
    let client = reqwest::Client::new();
    let socket_path = PathBuf::from(root_socket::DEFAULT_PATH);
    let path_ref = if skip_vpn {
        None
    } else {
        Some(socket_path.as_path())
    };

    gnosis_vpn_lib::check_update::download(&client, path_ref)
        .await
        .inspect(|_| tracing::info!(target: "update", "update manifest downloaded"))
        .map_err(|e| {
            let msg = match e {
                gnosis_vpn_lib::check_update::Error::VpnNotConnected => {
                    "VpnNotConnected".to_string()
                }
                gnosis_vpn_lib::check_update::Error::Integrity(msg) => format!("Integrity: {msg}"),
                gnosis_vpn_lib::check_update::Error::Other(msg) => msg,
            };
            tracing::warn!(target: "update", error = %msg, "update check failed");
            msg
        })
}

async fn query_info() -> Result<command::InfoResponse, String> {
    let p = PathBuf::from(root_socket::DEFAULT_PATH);
    let resp = root_socket::process_cmd(&p, &command::Command::Info)
        .await
        .map_err(|e| e.to_string())?;
    match resp {
        command::Response::Info(info) => Ok(info),
        other => Err(format!("Unexpected info response: {other:?}")),
    }
}

async fn start_client_worker(keep_alive: Duration) -> Result<(), String> {
    let p = PathBuf::from(root_socket::DEFAULT_PATH);
    let resp = root_socket::process_cmd(&p, &command::Command::StartClient(keep_alive))
        .await
        .map_err(|e| e.to_string())?;
    match resp {
        command::Response::StartClient(_) => Ok(()),
        other => Err(format!("Unexpected start-client response: {other:?}")),
    }
}

#[tauri::command]
pub async fn connect(
    id: String,
    polling_state: State<'_, Mutex<StatusPollingHandle>>,
) -> Result<command::ConnectResponse, String> {
    tracing::info!(target: "status", destination = %id, "connect requested");
    let p = PathBuf::from(root_socket::DEFAULT_PATH);
    let cmd = command::Command::Connect(id);
    let resp = root_socket::process_cmd(&p, &cmd).await.map_err(|e| {
        tracing::warn!(target: "status", error = %e, "connect failed");
        e.to_string()
    })?;
    match resp {
        command::Response::Connect(resp) => {
            match polling_state.lock() {
                Ok(guard) => guard.trigger.notify_one(),
                Err(e) => {
                    tracing::warn!(target: "status", error = %e, "cannot trigger status poll after connect")
                }
            }
            Ok(resp)
        }
        other => {
            tracing::warn!(target: "status", response = ?other, "unexpected connect response");
            Err("Unexpected response type".to_string())
        }
    }
}

#[tauri::command]
pub async fn disconnect(
    polling_state: State<'_, Mutex<StatusPollingHandle>>,
) -> Result<command::DisconnectResponse, String> {
    tracing::info!(target: "status", "disconnect requested");
    let p = PathBuf::from(root_socket::DEFAULT_PATH);
    let cmd = command::Command::Disconnect;
    let resp = root_socket::process_cmd(&p, &cmd).await.map_err(|e| {
        tracing::warn!(target: "status", error = %e, "disconnect failed");
        e.to_string()
    })?;
    match resp {
        command::Response::Disconnect(resp) => {
            match polling_state.lock() {
                Ok(guard) => guard.trigger.notify_one(),
                Err(e) => {
                    tracing::warn!(target: "status", error = %e, "cannot trigger status poll after disconnect")
                }
            }
            Ok(resp)
        }
        other => {
            tracing::warn!(target: "status", response = ?other, "unexpected disconnect response");
            Err("Unexpected response type".to_string())
        }
    }
}

async fn query_balance(
    last_warn: &mut Option<String>,
) -> (Duration, Result<Option<BalanceResponse>, String>) {
    let p = PathBuf::from(root_socket::DEFAULT_PATH);
    let resp = root_socket::process_cmd(&p, &command::Command::Balance).await;
    match resp {
        Ok(command::Response::Balance(Ok(balance_resp))) => {
            if last_warn.take().is_some() {
                tracing::info!(target: "balance", "balance query recovered");
            }
            (Duration::from_secs(60), Ok(Some(balance_resp.into())))
        }
        Ok(command::Response::Balance(Err(e))) => {
            warn_on_change(last_warn, format!("daemon balance query failed: {e:?}"));
            (Duration::from_secs(5), Ok(None))
        }
        // worker-offline recovery is the status loop's story; stay quiet here
        Ok(command::Response::WorkerOffline) => (Duration::from_secs(5), Ok(None)),
        Ok(unexpected) => {
            let msg = format!("Unexpected balance response: {unexpected:?}");
            warn_on_change(last_warn, msg.clone());
            (Duration::from_secs(5), Err(msg))
        }
        Err(e) => {
            warn_on_change(last_warn, format!("balance query failed: {e}"));
            (Duration::from_secs(5), Err(e.to_string()))
        }
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

/// Routes frontend log lines into the app log file alongside Rust events.
#[tauri::command]
pub fn log_from_frontend(webview: tauri::Webview, level: String, message: String) {
    let origin = webview.label();
    match level.as_str() {
        "error" => tracing::error!(target: "frontend", origin, "{message}"),
        "warn" => tracing::warn!(target: "frontend", origin, "{message}"),
        "debug" => tracing::debug!(target: "frontend", origin, "{message}"),
        "info" => tracing::info!(target: "frontend", origin, "{message}"),
        other => tracing::info!(target: "frontend", origin, level = other, "{message}"),
    }
}

// The uploader accepts only one zstd frame of plain text — hence concatenation, not an archive.
fn write_log_section(
    encoder: &mut Encoder<'_, &File>,
    title: &str,
    path: &Path,
) -> Result<(), String> {
    // Bundles get shared with support, so name the source file without its absolute path.
    let source = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");
    writeln!(encoder, "===== {title} ({source}) =====")
        .map_err(|e| format!("Failed to write section header: {e}"))?;
    match File::open(path) {
        Ok(file) => {
            io::copy(&mut BufReader::new(file), encoder)
                .map_err(|e| format!("Failed to compress {title}: {e}"))?;
        }
        Err(e) => {
            tracing::warn!(target: "export", path = %path.display(), error = %e, "log source unreadable");
            writeln!(encoder, "<unreadable: {e}>")
                .map_err(|e| format!("Failed to write section note: {e}"))?;
        }
    }
    writeln!(encoder).map_err(|e| format!("Failed to write section footer: {e}"))
}

/// Exports app + daemon logs as one uploader-compatible `.zst`; sources are never caller-supplied.
#[tauri::command]
pub async fn export_logs(app: AppHandle, dest_path: String) -> Result<String, String> {
    tracing::info!(target: "export", dest = %dest_path, "exporting logs");
    let result = export_logs_inner(app, dest_path).await;
    match &result {
        Ok(written) => tracing::info!(target: "export", path = %written, "log export finished"),
        Err(e) => tracing::warn!(target: "export", error = %e, "log export failed"),
    }
    result
}

/// Returns the path actually written, which may differ from `dest_path` by a `.zst` suffix.
async fn export_logs_inner(app: AppHandle, dest_path: String) -> Result<String, String> {
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
    // The uploader regex-checks for a `.zst` filename, so repair a name the user stripped.
    let dest_file = if dest_file_raw.extension().and_then(|e| e.to_str()) == Some("zst") {
        dest_file_raw
    } else {
        dest_file_raw.with_added_extension("zst")
    };
    let written = dest_file.display().to_string();

    let app_logs = app
        .path()
        .app_log_dir()
        .map(|dir| crate::logging::log_files(&dir))
        .unwrap_or_default();
    let daemon_log = app
        .state::<AppStateCache>()
        .service_info
        .borrow()
        .as_ref()
        .and_then(|info| info.log_file.clone());
    tracing::info!(
        target: "export",
        app_log_files = app_logs.len(),
        daemon_log_available = daemon_log.is_some(),
        "collected log sources",
    );

    spawn_blocking(move || -> Result<(), String> {
        let output_file =
            File::create(dest_file).map_err(|e| format!("Failed to create output file: {e}"))?;
        let mut encoder = Encoder::new(&output_file, 5)
            .map_err(|e| format!("Failed to create zstd encoder: {e}"))?;

        for path in &app_logs {
            write_log_section(&mut encoder, "gnosis_vpn-app log", path)?;
        }
        match daemon_log {
            Some(path) => write_log_section(&mut encoder, "gnosisvpn daemon log", &path)?,
            None => writeln!(encoder, "===== gnosisvpn daemon log (unavailable) =====")
                .map_err(|e| format!("Failed to write section header: {e}"))?,
        }

        encoder
            .finish()
            .map_err(|e| format!("Failed to finalize compression: {e}"))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("export_logs: blocking task panicked: {e}"))??;

    Ok(written)
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
    let bal_trigger = trigger.clone();

    let app = app_handle.clone();
    let join_handle = tauri::async_runtime::spawn(async move {
        let tick_timeout = time::sleep(Duration::ZERO);
        tokio::pin!(tick_timeout);
        let mut last_conn_state: Option<String> = None;
        let mut last_funds_level: Option<icons::FundsLevel> = None;
        let mut last_status_warn: Option<String> = None;
        loop {
            tokio::select! {
                _ = cancel.cancelled() => {
                    tracing::info!(target: "status", "status polling cancelled");
                    break PollingExit::Cancelled;
                }
                _ = trigger.notified() => {
                    tick_timeout.as_mut().reset(Instant::now());
                }
                _ = tick_timeout.as_mut() => {
                    let (needs_reinit, status_delay, result) = query_status().await;
                    tick_timeout.as_mut().reset(Instant::now() + status_delay);
                    if let Err(ref e) = result {
                        warn_on_change(&mut last_status_warn, format!("status query failed: {e}"));
                    }
                    if let Ok(Some(ref status)) = result {
                        if last_status_warn.take().is_some() {
                            tracing::info!(target: "status", "status query recovered");
                        }
                        let conn_state: ConnectionState = status.into();
                        let state_label = conn_state.to_string();
                        if last_conn_state.as_deref() != Some(state_label.as_str()) {
                            tracing::info!(
                                target: "status",
                                from = last_conn_state.as_deref().unwrap_or("<startup>"),
                                to = %state_label,
                                "connection state changed",
                            );
                            last_conn_state = Some(state_label);
                        }

                        // Funding level needs the balance poll's data; use the latest cached response.
                        let cached_balance = app.state::<AppStateCache>().balance.borrow().clone();
                        let balance = cached_balance
                            .as_ref()
                            .and_then(|res| res.as_ref().ok())
                            .and_then(|opt| opt.as_ref());
                        let level = icons::funds_level(&status.run_mode, balance);
                        if last_funds_level != Some(level) {
                            tracing::info!(target: "status", level = ?level, "funds level changed");
                            last_funds_level = Some(level);
                        }

                        let icon_state = app.state::<Arc<Mutex<icons::IconState>>>();
                        let new_dock_icon = match icon_state.lock() {
                            Ok(mut guard) => guard.apply_status(&conn_state, level),
                            Err(e) => {
                                tracing::warn!(target: "status", error = %e, "failed to lock icon state");
                                None
                            }
                        };

                        // during animation, the heartbeat logic owns app and tray icon changes
                        if !icons::is_animating_state(&conn_state) {
                            icons::update_tray_icon(&app, &app.state::<TrayIconState>(), &conn_state, level);

                            if let Some(icon_name) = new_dock_icon {
                                if let Err(e) = set_app_icon(app.clone(), icon_name).await {
                                    tracing::warn!(target: "status", error = %e, "failed to set app icon");
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
                    }
                    app.state::<AppStateCache>().status.send_replace(Some(result.clone()));
                    let _ = app.emit("status", result);
                    if needs_reinit {
                        tracing::warn!(target: "status", "daemon worker offline, restarting initialization");
                        break PollingExit::NeedsReinit;
                    }
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
        let mut last_warn: Option<String> = None;
        loop {
            tokio::select! {
                _ = bal_cancel.cancelled() => {
                    tracing::info!(target: "balance", "balance polling cancelled");
                    break;
                }
                _ = tick_timeout.as_mut() => {
                    let (delay, result) = query_balance(&mut last_warn).await;
                    tick_timeout.as_mut().reset(Instant::now() + delay);
                    app_bal.state::<AppStateCache>().balance.send_replace(Some(result.clone()));
                    let _ = app_bal.emit("balance", result);
                    // Nudge the status loop so the tray funding level picks up
                    // the fresh balance without waiting for its next tick.
                    bal_trigger.notify_one();
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
    let mut last_warn: Option<String> = None;
    loop {
        let info = match query_info().await {
            Ok(i) => i,
            Err(e) => {
                warn_on_change(&mut last_warn, format!("daemon unreachable, retrying: {e}"));
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
            warn_on_change(
                &mut last_warn,
                format!(
                    "incompatible daemon version: {} (supported: {supported})",
                    info.version
                ),
            );
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
            warn_on_change(
                &mut last_warn,
                format!("failed to start client worker: {e}"),
            );
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
            warn_on_change(&mut last_warn, format!("failed to start polling: {e}"));
            let _ = app.emit(
                "status",
                Err::<Option<StatusResponse>, String>(format!("Failed to start polling: {e}")),
            );
            time::sleep(RETRY_DELAY).await;
            continue;
        }

        last_warn = None;
        tracing::info!(
            daemon_version = %info.version,
            daemon_log_file = ?info.log_file,
            "initialized",
        );
        let _ = app.emit("service_info", &info);
        app.state::<AppStateCache>()
            .service_info
            .send_replace(Some(info));

        let handle = match app.state::<Mutex<StatusPollingHandle>>().lock() {
            Ok(mut g) => g.handle.take(),
            Err(e) => {
                tracing::error!(error = %e, "status polling handle lock poisoned");
                None
            }
        };

        let exit = if let Some(h) = handle {
            h.await.unwrap_or_else(|e| {
                tracing::error!(error = %e, "status polling task panicked");
                PollingExit::Cancelled
            })
        } else {
            PollingExit::Cancelled
        };

        if matches!(exit, PollingExit::Cancelled) {
            tracing::info!("initialization loop stopped");
            break;
        }
    }
}

async fn query_status() -> (bool, Duration, Result<Option<StatusResponse>, String>) {
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
                return (true, Duration::from_secs(5), Ok(Some(resp)));
            }

            let is_in_transition = resp.connecting.is_some() || resp.reconnecting.is_some();
            if is_in_transition {
                (false, Duration::from_millis(222), Ok(Some(resp)))
            } else {
                (false, Duration::from_secs_f64(2.3), Ok(Some(resp)))
            }
        }
        Ok(command::Response::WorkerOffline) => {
            // socket-level response: worker process not running
            (true, Duration::from_secs(5), Ok(None))
        }
        // Internal response sent by the root process to itself; never forwarded to the app.
        Ok(command::Response::ForceReconnectAcknowledged) => {
            (false, Duration::from_secs(2), Ok(None))
        }
        Ok(unexpected) => (
            false,
            Duration::from_secs_f64(2.3),
            Err(format!("Unexpected response type: {:?}", unexpected).to_string()),
        ),
        Err(e) => (false, Duration::from_secs_f64(2.3), Err(e.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // The list is rewritten by the bump-version workflow; a malformed entry
    // would otherwise only surface as a silent runtime mismatch.
    #[test]
    fn compatible_versions_are_valid_semver_requirements() {
        for req in COMPATIBLE_VERSIONS {
            assert!(
                semver::VersionReq::parse(req).is_ok(),
                "invalid semver requirement in COMPATIBLE_VERSIONS: {req}"
            );
        }
    }

    // ">="/">" would match all future versions, silently disabling this check.
    #[test]
    fn compatible_versions_never_use_open_ended_operators() {
        for req in COMPATIBLE_VERSIONS {
            assert!(
                !req.trim_start().starts_with('>'),
                "open-ended requirement in COMPATIBLE_VERSIONS: {req}"
            );
        }
    }

    #[test]
    fn write_log_section_names_the_file_without_its_directory() {
        let dir = std::env::temp_dir().join("gnosis_vpn-app-write-log-section");
        std::fs::create_dir_all(&dir).unwrap();
        let source = dir.join("gnosis_vpn-app.2026-09-07.log");
        std::fs::write(&source, "line one\n").unwrap();
        let dest = dir.join("out.zst");

        let out = File::create(&dest).unwrap();
        let mut encoder = Encoder::new(&out, 1).unwrap();
        write_log_section(&mut encoder, "gnosis_vpn-app log", &source).unwrap();
        encoder.finish().unwrap();

        let bytes = std::fs::read(&dest).unwrap();
        let text = String::from_utf8(zstd::decode_all(&bytes[..]).unwrap()).unwrap();

        assert!(text.starts_with("===== gnosis_vpn-app log (gnosis_vpn-app.2026-09-07.log) ====="));
        assert!(!text.contains(dir.to_str().unwrap()));
        assert!(text.contains("line one"));

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn plain_requirement_matches_its_minor_series() {
        let requirements = ["0.94"];
        assert!(version_matches("0.94.0", &requirements));
        assert!(version_matches(" 0.94.5 ", &requirements));
        assert!(!version_matches("0.93.9", &requirements));
        assert!(!version_matches("0.95.0", &requirements));
        assert!(!version_matches("0.940.0", &requirements));
        assert!(!version_matches("not-a-version", &requirements));
        assert!(!version_matches("", &requirements));
    }
}
