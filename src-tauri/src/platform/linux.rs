use super::PlatformInterface;
use gtk::gdk;
use gtk::glib::{self, translate::ToGlibPtr};
use gtk::prelude::WidgetExt;

pub struct LinuxPlatform;

impl PlatformInterface for LinuxPlatform {
    fn setup_system_tray() -> Result<(), String> {
        // System tray setup will be handled in the main Tauri application
        // This is just a placeholder for any Linux-specific setup
        Ok(())
    }
}

/// Makes WebKitGTK clear `:hover` and fire `mouseleave` when the pointer leaves onto a window stacked above ours.
///
/// WebKitGTK hit-tests the leave event's own coordinates. When an overlapping window takes the
/// pointer those lie inside our view, so whatever is under that point stays (or becomes) hovered.
pub fn clear_hover_on_pointer_leave(window: &tauri::WebviewWindow) {
    let result = window.with_webview(|webview| {
        webview.inner().connect_leave_notify_event(|_, event| {
            if event.detail() != gdk::NotifyType::Inferior {
                // SAFETY: the live event GTK is dispatching; WebKit's default handler reads it after us.
                unsafe {
                    let raw = event.to_glib_none().0 as *mut gdk::ffi::GdkEventCrossing;
                    (*raw).x = -1.0;
                    (*raw).y = -1.0;
                }
            }
            glib::Propagation::Proceed
        });
    });
    if let Err(e) = result {
        tracing::warn!(window = window.label(), error = %e, "cannot hook pointer leave");
    }
}
