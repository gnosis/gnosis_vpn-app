//! The toolkit binary has no install engine off macOS — on Linux `update` refuses before doing
//! anything and prints the apt commands — so installing stays manual here and the frontend
//! routes the button to its "How to update" modal instead. Version and update checks work on
//! Linux exactly as on macOS; those live in `crate::toolkit`.

use tauri::AppHandle;

#[tauri::command]
pub fn install_update(_app: AppHandle, _channel: String, _force: bool) -> Result<(), String> {
    tracing::warn!(target: "update_install", "install requested on unsupported platform");
    Err("UnsupportedPlatform".to_string())
}
