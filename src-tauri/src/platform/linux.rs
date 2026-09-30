use super::PlatformInterface;
use gtk::gdk;
use gtk::glib;
use gtk::prelude::WidgetExt;
use tauri::Emitter;

pub struct LinuxPlatform;

impl PlatformInterface for LinuxPlatform {
    fn setup_system_tray() -> Result<(), String> {
        // System tray setup will be handled in the main Tauri application
        // This is just a placeholder for any Linux-specific setup
        Ok(())
    }
}

/// Reports the pointer leaving the window: the GTK event arrives fine, but WebKitGTK hit-tests its
/// coordinates and never turns it into a `mouseleave` (see `docs/tooltips.md`).
pub fn forward_pointer_leave(app: &tauri::AppHandle, window: &tauri::WebviewWindow) {
    let app = app.clone();
    let label = window.label().to_string();
    let result = window.with_webview(move |webview| {
        webview.inner().connect_leave_notify_event(move |_, event| {
            // Inferior: the pointer moved onto a child widget, not out of the window.
            if event.detail() != gdk::NotifyType::Inferior {
                let _ = app.emit("pointer-left-window", ());
            }
            glib::Propagation::Proceed
        });
    });
    if let Err(e) = result {
        tracing::warn!(target: "tooltip", window = %label, error = %e, "cannot hook pointer leave");
    }
}
