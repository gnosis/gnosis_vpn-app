use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    AppHandle, Emitter, Listener, Manager,
    menu::{Menu, MenuBuilder, MenuItem},
    tray::TrayIconEvent,
};
use tokio::time::sleep;

/// State to hold a reference to the tray "status" menu item so commands can update it.
pub struct TrayStatusItem(pub Mutex<MenuItem<tauri::Wry>>);

/// State to hold a reference to the tray "quit" menu item so commands can update its label.
pub struct TrayQuitItem(pub Mutex<MenuItem<tauri::Wry>>);

pub fn create_tray_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, tauri::Error> {
    let status_item =
        MenuItem::with_id(app, "status", "Status: Disconnected", false, None::<&str>)?;
    let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let usage_item = MenuItem::with_id(app, "usage", "Usage", true, None::<&str>)?;
    let traffic_item = MenuItem::with_id(app, "traffic", "Traffic", true, None::<&str>)?;
    let check_update_item =
        MenuItem::with_id(app, "check_update", "Check update", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    app.manage(TrayStatusItem(Mutex::new(status_item.clone())));
    app.manage(TrayQuitItem(Mutex::new(quit_item.clone())));

    MenuBuilder::new(app)
        .item(&status_item)
        .separator()
        .item(&show_item)
        .item(&settings_item)
        .item(&usage_item)
        .item(&traffic_item)
        .item(&check_update_item)
        .separator()
        .item(&quit_item)
        .build()
}

pub fn toggle_main_window_visibility(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        tracing::warn!(target: "tray", "main window missing, cannot toggle visibility");
        return;
    };
    {
        let is_visible = window.is_visible().unwrap_or(false);
        let is_focused = window.is_focused().unwrap_or(false);
        tracing::info!(target: "window", show = !is_visible || !is_focused, "toggling main window");
        if !is_visible || !is_focused {
            #[cfg(target_os = "macos")]
            {
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
            }
            let _ = window.show();
            let _ = window.set_focus();
        } else {
            let _ = window.hide();
            #[cfg(target_os = "macos")]
            {
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }
        }
    }
}

pub fn handle_tray_event(app: &AppHandle, event: TrayIconEvent) {
    if let TrayIconEvent::Click {
        button: tauri::tray::MouseButton::Left,
        button_state: tauri::tray::MouseButtonState::Up,
        ..
    } = event
    {
        toggle_main_window_visibility(app);
    }
}

/// Shows and focuses the main window; every tray action lands there now that it is the only window.
fn show_main_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    let Some(window) = app.get_webview_window("main") else {
        tracing::warn!(target: "tray", "main window missing");
        return None;
    };
    #[cfg(target_os = "macos")]
    {
        let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
    }
    let _ = window.show();
    let _ = window.set_focus();
    Some(window)
}

/// Shows the main window and asks it for a page (`settings`, `software-update`, ...) or the wallet popover.
pub fn show_main_and_navigate(app: &AppHandle, target: &str) {
    let Some(window) = show_main_window(app) else {
        return;
    };
    let target_owned = target.to_string();
    tauri::async_runtime::spawn(async move {
        // A window that was hidden needs a moment before its listener sees the event.
        sleep(Duration::from_millis(120)).await;
        // emit_to: the page stack in App.tsx owns this event
        if let Err(e) = window.emit_to("main", "navigate", target_owned) {
            tracing::warn!(target: "tray", error = %e, "cannot emit navigate to main window");
        }
    });
}

/// Shows the Software update page and starts a check once the page says its listener is up.
pub fn show_main_and_check_update(app: &AppHandle) {
    let Some(window) = show_main_window(app) else {
        return;
    };
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        // Register the ready listener before navigating so we cannot miss
        // the ack even if the frontend mounts faster than expected.
        let (tx, rx) = tokio::sync::oneshot::channel::<()>();
        let tx = std::sync::Arc::new(Mutex::new(Some(tx)));
        let tx2 = tx.clone();
        let id = app_handle.listen("updates:ready", move |_| {
            if let Ok(mut guard) = tx2.lock() {
                if let Some(s) = guard.take() {
                    let _ = s.send(());
                }
            }
        });
        sleep(Duration::from_millis(120)).await;
        let _ = window.emit_to("main", "navigate", "software-update");
        // Ping covers the case where the page is already mounted (no
        // remount, so its onMount-time ready emit won't fire again).
        sleep(Duration::from_millis(80)).await;
        let _ = window.emit_to("main", "updates:ping", ());
        // Wait until the page signals its listener is attached (5 s fallback).
        if tokio::time::timeout(Duration::from_secs(5), rx)
            .await
            .is_err()
        {
            tracing::warn!(target: "tray", "updates-ready handshake timed out, requesting check anyway");
        }
        app_handle.unlisten(id);
        let _ = window.emit_to("main", "updates:check", ());
    });
}
