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

/// Run a command and return its stdout as a string. Returns `None` on failure.
#[cfg(target_os = "linux")]
fn run_stdout(mut cmd: Command) -> Option<String> {
    let out = cmd.output().ok()?;
    if out.status.success() {
        String::from_utf8(out.stdout)
            .ok()
            .map(|s| s.trim().to_string())
    } else {
        None
    }
}

/// On Linux, try gsettings (GNOME) so the tray uses the correct icon on first render. Tries color-scheme first, then gtk-theme.
#[cfg(target_os = "linux")]
fn linux_theme_from_gsettings() -> Option<tauri::Theme> {
    // 1) GNOME 42+: org.gnome.desktop.interface color-scheme → 'prefer-dark' / 'prefer-light'
    let mut cmd = Command::new("gsettings");
    cmd.args(["get", "org.gnome.desktop.interface", "color-scheme"]);
    let out = run_stdout(cmd)?;
    if out.contains("prefer-dark") {
        return Some(tauri::Theme::Dark);
    }
    if out.contains("prefer-light") {
        return Some(tauri::Theme::Light);
    }

    // 2) Fallback: gtk-theme (e.g. 'Adwaita-dark' vs 'Adwaita') on older GNOME or when color-scheme is unset
    let mut cmd = Command::new("gsettings");
    cmd.args(["get", "org.gnome.desktop.interface", "gtk-theme"]);
    let out = run_stdout(cmd)?.to_lowercase();
    if out.contains("-dark") || out.contains("dark") {
        return Some(tauri::Theme::Dark);
    }
    Some(tauri::Theme::Light)
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
            let Some(stdout) = child.stdout else { return };
            let reader = io::BufReader::new(stdout);
            for line_result in reader.lines() {
                let line = match line_result {
                    Ok(l) => l,
                    Err(e) => {
                        eprintln!("Error reading stream: {}", e);
                        break;
                    }
                };
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

/// OS theme at startup: used for app windows (all OS) and tray icons (non-macOS only).
/// Defaults to dark theme.
pub fn system_theme() -> tauri::Theme {
    #[cfg(target_os = "linux")]
    {
        // On Linux use gsettings only — dark_light falls back to D-Bus/portal which can
        // timeout in environments without a full desktop session (e.g. VMs, minimal installs).
        return linux_theme_from_gsettings().unwrap_or(tauri::Theme::Dark);
    }

    #[cfg(not(target_os = "linux"))]
    {
        let mode = dark_light::detect()
            .map_err(|e| {
                eprintln!("Failed to detect OS theme: {e}");
            })
            .unwrap_or(dark_light::Mode::Unspecified);

        match mode {
            dark_light::Mode::Dark => tauri::Theme::Dark,
            dark_light::Mode::Light => tauri::Theme::Light,
            dark_light::Mode::Unspecified => tauri::Theme::Dark,
        }
    }
}

/// Initial theme computed at startup so the frontend can apply dark/light to app windows on all OS.
/// Resolved to light or dark (defaults to dark when OS reports no preference).
pub struct InitialTheme(pub tauri::Theme);

#[tauri::command]
pub fn get_initial_theme(state: State<InitialTheme>) -> String {
    match state.0 {
        tauri::Theme::Light => "light".to_string(),
        _ => "dark".to_string(),
    }
}
