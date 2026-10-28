//! Traffic visualization: daemon source, retained model, projection and window.
//!
//! Capture runs in the privileged root daemon. This module only reads per-endpoint
//! one-second aggregates from it, keeps presentation state and projects what the
//! window asks for. Nothing here sees a packet, and remote addresses never reach
//! the webview.

mod daemon;
mod model;
mod protocol;

use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;

pub use model::{Endpoint, Frame, MAX_ENDPOINTS, WINDOW_SECONDS};
pub use protocol::Interface;

/// What the window shows about the capture itself, as opposed to its data.
#[derive(Clone, Debug, Default, Serialize)]
pub struct CaptureStatus {
    pub active: bool,
    pub interface: Option<String>,
    pub error: Option<String>,
    /// Set once when capture ended without the user stopping it.
    pub ended: Option<String>,
}

#[derive(Serialize)]
pub struct FrameResponse {
    pub frame: Frame,
    pub capture: CaptureStatus,
    /// The daemon discarded batches this app had not read; the view has holes.
    pub gap: bool,
}

struct Session {
    id: u64,
}

#[derive(Default)]
struct Inner {
    model: model::Model,
    session: Option<Session>,
    cursor: u64,
    gap: bool,
    capture: CaptureStatus,
}

#[derive(Default)]
pub struct TrafficState {
    inner: Arc<Mutex<Inner>>,
}

impl TrafficState {
    pub fn new() -> Self {
        Self::default()
    }
}

/// Lists the interfaces the daemon is willing to capture on.
#[tauri::command]
pub async fn traffic_interfaces() -> Result<Vec<Interface>, String> {
    match daemon::call(&protocol::Request::TrafficInterfaces).await? {
        protocol::Response::TrafficInterfaces(interfaces) => Ok(interfaces),
        _ => Err("unexpected response from the Gnosis VPN service".to_string()),
    }
}

/// Starts a capture session, replacing any previous one.
#[tauri::command]
pub async fn traffic_start(
    interface_id: String,
    state: State<'_, TrafficState>,
) -> Result<CaptureStatus, String> {
    let request = protocol::StartRequest {
        interface_id: interface_id.clone(),
    };
    let result = daemon::call(&protocol::Request::TrafficStart(&request)).await;

    // A daemon from another protocol version would answer with shapes this app
    // cannot read. Refuse the session instead of showing an empty chart.
    if let Ok(protocol::Response::TrafficStart(Ok(started))) = &result {
        if let Some(reason) = incompatible_protocol(started.protocol) {
            tracing::warn!(target: "traffic", error = %reason, "traffic protocol mismatch");
            let stop = protocol::StopRequest {
                session_id: started.session_id,
            };
            if let Err(e) = daemon::call(&protocol::Request::TrafficStop(&stop)).await {
                tracing::warn!(target: "traffic", error = %e, "cannot stop an incompatible traffic session");
            }
            let mut inner = state.inner.lock().await;
            inner.session = None;
            inner.capture = failed(&reason);
            return Err(reason);
        }
    }

    let mut inner = state.inner.lock().await;

    match result {
        Ok(protocol::Response::TrafficStart(Ok(started))) => {
            tracing::info!(
                target: "traffic",
                session = started.session_id,
                interface = %started.interface.id,
                "traffic session started"
            );
            inner.model.reset();
            inner.cursor = 0;
            inner.gap = false;
            inner.session = Some(Session {
                id: started.session_id,
            });
            inner.capture = CaptureStatus {
                active: true,
                interface: Some(started.interface.name),
                error: None,
                ended: None,
            };
            Ok(inner.capture.clone())
        }
        Ok(protocol::Response::TrafficStart(Err(reason))) => {
            tracing::warn!(target: "traffic", error = %reason, "traffic capture refused");
            inner.session = None;
            inner.capture = failed(&reason);
            Err(reason)
        }
        Ok(_) => {
            let reason = "unexpected response from the Gnosis VPN service".to_string();
            inner.session = None;
            inner.capture = failed(&reason);
            Err(reason)
        }
        Err(reason) => {
            tracing::warn!(target: "traffic", error = %reason, "traffic capture unavailable");
            inner.session = None;
            inner.capture = failed(&reason);
            Err(reason)
        }
    }
}

/// Reads pending aggregates and projects the rolling window.
#[tauri::command]
pub async fn traffic_frame(state: State<'_, TrafficState>) -> Result<FrameResponse, String> {
    let mut inner = state.inner.lock().await;
    let session_id = inner.session.as_ref().map(|session| session.id);
    let mut stop_session = None;

    if let Some(session_id) = session_id {
        let request = protocol::ReadRequest {
            session_id,
            cursor: inner.cursor,
        };
        match daemon::call(&protocol::Request::TrafficRead(&request)).await {
            Ok(protocol::Response::TrafficRead(read)) => {
                let mut mismatch = None;
                for batch in &read.batches {
                    if let Err(reason) = inner.model.ingest(batch) {
                        mismatch = Some(reason);
                        break;
                    }
                }
                inner.cursor = read.cursor;
                inner.gap |= read.gap;
                inner.capture.active = read.active;
                if let Some(reason) = mismatch {
                    tracing::warn!(target: "traffic", reason = %reason, "traffic protocol mismatch");
                    inner.capture = failed(&reason);
                    inner.session = None;
                    stop_session = Some(session_id);
                } else if let Some(reason) = read.ended {
                    tracing::warn!(target: "traffic", reason = %reason, "traffic capture ended");
                    inner.capture.ended = Some(reason);
                    inner.session = None;
                }
            }
            Ok(_) => {
                inner.capture = failed("unexpected response from the Gnosis VPN service");
                inner.session = None;
            }
            Err(reason) => {
                inner.capture = failed(&reason);
                inner.session = None;
            }
        }
    }

    let response = FrameResponse {
        frame: inner.model.project(),
        capture: inner.capture.clone(),
        gap: inner.gap,
    };
    drop(inner);

    if let Some(session_id) = stop_session {
        let stop = protocol::StopRequest { session_id };
        if let Err(e) = daemon::call(&protocol::Request::TrafficStop(&stop)).await {
            tracing::warn!(target: "traffic", error = %e, "cannot stop an incompatible traffic session");
        }
    }
    Ok(response)
}

/// Ends the capture session and forgets its history.
#[tauri::command]
pub async fn traffic_stop(state: State<'_, TrafficState>) -> Result<(), String> {
    stop_inner(&state.inner).await;
    Ok(())
}

fn failed(reason: &str) -> CaptureStatus {
    CaptureStatus {
        active: false,
        interface: None,
        error: Some(reason.to_string()),
        ended: None,
    }
}

/// Names both versions when the daemon speaks another traffic protocol.
fn incompatible_protocol(version: u16) -> Option<String> {
    (version != protocol::PROTOCOL_VERSION).then(|| {
        format!(
            "The Gnosis VPN service speaks traffic protocol {version}, this app needs {}. Update the client and app together.",
            protocol::PROTOCOL_VERSION
        )
    })
}

async fn stop_inner(inner: &Arc<Mutex<Inner>>) {
    let mut guard = inner.lock().await;
    if let Some(session) = guard.session.take() {
        let request = protocol::StopRequest {
            session_id: session.id,
        };
        match daemon::call(&protocol::Request::TrafficStop(&request)).await {
            Ok(protocol::Response::TrafficStop(stop)) if !stop.stopped => {
                tracing::debug!(target: "traffic", session = session.id, "traffic session was already gone");
            }
            Ok(_) => {}
            Err(e) => {
                tracing::warn!(target: "traffic", error = %e, "cannot stop traffic capture");
            }
        }
        tracing::info!(target: "traffic", session = session.id, "traffic session stopped");
    }
    guard.model.reset();
    guard.cursor = 0;
    guard.gap = false;
    guard.capture = CaptureStatus::default();
}

/// Stops capture without a command invocation, e.g. when the window closes.
pub async fn stop(app: &AppHandle) {
    if let Some(state) = app.try_state::<TrafficState>() {
        stop_inner(&state.inner).await;
    }
}

/// Shows the traffic window and tells it to start a fresh session.
pub fn show(app: &AppHandle) {
    let Some(window) = app.get_webview_window("traffic") else {
        tracing::warn!(target: "traffic", "traffic window missing");
        return;
    };
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
    // The webview outlives hiding, so it must be told to start over.
    if let Err(e) = window.emit_to("traffic", "traffic:open", ()) {
        tracing::warn!(target: "traffic", error = %e, "cannot notify traffic window");
    }
}

/// Opens the traffic window from the frontend, matching the tray entry point.
#[tauri::command]
pub fn open_traffic_window(app: AppHandle) {
    show(&app);
}

/// Interface the window should select when it opens: the egress interface, or
/// the only candidate.
pub fn preferred_interface(interfaces: &[Interface]) -> Option<&Interface> {
    interfaces
        .iter()
        .find(|interface| interface.is_default)
        .or_else(|| (interfaces.len() == 1).then(|| &interfaces[0]))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn interface(name: &str, is_default: bool) -> Interface {
        Interface {
            id: name.to_string(),
            name: name.to_string(),
            addresses: Vec::new(),
            is_default,
        }
    }

    #[test]
    fn the_egress_interface_is_preferred() {
        let interfaces = [interface("en1", false), interface("en0", true)];
        assert_eq!(
            preferred_interface(&interfaces).map(|i| i.id.as_str()),
            Some("en0")
        );
    }

    #[test]
    fn a_single_candidate_is_preferred() {
        let interfaces = [interface("wlan0", false)];
        assert_eq!(
            preferred_interface(&interfaces).map(|i| i.id.as_str()),
            Some("wlan0")
        );
    }

    #[test]
    fn an_ambiguous_set_without_egress_prefers_nothing() {
        let interfaces = [interface("en0", false), interface("en1", false)];
        assert!(preferred_interface(&interfaces).is_none());
        assert!(preferred_interface(&[]).is_none());
    }

    #[test]
    fn another_protocol_version_names_both_sides() {
        assert!(incompatible_protocol(protocol::PROTOCOL_VERSION).is_none());
        let error = incompatible_protocol(protocol::PROTOCOL_VERSION + 1).expect("mismatch");
        assert!(error.contains("traffic protocol 4"), "{error}");
        assert!(error.contains("needs 3"), "{error}");
    }
}
