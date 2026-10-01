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
#[must_use]
pub fn disable_app_nap() -> app_nap::ActivityToken {
    app_nap::disable("VPN client must remain responsive")
}

/// OS release name from `sw_vers`, e.g. "macOS 15.2".
pub fn os_distribution() -> Option<String> {
    let out = std::process::Command::new("sw_vers")
        .arg("-productVersion")
        .output()
        .ok()?;
    let version = String::from_utf8(out.stdout).ok()?.trim().to_string();
    (out.status.success() && !version.is_empty()).then(|| format!("macOS {version}"))
}
