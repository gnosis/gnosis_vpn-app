pub trait PlatformInterface {
    fn setup_system_tray() -> Result<(), String>;
}

// Platform-specific modules
#[cfg(target_os = "linux")]
pub mod linux;
#[cfg(target_os = "macos")]
pub mod macos;

pub mod common;

// Re-export the appropriate platform implementation
#[cfg(target_os = "linux")]
pub use linux::LinuxPlatform as Platform;
#[cfg(target_os = "macos")]
pub use macos::MacOSPlatform as Platform;

// Fallback for unsupported platforms
#[cfg(not(any(target_os = "macos", target_os = "linux")))]
pub use common::UnsupportedPlatform as Platform;
