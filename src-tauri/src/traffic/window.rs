//! Live traffic has its own window beside the main one, so the main window never changes size.

use std::sync::{Mutex, PoisonError};

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewWindow, WindowEvent};

pub const LABEL: &str = "traffic";
/// Logical px between the main window and the traffic window.
const GAP: f64 = 1.0;

/// Where the window was last hidden; held in memory only, so it reopens there until the app quits.
#[derive(Default)]
pub struct TrafficWindowState(Mutex<Option<PhysicalPosition<i32>>>);

impl TrafficWindowState {
    fn last_position(&self) -> std::sync::MutexGuard<'_, Option<PhysicalPosition<i32>>> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

fn traffic_window(app: &AppHandle) -> Option<WebviewWindow> {
    let window = app.get_webview_window(LABEL);
    if window.is_none() {
        tracing::warn!(target: "traffic", "traffic window missing");
    }
    window
}

/// Wires up the window declared in tauri.conf.json.
pub fn setup(app: &AppHandle) {
    let Some(window) = traffic_window(app) else {
        return;
    };
    let handle = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            tracing::info!(target: "traffic", "traffic window close requested, hiding");
            api.prevent_close();
            hide(&handle);
        }
    });
}

/// The icon shows open or closed, so it toggles (minimized counts as closed); the tray item always shows.
#[tauri::command]
pub fn traffic_window_toggle(app: AppHandle) {
    let Some(window) = traffic_window(&app) else {
        return;
    };
    let up = window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false);
    if up {
        hide(&app);
    } else {
        show(&app);
    }
}

/// Shows and focuses the window; a hidden one reopens where it was last, or beside main, with a fresh capture.
pub fn show(app: &AppHandle) {
    let Some(window) = traffic_window(app) else {
        return;
    };
    let hidden = !window.is_visible().unwrap_or(false);
    if hidden {
        if let Err(e) = place(app, &window) {
            tracing::warn!(target: "traffic", error = %e, "cannot place the traffic window");
        }
    }
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    if hidden {
        tracing::info!(target: "traffic", "traffic window shown");
        // The webview outlives hiding, so it must be told to start over.
        if let Err(e) = window.emit_to(LABEL, "traffic:open", ()) {
            tracing::warn!(target: "traffic", error = %e, "cannot notify the traffic window");
        }
    }
    notify_main(app, true);
}

/// Hides the window and ends its capture.
pub fn hide(app: &AppHandle) {
    let Some(window) = traffic_window(app) else {
        return;
    };
    remember_position(app, &window);
    let _ = window.hide();
    tracing::info!(target: "traffic", "traffic window hidden");
    if let Err(e) = window.emit_to(LABEL, "traffic:closed", ()) {
        tracing::warn!(target: "traffic", error = %e, "cannot notify the traffic window");
    }
    notify_main(app, false);
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        super::stop(&handle).await;
    });
}

/// Keeps the main window's icon in step.
fn notify_main(app: &AppHandle, open: bool) {
    if let Err(e) = app.emit_to("main", "traffic:window", open) {
        tracing::warn!(target: "traffic", error = %e, "cannot tell the main window about the traffic window");
    }
}

/// A minimized window reports a parking spot, not where the user left it.
fn remember_position(app: &AppHandle, window: &WebviewWindow) {
    if !window.is_visible().unwrap_or(false) || window.is_minimized().unwrap_or(false) {
        return;
    }
    if let Ok(position) = window.outer_position() {
        *app.state::<TrafficWindowState>().last_position() = Some(position);
    }
}

/// Where it was last hidden this session, if that is still on a screen; otherwise beside the main window.
fn place(app: &AppHandle, window: &WebviewWindow) -> tauri::Result<()> {
    let last = *app.state::<TrafficWindowState>().last_position();
    if let Some(position) = last {
        let on_screen = window.available_monitors()?.iter().any(|monitor| {
            let area = monitor.work_area();
            contains(
                area.position.x,
                area.position.y,
                area.size.width as i32,
                area.size.height as i32,
                position,
            )
        });
        if on_screen {
            return window.set_position(position);
        }
    }
    place_beside_main(app, window)
}

/// The window's top-left corner sits inside the area.
fn contains(x: i32, y: i32, width: i32, height: i32, point: PhysicalPosition<i32>) -> bool {
    (x..x + width).contains(&point.x) && (y..y + height).contains(&point.y)
}

/// x for a window of `width` beside main: left when it fits on the screen, else right, else None.
fn beside_x(
    area_x: i32,
    area_width: i32,
    main_x: i32,
    main_width: i32,
    width: i32,
    gap: i32,
) -> Option<i32> {
    let left = main_x - gap - width;
    let right = main_x + main_width + gap;
    if left >= area_x {
        Some(left)
    } else if right + width <= area_x + area_width {
        Some(right)
    } else {
        None
    }
}

/// Left of a visible main window, or right of it when the left has no room; otherwise the window manager decides.
fn place_beside_main(app: &AppHandle, window: &WebviewWindow) -> tauri::Result<()> {
    let Some(main) = app.get_webview_window("main") else {
        return Ok(());
    };
    if !main.is_visible()? || main.is_minimized()? {
        return Ok(());
    }
    let Some(monitor) = main.current_monitor()? else {
        return Ok(());
    };
    let area = monitor.work_area();
    let gap = (GAP * main.scale_factor()?).round() as i32;
    let main_at = main.outer_position()?;
    let main_width = main.outer_size()?.width as i32;
    let width = window.outer_size()?.width as i32;
    let Some(x) = beside_x(
        area.position.x,
        area.size.width as i32,
        main_at.x,
        main_width,
        width,
        gap,
    ) else {
        return Ok(());
    };
    window.set_position(PhysicalPosition::new(x, main_at.y))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_left_of_main_with_a_one_pixel_gap_when_it_fits() {
        // 1920 px screen, main at 1000..1360, traffic 460 wide
        assert_eq!(beside_x(0, 1920, 1000, 360, 460, 1), Some(539));
    }

    #[test]
    fn opens_right_of_main_when_the_left_has_no_room() {
        assert_eq!(beside_x(0, 1920, 100, 360, 460, 1), Some(461));
    }

    #[test]
    fn left_edge_counts_on_a_secondary_monitor() {
        // monitor starting at x 1920; main 461 px in leaves exactly room for 460 + 1
        assert_eq!(beside_x(1920, 1920, 2381, 360, 460, 1), Some(1920));
        assert_eq!(beside_x(1920, 1920, 2380, 360, 460, 1), Some(2741));
    }

    #[test]
    fn no_room_on_either_side_leaves_it_to_the_window_manager() {
        assert_eq!(beside_x(0, 1000, 300, 360, 460, 1), None);
    }

    #[test]
    fn a_remembered_spot_off_every_screen_is_not_reused() {
        assert!(contains(0, 0, 1920, 1080, PhysicalPosition::new(539, 200)));
        assert!(!contains(
            0,
            0,
            1920,
            1080,
            PhysicalPosition::new(1920, 200)
        ));
        assert!(!contains(
            0,
            0,
            1920,
            1080,
            PhysicalPosition::new(-460, 200)
        ));
    }
}
