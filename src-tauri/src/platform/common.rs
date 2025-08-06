use super::PlatformInterface;

pub struct UnsupportedPlatform;

impl PlatformInterface for UnsupportedPlatform {
    fn setup_system_tray() -> Result<(), String> {
        Err("System tray not supported on this platform".to_string())
    }
}
