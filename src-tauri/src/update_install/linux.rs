//! No bundled Linux updater exists yet; these are permanent stand-ins so the
//! commands stay registered cross-platform.

use tauri::AppHandle;

#[tauri::command]
pub async fn get_toolkit_version() -> Option<String> {
    None
}

#[tauri::command]
pub fn install_update(_app: AppHandle, _channel: String, _force: bool) -> Result<(), String> {
    Err("UnsupportedPlatform".to_string())
}
