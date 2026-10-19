//! App-side file logging: hourly-rotating, auto-pruned files under the Tauri app log dir.

use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::{EnvFilter, fmt, prelude::*};

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

const DEFAULT_LOG_FILTER: &str = "info";
const LOG_FILE_PREFIX: &str = "gnosis_vpn-app";
const MAX_LOG_FILES: usize = 12;

// Dropping the guard stops the background log writer, so park it for the process lifetime.
static WORKER_GUARD: OnceLock<WorkerGuard> = OnceLock::new();

/// Global tracing subscriber: rotating file plus stdout; `RUST_LOG` overrides "info".
/// Returns the effective filter so the startup line can record it.
pub fn init(log_dir: &Path) -> Result<String, String> {
    std::fs::create_dir_all(log_dir).map_err(|e| format!("cannot create log dir: {e}"))?;

    let appender = RollingFileAppender::builder()
        .rotation(Rotation::HOURLY)
        .filename_prefix(LOG_FILE_PREFIX)
        .filename_suffix("log")
        .max_log_files(MAX_LOG_FILES)
        .build(log_dir)
        .map_err(|e| format!("cannot create rolling log file: {e}"))?;
    let (file_writer, guard) = tracing_appender::non_blocking(appender);

    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(DEFAULT_LOG_FILTER));
    let filter_desc = filter.to_string();
    tracing_subscriber::registry()
        .with(fmt::layer().with_writer(file_writer).with_ansi(false))
        .with(fmt::layer())
        .with(filter)
        .try_init()
        .map_err(|e| format!("cannot set global subscriber: {e}"))?;
    // Park the guard only once a subscriber owns the writer, so a failed init drops the worker.
    WORKER_GUARD
        .set(guard)
        .map_err(|_| "logging already initialized".to_string())?;
    Ok(filter_desc)
}

/// The most recently written app log file in `log_dir`, if any. Hourly rotation
/// keeps it to the current hour. Selection is by modification time, so a leftover
/// daily-rotated file from before the switch cannot outrank the live hourly one.
pub fn latest_log_file(log_dir: &Path) -> Option<PathBuf> {
    let entries = match std::fs::read_dir(log_dir) {
        Ok(entries) => entries,
        Err(e) => {
            tracing::warn!(dir = %log_dir.display(), error = %e, "cannot read log dir");
            return None;
        }
    };
    entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with(LOG_FILE_PREFIX))
        })
        .max_by_key(|p| p.metadata().and_then(|m| m.modified()).ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::OpenOptions;
    use std::time::{Duration, SystemTime};

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(name);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_at(path: &Path, modified: SystemTime) {
        std::fs::write(path, "line\n").unwrap();
        OpenOptions::new()
            .write(true)
            .open(path)
            .unwrap()
            .set_modified(modified)
            .unwrap();
    }

    // A leftover daily-rotated file sorts higher by name than the live hourly
    // one, so modification time has to decide.
    #[test]
    fn latest_log_file_prefers_the_newest_by_modification_time() {
        let dir = temp_dir("gnosis_vpn-app-latest-log-file");
        let base = SystemTime::UNIX_EPOCH + Duration::from_secs(1_700_000_000);
        let daily = dir.join("gnosis_vpn-app.2026-10-19.log");
        let hourly = dir.join("gnosis_vpn-app.2026-10-19-14.log");
        write_at(&daily, base);
        write_at(&hourly, base + Duration::from_secs(3600));

        assert_eq!(latest_log_file(&dir), Some(hourly));

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn latest_log_file_ignores_unrelated_files() {
        let dir = temp_dir("gnosis_vpn-app-latest-log-file-ignores");
        write_at(&dir.join("other.log"), SystemTime::now());

        assert_eq!(latest_log_file(&dir), None);

        std::fs::remove_dir_all(&dir).unwrap();
    }
}
