//! App-side file logging: daily-rotating, auto-pruned files under the Tauri app log dir.

use tracing_appender::non_blocking::WorkerGuard;
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
    std::fs::create_dir_all(log_dir).map_err(|e| format!("cannot create log dir: {e}"))?;

    let appender = RollingFileAppender::builder()
        .rotation(Rotation::DAILY)
        .filename_prefix(LOG_FILE_PREFIX)
        .filename_suffix("log")
        .max_log_files(MAX_LOG_FILES)
        .build(log_dir)
        .map_err(|e| format!("cannot create rolling log file: {e}"))?;
    let (file_writer, guard) = tracing_appender::non_blocking(appender);
    let _ = WORKER_GUARD.set(guard);

    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(DEFAULT_LOG_FILTER));
    let filter_desc = filter.to_string();
    tracing_subscriber::registry()
        .with(fmt::layer().with_writer(file_writer).with_ansi(false))
        .with(fmt::layer())
        .with(filter)
        .try_init()
        .map_err(|e| format!("cannot set global subscriber: {e}"))?;
    Ok(filter_desc)
}

/// App log files in `log_dir`, oldest first (the date suffix sorts chronologically).
pub fn log_files(log_dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(log_dir) else {
        return Vec::new();
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
