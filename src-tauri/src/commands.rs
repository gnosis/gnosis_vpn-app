use gnosis_vpn_lib::command;
use gnosis_vpn_lib::socket::root as root_socket;

use tokio_util::sync::CancellationToken;
use tauri::{State, AppHandle, Emitter, Manager};
use zstd::stream::Encoder;

use std::fs::File;
use std::io::{self, BufReader};
use std::path::PathBuf;
use std::time::Duration;
use std::sync::{Arc, Mutex};
use std::sync::atomic::Ordering;
use tokio::task::spawn_blocking;
use tokio::time::{self, Instant};

use crate::tray;
use crate::icons::{self, TrayIconState, AppIconState};
use crate::types::{BalanceResponse, ConnectResponse, ConnectionState, DisconnectResponse, StatusResponse};

const ALLOWED_APP_ICONS: &[&str] = &[
    icons::APP_ICON_CONNECTED,
    icons::APP_ICON_CONNECTED_LOW_FUNDS,
    icons::APP_ICON_CONNECTING_1,
    icons::APP_ICON_CONNECTING_2,
    icons::APP_ICON_DISCONNECTED,
    icons::APP_ICON_DISCONNECTED_LOW_FUNDS,
];

fn validate_icon_name(icon_name: &str) -> Result<(), String> {
    if ALLOWED_APP_ICONS.contains(&icon_name) {
        Ok(())
    } else {
        Err(format!("Invalid icon name: {icon_name}"))
    }
}

#[tauri::command]
pub async fn info() -> Result<command::InfoResponse, String> {
    let p = PathBuf::from(root_socket::DEFAULT_PATH);
    let cmd = command::Command::Info;

    let resp = root_socket::process_cmd(&p, &cmd)
        .await
        .map_err(|e| e.to_string())?;

    match resp {
        command::Response::Info(info) => Ok(info),
        _ => Err("Unexpected response type".to_string()),
    }
}

#[tauri::command]
pub async fn start_client(keep_alive: Duration) -> Result<(), String> {
    let p = PathBuf::from(root_socket::DEFAULT_PATH);
    let cmd = command::Command::StartClient(keep_alive);

    let resp = root_socket::process_cmd(&p, &cmd)
        .await
        .map_err(|e| e.to_string())?;

    match resp {
        command::Response::StartClient(_resp) => Ok(()),
        _ => Err("Unexpected response type".to_string()),
    }
}

#[tauri::command]
pub async fn connect(id: String) -> Result<ConnectResponse, String> {
    let p = PathBuf::from(root_socket::DEFAULT_PATH);
    let cmd = command::Command::Connect(id);
    let resp = root_socket::process_cmd(&p, &cmd)
        .await
        .map_err(|e| e.to_string())?;
    match resp {
        command::Response::Connect(resp) => Ok(resp.into()),
        _ => Err("Unexpected response type".to_string()),
    }
}

#[tauri::command]
pub async fn disconnect() -> Result<DisconnectResponse, String> {
    let p = PathBuf::from(root_socket::DEFAULT_PATH);
    let cmd = command::Command::Disconnect;
    let resp = root_socket::process_cmd(&p, &cmd)
        .await
        .map_err(|e| e.to_string())?;
    match resp {
        command::Response::Disconnect(resp) => Ok(resp.into()),
        _ => Err("Unexpected response type".to_string()),
    }
}

#[tauri::command]
pub async fn balance() -> Result<Option<BalanceResponse>, String> {
    let p = PathBuf::from(root_socket::DEFAULT_PATH);
    let cmd = command::Command::Balance;
    let resp = root_socket::process_cmd(&p, &cmd)
        .await
        .map_err(|e| e.to_string())?;
    match resp {
        command::Response::Balance(resp) => Ok(resp.map(|b| b.into())),
        unexpected => {
            eprintln!("Unexpected balance response: {:?}", unexpected);
            Err("Unexpected response type".to_string())
        }
    }
}

#[tauri::command]
pub async fn refresh_node() -> Result<(), String> {
    let p = PathBuf::from(root_socket::DEFAULT_PATH);
    let cmd = command::Command::RefreshNode;
    let resp = root_socket::process_cmd(&p, &cmd)
        .await
        .map_err(|e| e.to_string())?;
    match resp {
        command::Response::RefreshNodeTriggered => Ok(()),
        _ => Err("Unexpected response type".to_string()),
    }
}

#[cfg(target_os = "macos")]
#[allow(unexpected_cfgs)]
#[tauri::command]
pub async fn set_app_icon(app: AppHandle, icon_name: String) -> Result<(), String> {
    use dispatch::Queue;
    use std::fs;
    use std::sync::mpsc;

    validate_icon_name(&icon_name)?;

    let icon_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?
        .join("icons")
        .join("app-icons")
        .join(&icon_name);

    spawn_blocking(move || {
        let icon_data = fs::read(&icon_path)
            .map_err(|e| format!("Failed to read icon file {}: {}", icon_path.display(), e))?;

        let (tx, rx) = mpsc::channel();

        Queue::main().exec_async(move || unsafe {
            use cocoa::{
                appkit::NSImage,
                base::{id, nil},
                foundation::NSData,
            };

            let result = (|| {
                let app: id = msg_send![class!(NSApplication), sharedApplication];
                if app == nil {
                    return Err("Failed to get NSApplication".to_string());
                }

                let data = NSData::dataWithBytes_length_(
                    nil,
                    icon_data.as_ptr() as *const std::os::raw::c_void,
                    icon_data.len() as u64,
                );

                if data == nil {
                    return Err("Failed to create NSData".to_string());
                }

                let app_icon = NSImage::initWithData_(NSImage::alloc(nil), data);
                if app_icon == nil {
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
    use std::fs;
    use tauri::image::Image;

    validate_icon_name(&icon_name)?;

    let icon_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?
        .join("icons")
        .join("app-icons")
        .join(&icon_name);

    let icon_data = spawn_blocking(move || {
        fs::read(&icon_path)
            .map_err(|e| format!("Failed to read icon file {}: {}", icon_path.display(), e))
    })
    .await
    .map_err(|e| format!("set_app_icon: blocking task panicked: {e}"))??;

    let image = Image::from_bytes(&icon_data)
        .map_err(|e| format!("Failed to create image from icon data: {e}"))?;

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

#[tauri::command]
pub async fn start_status_polling(app_handle: AppHandle, m_cancel: State<'_, Mutex<CancellationToken>>) -> Result<(), String> {
    println!("Starting status polling...");
    // cancel previous polling
    let mut cancel_guard = m_cancel.lock().map_err(|e| e.to_string())?;
    cancel_guard.cancel();
    *cancel_guard = CancellationToken::new();
    let cancel = cancel_guard.clone();
    drop(cancel_guard);

    let app = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        let tick_timeout = time::sleep(Duration::ZERO);
        tokio::pin!(tick_timeout);
        loop {
            tokio::select! {

                _ = cancel.cancelled() => {
                    println!("Status tick received cancellation signal, exiting...");
                    break;
                }

                _ = tick_timeout.as_mut() => {
                    let (status_delay, result) = query_status().await;
                    tick_timeout.as_mut().reset(Instant::now() + status_delay);
                    if let Ok(Some(status)) = result.clone() {
                        // derive tray icon
                        let conn_state = status.clone().into();
                        icons::update_tray_icon(&app, &app.state::<TrayIconState>(), &conn_state);

                        // animate icon
                        let should_animate = matches!(conn_state, ConnectionState::Connecting(_) | ConnectionState::Disconnecting);
                        let app_icon_state = app.state::<Arc<AppIconState>>();
                        app_icon_state.is_animating.store(should_animate, Ordering::Relaxed);

                        // derive app_icon
                        let icon_name = icons::determine_app_icon(&conn_state, &status.run_mode);
                        if icons::update_icon_name_if_changed(&app_icon_state.current_icon, &icon_name) {
                            if let Err(e) = set_app_icon(app.clone(), icon_name.to_string()).await {
                                eprintln!("Failed to update app icon: {}", e);
                            }
                        }

                        // set status text
                        let status_item = app.state::<tray::TrayStatusItem>();
                        if let Ok(guard) = status_item.0.lock() {
                            let _ = guard.set_text(conn_state.to_string());
                        };
                    }
                    eprintln!("Emitting status event with result: {:?}", result);
                    let _ = app.emit("status", result);
                }

            }
        }
    });
    Ok(())
}

async fn query_status() -> (Duration, Result<Option<StatusResponse>, String>) {
    let p = PathBuf::from(root_socket::DEFAULT_PATH);
    let resp = root_socket::process_cmd(&p, &command::Command::Status).await;
    match resp {
        Ok(command::Response::Status(status_resp)) => {
            let resp = status_resp.destinations.iter().fold(
                StatusResponse {
                    run_mode: status_resp.run_mode.into(),
                    destinations: Default::default(),
                    dest_order: Vec::new(),
                    connected: None,
                    connecting: None,
                    disconnecting: Vec::new(),
                },
                |mut acc, ds| {
                    let id = ds.destination.clone().id.clone();
                    match ds.connection_state {
                        command::ConnectionState::Connected(_) => {
                            acc.connected = Some(id.clone());
                        }
                        command::ConnectionState::Connecting(_, _) => {
                            acc.connecting = Some(id.clone());
                        }
                        command::ConnectionState::Disconnecting(_, _) => {
                            acc.disconnecting.push(id.clone());
                        }
                        command::ConnectionState::None => {}
                    };
                    acc.destinations.insert(id.clone(), ds.clone().into());
                    acc.dest_order.push(id.clone());
                    acc
                },
            );

            if resp.connecting.is_some() {
                (Duration::from_millis(222), Ok(Some(resp)))
            } else {
                (Duration::from_secs(2), Ok(Some(resp)))
            }
        }
        Ok(command::Response::WorkerOffline) => (Duration::from_secs(5), Ok(None)),
        Ok(unexpected) => (
            Duration::from_secs(2),
            Err(format!("Unexpected response type: {:?}", unexpected).to_string()),
        ),
        Err(e) => (Duration::from_secs(2), Err(e.to_string())),
    }
}
