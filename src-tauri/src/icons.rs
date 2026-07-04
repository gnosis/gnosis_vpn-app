use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Manager, tray::TrayIcon};

use tokio::time::sleep;

use gnosis_vpn_lib::balance::FundingIssue;

use crate::commands::set_app_icon;
use crate::types::{ConnectionState, RunMode};

// App icon constants
pub const APP_ICON_CONNECTED: &str = "app-icon-connected.png";
pub const APP_ICON_CONNECTED_LOW_FUNDS: &str = "app-icon-connected-low-funds.png";
pub const APP_ICON_CONNECTED_OUT_OF_FUNDS: &str = "app-icon-connected-out-of-funds.png";
pub const APP_ICON_CONNECTING_1: &str = "app-icon-connecting-1.png";
pub const APP_ICON_CONNECTING_2: &str = "app-icon-connecting-2.png";
pub const APP_ICON_CONNECTING_LOW_FUNDS_1: &str = "app-icon-connecting-low-funds-1.png";
pub const APP_ICON_CONNECTING_LOW_FUNDS_2: &str = "app-icon-connecting-low-funds-2.png";
pub const APP_ICON_CONNECTING_OUT_OF_FUNDS_1: &str = "app-icon-connecting-out-of-funds-1.png";
pub const APP_ICON_CONNECTING_OUT_OF_FUNDS_2: &str = "app-icon-connecting-out-of-funds-2.png";
pub const APP_ICON_DISCONNECTED: &str = "app-icon-disconnected.png";
pub const APP_ICON_DISCONNECTED_LOW_FUNDS: &str = "app-icon-disconnected-low-funds.png";
pub const APP_ICON_DISCONNECTED_OUT_OF_FUNDS: &str = "app-icon-disconnected-out-of-funds.png";

// Tray icon constants
pub const TRAY_ICON_CONNECTED: &str = "tray-icons/tray-icon-connected.png";
pub const _TRAY_ICON_CONNECTED_BLACK: &str = "tray-icons/tray-icon-connected-black.png";
pub const TRAY_ICON_CONNECTING: &str = "tray-icons/tray-icon-connecting.png";
pub const _TRAY_ICON_CONNECTING_BLACK: &str = "tray-icons/tray-icon-connecting-black.png";
pub const TRAY_ICON_DISCONNECTED: &str = "tray-icons/tray-icon-disconnected.png";
pub const _TRAY_ICON_DISCONNECTED_BLACK: &str = "tray-icons/tray-icon-disconnected-black.png";

// Linux tray icon constants (theme-independent)
pub const TRAY_ICON_LINUX_CONNECTED: &str = "tray-icons/linux/connected.png";
pub const TRAY_ICON_LINUX_CONNECTING: &str = "tray-icons/linux/connecting.png";
pub const TRAY_ICON_LINUX_DISCONNECTED: &str = "tray-icons/linux/disconnected.png";

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
    pub funds_level: Mutex<FundsLevel>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum FundsLevel {
    Sufficient,
    Low,
    Empty,
}

// Mirrors deriveOverallStatus in src/utils/funding.ts — keep both in sync.
pub fn funds_level(run_mode: &RunMode) -> FundsLevel {
    let issues = match run_mode {
        RunMode::Running {
            funding_issues: Some(issues),
            ..
        } => issues,
        _ => return FundsLevel::Sufficient,
    };

    let is_empty = issues.iter().any(|i| {
        matches!(
            i,
            FundingIssue::Unfunded
                | FundingIssue::ChannelsOutOfFunds
                | FundingIssue::SafeOutOfFunds
                | FundingIssue::NodeUnderfunded
        )
    });
    if is_empty {
        return FundsLevel::Empty;
    }

    let is_low = issues.iter().any(|i| {
        matches!(
            i,
            FundingIssue::SafeLowOnFunds | FundingIssue::NodeLowOnFunds
        )
    });
    if is_low {
        FundsLevel::Low
    } else {
        FundsLevel::Sufficient
    }
}

// Animation frame pair for the connecting/reconnecting/disconnecting states.
pub fn connecting_frames(level: FundsLevel) -> (&'static str, &'static str) {
    match level {
        FundsLevel::Sufficient => (APP_ICON_CONNECTING_1, APP_ICON_CONNECTING_2),
        FundsLevel::Low => (
            APP_ICON_CONNECTING_LOW_FUNDS_1,
            APP_ICON_CONNECTING_LOW_FUNDS_2,
        ),
        FundsLevel::Empty => (
            APP_ICON_CONNECTING_OUT_OF_FUNDS_1,
            APP_ICON_CONNECTING_OUT_OF_FUNDS_2,
        ),
    }
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

pub fn determine_app_icon(connection_state: &ConnectionState, run_mode: &RunMode) -> String {
    let level = funds_level(run_mode);
    let icon = match connection_state {
        ConnectionState::Connected(_) => match level {
            FundsLevel::Sufficient => APP_ICON_CONNECTED,
            FundsLevel::Low => APP_ICON_CONNECTED_LOW_FUNDS,
            FundsLevel::Empty => APP_ICON_CONNECTED_OUT_OF_FUNDS,
        },
        ConnectionState::Connecting(_)
        | ConnectionState::Reconnecting(_)
        | ConnectionState::Disconnecting => connecting_frames(level).0, // Will be animated by heartbeat
        ConnectionState::Disconnected => match level {
            FundsLevel::Sufficient => APP_ICON_DISCONNECTED,
            FundsLevel::Low => APP_ICON_DISCONNECTED_LOW_FUNDS,
            FundsLevel::Empty => APP_ICON_DISCONNECTED_OUT_OF_FUNDS,
        },
    };
    icon.to_string()
}

pub fn determine_tray_icon(connection_state: &ConnectionState) -> &'static str {
    if cfg!(target_os = "linux") {
        match connection_state {
            ConnectionState::Connected(_) => TRAY_ICON_LINUX_CONNECTED,
            ConnectionState::Connecting(_)
            | ConnectionState::Reconnecting(_)
            | ConnectionState::Disconnecting => TRAY_ICON_LINUX_CONNECTING,
            _ => TRAY_ICON_LINUX_DISCONNECTED,
        }
    } else {
        match connection_state {
            ConnectionState::Connected(_) => TRAY_ICON_CONNECTED,
            ConnectionState::Connecting(_)
            | ConnectionState::Reconnecting(_)
            | ConnectionState::Disconnecting => TRAY_ICON_CONNECTING,
            _ => TRAY_ICON_DISCONNECTED,
        }
    }
}

pub fn update_tray_icon(
    app: &AppHandle,
    tray_icon_state: &TrayIconState,
    conn_state: &ConnectionState,
) {
    let tray_icon_name = determine_tray_icon(conn_state);
    if update_icon_name_if_changed(&tray_icon_state.current_icon, tray_icon_name) {
        if let Ok(tray_icon_path) = Manager::path(app)
            .resource_dir()
            .map(|p| p.join("icons").join(tray_icon_name))
        {
            if let Ok(tray_image) = tauri::image::Image::from_path(&tray_icon_path) {
                if let Ok(guard) = tray_icon_state.tray.lock() {
                    let _ = guard.set_icon(Some(tray_image));
                    // this function only affects macOS and is a noop on other platforms
                    let _ = guard.set_icon_as_template(true);
                }
            }
        }
    }
}

pub fn start_app_icon_heartbeat(
    app: AppHandle,
    app_icon_state: Arc<AppIconState>,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        loop {
            if app_icon_state.is_animating.load(Ordering::Relaxed) {
                let current = app_icon_state
                    .animation_toggle
                    .fetch_xor(true, Ordering::Relaxed);
                let level = app_icon_state
                    .funds_level
                    .lock()
                    .map(|guard| *guard)
                    .unwrap_or(FundsLevel::Sufficient);
                let (frame_1, frame_2) = connecting_frames(level);
                let (icon_name, sleep_duration) = if current {
                    (frame_2, Duration::from_millis(600))
                } else {
                    (frame_1, Duration::from_millis(200))
                };

                if let Ok(mut current_icon) = app_icon_state.current_icon.lock() {
                    *current_icon = icon_name.to_string();
                }

                if let Err(e) = set_app_icon(app.clone(), icon_name.to_string()).await {
                    eprintln!("Failed to update dock icon in heartbeat: {}", e);
                }

                sleep(sleep_duration).await;
            } else {
                sleep(Duration::from_millis(500)).await;
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn running(issues: Vec<FundingIssue>) -> RunMode {
        RunMode::Running {
            funding_issues: Some(issues),
            hopr_status: None,
        }
    }

    #[test]
    fn funds_level_ignores_non_running_modes() {
        assert_eq!(funds_level(&RunMode::NotRunning), FundsLevel::Sufficient);
        assert_eq!(funds_level(&RunMode::Shutdown), FundsLevel::Sufficient);
    }

    #[test]
    fn funds_level_classifies_issues() {
        assert_eq!(funds_level(&running(vec![])), FundsLevel::Sufficient);
        assert_eq!(
            funds_level(&running(vec![FundingIssue::SafeLowOnFunds])),
            FundsLevel::Low
        );
        assert_eq!(
            funds_level(&running(vec![FundingIssue::NodeLowOnFunds])),
            FundsLevel::Low
        );
        assert_eq!(
            funds_level(&running(vec![FundingIssue::Unfunded])),
            FundsLevel::Empty
        );
        assert_eq!(
            funds_level(&running(vec![FundingIssue::ChannelsOutOfFunds])),
            FundsLevel::Empty
        );
        assert_eq!(
            funds_level(&running(vec![FundingIssue::SafeOutOfFunds])),
            FundsLevel::Empty
        );
        assert_eq!(
            funds_level(&running(vec![FundingIssue::NodeUnderfunded])),
            FundsLevel::Empty
        );
    }

    #[test]
    fn funds_level_empty_wins_over_low() {
        let mode = running(vec![
            FundingIssue::SafeLowOnFunds,
            FundingIssue::SafeOutOfFunds,
        ]);
        assert_eq!(funds_level(&mode), FundsLevel::Empty);
    }

    #[test]
    fn app_icon_matrix() {
        let connected = ConnectionState::Connected("x".into());
        let connecting = ConnectionState::Connecting("x".into());
        let disconnected = ConnectionState::Disconnected;

        let sufficient = running(vec![]);
        let low = running(vec![FundingIssue::NodeLowOnFunds]);
        let empty = running(vec![FundingIssue::Unfunded]);

        assert_eq!(
            determine_app_icon(&connected, &sufficient),
            APP_ICON_CONNECTED
        );
        assert_eq!(
            determine_app_icon(&connected, &low),
            APP_ICON_CONNECTED_LOW_FUNDS
        );
        assert_eq!(
            determine_app_icon(&connected, &empty),
            APP_ICON_CONNECTED_OUT_OF_FUNDS
        );

        assert_eq!(
            determine_app_icon(&connecting, &sufficient),
            APP_ICON_CONNECTING_1
        );
        assert_eq!(
            determine_app_icon(&connecting, &low),
            APP_ICON_CONNECTING_LOW_FUNDS_1
        );
        assert_eq!(
            determine_app_icon(&connecting, &empty),
            APP_ICON_CONNECTING_OUT_OF_FUNDS_1
        );

        assert_eq!(
            determine_app_icon(&disconnected, &sufficient),
            APP_ICON_DISCONNECTED
        );
        assert_eq!(
            determine_app_icon(&disconnected, &low),
            APP_ICON_DISCONNECTED_LOW_FUNDS
        );
        assert_eq!(
            determine_app_icon(&disconnected, &empty),
            APP_ICON_DISCONNECTED_OUT_OF_FUNDS
        );
    }
}
