//! Runs the bundled `gnosis_vpn-update` binary and streams its progress via
//! `INSTALL_STATUS_EVENT`.
//!
//! The updater prints NDJSON on stdout — one externally-tagged value per
//! line: `"Checking"` → `"Downloading"` → `"Installing"` → a terminal
//! `{"Completed":{...}}` or `{"Failed":{...}}` (contract documented in the
//! gnosis_vpn-toolkit repo). stderr carries human logs only.

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, State};

use super::{InstallStatus, UpdateInstallState};
use crate::toolkit;

const INSTALL_STATUS_EVENT: &str = "update-install-status";

/// One NDJSON line from `gnosis_vpn-update update` (serde's default
/// externally-tagged encoding, e.g. `"Downloading"` or
/// `{"Failed":{"stage":"Download","error":"..."}}`).
#[derive(Debug, Deserialize)]
enum UpdaterStatus {
    Checking,
    Downloading,
    Installing,
    Completed { new_version: String },
    Failed { stage: String, error: String },
}

impl From<UpdaterStatus> for InstallStatus {
    fn from(s: UpdaterStatus) -> Self {
        match s {
            UpdaterStatus::Checking => InstallStatus::Checking,
            UpdaterStatus::Downloading => InstallStatus::Downloading,
            UpdaterStatus::Installing => InstallStatus::Installing,
            UpdaterStatus::Completed { new_version } => InstallStatus::Completed { new_version },
            UpdaterStatus::Failed { stage, error } => InstallStatus::Failed { stage, error },
        }
    }
}

impl InstallStatus {
    // Only the install flow (this file) needs to know when a status is terminal.
    fn is_terminal(&self) -> bool {
        matches!(
            self,
            InstallStatus::Completed { .. } | InstallStatus::Failed { .. }
        )
    }
}

fn parse_line(line: &str) -> Option<InstallStatus> {
    serde_json::from_str::<UpdaterStatus>(line)
        .ok()
        .map(InstallStatus::from)
}

/// Store the status (re-hydration + in-progress guard) and broadcast it.
fn publish(app: &AppHandle, status: InstallStatus) {
    match &status {
        InstallStatus::Failed { stage, error } => {
            tracing::error!(target: "update_install", %stage, %error, "install failed")
        }
        other => tracing::info!(target: "update_install", status = ?other, "install status"),
    }
    let state: State<UpdateInstallState> = app.state();
    match state.0.lock() {
        Ok(mut guard) => *guard = Some(status.clone()),
        Err(e) => {
            tracing::warn!(target: "update_install", error = %e, "install status lock poisoned")
        }
    }
    let _ = app.emit(INSTALL_STATUS_EVENT, &status);
}

/// Start the updater and return immediately; progress arrives as
/// `update-install-status` events. `Err` means the run never started.
#[tauri::command]
pub fn install_update(app: AppHandle, channel: String, force: bool) -> Result<(), String> {
    use std::collections::VecDeque;
    use std::io::BufRead;
    use std::process::{Command, Stdio};

    const STDERR_TAIL_LINES: usize = 10;

    // Parsed through the enum rather than compared against a hand-written list
    // of spellings, which silently rejected `experimental` when it was added.
    let Some(parsed) = crate::settings::UpdateChannel::from_wire(&channel) else {
        tracing::warn!(target: "update_install", %channel, "rejected invalid update channel");
        return Err("InvalidChannel".to_string());
    };
    // Forward the enum's own spelling, never the caller's string.
    let channel = toolkit::channel_arg(parsed);

    // The same lookup the version and update checks use. On macOS /usr/local/bin —
    // the path the sudoers entries name, which is why `sudo -n` works.
    let Some(updater) = toolkit::locate() else {
        tracing::warn!(target: "update_install", "updater binary not installed");
        return Err("ToolkitMissing".to_string());
    };
    let updater = updater.to_string_lossy().into_owned();

    // Claim the in-progress guard before spawning; every exit path of the
    // reader thread below ends in a terminal status, which re-arms it.
    {
        let state: State<UpdateInstallState> = app.state();
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        if matches!(&*guard, Some(s) if !s.is_terminal()) {
            tracing::warn!(target: "update_install", "install already in progress, rejecting");
            return Err("InstallInProgress".to_string());
        }
        *guard = Some(InstallStatus::Checking);
    }
    let _ = app.emit(INSTALL_STATUS_EVENT, &InstallStatus::Checking);

    tracing::info!(target: "update_install", %updater, %channel, force, "starting updater");
    // The installer's sudoers rule lets gnosisvpn-group members run this
    // without a password; -n fails fast instead of prompting if it's missing.
    let mut cmd = Command::new("sudo");
    // Explicit `--output json`: the updater renders plain text by default, and
    // the reader below parses one status object per stdout line.
    cmd.args(["-n", &updater, "update", "--output", "json", "--channel", channel]);
    if force {
        cmd.arg("--force");
    }
    let mut child = match cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            publish(
                &app,
                InstallStatus::Failed {
                    stage: "Spawn".to_string(),
                    error: e.to_string(),
                },
            );
            return Err(format!("Spawn: {e}"));
        }
    };

    // stderr is human logs; drain it (a full pipe would stall the updater)
    // keeping a short tail for the fallback error below.
    let stderr = child.stderr.take();
    let stderr_tail = std::thread::spawn(move || {
        let mut tail: VecDeque<String> = VecDeque::with_capacity(STDERR_TAIL_LINES);
        if let Some(stderr) = stderr {
            for line in std::io::BufReader::new(stderr)
                .lines()
                .map_while(Result::ok)
            {
                if tail.len() == STDERR_TAIL_LINES {
                    tail.pop_front();
                }
                tail.push_back(line);
            }
        }
        tail.into_iter().collect::<Vec<_>>().join("\n")
    });

    let stdout = child.stdout.take();
    std::thread::spawn(move || {
        let mut saw_terminal = false;
        if let Some(stdout) = stdout {
            for line in std::io::BufReader::new(stdout)
                .lines()
                .map_while(Result::ok)
            {
                match parse_line(&line) {
                    Some(status) => {
                        saw_terminal |= status.is_terminal();
                        publish(&app, status);
                    }
                    None => {
                        tracing::warn!(target: "update_install", line, "unrecognized updater output")
                    }
                }
            }
        }
        let exit = child.wait();
        let tail = stderr_tail.join().unwrap_or_else(|_| {
            tracing::warn!(target: "update_install", "stderr reader thread panicked");
            String::new()
        });
        // sudo refused, process killed, or output never parsed: synthesize
        // the terminal status the frontend and the guard rely on.
        if !saw_terminal {
            let exit_desc = match exit {
                Ok(status) => status.to_string(),
                Err(e) => format!("wait failed: {e}"),
            };
            publish(
                &app,
                InstallStatus::Failed {
                    stage: "Process".to_string(),
                    error: format!("updater exited without a result ({exit_desc}); {tail}"),
                },
            );
        }
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_phase_lines() {
        assert!(matches!(
            parse_line("\"Checking\""),
            Some(InstallStatus::Checking)
        ));
        assert!(matches!(
            parse_line("\"Downloading\""),
            Some(InstallStatus::Downloading)
        ));
        assert!(matches!(
            parse_line("\"Installing\""),
            Some(InstallStatus::Installing)
        ));
    }

    #[test]
    fn parses_terminal_lines() {
        match parse_line(r#"{"Completed":{"new_version":"0.78.0"}}"#) {
            Some(InstallStatus::Completed { new_version }) => assert_eq!(new_version, "0.78.0"),
            other => panic!("unexpected: {other:?}"),
        }
        match parse_line(r#"{"Failed":{"stage":"Download","error":"boom"}}"#) {
            Some(InstallStatus::Failed { stage, error }) => {
                assert_eq!(stage, "Download");
                assert_eq!(error, "boom");
            }
            other => panic!("unexpected: {other:?}"),
        }
    }

    #[test]
    fn rejects_malformed_lines() {
        assert!(parse_line("").is_none());
        assert!(parse_line("not json").is_none());
        assert!(parse_line(r#"{"Unknown":{}}"#).is_none());
    }

    #[test]
    fn non_terminal_vs_terminal() {
        assert!(!InstallStatus::Checking.is_terminal());
        assert!(!InstallStatus::Downloading.is_terminal());
        assert!(!InstallStatus::Installing.is_terminal());
        assert!(
            InstallStatus::Completed {
                new_version: String::new()
            }
            .is_terminal()
        );
        assert!(
            InstallStatus::Failed {
                stage: String::new(),
                error: String::new()
            }
            .is_terminal()
        );
    }
}
