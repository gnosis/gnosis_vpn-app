use super::PlatformInterface;

pub struct MacOSPlatform;

impl PlatformInterface for MacOSPlatform {
    fn setup_system_tray() -> Result<(), String> {
        Ok(())
    }
}
