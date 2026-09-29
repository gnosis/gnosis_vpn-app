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

    // the frontend imports the file directly, so its keys are validated here too
    require_url(&config, "logUploaderWebsiteUrl");
    let log_upload_api_url = require_url(&config, "logUploadApiUrl");
    println!("cargo:rustc-env=LOG_UPLOAD_API_URL={log_upload_api_url}");

    tauri_build::build()
}

// fail the build, not the user's upload or link
fn require_url<'a>(config: &'a Value, key: &str) -> &'a str {
    let Some(Value::String(value)) = config.get(key) else {
        panic!("app.config.json: {key} must be set to a URL string");
    };
    url::Url::parse(value)
        .unwrap_or_else(|e| panic!("app.config.json: invalid {key} {value:?}: {e}"));
    value
}
