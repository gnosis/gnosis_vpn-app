#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

use serde::Serialize;
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_store::StoreExt;
use tokio::time::{self, Instant};
use tokio_util::sync::CancellationToken;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

mod commands;
mod icons;
mod platform;
mod theme;
pub mod tray;
pub mod types;

use commands::{
    balance, compress_logs, connect, disconnect, info, refresh_node, set_app_icon, start_client,
    stop_client,
};
use icons::{AppIconState, TrayIconState, determine_tray_icon, start_app_icon_heartbeat};
use platform::{Platform, PlatformInterface};
#[cfg(target_os = "linux")]
use theme::spawn_linux_theme_monitor;
#[cfg_attr(target_os = "macos", allow(unused_imports))]
use theme::{InitialTheme, get_initial_theme, system_theme};
use tray::{create_tray_menu, handle_tray_event, show_settings, toggle_main_window_visibility};
use types::ConnectionState;

struct HeartbeatHandle(Mutex<Option<tauri::async_runtime::JoinHandle<()>>>);

#[derive(Clone, Serialize, Default)]
struct AppSettings {
    preferred_location: Option<String>,
    connect_on_startup: bool,
    start_minimized: bool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_positioner::init())
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

            // First step: OS theme for app windows (all OS) and tray icons (non-macOS only)
            let theme = system_theme();
            app.manage(InitialTheme(theme));

            // Create tray menu
            let menu = create_tray_menu(app.handle())?;

            let icon_name: &str = determine_tray_icon(&ConnectionState::Disconnected);

            let tray_icon_path: PathBuf = app
                .path()
                .resource_dir()
                .unwrap()
                .join("icons")
                .join(icon_name);

            let icon = tauri::image::Image::from_path(&tray_icon_path)
                .map_err(|e| format!("Failed to load tray icon: {e}"))?;

            // Create tray icon
            let builder = TrayIconBuilder::with_id("menu_extra")
                .menu(&menu)
                .icon(icon)
                .icon_as_template(true);
            let tray = builder
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        toggle_main_window_visibility(app, false);
                    }
                    "settings" => show_settings(app, "settings"),
                    "logs" => show_settings(app, "logs"),
                    "usage" => show_settings(app, "usage"),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    handle_tray_event(tray.app_handle(), event);
                })
                .show_menu_on_left_click(false)
                .build(app)?;

            app.manage(TrayIconState {
                tray: Mutex::new(tray),
                current_icon: Mutex::new(icon_name.to_string()),
            });

            let app_icon_state = Arc::new(AppIconState {
                animation_toggle: AtomicBool::new(false),
                is_animating: AtomicBool::new(false),
                current_icon: Mutex::new(icons::APP_ICON_DISCONNECTED.to_string()),
            });
            app.manage(app_icon_state.clone());

            let heartbeat_handle = start_app_icon_heartbeat(app.handle().clone(), app_icon_state);
            app.manage(HeartbeatHandle(Mutex::new(Some(heartbeat_handle))));

            #[cfg(target_os = "linux")]
            spawn_linux_theme_monitor(app.handle().clone());

            // Setup platform-specific functionality
            let _ = Platform::setup_system_tray();

            // Prevent macOS App Nap from throttling the process when backgrounded.
            // The token must stay alive for the process lifetime; Tauri's managed
            // state keeps it until the application exits.
            #[cfg(target_os = "macos")]
            app.manage(platform::macos::disable_app_nap());

            // Intercept window close to hide to tray instead of exiting
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                let app_handle = app.handle().clone();
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.hide();
                        #[cfg(target_os = "macos")]
                        {
                            let _ = app_handle
                                .set_activation_policy(tauri::ActivationPolicy::Accessory);
                        }
                    }
                });
            }

            // Intercept settings window close to hide instead of destroying the window
            if let Some(settings_window) = app.get_webview_window("settings") {
                let settings_clone = settings_window.clone();
                settings_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = settings_clone.hide();
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

            let cancel = emit_status_periodically(app.handle().clone());
            app.manage(cancel);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            info,
            start_client,
            connect,
            disconnect,
            balance,
            refresh_node,
            compress_logs,
            set_app_icon,
            get_initial_theme,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // cancel query status loop
                let c = app_handle.state::<CancellationToken>();
                c.cancel();

                if let Ok(mut guard) = app_handle.state::<HeartbeatHandle>().0.lock() {
                    if let Some(handle) = guard.take() {
                        handle.abort();
                    }
                }

                // inform the client about the shutdown
                if let Err(reason) = tauri::async_runtime::block_on(async { stop_client().await }) {
                    eprintln!("Error stopping client on exit: {reason}");
                }
            }
        });
}

async fn emit_status_periodically(app: AppHandle) -> CancellationToken {
    let cancel = CancellationToken::new();
    let owned_cancel = cancel.clone();
    tauri::async_runtime::spawn(async move {
        let tick_timeout = time::sleep(Duration::from_secs(2));
        tokio::pin!(tick_timeout);

        loop {
            tokio::select! {
                    _ = cancel.cancelled() => {
                        println!("Status tick received cancellation signal, exiting...");
                        break;
                    }
                    _ = tick_timeout.as_mut() => {
                        let (status_delay, result) = commands::status().await;
                        tick_timeout.as_mut().reset(Instant::now() + status_delay);
                        if let Ok(Some(status)) = result.clone() {
                            // derive tray icon
                            let conn_state = status.into();
                            icons::update_tray_icon(&app, &app.state::<TrayIconState>(), &conn_state);
                            // animate icon
                            let should_animate = matches!(conn_state, ConnectionState::Connecting(_) | ConnectionState::Disconnecting);
                            let app_icon_stat = app.state::<AppIconState>();
            app_icon_stat.is_animating.store(should_animate, Ordering::Relaxed);
                            // set status text
            let status_item = app.state::<tray::TrayStatusItem>();
                            if let Ok(guard) = status_item.0.lock() {
                                let _ = guard.set_text(conn_state.to_string());
                            };

                        let _ = app.emit("status", result);

                        }
                    }
                }
        }
    });
    owned_cancel
}
