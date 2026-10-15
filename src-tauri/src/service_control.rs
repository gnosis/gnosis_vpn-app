//! The "installed, not started" screen: what it shows and the one action the app can take itself.

use serde::Serialize;

use std::path::Path;

/// The sudoers rule the installer ships names exactly this argv for `%gnosisvpn` members.
#[cfg(target_os = "macos")]
const LAUNCHD_PLIST: &str = "/Library/LaunchDaemons/com.gnosisvpn.gnosisvpnclient.plist";

/// The legacy single-identity dir; still unrenamed means gnosis_vpn-migrate has not succeeded.
#[cfg(target_os = "macos")]
const LEGACY_CONFIG_DIR: &str = "/Library/Application Support/GnosisVPN/.config";
#[cfg(target_os = "linux")]
const LEGACY_CONFIG_DIR: &str = "/var/lib/gnosisvpn/.config";

/// Linux gets a second copy because an rpm upgrade deletes the log dir after the installer wrote it.
#[cfg(target_os = "macos")]
const MIGRATE_LOG_PATHS: &[&str] = &["/Library/Logs/GnosisVPN/installer/migrate.log"];
#[cfg(target_os = "linux")]
const MIGRATE_LOG_PATHS: &[&str] = &[
    "/var/log/gnosisvpn/migrate.log",
    "/var/lib/gnosisvpn/migrate.log",
];

#[cfg(target_os = "macos")]
fn start_command() -> String {
    format!("sudo launchctl bootstrap system {LAUNCHD_PLIST}")
}

#[cfg(target_os = "linux")]
fn start_command() -> String {
    "sudo systemctl start gnosisvpn".to_string()
}

#[derive(Clone, Debug, Serialize)]
pub struct ServiceNotRunningInfo {
    pub platform: &'static str,
    pub migrate_log_paths: Vec<&'static str>,
    pub start_command: String,
    /// Starting now would mint a fresh identity and turn a migration retry into a conflict.
    pub migration_pending: bool,
    /// The installer's three ways forward, only while the migration is pending.
    pub migrate_commands: Vec<String>,
    /// macOS only, and never while the migration is pending.
    pub can_start_from_app: bool,
}

fn migration_pending() -> bool {
    Path::new(LEGACY_CONFIG_DIR).is_dir()
}

fn migrate_commands() -> Vec<String> {
    let user = std::env::var("USER")
        .ok()
        .filter(|u| !u.is_empty())
        .unwrap_or_else(|| "<your username>".to_string());
    vec![
        format!("sudo gnosis_vpn-migrate identity --user {user}"),
        "sudo gnosis_vpn-migrate upload-log".to_string(),
        format!("sudo gnosis_vpn-migrate start-clean --user {user}"),
    ]
}

#[tauri::command]
pub fn get_service_not_running_info() -> ServiceNotRunningInfo {
    let migration_pending = migration_pending();
    let migrate_commands = if migration_pending {
        migrate_commands()
    } else {
        Vec::new()
    };
    ServiceNotRunningInfo {
        platform: std::env::consts::OS,
        migrate_log_paths: MIGRATE_LOG_PATHS.to_vec(),
        start_command: start_command(),
        migration_pending,
        migrate_commands,
        can_start_from_app: cfg!(target_os = "macos") && !migration_pending,
    }
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn start_service() -> Result<(), String> {
    use tokio::process::Command;

    if migration_pending() {
        return Err(
            "The previous identity has not been migrated yet; run the gnosis_vpn-migrate commands first"
                .to_string(),
        );
    }
    tracing::info!(target: "service", "starting the service via launchctl");
    // -n fails fast instead of prompting when the sudoers rule is missing for this account.
    let output = Command::new("sudo")
        .args(["-n", "/bin/launchctl", "bootstrap", "system", LAUNCHD_PLIST])
        .output()
        .await
        .map_err(|e| format!("Could not run sudo: {e}"))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    tracing::warn!(target: "service", status = ?output.status.code(), %stderr, "launchctl bootstrap failed");
    Err(format!(
        "Could not start the service: {stderr}. Your account must be in the gnosisvpn group \
         (sudo dseditgroup -o edit -a $USER -t user gnosisvpn), or run the command below in Terminal."
    ))
}

#[cfg(target_os = "linux")]
#[tauri::command]
pub async fn start_service() -> Result<(), String> {
    Err("Starting the service from the app is not supported on Linux; run the command in a terminal".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn info_names_the_os_specific_paths() {
        let info = get_service_not_running_info();
        assert_eq!(info.platform, std::env::consts::OS);
        assert!(!info.migrate_log_paths.is_empty());
        assert!(info.start_command.starts_with("sudo "));
        // Nobody runs the tests on a host with the legacy dir, so the button side is deterministic.
        assert!(!info.migration_pending);
        assert!(info.migrate_commands.is_empty());
        assert_eq!(info.can_start_from_app, cfg!(target_os = "macos"));
    }

    #[test]
    fn migrate_commands_carry_the_current_user() {
        let user = std::env::var("USER").unwrap_or_default();
        let commands = migrate_commands();
        assert_eq!(commands.len(), 3);
        assert!(commands[0].starts_with("sudo gnosis_vpn-migrate identity --user "));
        assert_eq!(commands[1], "sudo gnosis_vpn-migrate upload-log");
        if !user.is_empty() {
            assert!(commands[2].ends_with(&user));
        }
    }
}
