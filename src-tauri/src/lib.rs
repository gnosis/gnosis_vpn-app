use gnosis_vpn_lib::prelude::Address;
use gnosis_vpn_lib::{balance, command, connection, socket};
use tauri::{
    AppHandle, Emitter, Manager,
    menu::{Menu, MenuBuilder, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
};
mod platform;
use platform::{Platform, PlatformInterface};
use serde::{Deserialize, Serialize};
use tauri_plugin_store::StoreExt;

use std::collections::HashMap;
use std::time::{SystemTime, Duration};
use std::{path::PathBuf, sync::Mutex};

#[derive(Clone, Debug, Serialize, Default)]
struct AppSettings {
    preferred_location: Option<String>,
    connect_on_startup: bool,
    start_minimized: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StatusResponse {
    pub run_mode: RunMode,
    pub destinations: Vec<DestinationState>,
    pub network: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DestinationState {
    pub destination: Destination,
    pub connection_state: ConnectionState,
    pub last_connection_error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Destination {
    pub meta: HashMap<String, String>,
    pub address: String,
    pub routing: RoutingOptions,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum RoutingOptions {
    Hops(usize),
    IntermediatePath(Vec<String>),
}

#[derive(Debug, Serialize, Deserialize)]
pub enum RunMode {
    /// Initial start, after creating safe this state will not be reached again
    PreparingSafe {
        node_address: String,
        node_xdai: String,
        node_wxhopr: String,
        funding_tool: balance::FundingTool,
    },
    /// Subsequent service start up in this state and after preparing safe
    Warmup,
    /// Normal operation where connections can be made
    Running {
        funding: FundingState,
    },
    /// Shutdown service
    Shutdown
}

#[derive(Debug, Serialize, Deserialize)]
pub enum ConnectionState {
    None,
    Connecting(SystemTime, String),
    Connected(SystemTime),
    Disconnecting(SystemTime, String),
}

// in order of priority
#[derive(Debug, Serialize, Deserialize)]
pub enum FundingState {
    Unknown,                         // state not queried yet
    TopIssue(balance::FundingIssue), // there is at least one issue
    WellFunded,
}

impl From<connection::destination::RoutingOptions> for RoutingOptions {
    fn from(ro: connection::destination::RoutingOptions) -> Self {
        match ro {
            connection::destination::RoutingOptions::Hops(hops) => {
                RoutingOptions::Hops(hops.into())
            }
            connection::destination::RoutingOptions::IntermediatePath(path) => {
                RoutingOptions::IntermediatePath(path.into_iter().map(|a| a.to_string()).collect())
            }
        }
    }
}

impl From<command::DestinationState> for DestinationState {
    fn from(ds: command::DestinationState) -> Self {
        DestinationState {
            destination: ds.destination.into(),
            connection_state: ds.connection_state.into(),
            last_connection_error: ds.last_connection_error,
        }
    }
}

impl From<command::Destination> for Destination {
    fn from(dest: command::Destination) -> Self {
        Destination {
            meta: dest.meta,
            address: dest.address.to_string(),
            routing: dest.path.into(),
        }
    }
}

impl From<command::ConnectionState> for ConnectionState {
    fn from(cs: command::ConnectionState) -> Self {
        match cs {
            command::ConnectionState::None => ConnectionState::None,
            command::ConnectionState::Connecting(since, phase) => ConnectionState::Connecting(since, phase.to_string()),
            command::ConnectionState::Connected(since) => ConnectionState::Connected(since),
            command::ConnectionState::Disconnecting(since, phase) => ConnectionState::Disconnecting(since, phase.to_string()),
        }
    }
}

impl From<command::RunMode> for RunMode {
    fn from(rm: command::RunMode) -> Self {
        match rm {
            command::RunMode::Init | command::RunMode::ValueingTicket => {
                RunMode::Warmup
            }
            command::RunMode::PreparingSafe {
                node_address,
                node_xdai,
                node_wxhopr,
                funding_tool,
            } => RunMode::PreparingSafe {
                node_address: node_address.to_string(),
                node_xdai: node_xdai.amount().to_string(),
                node_wxhopr: node_wxhopr.amount().to_string(),
                funding_tool,
            },
            command::RunMode::Warmup {
                hopr_state: _,
            } => RunMode::Warmup ,
            command::RunMode::Running {
                funding,
                hopr_state: _,
            } => RunMode::Running {
                funding: match funding {
                    command::FundingState::Unknown => FundingState::Unknown,
                    command::FundingState::TopIssue(issue) => FundingState::TopIssue(issue),
                    command::FundingState::WellFunded => FundingState::WellFunded,
                },
            },
            command::RunMode::Shutdown => RunMode::Shutdown,
        }
    }
}

impl From<command::StatusResponse> for StatusResponse {
    fn from(sr: command::StatusResponse) -> Self {
        StatusResponse {
            run_mode: sr.run_mode.into(),
            destinations: sr
                .destinations
                .into_iter()
                .map(|d| d.into())
                .collect(),
            network: sr.network.to_string(),
        }
    }
}

#[tauri::command]
async fn status() -> Result<StatusResponse, String> {
    let p = PathBuf::from(socket::DEFAULT_PATH);
    let resp = socket::process_cmd(&p, &command::Command::Status).await.map_err(|e| e.to_string())?;
    let status_resp: command::StatusResponse = match resp {
        command::Response::Status(resp) => resp,
        _ => return Err("Unexpected response type".to_string()),
    };
    // Convert types for frontend
    Ok(status_resp.into())
}

#[tauri::command]
async fn connect(address: String) -> Result<command::ConnectResponse, String> {
    let p = PathBuf::from(socket::DEFAULT_PATH);
    let conv_address = address.parse::<Address>().map_err(|e| e.to_string())?;
    let cmd = command::Command::Connect(conv_address);
    let resp = socket::process_cmd(&p, &cmd).await.map_err(|e| e.to_string())?;
    match resp {
        command::Response::Connect(resp) => Ok(resp),
        _ => Err("Unexpected response type".to_string()),
    }
}

#[tauri::command]
async fn disconnect() -> Result<command::DisconnectResponse, String> {
    let p = PathBuf::from(socket::DEFAULT_PATH);
    let cmd = command::Command::Disconnect;
    let resp = socket::process_cmd(&p, &cmd).await.map_err(|e| e.to_string())?;
    match resp {
        command::Response::Disconnect(resp) => Ok(resp),
        _ => Err("Unexpected response type".to_string()),
    }
}

#[tauri::command]
async fn balance() -> Result<Option<command::BalanceResponse>, String> {
    let p = PathBuf::from(socket::DEFAULT_PATH);
    let cmd = command::Command::Balance;
    let resp = socket::process_cmd(&p, &cmd).await.map_err(|e| e.to_string())?;
    match resp {
        command::Response::Balance(resp) => Ok(resp),
        _ => Err("Unexpected response type".to_string()),
    }
}

#[tauri::command]
async fn refresh_node() -> Result<(), String> {
    let p = PathBuf::from(socket::DEFAULT_PATH);
    let cmd = command::Command::RefreshNode;
    let resp = socket::process_cmd(&p, &cmd).await.map_err(|e| e.to_string())?;
    match resp {
        command::Response::Empty => Ok(()),
        _ => Err("Unexpected response type".to_string()),
    }
}

#[tauri::command]
async fn funding_tool(secret: String) -> Result<(), String> {
    let p = PathBuf::from(socket::DEFAULT_PATH);
    let cmd = command::Command::FundingTool(secret);
    let resp = socket::process_cmd(&p, &cmd).await.map_err(|e| e.to_string())?;
    match resp {
        command::Response::Empty => Ok(()),
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
        // let is_visible = window.is_visible().unwrap_or(false);
        let is_focused = window.is_focused().unwrap_or(false);
        if is_focused {
            // Slide out to the right and then hide (anchor at top-right of current monitor)
            if let Ok(size) = window.outer_size() {
                let width = size.width as i32;
                // Determine target monitor geometry
                let (mon_x, mon_y, mon_w) = window
                    .current_monitor()
                    .ok()
                    .flatten()
                    .map(|m| (m.position().x, m.position().y, m.size().width as i32))
                    .or_else(|| {
                        window
                            .primary_monitor()
                            .ok()
                            .flatten()
                            .map(|m| (m.position().x, m.position().y, m.size().width as i32))
                    })
                    .unwrap_or((0, 0, 1920));

                let margin: i32 = 20;
                let start_x = window
                    .outer_position()
                    .map(|p| p.x)
                    .unwrap_or(mon_x + mon_w - width - margin);
                // Align to top margin consistently
                let start_y = mon_y + margin;
                let end_x = mon_x + mon_w + 10; // a bit off-screen to the right

                let steps: i32 = 16;
                let step_ms = 10u64;
                let handle = window.clone();
                tauri::async_runtime::spawn(async move {
                    for i in 0..=steps {
                        let t = i as f32 / steps as f32;
                        // smoothstep easing (ease-in-out): t^2 * (3 - 2t)
                        let te = t * t * (3.0 - 2.0 * t);
                        let x = (start_x as f32 + (end_x - start_x) as f32 * te).round() as i32;
                        let _ = handle.set_position(tauri::Position::Physical(
                            tauri::PhysicalPosition { x, y: start_y },
                        ));
                        std::thread::sleep(Duration::from_millis(step_ms));
                    }
                    let _ = handle.hide();
                });
            } else {
                let _ = window.hide();
            }
            #[cfg(target_os = "macos")]
            {
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }
        } else {
            // Slide in from the right to the top-right corner (with margins) of the current (or primary) monitor
            #[cfg(target_os = "macos")]
            {
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
            }

            let width = window.outer_size().map(|s| s.width as i32).unwrap_or(360);
            // Determine target monitor geometry
            let (mon_x, mon_y, mon_w) = window
                .current_monitor()
                .ok()
                .flatten()
                .map(|m| (m.position().x, m.position().y, m.size().width as i32))
                .or_else(|| {
                    window
                        .primary_monitor()
                        .ok()
                        .flatten()
                        .map(|m| (m.position().x, m.position().y, m.size().width as i32))
                })
                .unwrap_or((0, 0, 1920));

            let margin: i32 = 20;
            let target_x: i32 = mon_x + mon_w - width - margin; // top-right with right margin
            let target_y: i32 = mon_y + margin; // top with top margin
            // Start off-screen on the right
            let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                x: mon_x + mon_w + 10,
                y: target_y,
            }));

            let steps: i32 = 16;
            let step_ms = 10u64;
            let handle = window.clone();
            tauri::async_runtime::spawn(async move {
                // Ensure first visible frame is off-screen to avoid flash, then show and focus
                let _ = handle.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                    x: mon_x + mon_w + 10,
                    y: target_y,
                }));
                let _ = handle.show();
                let _ = handle.set_focus();
                for i in 0..=steps {
                    let t = i as f32 / steps as f32;
                    // smoothstep easing (ease-in-out)
                    let te = t * t * (3.0 - 2.0 * t);
                    let start_x = (mon_x + mon_w + 10) as f32;
                    let x = (start_x + (target_x as f32 - start_x) * te).round() as i32;
                    let _ =
                        handle.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                            x,
                            y: target_y,
                        }));
                    std::thread::sleep(Duration::from_millis(step_ms));
                }
            });
        }
    }
}

fn handle_tray_event(app: &AppHandle, event: TrayIconEvent) {
    if let TrayIconEvent::Click {
        button: tauri::tray::MouseButton::Left,
        button_state: tauri::tray::MouseButtonState::Up,
        ..
    } = event
    {
        toggle_main_window_visibility(app);
    }
}

fn show_settings(app: &AppHandle, target: &str) {
    if let Some(window) = app.get_webview_window("settings") {
        #[cfg(target_os = "macos")]
        {
            // Keep the app hidden from the Dock if only the settings window is shown
            let main_visible = app
                .get_webview_window("main")
                .and_then(|w| w.is_visible().ok())
                .unwrap_or(false);
            if !main_visible {
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }
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
                    // Open the dedicated settings window and navigate within it
                    "settings" => show_settings(app, "settings"),
                    // Route logs/usage to the settings window too
                    "logs" => show_settings(app, "logs"),
                    "usage" => show_settings(app, "usage"),
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

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            status,
            connect,
            disconnect,
            balance,
            refresh_node,
            funding_tool
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
