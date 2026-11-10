//! The "installed, not started" screen: what it shows and the one action the app can take itself.

use serde::Serialize;

use std::path::{Path, PathBuf};

/// The sudoers rules the installer ships name exactly these argvs for `%gnosisvpn` members.
#[cfg(target_os = "macos")]
const LAUNCHD_PLIST: &str = "/Library/LaunchDaemons/com.gnosisvpn.gnosisvpnclient.plist";
#[cfg(target_os = "macos")]
const LAUNCHD_SERVICE: &str = "system/com.gnosisvpn.gnosisvpnclient";

/// The legacy single-identity dir; still unrenamed means gnosis_vpn-migrate has not succeeded.
#[cfg(target_os = "macos")]
const LEGACY_CONFIG_DIR: &str = "/Library/Application Support/GnosisVPN/.config";
#[cfg(target_os = "linux")]
const LEGACY_CONFIG_DIR: &str = "/var/lib/gnosisvpn/.config";

/// The installer's network-move marker: one line of old network names, removed once every identity moved on.
#[cfg(target_os = "macos")]
const PENDING_SWITCH_FILE: &str = "/Library/Application Support/GnosisVPN/network-switch-pending";
#[cfg(target_os = "linux")]
const PENDING_SWITCH_FILE: &str = "/var/lib/gnosisvpn/network-switch-pending";

#[cfg(target_os = "macos")]
const MIGRATE_LOG_PATHS: &[&str] = &["/Library/Logs/GnosisVPN/installer/migrate.log"];
#[cfg(target_os = "linux")]
const MIGRATE_LOG_PATHS: &[&str] = &["/var/log/gnosisvpn/migrate.log"];

/// gnosis_vpn-lib keeps its identity file name private.
const IDENTITY_FILE: &str = "hopr.id";

/// A failed migration leaves the service disabled, so a plain bootstrap/start would fail.
#[cfg(target_os = "macos")]
fn start_command() -> String {
    format!(
        "sudo launchctl enable {LAUNCHD_SERVICE} && sudo launchctl bootstrap system {LAUNCHD_PLIST}"
    )
}

#[cfg(target_os = "linux")]
fn start_command() -> String {
    "sudo systemctl enable --now gnosisvpn".to_string()
}

#[derive(Clone, Debug, Serialize)]
pub struct ServiceNotRunningInfo {
    pub platform: &'static str,
    pub migrate_log_paths: Vec<&'static str>,
    pub start_command: String,
    /// Starting now would mint a fresh identity and turn a migration retry into a conflict.
    pub migration_pending: bool,
    /// Only while the migration is pending.
    pub migrate_commands: Option<MigrateCommands>,
    /// Starting now would mint a fresh identity on the new network and strand the old one.
    pub switch_pending: bool,
    /// The networks being left, oldest first.
    pub switch_from: Vec<String>,
    /// One per network being left, newest first, run after the identity migration.
    pub switch_commands: Vec<String>,
    pub upload_log_command: &'static str,
    /// macOS only, and never while the migration or a network move is pending.
    pub can_start_from_app: bool,
}

/// Separate fields so each gets its own copy button; pasting them together would run start-clean after a good migration.
#[derive(Clone, Debug, Serialize)]
pub struct MigrateCommands {
    /// The toolkit's exit-75 case: `start-clean --user` would park this identity, so the advice switches like the installer's.
    pub has_own_identity: bool,
    pub identity: String,
    pub start_clean: String,
}

fn migration_pending() -> bool {
    Path::new(LEGACY_CONFIG_DIR).is_dir()
}

/// A link or garbage reads as nothing pending, like the installer's own `pending_switches`, which then removes the file.
fn pending_switch_networks(path: &Path) -> Vec<String> {
    let Some(content) = read_regular_file(path) else {
        return Vec::new();
    };
    let first_line = content.lines().next().unwrap_or_default();
    first_line
        .split_whitespace()
        .filter(|name| is_network_name(name))
        .map(str::to_string)
        .collect()
}

fn is_network_name(name: &str) -> bool {
    name.chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// The installer writes these as plain files in a root-only dir; anything else was not written by it.
fn read_regular_file(path: &Path) -> Option<String> {
    let metadata = std::fs::symlink_metadata(path).ok()?;
    if !metadata.is_file() {
        return None;
    }
    std::fs::read_to_string(path).ok()
}

/// Newest first like the installer's `switch_steps`: a user's most recent identity wins; `--to` defaults to the config link's network.
fn switch_commands(networks: &[String]) -> Vec<String> {
    networks
        .iter()
        .rev()
        .map(|network| format!("sudo gnosis_vpn-migrate switch-network --from {network}"))
        .collect()
}

fn own_data_dir() -> Option<PathBuf> {
    let home = std::env::home_dir()?;
    Some(gnosis_vpn_lib::dirs::user_dirs(&home).data)
}

fn has_own_identity(data_dir: &Path) -> bool {
    let Ok(networks) = std::fs::read_dir(data_dir.join("networks")) else {
        return false;
    };
    networks
        .flatten()
        .any(|network| network.path().join(IDENTITY_FILE).is_file())
}

/// `legacy_network`: the oldest network being left, where the installer files the legacy identity next to its safe.
fn migrate_commands(data_dir: Option<&Path>, legacy_network: Option<&str>) -> MigrateCommands {
    let user = std::env::var("USER")
        .ok()
        .filter(|u| !u.is_empty())
        .unwrap_or_else(|| "<your username>".to_string());
    let has_own_identity = data_dir.is_some_and(has_own_identity);
    let network_flag = legacy_network
        .map(|network| format!(" --network {network}"))
        .unwrap_or_default();
    let identity = format!("sudo gnosis_vpn-migrate identity --user {user}{network_flag}");
    let legacy_only = "sudo gnosis_vpn-migrate start-clean".to_string();
    if has_own_identity {
        return MigrateCommands {
            has_own_identity,
            identity: format!("{identity} --replace"),
            start_clean: legacy_only,
        };
    }
    // `start-clean --user` resets the config link's network, which is not the one `--network` migrates.
    let start_clean = if legacy_network.is_some() {
        legacy_only
    } else {
        format!("sudo gnosis_vpn-migrate start-clean --user {user}")
    };
    MigrateCommands {
        has_own_identity,
        identity,
        start_clean,
    }
}

#[tauri::command]
pub fn get_service_not_running_info() -> ServiceNotRunningInfo {
    let migration_pending = migration_pending();
    let switch_from = pending_switch_networks(Path::new(PENDING_SWITCH_FILE));
    let switch_pending = !switch_from.is_empty();
    let anything_pending = migration_pending || switch_pending;
    let migrate_commands = migration_pending.then(|| {
        migrate_commands(
            own_data_dir().as_deref(),
            switch_from.first().map(String::as_str),
        )
    });
    ServiceNotRunningInfo {
        platform: std::env::consts::OS,
        migrate_log_paths: MIGRATE_LOG_PATHS.to_vec(),
        start_command: start_command(),
        migration_pending,
        migrate_commands,
        switch_pending,
        switch_commands: switch_commands(&switch_from),
        switch_from,
        upload_log_command: "sudo gnosis_vpn-migrate upload-log",
        can_start_from_app: cfg!(target_os = "macos") && !anything_pending,
    }
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn start_service() -> Result<(), String> {
    if migration_pending() {
        return Err(
            "The previous identity has not been migrated yet; run the gnosis_vpn-migrate commands first"
                .to_string(),
        );
    }
    let switch_from = pending_switch_networks(Path::new(PENDING_SWITCH_FILE));
    if !switch_from.is_empty() {
        return Err(format!(
            "The move off {} has not finished; starting now would create a new node address",
            switch_from.join(", ")
        ));
    }
    tracing::info!(target: "service", "starting the service via launchctl");
    run_launchctl(&["enable", LAUNCHD_SERVICE]).await?;
    run_launchctl(&["bootstrap", "system", LAUNCHD_PLIST]).await
}

#[cfg(target_os = "macos")]
async fn run_launchctl(args: &[&str]) -> Result<(), String> {
    use tokio::process::Command;

    // -n fails fast instead of prompting when the sudoers rule is missing for this account.
    let output = Command::new("sudo")
        .arg("-n")
        .arg("/bin/launchctl")
        .args(args)
        .output()
        .await
        .map_err(|e| format!("Could not run sudo: {e}"))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    tracing::warn!(target: "service", ?args, status = ?output.status.code(), %stderr, "launchctl failed");
    Err(start_failure_message(&stderr))
}

/// The group hint only helps when sudo itself refused; any launchctl failure is shown as launchctl said it.
#[cfg(target_os = "macos")]
fn start_failure_message(stderr: &str) -> String {
    let sudo_refused = stderr.contains("a password is required");
    if sudo_refused {
        return "Could not start the service: your account must be in the gnosisvpn group \
                (sudo dseditgroup -o edit -a $USER -t user gnosisvpn), or run the command below in Terminal."
            .to_string();
    }
    format!("Could not start the service: {stderr}")
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
        assert!(info.migrate_commands.is_none());
        assert!(!info.switch_pending);
        assert!(info.switch_commands.is_empty());
        assert_eq!(info.can_start_from_app, cfg!(target_os = "macos"));
    }

    #[test]
    fn only_the_migrate_log_the_installer_writes_is_listed() {
        let expected: &[&str] = if cfg!(target_os = "macos") {
            &["/Library/Logs/GnosisVPN/installer/migrate.log"]
        } else {
            &["/var/log/gnosisvpn/migrate.log"]
        };
        assert_eq!(MIGRATE_LOG_PATHS, expected);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_start_command_enables_before_bootstrapping() {
        assert_eq!(
            start_command(),
            "sudo launchctl enable system/com.gnosisvpn.gnosisvpnclient && \
             sudo launchctl bootstrap system /Library/LaunchDaemons/com.gnosisvpn.gnosisvpnclient.plist"
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn group_hint_only_when_sudo_refused() {
        let refused = start_failure_message("sudo: a password is required");
        assert!(refused.contains("gnosisvpn group"));
        let launchctl = start_failure_message("Bootstrap failed: 5: Input/output error");
        assert_eq!(
            launchctl,
            "Could not start the service: Bootstrap failed: 5: Input/output error"
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_start_command_enables_the_unit() {
        assert_eq!(start_command(), "sudo systemctl enable --now gnosisvpn");
    }

    fn temp_data_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "gvpn-service-control-{name}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("networks/rotsee")).expect("create temp data dir");
        dir
    }

    #[test]
    fn without_own_identity_the_commands_target_the_current_user() {
        let user = std::env::var("USER").unwrap_or_default();
        let data_dir = temp_data_dir("fresh");
        let commands = migrate_commands(Some(&data_dir), None);
        std::fs::remove_dir_all(&data_dir).expect("cleanup");

        assert!(!commands.has_own_identity);
        assert!(
            commands
                .identity
                .starts_with("sudo gnosis_vpn-migrate identity --user ")
        );
        assert!(!commands.identity.ends_with("--replace"));
        if !user.is_empty() {
            assert!(
                commands
                    .start_clean
                    .ends_with(&format!("start-clean --user {user}"))
            );
        }
    }

    #[test]
    fn with_own_identity_the_commands_match_the_exit_75_advice() {
        let data_dir = temp_data_dir("conflict");
        std::fs::write(data_dir.join("networks/rotsee").join(IDENTITY_FILE), "{}")
            .expect("write identity");
        let commands = migrate_commands(Some(&data_dir), None);
        std::fs::remove_dir_all(&data_dir).expect("cleanup");

        assert!(commands.has_own_identity);
        assert!(commands.identity.ends_with("--replace"));
        assert_eq!(commands.start_clean, "sudo gnosis_vpn-migrate start-clean");
    }

    #[test]
    fn migrate_commands_serialize_with_the_keys_the_frontend_parses() {
        let json = serde_json::to_value(migrate_commands(None, None)).expect("serialize");
        let mut keys: Vec<&str> = json
            .as_object()
            .expect("object")
            .keys()
            .map(String::as_str)
            .collect();
        keys.sort_unstable();
        assert_eq!(keys, ["has_own_identity", "identity", "start_clean"]);
    }

    #[test]
    fn missing_data_dir_counts_as_no_identity() {
        assert!(!migrate_commands(None, None).has_own_identity);
        assert!(!has_own_identity(Path::new("/nonexistent/gnosisvpn")));
    }

    fn temp_file(name: &str, content: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "gvpn-service-control-{name}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let path = dir.join("file");
        std::fs::write(&path, content).expect("write temp file");
        path
    }

    fn cleanup(path: &Path) {
        std::fs::remove_dir_all(path.parent().expect("parent")).expect("cleanup");
    }

    #[test]
    fn missing_marker_means_no_move_pending() {
        assert!(
            pending_switch_networks(Path::new("/nonexistent/network-switch-pending")).is_empty()
        );
    }

    #[test]
    fn marker_lists_the_networks_oldest_first() {
        let path = temp_file("marker-two", "jura-dev jura-prod\n");
        let networks = pending_switch_networks(&path);
        cleanup(&path);
        assert_eq!(networks, ["jura-dev", "jura-prod"]);
    }

    #[test]
    fn malformed_marker_means_no_move_pending() {
        for (name, content) in [
            ("marker-empty", ""),
            ("marker-blank", "  \n"),
            ("marker-junk", "Jura_Prod ../etc $(rm)\n"),
            ("marker-second-line", "\njura-prod\n"),
        ] {
            let path = temp_file(name, content);
            let networks = pending_switch_networks(&path);
            cleanup(&path);
            assert!(networks.is_empty(), "{name}: {networks:?}");
        }
    }

    #[test]
    fn marker_keeps_only_the_valid_names() {
        let path = temp_file("marker-mixed", "jura-prod BAD jura-dev\n");
        let networks = pending_switch_networks(&path);
        cleanup(&path);
        assert_eq!(networks, ["jura-prod", "jura-dev"]);
    }

    #[cfg(unix)]
    #[test]
    fn linked_marker_means_no_move_pending() {
        let target = temp_file("marker-link", "jura-prod\n");
        let link = target.with_file_name("link");
        std::os::unix::fs::symlink(&target, &link).expect("symlink");
        let networks = pending_switch_networks(&link);
        cleanup(&target);
        assert!(networks.is_empty());
    }

    #[test]
    fn marker_dir_means_no_move_pending() {
        let path = temp_file("marker-dir", "");
        let dir = path.parent().expect("parent").to_path_buf();
        let networks = pending_switch_networks(&dir);
        cleanup(&path);
        assert!(networks.is_empty());
    }

    #[test]
    fn switch_commands_run_the_newest_network_first() {
        let networks = ["jura-dev".to_string(), "jura-prod".to_string()];
        assert_eq!(
            switch_commands(&networks),
            [
                "sudo gnosis_vpn-migrate switch-network --from jura-prod",
                "sudo gnosis_vpn-migrate switch-network --from jura-dev",
            ]
        );
    }

    #[test]
    fn with_a_move_pending_the_identity_lands_on_the_old_network() {
        let data_dir = temp_data_dir("move-fresh");
        let commands = migrate_commands(Some(&data_dir), Some("jura-prod"));
        std::fs::remove_dir_all(&data_dir).expect("cleanup");

        assert!(!commands.has_own_identity);
        assert!(commands.identity.ends_with(" --network jura-prod"));
        assert_eq!(commands.start_clean, "sudo gnosis_vpn-migrate start-clean");
    }

    #[test]
    fn with_a_move_pending_and_own_identity_the_replace_keeps_the_network() {
        let data_dir = temp_data_dir("move-conflict");
        std::fs::write(data_dir.join("networks/rotsee").join(IDENTITY_FILE), "{}")
            .expect("write identity");
        let commands = migrate_commands(Some(&data_dir), Some("jura-prod"));
        std::fs::remove_dir_all(&data_dir).expect("cleanup");

        assert!(commands.has_own_identity);
        assert!(
            commands
                .identity
                .ends_with(" --network jura-prod --replace")
        );
        assert_eq!(commands.start_clean, "sudo gnosis_vpn-migrate start-clean");
    }
}
