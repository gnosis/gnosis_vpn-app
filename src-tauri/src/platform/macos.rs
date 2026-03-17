use gnosis_vpn_lib::app_nap;

use super::PlatformInterface;

pub struct MacOSPlatform;

impl PlatformInterface for MacOSPlatform {
    fn setup_system_tray() -> Result<(), String> {
        Ok(())
    }
}

/// Prevents macOS App Nap from throttling this process.
///
/// The returned token must be kept alive for the process lifetime.
pub fn disable_app_nap() -> app_nap::ActivityToken {
    app_nap::disable("VPN client must remain responsive")
}
