// An icon missing from bundle.resources only surfaces at runtime as a cache miss.

use std::path::Path;

const ICONS_SOURCE: &str = include_str!("../src/icons.rs");
const TAURI_CONF: &str = include_str!("../tauri.conf.json");

// Scans the source instead of listing constants, so new ones are covered automatically.
fn icon_resource_paths() -> Vec<String> {
    let mut paths = Vec::new();
    for chunk in ICONS_SOURCE.split("pub const ").skip(1) {
        let is_app_icon = chunk.starts_with("APP_ICON_");
        let is_tray_icon = chunk.starts_with("TRAY_ICON_");
        if !is_app_icon && !is_tray_icon {
            continue;
        }
        let declaration = chunk.split(';').next().unwrap_or_default();
        let value = declaration
            .split('"')
            .nth(1)
            .unwrap_or_else(|| panic!("icon constant without a string value: {declaration}"));
        let path = if is_app_icon {
            format!("icons/app-icons/{value}")
        } else {
            format!("icons/{value}")
        };
        paths.push(path);
    }
    paths
}

fn bundled_resources() -> Vec<String> {
    let conf: serde_json::Value = serde_json::from_str(TAURI_CONF).expect("tauri.conf.json parses");
    conf["bundle"]["resources"]
        .as_array()
        .expect("bundle.resources is an array")
        .iter()
        .map(|r| r.as_str().expect("resource is a string").to_string())
        .collect()
}

#[test]
fn every_icon_constant_is_bundled_and_exists() {
    let icon_paths = icon_resource_paths();
    // 17 app + 17 tray + 17 Linux tray today; guards against the scan matching nothing
    assert!(
        icon_paths.len() >= 51,
        "found only {} icon constants",
        icon_paths.len()
    );

    let resources = bundled_resources();
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut problems = Vec::new();
    for path in &icon_paths {
        if !resources.contains(path) {
            problems.push(format!("not in tauri.conf.json bundle.resources: {path}"));
        }
        if !manifest_dir.join(path).is_file() {
            problems.push(format!("missing file: src-tauri/{path}"));
        }
    }
    assert!(problems.is_empty(), "\n{}", problems.join("\n"));
}
