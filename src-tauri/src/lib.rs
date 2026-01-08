#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

use gnosis_vpn_lib::{balance, command, connection, info, socket};
use tauri::State;
use tauri::{
    AppHandle, Emitter, Manager,
    menu::{Menu, MenuBuilder, MenuItem},
    tray::{TrayIcon, TrayIconBuilder, TrayIconEvent},
};
mod platform;
use platform::{Platform, PlatformInterface};
use serde::Serialize;
use tauri_plugin_positioner::{Position, WindowExt};
use tauri_plugin_store::StoreExt;

use std::collections::HashMap;
use std::path::Path;
use std::process::Command;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime};
use std::{path::PathBuf, sync::Mutex};

// State to hold a reference to the tray "status" menu item so we can update it
struct TrayStatusItem(Mutex<MenuItem<tauri::Wry>>);

// State to hold a reference to the tray icon so we can update it
struct TrayIconState(Mutex<TrayIcon<tauri::Wry>>);

// State to track which connecting icon to show (for animation) and if animation is active
struct ConnectingIconState {
    toggle: AtomicBool,
    is_animating: AtomicBool,
    current_icon: Mutex<String>,
}

#[derive(Clone, Serialize, Default)]
struct AppSettings {
    preferred_location: Option<String>,
    connect_on_startup: bool,
    start_minimized: bool,
}

// Sanitized library responses

#[derive(Serialize)]
pub struct StatusResponse {
    pub run_mode: RunMode,
    pub destinations: Vec<DestinationState>,
}

#[derive(Serialize)]
pub enum ConnectResponse {
    Connecting(Destination),
    WaitingToConnect(Destination, Option<DestinationHealth>),
    UnableToConnect(Destination, DestinationHealth),
    AddressNotFound,
}

#[derive(Serialize)]
pub enum DisconnectResponse {
    Disconnecting(Destination),
    NotConnected,
}

#[derive(Serialize)]
pub struct BalanceResponse {
    pub node: String,
    pub safe: String,
    pub channels_out: String,
    pub info: Info,
    pub issues: Vec<balance::FundingIssue>,
}

// Sanitized library structs

#[derive(Serialize)]
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
    Running { funding: command::FundingState },
    /// Shutdown service
    Shutdown,
}

#[derive(Serialize)]
pub struct DestinationState {
    pub destination: Destination,
    pub connection_state: ConnectionState,
    pub health: Option<DestinationHealth>,
}

#[derive(Serialize)]
pub enum RoutingOptions {
    Hops(usize),
    IntermediatePath(Vec<String>),
}

#[derive(Serialize)]
pub struct Destination {
    pub meta: HashMap<String, String>,
    pub address: String,
    pub routing: RoutingOptions,
}

#[derive(Serialize)]
pub enum ConnectionState {
    None,
    Connecting(SystemTime, String),
    Connected(SystemTime),
    Disconnecting(SystemTime, String),
}

#[derive(Serialize)]
pub struct DestinationHealth {
    pub last_error: Option<String>,
    pub health: connection::destination_health::Health,
    need: Need,
}

/// Requirements to be able to connect to this destination
/// This is statically derived at construction time from a destination's routing options.
#[derive(Serialize)]
pub enum Need {
    Channel(String),
    AnyChannel,
    Peering(String),
    Nothing,
}

#[derive(Serialize)]
pub struct Info {
    pub node_address: String,
    pub node_peer_id: String,
    pub safe_address: String,
    pub network: String,
}

// Conversions from library types to sanitized types

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

impl From<connection::destination::Destination> for Destination {
    fn from(d: connection::destination::Destination) -> Self {
        Destination {
            meta: d.meta.clone(),
            address: d.address.to_string(),
            routing: d.routing.into(),
        }
    }
}

impl From<connection::destination_health::DestinationHealth> for DestinationHealth {
    fn from(d: connection::destination_health::DestinationHealth) -> Self {
        DestinationHealth {
            last_error: d.last_error.clone(),
            health: d.health.clone(),
            need: match d.need {
                connection::destination_health::Need::Channel(c) => Need::Channel(c.to_string()),
                connection::destination_health::Need::AnyChannel => Need::AnyChannel,
                connection::destination_health::Need::Peering(p) => Need::Peering(p.to_string()),
                connection::destination_health::Need::Nothing => Need::Nothing,
            },
        }
    }
}

impl From<command::DestinationState> for DestinationState {
    fn from(ds: command::DestinationState) -> Self {
        DestinationState {
            destination: ds.destination.into(),
            connection_state: ds.connection_state.into(),
            health: ds.health.map(|h| h.into()),
        }
    }
}

impl From<command::ConnectionState> for ConnectionState {
    fn from(cs: command::ConnectionState) -> Self {
        match cs {
            command::ConnectionState::None => ConnectionState::None,
            command::ConnectionState::Connecting(since, phase) => {
                ConnectionState::Connecting(since, phase.to_string())
            }
            command::ConnectionState::Connected(since) => ConnectionState::Connected(since),
            command::ConnectionState::Disconnecting(since, phase) => {
                ConnectionState::Disconnecting(since, phase.to_string())
            }
        }
    }
}

impl From<command::RunMode> for RunMode {
    fn from(rm: command::RunMode) -> Self {
        match rm {
            command::RunMode::Init | command::RunMode::ValueingTicket => RunMode::Warmup,
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
            command::RunMode::Warmup { hopr_status: _ } => RunMode::Warmup,
            command::RunMode::Running {
                funding,
                hopr_status: _,
            } => RunMode::Running { funding },
            command::RunMode::Shutdown => RunMode::Shutdown,
        }
    }
}

impl From<command::StatusResponse> for StatusResponse {
    fn from(sr: command::StatusResponse) -> Self {
        StatusResponse {
            run_mode: sr.run_mode.into(),
            destinations: sr.destinations.into_iter().map(|d| d.into()).collect(),
        }
    }
}

impl From<command::ConnectResponse> for ConnectResponse {
    fn from(cr: command::ConnectResponse) -> Self {
        match cr {
            command::ConnectResponse::Connecting(dest) => ConnectResponse::Connecting(dest.into()),
            command::ConnectResponse::WaitingToConnect(dest, health) => {
                ConnectResponse::WaitingToConnect(dest.into(), health.map(|h| h.into()))
            }
            command::ConnectResponse::UnableToConnect(dest, health) => {
                ConnectResponse::UnableToConnect(dest.into(), health.into())
            }
            command::ConnectResponse::AddressNotFound => ConnectResponse::AddressNotFound,
        }
    }
}

impl From<command::DisconnectResponse> for DisconnectResponse {
    fn from(dr: command::DisconnectResponse) -> Self {
        match dr {
            command::DisconnectResponse::Disconnecting(dest) => {
                DisconnectResponse::Disconnecting(dest.into())
            }
            command::DisconnectResponse::NotConnected => DisconnectResponse::NotConnected,
        }
    }
}

impl From<info::Info> for Info {
    fn from(i: info::Info) -> Self {
        Info {
            node_address: i.node_address.to_string(),
            node_peer_id: i.node_peer_id,
            safe_address: i.safe_address.to_string(),
            network: i.network,
        }
    }
}

impl From<command::BalanceResponse> for BalanceResponse {
    fn from(br: command::BalanceResponse) -> Self {
        BalanceResponse {
            node: br.node.amount().to_string(),
            safe: br.safe.amount().to_string(),
            channels_out: br.channels_out.amount().to_string(),
            info: br.info.into(),
            issues: br.issues,
        }
    }
}

fn determine_app_icon(connection_state: &str, run_mode: &command::RunMode) -> String {
    // Check for low funds in Running mode
    let has_low_funds = if let command::RunMode::Running {
        funding,
        hopr_status: _,
    } = run_mode
    {
        if let command::FundingState::TopIssue(issue) = funding {
            use balance::FundingIssue;
            matches!(
                issue,
                FundingIssue::Unfunded
                    | FundingIssue::ChannelsOutOfFunds
                    | FundingIssue::SafeOutOfFunds
                    | FundingIssue::SafeLowOnFunds
                    | FundingIssue::NodeUnderfunded
                    | FundingIssue::NodeLowOnFunds
            )
        } else {
            false
        }
    } else {
        false
    };

    // Determine icon based on connection state and funding status
    match (connection_state, has_low_funds) {
        ("Connected", true) => "app-icon-connected-low-funds.png".to_string(),
        ("Connected", false) => "app-icon-connected.png".to_string(),
        ("Connecting" | "Disconnecting", _) => "app-icon-connecting-1.png".to_string(), // Will be animated by heartbeat
        (_, true) => "app-icon-disconnected-low-funds.png".to_string(), // Disconnected with low funds
        (_, false) => "app-icon-disconnected.png".to_string(),          // Disconnected
    }
}

fn determine_tray_icon(connection_state: &str) -> &'static str {
    match connection_state {
        "Connected" => "tray-icons/tray-icon-connected.png",
        "Connecting" | "Disconnecting" => "tray-icons/tray-icon-connecting.png",
        _ => "tray-icons/tray-icon-disconnected.png",
    }
}

fn start_icon_heartbeat(app: AppHandle, icon_state: Arc<ConnectingIconState>) {
    std::thread::spawn(move || {
        loop {
            if icon_state.is_animating.load(Ordering::Relaxed) {
                let current = icon_state.toggle.fetch_xor(true, Ordering::Relaxed);
                let (icon_name, sleep_duration) = if current {
                    ("app-icon-connecting-2.png", Duration::from_millis(600))
                } else {
                    ("app-icon-connecting-1.png", Duration::from_millis(200))
                };

                if let Ok(mut current_icon) = icon_state.current_icon.lock() {
                    *current_icon = icon_name.to_string();
                }

                let app_clone = app.clone();
                let icon_name_clone = icon_name.to_string();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = set_app_icon(app_clone, icon_name_clone).await {
                        eprintln!("Failed to update dock icon in heartbeat: {}", e);
                    }
                });

                std::thread::sleep(sleep_duration);
            } else {
                std::thread::sleep(Duration::from_millis(500));
            }
        }
    });
}

#[tauri::command]
async fn status(
    app: AppHandle,
    status_item: State<'_, TrayStatusItem>,
    tray_icon_state: State<'_, TrayIconState>,
    icon_state: State<'_, Arc<ConnectingIconState>>,
) -> Result<StatusResponse, String> {
    let p = PathBuf::from(socket::DEFAULT_PATH);
    let resp = socket::process_cmd(&p, &command::Command::Status).await;
    match resp {
        Ok(command::Response::Status(status_resp)) => {
            let mut derived: &str = "Disconnected";
            for ds in &status_resp.destinations {
                match ds.connection_state {
                    command::ConnectionState::Connected(_) => {
                        derived = "Connected";
                        break;
                    }
                    command::ConnectionState::Connecting(_, _) => {
                        if derived != "Connected" {
                            derived = "Connecting";
                        }
                    }
                    command::ConnectionState::Disconnecting(_, _) => {
                        if derived != "Connected" {
                            derived = "Disconnecting";
                        }
                    }
                    command::ConnectionState::None => {}
                }
            }
            if let Ok(guard) = status_item.0.lock() {
                let _ = guard.set_text(format!("Status: {}", derived));
            }

            // Update tray icon on all platforms
            let tray_icon_name = determine_tray_icon(derived);
            if let Ok(tray_icon_path) = app
                .path()
                .resource_dir()
                .map(|p| p.join("icons").join(tray_icon_name))
            {
                if let Ok(tray_image) = tauri::image::Image::from_path(&tray_icon_path) {
                    if let Ok(guard) = tray_icon_state.0.lock() {
                        let _ = guard.set_icon(Some(tray_image));

                        #[cfg(target_os = "macos")]
                        {
                            let _ = guard.set_icon_as_template(true);
                        }
                    }
                }
            }

            let icon_name = determine_app_icon(derived, &status_resp.run_mode);
            let should_animate = derived == "Connecting" || derived == "Disconnecting";

            icon_state
                .is_animating
                .store(should_animate, Ordering::Relaxed);

            if !should_animate {
                if let Ok(mut current_icon) = icon_state.current_icon.lock() {
                    *current_icon = icon_name.clone();
                }
                if let Err(e) = set_app_icon(app, icon_name).await {
                    eprintln!("Failed to update app icon: {}", e);
                }
            }

            Ok(status_resp.into())
        }
        Ok(_) => {
            if let Ok(guard) = status_item.0.lock() {
                let _ = guard.set_text("Status: Not available");
            }
            Err("Unexpected response type".to_string())
        }
        Err(e) => {
            if let Ok(guard) = status_item.0.lock() {
                let _ = guard.set_text("Status: Not available");
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn connect(address: String) -> Result<ConnectResponse, String> {
    let p = PathBuf::from(socket::DEFAULT_PATH);
    let conv_address = address
        .parse::<connection::destination::Address>()
        .map_err(|e| e.to_string())?;
    let cmd = command::Command::Connect(conv_address);
    let resp = socket::process_cmd(&p, &cmd)
        .await
        .map_err(|e| e.to_string())?;
    match resp {
        command::Response::Connect(resp) => Ok(resp.into()),
        _ => Err("Unexpected response type".to_string()),
    }
}

#[tauri::command]
async fn disconnect() -> Result<DisconnectResponse, String> {
    let p = PathBuf::from(socket::DEFAULT_PATH);
    let cmd = command::Command::Disconnect;
    let resp = socket::process_cmd(&p, &cmd)
        .await
        .map_err(|e| e.to_string())?;
    match resp {
        command::Response::Disconnect(resp) => Ok(resp.into()),
        _ => Err("Unexpected response type".to_string()),
    }
}

#[tauri::command]
async fn balance() -> Result<Option<BalanceResponse>, String> {
    let p = PathBuf::from(socket::DEFAULT_PATH);
    let cmd = command::Command::Balance;
    let resp = socket::process_cmd(&p, &cmd)
        .await
        .map_err(|e| e.to_string())?;
    match resp {
        command::Response::Balance(resp) => Ok(resp.map(|b| b.into())),
        _ => Err("Unexpected response type".to_string()),
    }
}

#[tauri::command]
async fn refresh_node() -> Result<(), String> {
    let p = PathBuf::from(socket::DEFAULT_PATH);
    let cmd = command::Command::RefreshNode;
    let resp = socket::process_cmd(&p, &cmd)
        .await
        .map_err(|e| e.to_string())?;
    match resp {
        command::Response::Empty => Ok(()),
        _ => Err("Unexpected response type".to_string()),
    }
}

#[tauri::command]
async fn funding_tool(secret: String) -> Result<(), String> {
    let p = PathBuf::from(socket::DEFAULT_PATH);
    let cmd = command::Command::FundingTool(secret);
    let resp = socket::process_cmd(&p, &cmd)
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
async fn set_app_icon(app: AppHandle, icon_name: String) -> Result<(), String> {
    use dispatch::Queue;
    use std::fs;
    use std::sync::mpsc;

    let icon_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?
        .join("icons")
        .join("app-icons")
        .join(&icon_name);

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

    // Wait for the result from the main thread
    rx.recv()
        .map_err(|e| format!("Failed to receive result from main thread: {}", e))?
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
async fn set_app_icon(app: AppHandle, icon_name: String) -> Result<(), String> {
    use std::fs;
    use tauri::image::Image;

    let icon_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?
        .join("icons")
        .join("app-icons")
        .join(&icon_name);

    let icon_data = fs::read(&icon_path)
        .map_err(|e| format!("Failed to read icon file {}: {}", icon_path.display(), e))?;

    let image = Image::from_bytes(&icon_data)
        .map_err(|e| format!("Failed to create image from icon data: {}", e))?;

    // Set icon on all windows (main and settings)
    let mut errors = Vec::new();

    if let Some(window) = app.get_webview_window("main") {
        if let Err(e) = window.set_icon(Some(image.clone())) {
            errors.push(format!("Failed to set main window icon: {}", e));
        }
    }

    if let Some(window) = app.get_webview_window("settings") {
        if let Err(e) = window.set_icon(Some(image)) {
            errors.push(format!("Failed to set settings window icon: {}", e));
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}

#[tauri::command]
async fn compress_logs(_app: AppHandle, dest_path: Option<String>) -> Result<String, String> {
    // Resolve candidate log files by platform
    #[cfg(target_os = "macos")]
    let candidates: Vec<&str> = vec![
        "/var/log/gnosis_vpn/gnosis_vpn.log",
        "/var/log/gnosis_vpn/gnosis_vpn.error.log",
    ];
    #[cfg(target_os = "linux")]
    let candidates: Vec<&str> = vec!["/var/log/gnosis_vpn/gnosis_vpn.log"];
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    let candidates: Vec<&str> = vec![];

    let existing: Vec<&str> = candidates
        .into_iter()
        .filter(|p| Path::new(p).exists())
        .collect();

    if existing.is_empty() {
        return Err("No gnosis_vpn log files found in /var/log/gnosis_vpn/".to_string());
    }

    // Determine output path (must be provided by caller)
    let requested_dest = dest_path.and_then(|p| {
        let trimmed = p.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });
    let out_path = requested_dest.ok_or_else(|| "Destination path not provided".to_string())?;

    // Compress logs
    // - If multiple files: concatenate with cat and pipe to zstd
    // - If single file: compress directly
    let status = if existing.len() > 1 {
        // Concatenate text logs and compress by piping cat stdout to zstd stdin
        use std::process::Stdio;

        let mut cat_cmd = Command::new("cat");
        for file in &existing {
            cat_cmd.arg(file);
        }

        let cat_child = cat_cmd
            .stdout(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn cat: {}", e))?;

        Command::new("zstd")
            .args(["-T0", "-19", "-f", "-o", &out_path])
            .stdin(cat_child.stdout.ok_or("Failed to get cat stdout")?)
            .status()
            .map_err(|e| format!("Failed to run zstd: {}", e))?
    } else {
        Command::new("zstd")
            .arg("-T0")
            .arg("-19")
            .arg("-f")
            .arg("-o")
            .arg(&out_path)
            .arg(existing[0])
            .status()
            .map_err(|e| format!("Failed to spawn zstd: {}", e))?
    };

    if !status.success() {
        return Err(
            "Compression failed. Ensure zstd is installed and files are readable.".to_string(),
        );
    }

    Ok(out_path)
}

fn create_tray_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, tauri::Error> {
    let status_item =
        MenuItem::with_id(app, "status", "Status: Disconnected", false, None::<&str>)?;
    let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let logs_item = MenuItem::with_id(app, "logs", "Logs", true, None::<&str>)?;
    let usage_item = MenuItem::with_id(app, "usage", "Usage", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    // Expose the status menu item via app state so commands can update it
    app.manage(TrayStatusItem(Mutex::new(status_item.clone())));

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

fn toggle_main_window_visibility(app: &AppHandle, triggered_by_tray: bool) {
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible().unwrap_or(false);
        let is_focused = window.is_focused().unwrap_or(false);
        if !is_visible || !is_focused {
            #[cfg(target_os = "macos")]
            {
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
            }
            // Only try to position by the tray when triggered by a tray icon click
            if triggered_by_tray {
                // Move first while hidden so the initial paint appears in the correct spot
                let _ = window.move_window(Position::TrayBottomLeft);
            }
            let _ = window.show();
            let _ = window.set_focus();
            if triggered_by_tray {
                // Re-apply shortly after to ensure it snaps tightly to the tray on multi-monitor
                let handle = window.clone();
                tauri::async_runtime::spawn(async move {
                    std::thread::sleep(Duration::from_millis(10));
                    let _ = handle.move_window(Position::TrayBottomLeft);
                });
            }
        } else {
            let _ = window.hide();
            #[cfg(target_os = "macos")]
            {
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }
        }
    }
}

fn handle_tray_event(app: &AppHandle, event: TrayIconEvent) {
    // Register tray position for the positioner plugin
    tauri_plugin_positioner::on_tray_event(app.app_handle(), &event);
    if let TrayIconEvent::Click {
        button: tauri::tray::MouseButton::Left,
        button_state: tauri::tray::MouseButtonState::Up,
        ..
    } = event
    {
        toggle_main_window_visibility(app, true);
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
        // Emit navigate after a short delay to ensure the frontend listener is attached
        let handle = window.clone();
        let target_owned = target.to_string();
        tauri::async_runtime::spawn(async move {
            std::thread::sleep(Duration::from_millis(120));
            let _ = handle.emit("navigate", target_owned);
        });
    }
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

            // Create tray menu
            let menu = create_tray_menu(app.handle())?;

            // Start with disconnected tray icon
            let icon_name: &str = "tray-icons/tray-icon-disconnected.png";

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

            app.manage(TrayIconState(Mutex::new(tray)));

            let icon_state = Arc::new(ConnectingIconState {
                toggle: AtomicBool::new(false),
                is_animating: AtomicBool::new(false),
                current_icon: Mutex::new("app-icon-disconnected.png".to_string()),
            });
            app.manage(icon_state.clone());

            start_icon_heartbeat(app.handle().clone(), icon_state);

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
            funding_tool,
            compress_logs,
            set_app_icon
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
