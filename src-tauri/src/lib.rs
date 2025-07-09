use gnosis_vpn_lib::{command, socket};

use std::path::PathBuf;

#[tauri::command]
fn status(_foo: &str) -> Result<command::Response, String> {
    let p = PathBuf::from(socket::DEFAULT_PATH);
    let resp = socket::process_cmd(&p, &command::Command::Status).map_err(|e| e.to_string())?;
    Ok(resp)
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, status])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
