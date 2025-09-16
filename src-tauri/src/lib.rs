use gnosis_vpn_lib::{address, command, socket};
use tauri::{
    AppHandle, Emitter, Manager,
    menu::{Menu, MenuBuilder, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
};

use std::{path::PathBuf, sync::Mutex};
mod platform;
use platform::{Platform, PlatformInterface};
use serde::Serialize;
use tauri_plugin_store::StoreExt;

#[derive(Clone, Debug, Serialize)]
#[derive(Default)]
struct AppSettings {
    preferred_location: Option<String>,
    connect_on_startup: bool,
    start_minimized: bool,
}


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

fn create_tray_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, tauri::Error> {
    let status_item =
        MenuItem::with_id(app, "status", "Status: Disconnected", false, None::<&str>)?;
    let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let logs_item = MenuItem::with_id(app, "logs", "Logs", true, None::<&str>)?;
    let usage_item = MenuItem::with_id(app, "usage", "Usage", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    MenuBuilder::new(app)
        .item(&status_item)
        .separator()
        .item(&show_item)
        .item(&settings_item)
        .item(&logs_item)
        .item(&usage_item)
        .item(&quit_item)
        .build()
}

fn toggle_main_window_visibility(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible().unwrap_or(false);
        if is_visible {
            let _ = window.hide();
        } else {
            #[cfg(target_os = "macos")]
            {
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
            }
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn handle_tray_event(app: &AppHandle, event: TrayIconEvent) {
    if let TrayIconEvent::Click {
            button: tauri::tray::MouseButton::Left,
            button_state: tauri::tray::MouseButtonState::Up,
            ..
        } = event {
        toggle_main_window_visibility(app);
    }
}

fn show_and_navigate(app: &AppHandle, target: &str) {
    if let Some(window) = app.get_webview_window("main") {
        #[cfg(target_os = "macos")]
        {
            let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
        }
        let _ = window.show();
        let _ = window.set_focus();
        if let Err(e) = window.emit("navigate", target) {
            eprintln!("Failed to emit navigate event: {e}");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Load settings from the shared store (settings.json) before any UI decisions
            let mut loaded: AppSettings = AppSettings::default();
            if let Ok(store) = app.store("settings.json") {
                if let Some(v) = store.get("preferredLocation") {
                    loaded.preferred_location = v.as_str().map(String::from);
                }
                if let Some(v) = store.get("connectOnStartup") {
                    loaded.connect_on_startup = v.as_bool().unwrap_or(false);
                }
                if let Some(v) = store.get("startMinimized") {
                    loaded.start_minimized = v.as_bool().unwrap_or(false);
                }
            }

            // Make settings available as managed state
            app.manage(Mutex::new(loaded.clone()));

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
                .map_err(|e| format!("Failed to load tray icon: {e}"))?;

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
                            let is_visible = window.is_visible().unwrap_or(false);
                            if is_visible {
                                let _ = window.hide();
                            } else {
                                #[cfg(target_os = "macos")]
                                {
                                    let _ =
                                        app.set_activation_policy(tauri::ActivationPolicy::Regular);
                                }
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    "settings" => show_and_navigate(app, "settings"),
                    "logs" => show_and_navigate(app, "logs"),
                    "usage" => show_and_navigate(app, "usage"),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    handle_tray_event(tray.app_handle(), event);
                })
                .show_menu_on_left_click(false)
                .build(app)?;

            // Setup platform-specific functionality
            let _ = Platform::setup_system_tray();

            // Intercept window close to hide to tray instead of exiting
            if let Some(window) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                let window_clone = window.clone();
                window.on_window_event(move |event| if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window_clone.hide();
                    #[cfg(target_os = "macos")]
                    {
                        let _ = app_handle
                            .set_activation_policy(tauri::ActivationPolicy::Accessory);
                    }
                });
            }

            // Decide initial window visibility based on settings
            if let Some(window) = app.get_webview_window("main") {
                let settings = app.state::<Mutex<AppSettings>>();
                let start_minimized = settings.lock().map(|s| s.start_minimized).unwrap_or(false);
                #[cfg(target_os = "macos")]
                {
                    let policy = if start_minimized {
                        tauri::ActivationPolicy::Accessory
                    } else {
                        tauri::ActivationPolicy::Regular
                    };
                    app.set_activation_policy(policy);
                }

                if !start_minimized {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![status, connect, disconnect])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
