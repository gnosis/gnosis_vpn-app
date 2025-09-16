use gnosis_vpn_lib::{address, command, socket};
use tauri::{
    AppHandle, Manager,
    menu::{Menu, MenuBuilder, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
};

use std::path::PathBuf;
mod platform;
use platform::{Platform, PlatformInterface};

#[tauri::command]
fn status() -> Result<command::StatusResponse, String> {
    let p = PathBuf::from(socket::DEFAULT_PATH);
    let resp = socket::process_cmd(&p, &command::Command::Status).map_err(|e| e.to_string())?;
    match resp {
        command::Response::Status(resp) => Ok(resp),
        _ => Err("Unexpected response type".to_string()),
    }
}

#[tauri::command]
fn connect(address: address::Address) -> Result<command::ConnectResponse, String> {
    let p = PathBuf::from(socket::DEFAULT_PATH);
    let cmd = command::Command::Connect(address);
    let resp = socket::process_cmd(&p, &cmd).map_err(|e| e.to_string())?;
    match resp {
        command::Response::Connect(resp) => Ok(resp),
        _ => Err("Unexpected response type".to_string()),
    }
}

#[tauri::command]
fn disconnect() -> Result<command::DisconnectResponse, String> {
    let p = PathBuf::from(socket::DEFAULT_PATH);
    let cmd = command::Command::Disconnect;
    let resp = socket::process_cmd(&p, &cmd).map_err(|e| e.to_string())?;
    match resp {
        command::Response::Disconnect(resp) => Ok(resp),
        _ => Err("Unexpected response type".to_string()),
    }
}

#[tauri::command]
fn balance() -> Result<Option<command::BalanceResponse>, String> {
    let p = PathBuf::from(socket::DEFAULT_PATH);
    let cmd = command::Command::Balance;
    let resp = socket::process_cmd(&p, &cmd).map_err(|e| e.to_string())?;
    match resp {
        command::Response::Balance(resp) => Ok(resp),
        _ => Err("Unexpected response type".to_string()),
    }
}

#[tauri::command]
fn refresh_node() -> Result<(), String> {
    let p = PathBuf::from(socket::DEFAULT_PATH);
    let cmd = command::Command::RefreshNode;
    let resp = socket::process_cmd(&p, &cmd).map_err(|e| e.to_string())?;
    match resp {
        command::Response::RefreshNode => Ok(()),
        _ => Err("Unexpected response type".to_string()),
    }
}

fn create_tray_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, tauri::Error> {
    let status_item =
        MenuItem::with_id(app, "status", "Status: Disconnected", false, None::<&str>)?;
    let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    MenuBuilder::new(app)
        .item(&status_item)
        .separator()
        .item(&show_item)
        .item(&settings_item)
        .item(&quit_item)
        .build()
}

fn handle_tray_event(app: &AppHandle, event: TrayIconEvent) {
    match event {
        TrayIconEvent::Click {
            button: tauri::tray::MouseButton::Left,
            button_state: tauri::tray::MouseButtonState::Up,
            ..
        } => {
            // On left click, show the main window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        _ => {}
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Create tray menu
            let menu = create_tray_menu(app.handle())?;

            let icon_name: &str = "tray-icon.png";

            let tray_icon_path: PathBuf = app
                .path()
                .resource_dir()
                .unwrap()
                .join("icons")
                .join(icon_name);

            let icon = tauri::image::Image::from_path(&tray_icon_path)
                .map_err(|e| format!("Failed to load tray icon: {}", e))?;

            // Create tray icon
            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .icon(icon)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    handle_tray_event(tray.app_handle(), event);
                })
                .show_menu_on_left_click(false)
                .build(app)?;

            // Setup platform-specific functionality
            let _ = Platform::setup_system_tray();

            // Hide window on startup if needed (Linux behavior)
            #[cfg(target_os = "linux")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![status, connect, disconnect, balance, refresh_node])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
