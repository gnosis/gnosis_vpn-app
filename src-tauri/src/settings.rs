use gnosis_vpn_lib::check_update::Manifest;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

/// App settings owned by the Rust layer and mirrored by the webviews.
/// Persisted as a flat JSON object in `app_data_dir/settings.json` —
/// the same path and format previously written via tauri-plugin-store.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub preferred_location: Option<String>,
    pub connect_on_startup: bool,
    pub start_minimized: bool,
    pub update_check: bool,
    pub exit_node_sort_order: SortOrder,
    pub last_checked_at: Option<i64>,
    pub update_manifest: Option<Manifest>,
    pub channel: Option<UpdateChannel>,
    pub dismissed_update_version: Option<String>,
    pub show_detailed_metrics: bool,
}

// Both enums serialize as plain strings (not tagged objects) to stay
// wire-compatible with the persisted settings.json and the TS union types.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SortOrder {
    #[default]
    Latency,
    Alpha,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UpdateChannel {
    Stable,
    Snapshot,
}

/// Partial settings update. Nullable fields are double-wrapped so a JSON
/// `null` (clear the value) is distinct from an absent field (leave untouched).
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    #[serde(default, deserialize_with = "double_option")]
    pub preferred_location: Option<Option<String>>,
    #[serde(default)]
    pub connect_on_startup: Option<bool>,
    #[serde(default)]
    pub start_minimized: Option<bool>,
    #[serde(default)]
    pub update_check: Option<bool>,
    #[serde(default)]
    pub exit_node_sort_order: Option<SortOrder>,
    #[serde(default, deserialize_with = "double_option")]
    pub last_checked_at: Option<Option<i64>>,
    #[serde(default, deserialize_with = "double_option")]
    pub update_manifest: Option<Option<Manifest>>,
    #[serde(default, deserialize_with = "double_option")]
    pub channel: Option<Option<UpdateChannel>>,
    #[serde(default, deserialize_with = "double_option")]
    pub dismissed_update_version: Option<Option<String>>,
    #[serde(default)]
    pub show_detailed_metrics: Option<bool>,
}

fn double_option<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    Deserialize::deserialize(deserializer).map(Some)
}

impl Settings {
    fn apply(&mut self, patch: SettingsPatch) {
        if let Some(v) = patch.preferred_location {
            self.preferred_location = v;
        }
        if let Some(v) = patch.connect_on_startup {
            self.connect_on_startup = v;
        }
        if let Some(v) = patch.start_minimized {
            self.start_minimized = v;
        }
        if let Some(v) = patch.update_check {
            self.update_check = v;
        }
        if let Some(v) = patch.exit_node_sort_order {
            self.exit_node_sort_order = v;
        }
        if let Some(v) = patch.last_checked_at {
            self.last_checked_at = v;
        }
        if let Some(v) = patch.update_manifest {
            self.update_manifest = v;
        }
        if let Some(v) = patch.channel {
            self.channel = v;
        }
        if let Some(v) = patch.dismissed_update_version {
            self.dismissed_update_version = v;
        }
        if let Some(v) = patch.show_detailed_metrics {
            self.show_detailed_metrics = v;
        }
    }
}

/// Builds settings from a raw JSON map one key at a time, so a single
/// invalid or legacy value falls back to its default instead of
/// discarding the whole file.
fn lenient_from_map(map: serde_json::Map<String, Value>) -> Settings {
    let mut settings = Settings::default();
    for (key, value) in map {
        let single = Value::Object([(key.clone(), value)].into_iter().collect());
        match serde_json::from_value::<SettingsPatch>(single) {
            Ok(patch) => settings.apply(patch),
            Err(e) => eprintln!("settings: ignoring invalid value for '{key}': {e}"),
        }
    }
    settings
}

fn persist(path: &Path, settings: &Settings) -> Result<(), String> {
    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("cannot serialize settings: {e}"))?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("cannot create settings dir: {e}"))?;
    }
    std::fs::write(path, json).map_err(|e| format!("cannot write settings file: {e}"))
}

/// Single owner of the settings: loads/persists the file and hands out
/// snapshots. Webviews mirror it via `get_settings` + the
/// `settings-changed` event.
pub struct SettingsStore {
    settings: Mutex<Settings>,
    path: PathBuf,
}

impl SettingsStore {
    pub fn load(path: PathBuf) -> Self {
        let settings = match std::fs::read(&path) {
            // missing file is the regular first run — start from defaults
            Err(_) => Settings::default(),
            Ok(bytes) => match serde_json::from_slice(&bytes) {
                Ok(map) => lenient_from_map(map),
                Err(e) => {
                    eprintln!(
                        "settings: cannot parse {}, using defaults: {e}",
                        path.display()
                    );
                    Settings::default()
                }
            },
        };
        Self {
            settings: Mutex::new(settings),
            path,
        }
    }

    pub fn current(&self) -> Settings {
        self.lock().clone()
    }

    /// Applies the patch and persists under the same lock, so concurrent
    /// updates cannot write stale snapshots out of order. The snapshot is
    /// returned even when the disk write failed — memory is the session
    /// truth, disk catches up on the next successful save.
    pub fn update(&self, patch: SettingsPatch) -> (Settings, Result<(), String>) {
        let mut guard = self.lock();
        guard.apply(patch);
        let snapshot = guard.clone();
        let persisted = persist(&self.path, &snapshot);
        (snapshot, persisted)
    }

    fn lock(&self) -> MutexGuard<'_, Settings> {
        // a poisoned lock cannot leave Settings logically broken
        // (apply is plain field assignments), so recover instead of erroring
        self.settings
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

#[tauri::command]
pub fn get_settings(store: State<'_, SettingsStore>) -> Settings {
    store.current()
}

#[tauri::command]
pub fn update_settings(
    app: AppHandle,
    store: State<'_, SettingsStore>,
    patch: SettingsPatch,
) -> Result<Settings, String> {
    let (snapshot, persisted) = store.update(patch);
    let _ = app.emit("settings-changed", &snapshot);
    persisted.map_err(|e| {
        eprintln!("settings: failed to persist: {e}");
        e
    })?;
    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicU32, Ordering};

    static TEST_DIR_COUNTER: AtomicU32 = AtomicU32::new(0);

    fn temp_settings_path() -> PathBuf {
        let unique = format!(
            "gnosis_vpn_settings_test_{}_{}",
            std::process::id(),
            TEST_DIR_COUNTER.fetch_add(1, Ordering::Relaxed)
        );
        std::env::temp_dir().join(unique).join("settings.json")
    }

    fn patch(value: Value) -> SettingsPatch {
        serde_json::from_value(value).expect("valid patch")
    }

    #[test]
    fn load_missing_file_yields_defaults() {
        let store = SettingsStore::load(temp_settings_path());
        let settings = store.current();
        assert_eq!(settings.preferred_location, None);
        assert!(!settings.connect_on_startup);
        assert_eq!(settings.exit_node_sort_order, SortOrder::Latency);
        assert_eq!(settings.channel, None);
    }

    #[test]
    fn load_ignores_legacy_and_invalid_values() {
        let path = temp_settings_path();
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(
            &path,
            json!({
                "theme": "dark",
                "exitNodeSortOrder": "bogus",
                "preferredLocation": "exit-1",
                "showDetailedMetrics": true
            })
            .to_string(),
        )
        .unwrap();

        let settings = SettingsStore::load(path).current();
        // legacy key dropped, invalid value falls back, valid values survive
        assert_eq!(settings.exit_node_sort_order, SortOrder::Latency);
        assert_eq!(settings.preferred_location, Some("exit-1".to_string()));
        assert!(settings.show_detailed_metrics);
    }

    #[test]
    fn patch_distinguishes_null_from_absent() {
        let store = SettingsStore::load(temp_settings_path());
        let _ = store.update(patch(
            json!({ "preferredLocation": "exit-1", "channel": "stable" }),
        ));

        // absent fields stay untouched
        let (snapshot, _) = store.update(patch(json!({ "connectOnStartup": true })));
        assert_eq!(snapshot.preferred_location, Some("exit-1".to_string()));
        assert_eq!(snapshot.channel, Some(UpdateChannel::Stable));

        // explicit null clears
        let (snapshot, _) = store.update(patch(json!({ "preferredLocation": null })));
        assert_eq!(snapshot.preferred_location, None);
        assert_eq!(snapshot.channel, Some(UpdateChannel::Stable));
    }

    #[test]
    fn update_persists_and_reloads() {
        let path = temp_settings_path();
        let store = SettingsStore::load(path.clone());
        let (_, persisted) = store.update(patch(json!({
            "updateCheck": true,
            "exitNodeSortOrder": "alpha",
            "lastCheckedAt": 1720000000000i64
        })));
        persisted.expect("persist should succeed");

        let reloaded = SettingsStore::load(path).current();
        assert!(reloaded.update_check);
        assert_eq!(reloaded.exit_node_sort_order, SortOrder::Alpha);
        assert_eq!(reloaded.last_checked_at, Some(1720000000000));
    }

    #[test]
    fn concurrent_updates_both_persist() {
        let path = temp_settings_path();
        let store = std::sync::Arc::new(SettingsStore::load(path.clone()));

        let handles: Vec<_> = [
            json!({ "connectOnStartup": true }),
            json!({ "showDetailedMetrics": true }),
        ]
        .into_iter()
        .map(|p| {
            let store = store.clone();
            std::thread::spawn(move || store.update(patch(p)))
        })
        .collect();
        for handle in handles {
            let (_, persisted) = handle.join().unwrap();
            persisted.expect("persist should succeed");
        }

        let reloaded = SettingsStore::load(path).current();
        assert!(reloaded.connect_on_startup);
        assert!(reloaded.show_detailed_metrics);
    }
}
