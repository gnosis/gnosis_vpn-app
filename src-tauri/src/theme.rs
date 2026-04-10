//! Theme detection and change handling for app windows.
//! Provides startup theme detection and OS theme change monitoring on Linux via the XDG Desktop Portal.

#[cfg_attr(not(target_os = "linux"), allow(unused_imports))]
use tauri::{AppHandle, Emitter, State};

#[cfg(target_os = "linux")]
use ashpd::desktop::settings::{ColorScheme, Settings as XdgSettings};
#[cfg(target_os = "linux")]
use futures_util::StreamExt;

/// On Linux, query the XDG Desktop Portal for the current color scheme.
/// NoPreference is treated as light (GNOME uses it to signal "user chose light", not "no preference").
/// Uses tauri's tokio runtime via block_on — setup() runs on the main thread outside an async
/// context, so block_on is safe here.
#[cfg(target_os = "linux")]
fn linux_theme_from_portal() -> Option<tauri::Theme> {
    tauri::async_runtime::block_on(async {
        let settings = XdgSettings::new().await.ok()?;
        let scheme = settings.color_scheme().await.ok()?;
        match scheme {
            ColorScheme::PreferDark => Some(tauri::Theme::Dark),
            // NoPreference treated as light: GNOME uses it to signal "user chose light"
            ColorScheme::PreferLight | ColorScheme::NoPreference => Some(tauri::Theme::Light),
        }
    })
}

/// On Linux, Tauri's onThemeChanged is not emitted when the OS theme changes.
/// Subscribe to the XDG Desktop Portal settings stream via ashpd — event-driven.
/// Runs on tauri's tokio runtime; emits "os-theme-changed" to all windows on change.
#[cfg(target_os = "linux")]
pub fn spawn_linux_theme_monitor(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let settings = match XdgSettings::new().await {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[theme] XDG Settings portal unavailable: {e}");
                return;
            }
        };
        let mut stream = match settings.receive_color_scheme_changed().await {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[theme] Failed to subscribe to color scheme changes: {e}");
                return;
            }
        };
        while let Some(color_scheme) = stream.next().await {
            // NoPreference is treated as light: on GNOME/Debian, switching to light
            // emits NoPreference rather than PreferLight.
            let is_dark = matches!(color_scheme, ColorScheme::PreferDark);
            let theme_str = if is_dark { "dark" } else { "light" };
            let _ = app.emit("os-theme-changed", theme_str);
        }
    });
}

/// OS theme at startup: used for app windows (all OS) and tray icons (non-macOS only).
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
