use std::sync::Mutex;
use tauri::{
    AppHandle, Emitter, Manager, State,
    menu::{Menu, MenuBuilder, MenuItem},
    tray::TrayIconEvent,
};

/// State to hold a reference to the tray "status" menu item so commands can update it.
pub struct TrayStatusItem(pub Mutex<MenuItem<tauri::Wry>>);

/// State to hold a reference to the tray "quit" menu item so commands can update its label.
pub struct TrayQuitItem(pub Mutex<MenuItem<tauri::Wry>>);

/// The Settings target the tray last asked for, until the main window takes it.
#[derive(Default)]
pub struct PendingSettings(Mutex<Option<String>>);

pub fn create_tray_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, tauri::Error> {
    let status_item =
        MenuItem::with_id(app, "status", "Status: Disconnected", false, None::<&str>)?;
    let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let usage_item = MenuItem::with_id(app, "usage", "Usage", true, None::<&str>)?;
    let traffic_item = MenuItem::with_id(app, "traffic", "Live traffic", true, None::<&str>)?;
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
    let is_visible = window.is_visible().unwrap_or(false);
    let is_focused = window.is_focused().unwrap_or(false);
    tracing::info!(target: "window", show = !is_visible || !is_focused, "toggling main window");
    if !is_visible || !is_focused {
        show_main_window(app);
    } else {
        crate::hide_main_window(app, &window);
    }
}

fn show_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        tracing::warn!(target: "tray", "main window missing, cannot show it");
        return;
    };
    #[cfg(target_os = "macos")]
    {
        let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
    }
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
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

/// Shows the main window with its Settings page open at `target`
/// ("general", "usage" or "check-update").
pub fn show_settings(app: &AppHandle, target: &str) {
    show_main_window(app);
    // held, not only emitted: a webview still loading has no listener yet and takes it once it has
    if let Ok(mut pending) = app.state::<PendingSettings>().0.lock() {
        *pending = Some(target.to_string());
    }
    if let Err(e) = app.emit_to("main", "settings:open", target) {
        tracing::warn!(target: "tray", error = %e, "cannot open settings in the main window");
    }
}

/// Hands the main window the pending Settings target, once.
#[tauri::command]
pub fn take_settings_target(pending: State<'_, PendingSettings>) -> Option<String> {
    pending.0.lock().ok().and_then(|mut target| target.take())
}
