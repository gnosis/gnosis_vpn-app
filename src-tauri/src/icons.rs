use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, tray::TrayIcon};

use crate::set_app_icon;
use gnosis_vpn_lib::{balance, command};

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
        Err(_) => true,
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
        ("Connected", true) => "app-icon-connected-low-funds.png".to_string(),
        ("Connected", false) => "app-icon-connected.png".to_string(),
        ("Connecting" | "Disconnecting", _) => "app-icon-connecting-1.png".to_string(), // Will be animated by heartbeat
        (_, true) => "app-icon-disconnected-low-funds.png".to_string(), // Disconnected with low funds
        (_, false) => "app-icon-disconnected.png".to_string(),          // Disconnected
    }
}

pub fn determine_tray_icon(connection_state: &str) -> &'static str {
    match connection_state {
        "Connected" => "tray-icons/tray-icon-connected.png",
        "Connecting" | "Disconnecting" => "tray-icons/tray-icon-connecting.png",
        _ => "tray-icons/tray-icon-disconnected.png",
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
                    ("app-icon-connecting-2.png", Duration::from_millis(600))
                } else {
                    ("app-icon-connecting-1.png", Duration::from_millis(200))
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
