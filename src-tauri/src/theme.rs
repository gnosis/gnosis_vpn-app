//! Theme detection and change handling for app windows and tray icons.
//! Uses [crate::icons] for tray icon updates when theme changes.

#[cfg_attr(not(target_os = "linux"), allow(unused_imports))]
use tauri::{AppHandle, Emitter, Manager, State};

#[cfg(target_os = "linux")]
use ashpd::desktop::settings::{ColorScheme, Settings as XdgSettings};
#[cfg(target_os = "linux")]
use futures_util::StreamExt;
/// On Linux, query the XDG Desktop Portal for the current color scheme.
/// Uses a 500 ms timeout so startup is not delayed if the portal is slow.
#[cfg(target_os = "linux")]
fn linux_theme_from_portal() -> Option<tauri::Theme> {
    async_std::task::block_on(async_std::future::timeout(
        std::time::Duration::from_millis(500),
        async {
            let settings = XdgSettings::new().await.ok()?;
            let scheme = settings.color_scheme().await.ok()?;
            Some(match scheme {
                ColorScheme::PreferDark => tauri::Theme::Dark,
                _ => tauri::Theme::Light,
            })
        },
    ))
    .ok()
    .flatten()
}

/// On Linux, Tauri's onThemeChanged is not emitted when the OS theme changes.
/// Subscribe to the XDG Desktop Portal settings stream via ashpd — event-driven,
#[cfg(target_os = "linux")]
pub fn spawn_linux_theme_monitor(app: AppHandle) {
    std::thread::spawn(move || {
        async_std::task::block_on(async {
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
                let is_dark = matches!(color_scheme, ColorScheme::PreferDark);
                let app_clone = app.clone();
                let _ = app.run_on_main_thread(move || {
                    let theme_str = if is_dark { "dark" } else { "light" };
                    for window in app_clone.webview_windows().values() {
                        let _ = window.emit("os-theme-changed", theme_str);
                        let t = if is_dark {
                            tauri::Theme::Dark
                        } else {
                            tauri::Theme::Light
                        };
                        let _ = window.set_theme(Some(t));
                    }
                });
            }
        });
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
