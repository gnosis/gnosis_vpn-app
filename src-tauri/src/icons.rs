use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Manager, Theme, tray::TrayIcon};

use crate::set_app_icon;
use gnosis_vpn_lib::{balance, command};

// App icon constants
pub const APP_ICON_CONNECTED: &str = "app-icon-connected.png";
pub const APP_ICON_CONNECTED_LOW_FUNDS: &str = "app-icon-connected-low-funds.png";
pub const APP_ICON_CONNECTING_1: &str = "app-icon-connecting-1.png";
pub const APP_ICON_CONNECTING_2: &str = "app-icon-connecting-2.png";
pub const APP_ICON_DISCONNECTED: &str = "app-icon-disconnected.png";
pub const APP_ICON_DISCONNECTED_LOW_FUNDS: &str = "app-icon-disconnected-low-funds.png";

// Tray icon constants
pub const TRAY_ICON_CONNECTED: &str = "tray-icons/tray-icon-connected.png";
pub const TRAY_ICON_CONNECTED_BLACK: &str = "tray-icons/tray-icon-connected-black.png";
pub const TRAY_ICON_CONNECTING: &str = "tray-icons/tray-icon-connecting.png";
pub const TRAY_ICON_CONNECTING_BLACK: &str = "tray-icons/tray-icon-connecting-black.png";
pub const TRAY_ICON_DISCONNECTED: &str = "tray-icons/tray-icon-disconnected.png";
pub const TRAY_ICON_DISCONNECTED_BLACK: &str = "tray-icons/tray-icon-disconnected-black.png";

// State to hold a reference to the tray icon so we can update it
pub struct TrayIconState {
    pub tray: Mutex<TrayIcon<tauri::Wry>>,
    pub current_icon: Mutex<String>,
}

// State to track which app icon to show (including animation state)
pub struct AppIconState {
    pub animation_toggle: AtomicBool,
    pub is_animating: AtomicBool,
    pub current_icon: Mutex<String>,
}

pub fn update_icon_name_if_changed(current: &Mutex<String>, next: &str) -> bool {
    match current.lock() {
        Ok(mut guard) => {
            if guard.as_str() == next {
                false
            } else {
                *guard = next.to_string();
                true
            }
        }
        Err(e) => {
            eprintln!("Failed to lock current_icon mutex: {}", e);
            true
        }
    }
}

pub fn determine_app_icon(connection_state: &str, run_mode: &command::RunMode) -> String {
    // Check for low funds in Running mode
    let has_low_funds = if let command::RunMode::Running {
        funding: command::FundingState::TopIssue(issue),
        hopr_status: _,
    } = run_mode
    {
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
    };

    // Determine icon based on connection state and funding status
    match (connection_state, has_low_funds) {
        ("Connected", true) => APP_ICON_CONNECTED_LOW_FUNDS.to_string(),
        ("Connected", false) => APP_ICON_CONNECTED.to_string(),
        ("Connecting" | "Disconnecting", _) => APP_ICON_CONNECTING_1.to_string(), // Will be animated by heartbeat
        (_, true) => APP_ICON_DISCONNECTED_LOW_FUNDS.to_string(), // Disconnected with low funds
        (_, false) => APP_ICON_DISCONNECTED.to_string(),          // Disconnected
    }
}

pub fn determine_tray_icon(connection_state: &str, theme: Option<Theme>) -> &'static str {
    let use_black_icons = !cfg!(target_os = "macos") && matches!(theme, Some(Theme::Light));
    eprintln!("use_black_icons: {}", use_black_icons);
    eprintln!("connection_state: {}", connection_state);
    eprintln!("theme: {:?}", theme);

    match (connection_state, use_black_icons) {
        ("Connected", true) => TRAY_ICON_CONNECTED_BLACK,
        ("Connected", false) => TRAY_ICON_CONNECTED,
        ("Connecting" | "Disconnecting", true) => TRAY_ICON_CONNECTING_BLACK,
        ("Connecting" | "Disconnecting", false) => TRAY_ICON_CONNECTING,
        (_, true) => TRAY_ICON_DISCONNECTED_BLACK,
        (_, false) => TRAY_ICON_DISCONNECTED,
    }
}

#[cfg_attr(target_os = "macos", allow(dead_code))]
pub fn extract_connection_state_from_icon(icon_name: &str) -> &'static str {
    if icon_name.contains("connected") && !icon_name.contains("connecting") {
        "Connected"
    } else if icon_name.contains("connecting") {
        "Connecting"
    } else {
        "Disconnected"
    }
}

pub fn update_tray_icon(
    app: &AppHandle,
    tray_icon_state: &TrayIconState,
    connection_state: &str,
    theme: Option<Theme>,
) {
    let tray_icon_name = determine_tray_icon(connection_state, theme);
    if update_icon_name_if_changed(&tray_icon_state.current_icon, tray_icon_name) {
        if let Ok(tray_icon_path) = Manager::path(app)
            .resource_dir()
            .map(|p| p.join("icons").join(tray_icon_name))
        {
            if let Ok(tray_image) = tauri::image::Image::from_path(&tray_icon_path) {
                if let Ok(guard) = tray_icon_state.tray.lock() {
                    let _ = guard.set_icon(Some(tray_image));

                    #[cfg(target_os = "macos")]
                    {
                        let _ = guard.set_icon_as_template(true);
                    }
                }
            }
        }
    }
}

pub fn start_app_icon_heartbeat(app: AppHandle, app_icon_state: Arc<AppIconState>) {
    std::thread::spawn(move || {
        loop {
            if app_icon_state.is_animating.load(Ordering::Relaxed) {
                let current = app_icon_state
                    .animation_toggle
                    .fetch_xor(true, Ordering::Relaxed);
                let (icon_name, sleep_duration) = if current {
                    (APP_ICON_CONNECTING_2, Duration::from_millis(600))
                } else {
                    (APP_ICON_CONNECTING_1, Duration::from_millis(200))
                };

                if let Ok(mut current_icon) = app_icon_state.current_icon.lock() {
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
