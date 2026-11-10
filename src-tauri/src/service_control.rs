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

/// The installer's ways forward after a failed migration, one `<step>: <command>` per line.
#[cfg(target_os = "macos")]
const RECOVERY_FILE: &str = "/Library/Application Support/GnosisVPN/migration-recovery";
#[cfg(target_os = "linux")]
const RECOVERY_FILE: &str = "/var/lib/gnosisvpn/migration-recovery";

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
    /// The app's own identity commands, only while the migration is pending and the installer named none.
    pub migrate_commands: Option<MigrateCommands>,
    /// Starting now would mint a fresh identity on the new network and strand the old one.
    pub switch_pending: bool,
    /// The networks being left, oldest first.
    pub switch_from: Vec<String>,
    /// The installer's commands, each step's only while that step is unfinished.
    pub recovery: RecoverySteps,
    /// macOS only, and never while the migration or a network move is pending.
    pub can_start_from_app: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct RecoverySteps {
    pub identity: Vec<String>,
    pub switch: Vec<String>,
    pub support: Vec<String>,
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

fn recovery_steps(path: &Path) -> RecoverySteps {
    let mut steps = RecoverySteps::default();
    let Some(content) = read_regular_file(path) else {
        return steps;
    };
    for line in content.lines() {
        let Some((step, command)) = line.split_once(':') else {
            continue;
        };
        let command = command.trim().to_string();
        if command.is_empty() {
            continue;
        }
        match step.trim() {
            "identity" => steps.identity.push(command),
            "switch" => steps.switch.push(command),
            "support" => steps.support.push(command),
            _ => {}
        }
    }
    steps
}

/// The installer writes these as plain files in a root-only dir; anything else was not written by it.
fn read_regular_file(path: &Path) -> Option<String> {
    let metadata = std::fs::symlink_metadata(path).ok()?;
    if !metadata.is_file() {
        return None;
    }
    std::fs::read_to_string(path).ok()
}

/// A stale file must not offer a step that already succeeded, so each step shows only while its state says unfinished.
fn unfinished_steps(
    all: RecoverySteps,
    migration_pending: bool,
    switch_pending: bool,
) -> RecoverySteps {
    RecoverySteps {
        identity: if migration_pending {
            all.identity
        } else {
            Vec::new()
        },
        switch: if switch_pending {
            all.switch
        } else {
            Vec::new()
        },
        support: all.support,
    }
}

fn own_data_dir() -> Option<PathBuf> {
    let home = std::env::home_dir()?;
    Some(gnosis_vpn_ipc::dirs::user_dirs(&home).data)
}

fn has_own_identity(data_dir: &Path) -> bool {
    let Ok(networks) = std::fs::read_dir(data_dir.join("networks")) else {
        return false;
    };
    networks
        .flatten()
        .any(|network| network.path().join(IDENTITY_FILE).is_file())
}

fn migrate_commands(data_dir: Option<&Path>) -> MigrateCommands {
    let user = std::env::var("USER")
        .ok()
        .filter(|u| !u.is_empty())
        .unwrap_or_else(|| "<your username>".to_string());
    let has_own_identity = data_dir.is_some_and(has_own_identity);
    if has_own_identity {
        return MigrateCommands {
            has_own_identity,
            identity: format!("sudo gnosis_vpn-migrate identity --user {user} --replace"),
            start_clean: "sudo gnosis_vpn-migrate start-clean".to_string(),
        };
    }
    MigrateCommands {
        has_own_identity,
        identity: format!("sudo gnosis_vpn-migrate identity --user {user}"),
        start_clean: format!("sudo gnosis_vpn-migrate start-clean --user {user}"),
    }
}

#[tauri::command]
pub fn get_service_not_running_info() -> ServiceNotRunningInfo {
    let migration_pending = migration_pending();
    let switch_from = pending_switch_networks(Path::new(PENDING_SWITCH_FILE));
    let switch_pending = !switch_from.is_empty();
    let mut recovery = unfinished_steps(
        recovery_steps(Path::new(RECOVERY_FILE)),
        migration_pending,
        switch_pending,
    );
    let anything_pending = migration_pending || switch_pending;
    if anything_pending && recovery.support.is_empty() {
        recovery
            .support
            .push("sudo gnosis_vpn-migrate upload-log".to_string());
    }
    // Installers before the recovery file name no identity commands; the app's own stand in.
    let needs_own_commands = migration_pending && recovery.identity.is_empty();
    let migrate_commands = needs_own_commands.then(|| migrate_commands(own_data_dir().as_deref()));
    ServiceNotRunningInfo {
        platform: std::env::consts::OS,
        migrate_log_paths: MIGRATE_LOG_PATHS.to_vec(),
        start_command: start_command(),
        migration_pending,
        migrate_commands,
        switch_pending,
        switch_from,
        recovery,
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
        assert_eq!(info.recovery, RecoverySteps::default());
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
        let commands = migrate_commands(Some(&data_dir));
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
        let commands = migrate_commands(Some(&data_dir));
        std::fs::remove_dir_all(&data_dir).expect("cleanup");

        assert!(commands.has_own_identity);
        assert!(commands.identity.ends_with("--replace"));
        assert_eq!(commands.start_clean, "sudo gnosis_vpn-migrate start-clean");
    }

    #[test]
    fn migrate_commands_serialize_with_the_keys_the_frontend_parses() {
        let json = serde_json::to_value(migrate_commands(None)).expect("serialize");
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
        assert!(!migrate_commands(None).has_own_identity);
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
    fn recovery_file_sorts_commands_by_step() {
        let content = "identity: sudo gnosis_vpn-migrate identity --user alice --replace  # keep the legacy identity\n\
                       \n\
                       switch: sudo gnosis_vpn-migrate switch-network --from jura-prod --to piz-palu-prod\n\
                       later: something unknown\n\
                       support:\n\
                       support: sudo gnosis_vpn-migrate upload-log\n";
        let path = temp_file("recovery", content);
        let steps = recovery_steps(&path);
        cleanup(&path);
        assert_eq!(
            steps,
            RecoverySteps {
                identity: vec![
                    "sudo gnosis_vpn-migrate identity --user alice --replace  # keep the legacy identity"
                        .to_string()
                ],
                switch: vec![
                    "sudo gnosis_vpn-migrate switch-network --from jura-prod --to piz-palu-prod"
                        .to_string()
                ],
                support: vec!["sudo gnosis_vpn-migrate upload-log".to_string()],
            }
        );
    }

    #[test]
    fn missing_recovery_file_names_no_commands() {
        assert_eq!(
            recovery_steps(Path::new("/nonexistent/migration-recovery")),
            RecoverySteps::default()
        );
    }

    #[cfg(unix)]
    #[test]
    fn linked_recovery_file_is_ignored() {
        let target = temp_file(
            "recovery-link",
            "support: sudo gnosis_vpn-migrate upload-log\n",
        );
        let link = target.with_file_name("link");
        std::os::unix::fs::symlink(&target, &link).expect("symlink");
        let steps = recovery_steps(&link);
        cleanup(&target);
        assert_eq!(steps, RecoverySteps::default());
    }

    #[test]
    fn finished_steps_drop_out_of_a_stale_recovery_file() {
        let all = RecoverySteps {
            identity: vec!["identity".to_string()],
            switch: vec!["switch".to_string()],
            support: vec!["upload-log".to_string()],
        };
        let identity_done = unfinished_steps(all.clone(), false, true);
        assert!(identity_done.identity.is_empty());
        assert_eq!(identity_done.switch, ["switch"]);
        assert_eq!(identity_done.support, ["upload-log"]);

        let switch_done = unfinished_steps(all.clone(), true, false);
        assert_eq!(switch_done.identity, ["identity"]);
        assert!(switch_done.switch.is_empty());

        assert_eq!(unfinished_steps(all.clone(), true, true), all);
    }
}
