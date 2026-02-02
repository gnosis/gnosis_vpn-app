//! Theme detection and change handling for app windows and tray icons.
//! Uses [crate::icons] for tray icon updates when theme changes.

#[cfg_attr(not(target_os = "linux"), allow(unused_imports))]
use tauri::{AppHandle, Emitter, State};

#[cfg(target_os = "linux")]
use std::io;
#[cfg(target_os = "linux")]
use std::io::BufRead;
#[cfg(target_os = "linux")]
use std::process::{Command, Stdio};

use crate::icons::{TrayIconState, extract_connection_state_from_icon, update_tray_icon};

/// On Linux, try gsettings (GNOME) so the tray uses the correct icon on first render. Tries color-scheme first, then gtk-theme.
#[cfg(target_os = "linux")]
fn linux_theme_from_gsettings() -> Option<tauri::Theme> {
    // 1) GNOME 42+: org.gnome.desktop.interface color-scheme → 'prefer-dark' / 'prefer-light'
    let out = std::process::Command::new("gsettings")
        .args(["get", "org.gnome.desktop.interface", "color-scheme"])
        .output()
        .ok()?;
    if out.status.success() {
        let s = std::str::from_utf8(out.stdout.as_slice()).ok()?.trim();
        if s.contains("prefer-dark") {
            return Some(tauri::Theme::Dark);
        }
        if s.contains("prefer-light") {
            return Some(tauri::Theme::Light);
        }
    }

    // 2) Fallback: gtk-theme (e.g. 'Adwaita-dark' vs 'Adwaita') on older GNOME or when color-scheme is unset
    let out = std::process::Command::new("gsettings")
        .args(["get", "org.gnome.desktop.interface", "gtk-theme"])
        .output()
        .ok()?;
    if out.status.success() {
        let s = std::str::from_utf8(out.stdout.as_slice())
            .ok()?
            .to_lowercase();
        if s.contains("-dark") || s.contains("dark") {
            return Some(tauri::Theme::Dark);
        }
        return Some(tauri::Theme::Light);
    }

    None
}

#[cfg(not(target_os = "linux"))]
#[allow(dead_code)]
fn linux_theme_from_gsettings() -> Option<tauri::Theme> {
    None
}

/// On Linux, Tauri's onThemeChanged is not emitted when the OS theme changes. Spawn threads that
/// monitor gsettings and emit "os-theme-changed" so the frontend and tray icon update.
#[cfg(target_os = "linux")]
pub fn spawn_linux_theme_monitor(app: AppHandle) {
    fn run_monitor(
        app: AppHandle,
        key: &'static str,
        to_theme: impl Fn(&str) -> Option<&'static str> + Send + 'static,
    ) {
        std::thread::spawn(move || {
            let child = match Command::new("gsettings")
                .args(["monitor", "org.gnome.desktop.interface", key])
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .spawn()
            {
                Ok(c) => c,
                Err(_) => return,
            };
            let reader = io::BufReader::new(child.stdout.expect("stdout piped"));
            for line in reader.lines().filter_map(Result::ok) {
                if let Some(theme) = to_theme(&line) {
                    let _ = app.emit("os-theme-changed", theme);
                }
            }
        });
    }
    run_monitor(app.clone(), "color-scheme", |line| {
        if line.contains("prefer-dark") {
            Some("dark")
        } else if line.contains("prefer-light") {
            Some("light")
        } else {
            None
        }
    });
    run_monitor(app, "gtk-theme", |line| {
        let lower = line.to_lowercase();
        if lower.contains("-dark") || lower.contains("dark") {
            Some("dark")
        } else if !line.is_empty() {
            Some("light")
        } else {
            None
        }
    });
}

#[cfg(not(target_os = "linux"))]
#[allow(dead_code)]
pub fn spawn_linux_theme_monitor(_app: AppHandle) {}

/// OS theme at startup: used for app windows (all OS) and tray icons (non-macOS only).
pub fn system_theme() -> Option<tauri::Theme> {
    #[cfg(target_os = "linux")]
    {
        // Prefer gsettings on Linux so tray icon is correct on first render (dark_light often returns Default at startup).
        if let Some(t) = linux_theme_from_gsettings() {
            return Some(t);
        }
    }

    match dark_light::detect() {
        dark_light::Mode::Dark => Some(tauri::Theme::Dark),
        dark_light::Mode::Light => Some(tauri::Theme::Light),
        dark_light::Mode::Default => None,
    }
}

/// Initial theme computed at startup so the frontend can apply dark/light to app windows on all OS.
pub struct InitialTheme(pub Option<tauri::Theme>);

#[tauri::command]
pub fn get_initial_theme(state: State<InitialTheme>) -> Option<String> {
    state.0.as_ref().map(|t| match t {
        tauri::Theme::Dark => "dark".to_string(),
        tauri::Theme::Light => "light".to_string(),
        _ => "light".to_string(),
    })
}

#[tauri::command]
pub fn theme_changed(
    app: AppHandle,
    tray_icon_state: State<'_, TrayIconState>,
    theme: String,
) -> Result<(), String> {
    let theme = match theme.as_str() {
        "dark" => Some(tauri::Theme::Dark),
        "light" => Some(tauri::Theme::Light),
        _ => None,
    };
    let connection_state = tray_icon_state
        .current_icon
        .lock()
        .map(|icon| extract_connection_state_from_icon(&icon))
        .unwrap_or("Disconnected");
    update_tray_icon(&app, tray_icon_state.inner(), connection_state, theme);
    Ok(())
}
