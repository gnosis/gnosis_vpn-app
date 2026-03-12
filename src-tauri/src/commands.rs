use gnosis_vpn_lib::command;
use gnosis_vpn_lib::socket::root as root_socket;

use tauri::{AppHandle, Manager, State};
use zstd::stream::Encoder;

use std::fs::File;
use std::io::{self, BufReader};
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::Ordering;
use tokio::task::spawn_blocking;

use crate::icons::{
    self, AppIconState, TrayIconState, determine_app_icon, update_icon_name_if_changed,
    update_tray_icon,
};
use crate::tray::TrayStatusItem;
use crate::types::{BalanceResponse, ConnectResponse, DisconnectResponse, StatusResponse};

#[cfg(target_os = "macos")]
const LOG_FILE_PATH: &str = "/Library/Logs/GnosisVPN/gnosisvpn.log";
#[cfg(target_os = "linux")]
const LOG_FILE_PATH: &str = "/var/log/gnosisvpn/gnosisvpn.log";

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
pub async fn status(
    app: AppHandle,
    status_item: State<'_, TrayStatusItem>,
    tray_icon_state: State<'_, TrayIconState>,
    app_icon_state: State<'_, Arc<AppIconState>>,
) -> Result<StatusResponse, String> {
    let p = PathBuf::from(root_socket::DEFAULT_PATH);
    let resp = root_socket::process_cmd(&p, &command::Command::Status).await;
    match resp {
        Ok(command::Response::Status(status_resp)) => {
            let mut derived = "Disconnected";
            if matches!(status_resp.run_mode, command::RunMode::Running { .. }) {
                let mut connecting = false;
                let mut disconnecting = false;

                for ds in &status_resp.destinations {
                    match ds.connection_state {
                        command::ConnectionState::Connected(_) => {
                            derived = "Connected";
                            break;
                        }
                        command::ConnectionState::Connecting(_, _) => connecting = true,
                        command::ConnectionState::Disconnecting(_, _) => disconnecting = true,
                        command::ConnectionState::None => {}
                    }
                }

                if derived == "Disconnected" {
                    if connecting {
                        derived = "Connecting";
                    } else if disconnecting {
                        derived = "Disconnecting";
                    }
                }
            }
            if let Ok(guard) = status_item.0.lock() {
                let _ = guard.set_text(format!("Status: {}", derived));
            }

            update_tray_icon(&app, tray_icon_state.inner(), derived);

            let icon_name = determine_app_icon(derived, &status_resp.run_mode);
            let should_animate = derived == "Connecting" || derived == "Disconnecting";

            app_icon_state
                .is_animating
                .store(should_animate, Ordering::Relaxed);

            if !should_animate
                && update_icon_name_if_changed(&app_icon_state.current_icon, &icon_name)
            {
                if let Err(e) = set_app_icon(app, icon_name).await {
                    eprintln!("Failed to update app icon: {}", e);
                }
            }

            Ok(status_resp.into())
        }
        Err(e) => {
            if let Ok(guard) = status_item.0.lock() {
                let _ = guard.set_text("Status: Not available");
            }
            update_tray_icon(
                &app,
                tray_icon_state.inner(),
                "Disconnected",
            );
            Err(e.to_string())
        }
        Ok(unexpected) => {
            eprintln!("Unexpected status response: {:?}", unexpected);
            Err("Unexpected response type".to_string())
        }
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
        command::Response::Empty => Ok(()),
        _ => Err("Unexpected response type".to_string()),
    }
}

#[tauri::command]
pub async fn funding_tool(secret: String) -> Result<(), String> {
    let p = PathBuf::from(root_socket::DEFAULT_PATH);
    let cmd = command::Command::FundingTool(secret);
    let resp = root_socket::process_cmd(&p, &cmd)
        .await
        .map_err(|e| e.to_string())?;
    match resp {
        command::Response::Empty => Ok(()),
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

#[cfg(not(target_os = "macos"))]
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

/// Validate that `dest_path` is a safe location to write compressed logs.
/// Rejects paths without a `.zst` extension and paths whose parent directory
/// doesn't exist or resolves (via symlinks) into sensitive system directories.
fn validate_log_dest(dest_path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(dest_path);

    if path.extension().and_then(|e| e.to_str()) != Some("zst") {
        return Err("Destination must have a .zst extension".to_string());
    }

    let parent = path
        .parent()
        .ok_or_else(|| "Destination path has no parent directory".to_string())?;

    let canonical_parent = parent
        .canonicalize()
        .map_err(|e| format!("Cannot resolve destination directory: {e}"))?;

    #[cfg(target_os = "macos")]
    const BLOCKED: &[&str] = &["/System", "/Library/Launch", "/usr", "/sbin", "/bin"];
    #[cfg(target_os = "linux")]
    const BLOCKED: &[&str] = &["/usr", "/sbin", "/bin", "/boot", "/etc", "/lib"];

    let canon_str = canonical_parent.to_string_lossy();
    for prefix in BLOCKED {
        if canon_str.starts_with(prefix) {
            return Err(format!("Writing to {prefix} is not allowed"));
        }
    }

    Ok(canonical_parent.join(path.file_name().unwrap()))
}

#[tauri::command]
pub async fn compress_logs(dest_path: String) -> Result<(), String> {
    let safe_path = validate_log_dest(&dest_path)?;

    spawn_blocking(move || {
        let input_file =
            File::open(LOG_FILE_PATH).map_err(|e| format!("Failed to open log file: {}", e))?;
        let output_file =
            File::create(&safe_path).map_err(|e| format!("Failed to create output file: {}", e))?;

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
