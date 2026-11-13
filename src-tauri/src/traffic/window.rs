//! Live traffic has its own window beside the main one, so the main window never changes size.

use std::sync::{Mutex, PoisonError};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewWindow, WindowEvent};

pub const LABEL: &str = "traffic";
/// Logical px between the main window and the traffic window.
const GAP: f64 = 8.0;
/// Traffic losing focus and main gaining it this close together is one hand-over; the platforms disagree on their order.
const HANDOVER: Duration = Duration::from_millis(300);
/// The icon click that took focus from the traffic window arrives within this.
const CLICK_GRACE: Duration = Duration::from_secs(1);

#[derive(Default)]
struct Focus {
    traffic: bool,
    traffic_lost_at: Option<Instant>,
    main_took_it_at: Option<Instant>,
}

impl Focus {
    fn traffic_changed(&mut self, focused: bool, now: Instant) {
        self.traffic = focused;
        if !focused {
            self.traffic_lost_at = Some(now);
        }
    }

    fn main_gained(&mut self, now: Instant) {
        let from_traffic = self.traffic
            || self
                .traffic_lost_at
                .is_some_and(|at| now.duration_since(at) < HANDOVER);
        self.main_took_it_at = from_traffic.then_some(now);
    }

    fn traffic_was_in_front(&self, now: Instant) -> bool {
        self.main_took_it_at
            .is_some_and(|at| now.duration_since(at) < CLICK_GRACE)
    }
}

/// Clicking the icon focuses main first, so whether traffic was in front is read from the hand-over.
#[derive(Default)]
pub struct TrafficWindowState(Mutex<Focus>);

impl TrafficWindowState {
    fn focus(&self) -> std::sync::MutexGuard<'_, Focus> {
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
    window.on_window_event(move |event| match event {
        WindowEvent::CloseRequested { api, .. } => {
            tracing::info!(target: "traffic", "traffic window close requested, hiding");
            api.prevent_close();
            hide(&handle);
        }
        WindowEvent::Focused(focused) => handle
            .state::<TrafficWindowState>()
            .focus()
            .traffic_changed(*focused, Instant::now()),
        _ => {}
    });
}

/// From the main window's focus event.
pub fn main_focused(app: &AppHandle) {
    app.state::<TrafficWindowState>()
        .focus()
        .main_gained(Instant::now());
}

fn was_in_front(app: &AppHandle, window: &WebviewWindow) -> bool {
    window.is_focused().unwrap_or(false)
        || app
            .state::<TrafficWindowState>()
            .focus()
            .traffic_was_in_front(Instant::now())
}

/// The main window's icon: opens the window, brings it forward, or closes it if it was in front.
#[tauri::command]
pub fn traffic_window_toggle(app: AppHandle) {
    let Some(window) = traffic_window(&app) else {
        return;
    };
    let up = window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false);
    if up && was_in_front(&app, &window) {
        hide(&app);
    } else {
        show(&app);
    }
}

/// Shows and focuses the window; a hidden one opens beside the main window with a fresh capture.
pub fn show(app: &AppHandle) {
    let Some(window) = traffic_window(app) else {
        return;
    };
    let hidden = !window.is_visible().unwrap_or(false);
    if hidden {
        if let Err(e) = place_beside_main(app, &window) {
            tracing::warn!(target: "traffic", error = %e, "cannot place the traffic window");
        }
    }
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
    let _ = window.hide();
    app.state::<TrafficWindowState>().focus().traffic = false;
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
    let left = main_at.x - gap - width;
    let right = main_at.x + main_width + gap;
    let x = if left >= area.position.x {
        left
    } else if right + width <= area.position.x + area.size.width as i32 {
        right
    } else {
        return Ok(());
    };
    window.set_position(PhysicalPosition::new(x, main_at.y))
}

#[cfg(test)]
mod tests {
    use super::*;

    const MS: Duration = Duration::from_millis(1);

    #[test]
    fn a_click_that_takes_focus_from_traffic_finds_it_in_front() {
        let start = Instant::now();
        let mut focus = Focus::default();
        focus.traffic_changed(true, start);
        focus.traffic_changed(false, start + 100 * MS);
        focus.main_gained(start + 110 * MS);
        assert!(focus.traffic_was_in_front(start + 300 * MS));
    }

    #[test]
    fn main_gaining_focus_before_traffic_loses_it_is_the_same_hand_over() {
        let start = Instant::now();
        let mut focus = Focus::default();
        focus.traffic_changed(true, start);
        focus.main_gained(start + 100 * MS);
        focus.traffic_changed(false, start + 105 * MS);
        assert!(focus.traffic_was_in_front(start + 300 * MS));
    }

    #[test]
    fn focus_reaching_main_from_another_app_leaves_traffic_behind() {
        let start = Instant::now();
        let mut focus = Focus::default();
        focus.traffic_changed(true, start);
        focus.traffic_changed(false, start + 100 * MS);
        focus.main_gained(start + 100 * MS + HANDOVER);
        assert!(!focus.traffic_was_in_front(start + 600 * MS));
    }

    #[test]
    fn a_later_click_in_main_brings_traffic_forward() {
        let start = Instant::now();
        let mut focus = Focus::default();
        focus.traffic_changed(true, start);
        focus.traffic_changed(false, start + 100 * MS);
        focus.main_gained(start + 110 * MS);
        assert!(!focus.traffic_was_in_front(start + 110 * MS + CLICK_GRACE));
    }
}
