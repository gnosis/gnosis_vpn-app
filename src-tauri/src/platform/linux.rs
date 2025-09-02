use super::PlatformInterface;

pub struct LinuxPlatform;

impl PlatformInterface for LinuxPlatform {
    fn setup_system_tray() -> Result<(), String> {
        // System tray setup will be handled in the main Tauri application
        // This is just a placeholder for any Linux-specific setup
        Ok(())
    }
}
