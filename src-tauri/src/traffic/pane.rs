//! The live traffic pane widens the main window to the left, so the main screen keeps its place.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewWindow};

/// Logical px the pane adds to the main window.
const PANE_WIDTH: f64 = 460.0;
/// Time for the window manager to apply a collapse before the window may hide.
pub const COLLAPSE_SETTLE: Duration = Duration::from_millis(150);
/// Only used if tauri.conf.json loses its main window entry.
const FALLBACK_MAIN_SIZE: (f64, f64) = (360.0, 612.0);

#[derive(Default)]
pub struct PaneState {
    open: AtomicBool,
}

/// Logical size of the main window with or without the pane.
fn target_size(app: &AppHandle, open: bool) -> (f64, f64) {
    let (width, height) = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "main")
        .map_or(FALLBACK_MAIN_SIZE, |w| (w.width, w.height));
    (if open { width + PANE_WIDTH } else { width }, height)
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main")
        .ok_or_else(|| "main window missing".to_string())
}

/// Opens or closes the pane; the window changes width in one step, its top-right corner fixed.
#[tauri::command]
pub fn traffic_pane(app: AppHandle, open: bool) -> Result<(), String> {
    let state = app.state::<PaneState>();
    if state.open.swap(open, Ordering::AcqRel) == open {
        return Ok(());
    }
    let result = main_window(&app).and_then(|w| resize(&app, &w, open).map_err(|e| e.to_string()));
    if result.is_err() {
        state.open.store(!open, Ordering::Release);
    }
    result
}

/// For the hide-to-tray path. Returns whether the pane was open.
pub fn collapse_now(app: &AppHandle) -> bool {
    if !app.state::<PaneState>().open.swap(false, Ordering::AcqRel) {
        return false;
    }
    if let Err(e) = main_window(app).and_then(|w| resize(app, &w, false).map_err(|e| e.to_string()))
    {
        tracing::warn!(target: "traffic", error = %e, "cannot collapse the traffic pane");
    }
    true
}

/// North-east gravity keeps the top-right corner through a plain resize; a separate move raced it and drifted.
#[cfg(target_os = "linux")]
fn resize(app: &AppHandle, window: &WebviewWindow, open: bool) -> tauri::Result<()> {
    use gtk::prelude::{GtkWindowExt, WidgetExt};

    let (width, height) = target_size(app, open);
    let target = window.clone();
    window.run_on_main_thread(move || {
        let Ok(gtk_window) = target.gtk_window() else {
            tracing::warn!(target: "traffic", "main window has no gtk window");
            return;
        };
        if let Some(frame) = gtk_window.window().map(|w| w.frame_extents()) {
            tracing::info!(
                target: "traffic",
                open,
                frame_x = frame.x(),
                frame_width = frame.width(),
                right_edge = frame.x() + frame.width(),
                to_width = width,
                "resizing the main window for the traffic pane"
            );
        }
        gtk_window.set_gravity(gtk::gdk::Gravity::NorthEast);
        gtk_window.resize(width.round() as i32, height.round() as i32);
    })
}

/// macOS applies both in one runloop turn, so moving the left edge with the resize stays atomic.
#[cfg(not(target_os = "linux"))]
fn resize(app: &AppHandle, window: &WebviewWindow, open: bool) -> tauri::Result<()> {
    use tauri::{LogicalSize, PhysicalPosition};

    let (width, height) = target_size(app, open);
    let scale = window.scale_factor()?;
    let position = window.outer_position()?;
    let current = window.inner_size()?;
    let x = position.x + current.width as i32 - (width * scale).round() as i32;
    tracing::info!(
        target: "traffic",
        open,
        from_x = position.x,
        to_x = x,
        to_width = width,
        "resizing the main window for the traffic pane"
    );
    window.set_position(PhysicalPosition::new(x, position.y))?;
    window.set_size(LogicalSize::new(width, height))
}
