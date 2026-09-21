//! No install engine off macOS: `update` refuses and prints the apt commands, so
//! the frontend routes the button to its modal. Checks live in `crate::toolkit`.

use tauri::AppHandle;

#[tauri::command]
pub fn install_update(_app: AppHandle, _channel: String, _force: bool) -> Result<(), String> {
    tracing::warn!(target: "update_install", "install requested on unsupported platform");
    Err("UnsupportedPlatform".to_string())
}
