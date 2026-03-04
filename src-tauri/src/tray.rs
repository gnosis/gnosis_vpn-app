use tauri::{
    AppHandle, Emitter, Manager,
    menu::{Menu, MenuBuilder, MenuItem},
    tray::TrayIconEvent,
};
use tauri_plugin_positioner::{Position, WindowExt};

use std::sync::Mutex;
use std::time::Duration;
use tokio::time::sleep;

/// State to hold a reference to the tray "status" menu item so commands can update it.
pub struct TrayStatusItem(pub Mutex<MenuItem<tauri::Wry>>);

pub fn create_tray_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, tauri::Error> {
    let status_item =
        MenuItem::with_id(app, "status", "Status: Disconnected", false, None::<&str>)?;
    let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let logs_item = MenuItem::with_id(app, "logs", "Logs", true, None::<&str>)?;
    let usage_item = MenuItem::with_id(app, "usage", "Usage", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    app.manage(TrayStatusItem(Mutex::new(status_item.clone())));

    MenuBuilder::new(app)
        .item(&status_item)
        .separator()
        .item(&show_item)
        .item(&settings_item)
        .item(&logs_item)
        .item(&usage_item)
        .item(&quit_item)
        .build()
}

pub fn toggle_main_window_visibility(app: &AppHandle, triggered_by_tray: bool) {
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible().unwrap_or(false);
        let is_focused = window.is_focused().unwrap_or(false);
        if !is_visible || !is_focused {
            #[cfg(target_os = "macos")]
            {
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
            }
            if triggered_by_tray {
                position_main_window_by_tray(&window);
            }
            let _ = window.show();
            let _ = window.set_focus();
            if triggered_by_tray {
                let handle = window.clone();
                tauri::async_runtime::spawn(async move {
                    sleep(Duration::from_millis(10)).await;
                    position_main_window_by_tray(&handle);
                });
            }
        } else {
            let _ = window.hide();
            #[cfg(target_os = "macos")]
            {
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }
        }
    }
}

fn position_main_window_by_tray(window: &tauri::WebviewWindow) {
    let _ = window.move_window(Position::TrayBottomLeft);

    let Ok(Some(monitor)) = window.current_monitor() else {
        return;
    };
    let Ok(pos) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };

    let monitor_pos = monitor.position();
    let monitor_size = monitor.size();

    let max_x = monitor_pos.x + monitor_size.width as i32;
    let win_right = pos.x + size.width as i32;

    if win_right > max_x {
        let _ = window.move_window(Position::TopRight);
    }
}

pub fn handle_tray_event(app: &AppHandle, event: TrayIconEvent) {
    tauri_plugin_positioner::on_tray_event(app.app_handle(), &event);
    if let TrayIconEvent::Click {
        button: tauri::tray::MouseButton::Left,
        button_state: tauri::tray::MouseButtonState::Up,
        ..
    } = event
    {
        toggle_main_window_visibility(app, true);
    }
}

pub fn show_settings(app: &AppHandle, target: &str) {
    if let Some(window) = app.get_webview_window("settings") {
        #[cfg(target_os = "macos")]
        {
            let main_visible = app
                .get_webview_window("main")
                .and_then(|w| w.is_visible().ok())
                .unwrap_or(false);
            if !main_visible {
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }
        }
        let _ = window.show();
        let _ = window.set_focus();
        let handle = window.clone();
        let target_owned = target.to_string();
        tauri::async_runtime::spawn(async move {
            sleep(Duration::from_millis(120)).await;
            let _ = handle.emit("navigate", target_owned);
        });
    }
}
