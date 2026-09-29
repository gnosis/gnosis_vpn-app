use serde_json::Value;

use std::path::PathBuf;

fn main() {
    let config_path = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("..")
        .join("app.config.json");
    println!("cargo:rerun-if-changed={}", config_path.display());
    let raw = std::fs::read_to_string(&config_path)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", config_path.display()));
    let config: Value = serde_json::from_str(&raw)
        .unwrap_or_else(|e| panic!("cannot parse {}: {e}", config_path.display()));

    let Some(Value::String(log_upload_api_url)) = config.get("logUploadApiUrl") else {
        panic!("app.config.json: logUploadApiUrl must be set to a URL string");
    };
    // fail the build, not the user's upload
    url::Url::parse(log_upload_api_url).unwrap_or_else(|e| {
        panic!("app.config.json: invalid logUploadApiUrl {log_upload_api_url:?}: {e}")
    });
    println!("cargo:rustc-env=LOG_UPLOAD_API_URL={log_upload_api_url}");

    tauri_build::build()
}
