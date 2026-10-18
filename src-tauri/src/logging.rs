//! App-side file logging: daily-rotating, auto-pruned files under the Tauri app log dir.

use tracing_appender::non_blocking::{NonBlocking, WorkerGuard};
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::{EnvFilter, fmt, prelude::*};

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

const DEFAULT_LOG_FILTER: &str = "info";
const LOG_FILE_PREFIX: &str = "gnosis_vpn-app";
const MAX_LOG_FILES: usize = 7;

// Dropping the guard stops the background log writer, so park it for the process lifetime.
static WORKER_GUARD: OnceLock<WorkerGuard> = OnceLock::new();

/// Global tracing subscriber: rotating file plus stdout; `RUST_LOG` overrides "info".
/// Returns the effective filter so the startup line can record it.
pub fn init(log_dir: &Path) -> Result<String, String> {
    // An unwritable log dir must not silence the app: stdout stays, and this line bypasses RUST_LOG on purpose.
    let (file_writer, guard) = match rolling_file_writer(log_dir) {
        Ok((writer, guard)) => (Some(writer), Some(guard)),
        Err(e) => {
            eprintln!(
                "log dir {} not writable ({e}), logging to stdout only",
                log_dir.display()
            );
            (None, None)
        }
    };
    let file_layer = file_writer.map(|writer| fmt::layer().with_writer(writer).with_ansi(false));

    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(DEFAULT_LOG_FILTER));
    let filter_desc = filter.to_string();
    tracing_subscriber::registry()
        .with(file_layer)
        .with(fmt::layer())
        .with(filter)
        .try_init()
        .map_err(|e| format!("cannot set global subscriber: {e}"))?;
    // Park the guard only once a subscriber owns the writer, so a failed init drops the worker.
    if let Some(guard) = guard {
        WORKER_GUARD
            .set(guard)
            .map_err(|_| "logging already initialized".to_string())?;
    }
    Ok(filter_desc)
}

fn rolling_file_writer(log_dir: &Path) -> Result<(NonBlocking, WorkerGuard), String> {
    std::fs::create_dir_all(log_dir).map_err(|e| format!("cannot create log dir: {e}"))?;
    let appender = RollingFileAppender::builder()
        .rotation(Rotation::DAILY)
        .filename_prefix(LOG_FILE_PREFIX)
        .filename_suffix("log")
        .max_log_files(MAX_LOG_FILES)
        .build(log_dir)
        .map_err(|e| format!("cannot create rolling log file: {e}"))?;
    Ok(tracing_appender::non_blocking(appender))
}

/// App log files in `log_dir`, oldest first (the date suffix sorts chronologically).
pub fn log_files(log_dir: &Path) -> Vec<PathBuf> {
    let entries = match std::fs::read_dir(log_dir) {
        Ok(entries) => entries,
        Err(e) => {
            tracing::warn!(dir = %log_dir.display(), error = %e, "cannot read log dir");
            return Vec::new();
        }
    };
    let mut files: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with(LOG_FILE_PREFIX))
        })
        .collect();
    files.sort();
    files
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_unwritable_log_dir_is_an_error_not_a_panic() {
        // A file where a directory is needed makes the create fail without needing privileges.
        let dir =
            std::env::temp_dir().join(format!("gnosis_vpn-app-logging-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let blocker = dir.join("blocker");
        std::fs::write(&blocker, "x").unwrap();
        assert!(rolling_file_writer(&blocker.join("logs")).is_err());
        assert!(rolling_file_writer(&dir.join("logs")).is_ok());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
