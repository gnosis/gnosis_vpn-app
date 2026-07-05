use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::image::Image;
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

// Tray icon constants (macOS/Windows, macOS renders them alpha-only via template mode)
pub const TRAY_ICON_CONNECTED: &str = "tray-icons/tray-icon-connected.png";
pub const TRAY_ICON_CONNECTED_LOW_FUNDS: &str = "tray-icons/tray-icon-connected-low-funds.png";
pub const TRAY_ICON_CONNECTED_OUT_OF_FUNDS: &str =
    "tray-icons/tray-icon-connected-out-of-funds.png";
pub const TRAY_ICON_CONNECTING_1: &str = "tray-icons/tray-icon-connecting-1.png";
pub const TRAY_ICON_CONNECTING_2: &str = "tray-icons/tray-icon-connecting-2.png";
pub const TRAY_ICON_CONNECTING_LOW_FUNDS_1: &str =
    "tray-icons/tray-icon-connecting-low-funds-1.png";
pub const TRAY_ICON_CONNECTING_LOW_FUNDS_2: &str =
    "tray-icons/tray-icon-connecting-low-funds-2.png";
pub const TRAY_ICON_CONNECTING_OUT_OF_FUNDS_1: &str =
    "tray-icons/tray-icon-connecting-out-of-funds-1.png";
pub const TRAY_ICON_CONNECTING_OUT_OF_FUNDS_2: &str =
    "tray-icons/tray-icon-connecting-out-of-funds-2.png";
pub const TRAY_ICON_DISCONNECTED: &str = "tray-icons/tray-icon-disconnected.png";
pub const TRAY_ICON_DISCONNECTED_LOW_FUNDS: &str =
    "tray-icons/tray-icon-disconnected-low-funds.png";
pub const TRAY_ICON_DISCONNECTED_OUT_OF_FUNDS: &str =
    "tray-icons/tray-icon-disconnected-out-of-funds.png";

// Linux tray icon constants (theme-independent, full-color app icon design)
pub const TRAY_ICON_LINUX_CONNECTED: &str = "tray-icons/linux/connected.png";
pub const TRAY_ICON_LINUX_CONNECTED_LOW_FUNDS: &str = "tray-icons/linux/connected-low-funds.png";
pub const TRAY_ICON_LINUX_CONNECTED_OUT_OF_FUNDS: &str =
    "tray-icons/linux/connected-out-of-funds.png";
pub const TRAY_ICON_LINUX_CONNECTING_1: &str = "tray-icons/linux/connecting-1.png";
pub const TRAY_ICON_LINUX_CONNECTING_2: &str = "tray-icons/linux/connecting-2.png";
pub const TRAY_ICON_LINUX_CONNECTING_LOW_FUNDS_1: &str =
    "tray-icons/linux/connecting-low-funds-1.png";
pub const TRAY_ICON_LINUX_CONNECTING_LOW_FUNDS_2: &str =
    "tray-icons/linux/connecting-low-funds-2.png";
pub const TRAY_ICON_LINUX_CONNECTING_OUT_OF_FUNDS_1: &str =
    "tray-icons/linux/connecting-out-of-funds-1.png";
pub const TRAY_ICON_LINUX_CONNECTING_OUT_OF_FUNDS_2: &str =
    "tray-icons/linux/connecting-out-of-funds-2.png";
pub const TRAY_ICON_LINUX_DISCONNECTED: &str = "tray-icons/linux/disconnected.png";
pub const TRAY_ICON_LINUX_DISCONNECTED_LOW_FUNDS: &str =
    "tray-icons/linux/disconnected-low-funds.png";
pub const TRAY_ICON_LINUX_DISCONNECTED_OUT_OF_FUNDS: &str =
    "tray-icons/linux/disconnected-out-of-funds.png";

// State to hold a reference to the tray icon so we can update it
pub struct TrayIconState {
    pub tray: Mutex<TrayIcon<tauri::Wry>>,
    pub current_icon: Mutex<String>,
}

// Every icon, loaded once at startup. The connecting animation swaps icons
// several times a second, so reading and decoding PNGs on demand would burn
// CPU on every frame. Loading eagerly also keeps the maps immutable — no
// locking needed.
pub struct IconCache {
    tray: HashMap<String, Image<'static>>,
    // The dock icon needs a different payload per platform: macOS feeds raw
    // PNG bytes to NSImage, Linux feeds decoded RGBA to window.set_icon.
    #[cfg(target_os = "macos")]
    app: HashMap<String, Arc<Vec<u8>>>,
    #[cfg(target_os = "linux")]
    app: HashMap<String, Image<'static>>,
}

impl IconCache {
    pub fn load(resource_dir: &Path) -> Result<Self, String> {
        let icons_dir = resource_dir.join("icons");
        let tray_subdir = if cfg!(target_os = "linux") {
            "tray-icons/linux"
        } else {
            "tray-icons"
        };
        Ok(Self {
            tray: load_images(&icons_dir.join(tray_subdir), &format!("{tray_subdir}/"))?,
            #[cfg(target_os = "macos")]
            app: load_bytes(&icons_dir.join("app-icons"))?,
            #[cfg(target_os = "linux")]
            app: load_images(&icons_dir.join("app-icons"), "")?,
        })
    }

    pub fn tray_image(&self, icon_name: &str) -> Option<Image<'static>> {
        self.tray.get(icon_name).cloned()
    }

    // The app icon lookups double as the allowlist for the set_app_icon
    // command: unknown names simply miss the cache.
    #[cfg(target_os = "macos")]
    pub fn app_icon_bytes(&self, icon_name: &str) -> Option<Arc<Vec<u8>>> {
        self.app.get(icon_name).cloned()
    }

    #[cfg(target_os = "linux")]
    pub fn app_icon_image(&self, icon_name: &str) -> Option<Image<'static>> {
        self.app.get(icon_name).cloned()
    }
}

// Decodes every PNG directly inside `dir`, keyed by `key_prefix` + file name.
fn load_images(dir: &Path, key_prefix: &str) -> Result<HashMap<String, Image<'static>>, String> {
    let mut images = HashMap::new();
    for (name, path) in png_files(dir)? {
        let image = Image::from_path(&path)
            .map_err(|e| format!("Failed to decode {}: {e}", path.display()))?;
        images.insert(format!("{key_prefix}{name}"), image);
    }
    Ok(images)
}

#[cfg(target_os = "macos")]
fn load_bytes(dir: &Path) -> Result<HashMap<String, Arc<Vec<u8>>>, String> {
    let mut bytes = HashMap::new();
    for (name, path) in png_files(dir)? {
        let data =
            std::fs::read(&path).map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
        bytes.insert(name, Arc::new(data));
    }
    Ok(bytes)
}

// Lists the PNG files directly inside `dir` as (file name, full path) pairs.
fn png_files(dir: &Path) -> Result<Vec<(String, PathBuf)>, String> {
    let entries =
        std::fs::read_dir(dir).map_err(|e| format!("Failed to read {}: {e}", dir.display()))?;
    let mut files = Vec::new();
    for entry in entries {
        let path = entry.map_err(|e| e.to_string())?.path();
        let is_png = path.extension().and_then(|e| e.to_str()) == Some("png");
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if is_png {
            let name = name.to_string();
            files.push((name, path));
        }
    }
    Ok(files)
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

// Tray twin of connecting_frames.
pub fn connecting_tray_frames(level: FundsLevel) -> (&'static str, &'static str) {
    if cfg!(target_os = "linux") {
        match level {
            FundsLevel::Sufficient => (TRAY_ICON_LINUX_CONNECTING_1, TRAY_ICON_LINUX_CONNECTING_2),
            FundsLevel::Low => (
                TRAY_ICON_LINUX_CONNECTING_LOW_FUNDS_1,
                TRAY_ICON_LINUX_CONNECTING_LOW_FUNDS_2,
            ),
            FundsLevel::Empty => (
                TRAY_ICON_LINUX_CONNECTING_OUT_OF_FUNDS_1,
                TRAY_ICON_LINUX_CONNECTING_OUT_OF_FUNDS_2,
            ),
        }
    } else {
        match level {
            FundsLevel::Sufficient => (TRAY_ICON_CONNECTING_1, TRAY_ICON_CONNECTING_2),
            FundsLevel::Low => (
                TRAY_ICON_CONNECTING_LOW_FUNDS_1,
                TRAY_ICON_CONNECTING_LOW_FUNDS_2,
            ),
            FundsLevel::Empty => (
                TRAY_ICON_CONNECTING_OUT_OF_FUNDS_1,
                TRAY_ICON_CONNECTING_OUT_OF_FUNDS_2,
            ),
        }
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

pub fn determine_tray_icon(connection_state: &ConnectionState, level: FundsLevel) -> &'static str {
    if cfg!(target_os = "linux") {
        match connection_state {
            ConnectionState::Connected(_) => match level {
                FundsLevel::Sufficient => TRAY_ICON_LINUX_CONNECTED,
                FundsLevel::Low => TRAY_ICON_LINUX_CONNECTED_LOW_FUNDS,
                FundsLevel::Empty => TRAY_ICON_LINUX_CONNECTED_OUT_OF_FUNDS,
            },
            ConnectionState::Connecting(_)
            | ConnectionState::Reconnecting(_)
            | ConnectionState::Disconnecting => connecting_tray_frames(level).0, // Will be animated by heartbeat
            ConnectionState::Disconnected => match level {
                FundsLevel::Sufficient => TRAY_ICON_LINUX_DISCONNECTED,
                FundsLevel::Low => TRAY_ICON_LINUX_DISCONNECTED_LOW_FUNDS,
                FundsLevel::Empty => TRAY_ICON_LINUX_DISCONNECTED_OUT_OF_FUNDS,
            },
        }
    } else {
        match connection_state {
            ConnectionState::Connected(_) => match level {
                FundsLevel::Sufficient => TRAY_ICON_CONNECTED,
                FundsLevel::Low => TRAY_ICON_CONNECTED_LOW_FUNDS,
                FundsLevel::Empty => TRAY_ICON_CONNECTED_OUT_OF_FUNDS,
            },
            ConnectionState::Connecting(_)
            | ConnectionState::Reconnecting(_)
            | ConnectionState::Disconnecting => connecting_tray_frames(level).0, // Will be animated by heartbeat
            ConnectionState::Disconnected => match level {
                FundsLevel::Sufficient => TRAY_ICON_DISCONNECTED,
                FundsLevel::Low => TRAY_ICON_DISCONNECTED_LOW_FUNDS,
                FundsLevel::Empty => TRAY_ICON_DISCONNECTED_OUT_OF_FUNDS,
            },
        }
    }
}

pub fn update_tray_icon(
    app: &AppHandle,
    tray_icon_state: &TrayIconState,
    conn_state: &ConnectionState,
    level: FundsLevel,
) {
    let tray_icon_name = determine_tray_icon(conn_state, level);
    set_tray_icon_file(app, tray_icon_state, tray_icon_name);
}

pub fn set_tray_icon_file(app: &AppHandle, tray_icon_state: &TrayIconState, icon_name: &str) {
    if !update_icon_name_if_changed(&tray_icon_state.current_icon, icon_name) {
        return;
    }
    let Some(tray_image) = app.state::<IconCache>().tray_image(icon_name) else {
        eprintln!("Tray icon not in cache: {icon_name}");
        return;
    };
    if let Ok(guard) = tray_icon_state.tray.lock() {
        let _ = guard.set_icon(Some(tray_image));
        // this function only affects macOS and is a noop on other platforms
        let _ = guard.set_icon_as_template(true);
    }
}

// Animates both the app (dock) icon and the tray icon while connecting.
pub fn start_icon_heartbeat(
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
                let (tray_frame_1, tray_frame_2) = connecting_tray_frames(level);
                let (icon_name, tray_icon_name, sleep_duration) = if current {
                    (frame_2, tray_frame_2, Duration::from_millis(600))
                } else {
                    (frame_1, tray_frame_1, Duration::from_millis(200))
                };

                if let Ok(mut current_icon) = app_icon_state.current_icon.lock() {
                    *current_icon = icon_name.to_string();
                }

                if let Err(e) = set_app_icon(app.clone(), icon_name.to_string()).await {
                    eprintln!("Failed to update dock icon in heartbeat: {}", e);
                }

                set_tray_icon_file(&app, &app.state::<TrayIconState>(), tray_icon_name);

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

    #[test]
    fn tray_icon_matrix() {
        // determine_tray_icon branches on the host OS, so assert on the
        // state-derived name parts shared by both platform sets.
        let cases = [
            (
                ConnectionState::Connected("x".into()),
                FundsLevel::Sufficient,
                "connected.png",
            ),
            (
                ConnectionState::Connected("x".into()),
                FundsLevel::Low,
                "connected-low-funds.png",
            ),
            (
                ConnectionState::Connected("x".into()),
                FundsLevel::Empty,
                "connected-out-of-funds.png",
            ),
            (
                ConnectionState::Reconnecting("x".into()),
                FundsLevel::Sufficient,
                "connecting-1.png",
            ),
            (
                ConnectionState::Connecting("x".into()),
                FundsLevel::Low,
                "connecting-low-funds-1.png",
            ),
            (
                ConnectionState::Disconnecting,
                FundsLevel::Empty,
                "connecting-out-of-funds-1.png",
            ),
            (
                ConnectionState::Disconnected,
                FundsLevel::Sufficient,
                "disconnected.png",
            ),
            (
                ConnectionState::Disconnected,
                FundsLevel::Low,
                "disconnected-low-funds.png",
            ),
            (
                ConnectionState::Disconnected,
                FundsLevel::Empty,
                "disconnected-out-of-funds.png",
            ),
        ];
        for (conn, level, expected_suffix) in cases {
            let icon = determine_tray_icon(&conn, level);
            assert!(
                icon.ends_with(expected_suffix),
                "{icon} should end with {expected_suffix}"
            );
        }
    }

    #[test]
    fn connecting_tray_frames_per_level() {
        let cases = [
            (
                FundsLevel::Sufficient,
                "connecting-1.png",
                "connecting-2.png",
            ),
            (
                FundsLevel::Low,
                "connecting-low-funds-1.png",
                "connecting-low-funds-2.png",
            ),
            (
                FundsLevel::Empty,
                "connecting-out-of-funds-1.png",
                "connecting-out-of-funds-2.png",
            ),
        ];
        for (level, suffix_1, suffix_2) in cases {
            let (frame_1, frame_2) = connecting_tray_frames(level);
            assert!(
                frame_1.ends_with(suffix_1),
                "{frame_1} should end with {suffix_1}"
            );
            assert!(
                frame_2.ends_with(suffix_2),
                "{frame_2} should end with {suffix_2}"
            );
        }
    }
}
