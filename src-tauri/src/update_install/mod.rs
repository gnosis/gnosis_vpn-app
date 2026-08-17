//! Streams the bundled updater's progress to the frontend as
//! `update-install-status` events.
//!
//! The last status is kept in managed state so the settings Updates tab can
//! re-hydrate mid-install after a remount (`get_install_status`), and doubles
//! as the guard against concurrent installs.

use serde::Serialize;
use tauri::State;

use std::sync::Mutex;

/// Normalized event payload for the frontend, e.g. `{"kind":"Downloading"}`
/// or `{"kind":"Completed","new_version":"0.78.0"}`.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind")]
pub enum InstallStatus {
    Checking,
    Downloading,
    Installing,
    Completed { new_version: String },
    Failed { stage: String, error: String },
}

/// Last install status; `None` until the first install of this app run.
#[derive(Default)]
pub struct UpdateInstallState(pub Mutex<Option<InstallStatus>>);

#[tauri::command]
pub fn get_install_status(state: State<'_, UpdateInstallState>) -> Option<InstallStatus> {
    state.0.lock().ok().and_then(|guard| (*guard).clone())
}

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::{get_toolkit_version, install_update};

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
pub use linux::{get_toolkit_version, install_update};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_kind_tagged_events() {
        let v = serde_json::to_value(InstallStatus::Downloading).unwrap();
        assert_eq!(v, serde_json::json!({"kind": "Downloading"}));
        let v = serde_json::to_value(InstallStatus::Completed {
            new_version: "1.2.3".to_string(),
        })
        .unwrap();
        assert_eq!(
            v,
            serde_json::json!({"kind": "Completed", "new_version": "1.2.3"})
        );
        let v = serde_json::to_value(InstallStatus::Failed {
            stage: "Install".to_string(),
            error: "e".to_string(),
        })
        .unwrap();
        assert_eq!(
            v,
            serde_json::json!({"kind": "Failed", "stage": "Install", "error": "e"})
        );
    }
}
