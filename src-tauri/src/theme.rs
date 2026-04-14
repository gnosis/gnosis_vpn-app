//! Theme detection and change handling for app windows.
//! Provides startup theme detection and OS theme change monitoring on Linux via the XDG Desktop Portal.

#[cfg_attr(not(target_os = "linux"), allow(unused_imports))]
use tauri::{AppHandle, Emitter, Manager, State};

#[cfg(target_os = "linux")]
use ashpd::desktop::settings::{ColorScheme, Settings as XdgSettings};
#[cfg(target_os = "linux")]
use futures_core::Stream;
#[cfg(target_os = "linux")]
use std::io::BufRead;
#[cfg(target_os = "linux")]
use std::process::{Command, Stdio};

/// On Linux, query the XDG Desktop Portal for the current color scheme.
/// NoPreference is treated as light
/// Spawns on Tauri's tokio runtime and blocks on the channel — avoids blocking the main thread's
/// tokio context while still waiting for the real D-Bus response.
#[cfg(target_os = "linux")]
fn linux_theme_from_portal() -> Option<tauri::Theme> {
    let (tx, rx) = std::sync::mpsc::channel();
    tauri::async_runtime::spawn(async move {
        let result: Option<tauri::Theme> = async {
            let settings = XdgSettings::new().await.ok()?;
            let scheme = settings.color_scheme().await.ok()?;
            match scheme {
                ColorScheme::PreferDark => Some(tauri::Theme::Dark),
                // NoPreference treated as light: GNOME uses it to signal "user chose light"
                ColorScheme::PreferLight | ColorScheme::NoPreference => Some(tauri::Theme::Light),
            }
        }
        .await;
        let _ = tx.send(result);
    });
    // Fall back immediately if the portal is slow or unavailable — caller falls through to dark_light::detect().
    rx.recv_timeout(std::time::Duration::from_millis(500))
        .ok()
        .flatten()
}

/// Fallback theme monitor for environments without a working XDG Desktop Portal.
/// Watches gsettings color-scheme and gtk-theme keys and emits "os-theme-changed".
#[cfg(target_os = "linux")]
fn spawn_gsettings_monitor(app: AppHandle) {
    fn run_monitor(
        app: AppHandle,
        key: &'static str,
        to_theme: impl Fn(&str) -> Option<&'static str> + Send + 'static,
    ) {
        std::thread::spawn(move || {
            let mut child = match Command::new("gsettings")
                .args(["monitor", "org.gnome.desktop.interface", key])
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .spawn()
            {
                Ok(c) => c,
                Err(_) => return,
            };
            let Some(stdout) = child.stdout.take() else {
                return;
            };
            let reader = std::io::BufReader::new(stdout);
            for line_result in reader.lines() {
                let line = match line_result {
                    Ok(l) => l,
                    Err(e) => {
                        eprintln!("[theme] gsettings monitor read error: {e}");
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

/// On Linux, Tauri's onThemeChanged is not emitted when the OS theme changes.
/// Tries the XDG Desktop Portal first; falls back to gsettings monitor if unavailable.
/// Emits "os-theme-changed" to all windows on change.
#[cfg(target_os = "linux")]
pub fn spawn_linux_theme_monitor(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let settings = match XdgSettings::new().await {
            Ok(s) => s,
            Err(e) => {
                eprintln!(
                    "[theme] XDG portal unavailable ({e}), falling back to gsettings monitor"
                );
                spawn_gsettings_monitor(app);
                return;
            }
        };
        let stream = match settings.receive_color_scheme_changed().await {
            Ok(s) => s,
            Err(e) => {
                eprintln!(
                    "[theme] XDG portal subscription failed ({e}), falling back to gsettings monitor"
                );
                spawn_gsettings_monitor(app);
                return;
            }
        };
        let mut stream = std::pin::pin!(stream);
        while let Some(color_scheme) =
            std::future::poll_fn(|cx| stream.as_mut().poll_next(cx)).await
        {
            // NoPreference is treated as light: on GNOME/Debian, switching to light
            // emits NoPreference rather than PreferLight.
            let is_dark = matches!(color_scheme, ColorScheme::PreferDark);
            let theme_str = if is_dark { "dark" } else { "light" };
            let _ = app.emit("os-theme-changed", theme_str);
            let theme = if is_dark {
                tauri::Theme::Dark
            } else {
                tauri::Theme::Light
            };
            for window in app.webview_windows().into_values() {
                let _ = window.set_theme(Some(theme));
            }
        }
        // Stream ended (portal restart/disconnect) — fall back so monitoring continues.
        eprintln!("[theme] XDG portal stream ended, falling back to gsettings monitor");
        spawn_gsettings_monitor(app);
    });
}

/// OS theme at startup: seeds [`InitialTheme`] state so the frontend can apply dark/light on all OS.
/// Defaults to dark theme.
pub fn system_theme() -> tauri::Theme {
    #[cfg(target_os = "linux")]
    {
        // Query XDG portal directly
        if let Some(t) = linux_theme_from_portal() {
            return t;
        }
    }

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
