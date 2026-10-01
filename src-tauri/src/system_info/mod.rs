use serde::Serialize;
use tokio::task::spawn_blocking;

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

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
use linux::os_distribution;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
use macos::os_distribution;
