use gnosis_vpn_lib::{command, peer_id, socket};

use std::path::PathBuf;

#[tauri::command]
fn status() -> Result<command::StatusResponse, String> {
    let p = PathBuf::from(socket::DEFAULT_PATH);
    let resp = socket::process_cmd(&p, &command::Command::Status).map_err(|e| e.to_string())?;
    match resp {
        command::Response::Status(status_resp) => Ok(status_resp),
        _ => Err("Unexpected response type".to_string()),
    }
}

#[tauri::command]
fn connect(peer_id: peer_id::PeerId) -> Result<command::Response, String> {
    let p = PathBuf::from(socket::DEFAULT_PATH);
    let cmd = command::Command::Connect(peer_id);
    let resp = socket::process_cmd(&p, &cmd).map_err(|e| e.to_string())?;
    Ok(resp)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![status, connect])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
