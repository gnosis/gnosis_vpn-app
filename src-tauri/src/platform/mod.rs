use serde::Serialize;
use tokio::task::spawn_blocking;

pub trait PlatformInterface {
    fn setup_system_tray() -> Result<(), String>;
}

// Platform-specific modules
#[cfg(target_os = "linux")]
pub mod linux;
#[cfg(target_os = "macos")]
pub mod macos;

// Re-export the appropriate platform implementation
#[cfg(target_os = "linux")]
pub use linux::LinuxPlatform as Platform;
#[cfg(target_os = "linux")]
use linux::os_distribution;
#[cfg(target_os = "macos")]
pub use macos::MacOSPlatform as Platform;
#[cfg(target_os = "macos")]
use macos::os_distribution;

/// OS name for the frontend ("macos", "linux", …) — it has no runtime
/// platform signal of its own and needs one to branch update-install UX.
#[tauri::command]
pub fn get_platform() -> &'static str {
    std::env::consts::OS
}

/// Host details reported in bug-report prefills and log bundles.
#[derive(Serialize)]
pub struct SystemInfo {
    /// `std::env::consts::OS` ("macos", "linux", …).
    pub os: &'static str,
    /// `std::env::consts::ARCH` ("x86_64", "aarch64", …).
    pub arch: &'static str,
    /// Human-readable OS release ("Ubuntu 24.04.3 LTS", "macOS 15.2"); `None` where it can't be determined.
    pub distribution: Option<String>,
}

#[tauri::command]
pub async fn get_system_info() -> SystemInfo {
    SystemInfo {
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        distribution: spawn_blocking(os_distribution).await.ok().flatten(),
    }
}
