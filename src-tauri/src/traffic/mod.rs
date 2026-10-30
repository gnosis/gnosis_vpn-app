//! Traffic window backend: capture runs in the root daemon, remote addresses never reach the webview.

mod model;

use gnosis_vpn_ipc::traffic as protocol;
use gnosis_vpn_ipc::{CallError, Request, Response, ServiceError};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;

pub use model::{Endpoint, Frame, MAX_ENDPOINTS, WINDOW_SECONDS};

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

#[derive(Default)]
struct Inner {
    model: model::Model,
    session_id: Option<u64>,
    cursor: u64,
    gap: bool,
    capture: CaptureStatus,
}

#[derive(Default)]
pub struct TrafficState {
    inner: Mutex<Inner>,
}

#[tauri::command]
pub async fn traffic_interfaces() -> Result<Vec<protocol::Interface>, String> {
    match call(Request::TrafficInterfaces).await? {
        Response::TrafficInterfaces(interfaces) => Ok(interfaces),
        _ => Err("unexpected response from the Gnosis VPN service".to_string()),
    }
}

#[tauri::command]
pub async fn traffic_start(
    interface_id: String,
    state: State<'_, TrafficState>,
) -> Result<CaptureStatus, String> {
    let request = protocol::StartRequest {
        interface_id: interface_id.clone(),
    };
    let result = call(Request::TrafficStart(request)).await;

    // Another protocol version answers in shapes this app cannot read; refuse instead of an empty globe.
    if let Ok(Response::TrafficStart(protocol::StartReply::Started(started))) = &result {
        if let Some(reason) = incompatible_protocol(started.protocol) {
            tracing::warn!(target: "traffic", error = %reason, "traffic protocol mismatch");
            let stop = protocol::StopRequest {
                session_id: started.session_id,
            };
            if let Err(e) = call(Request::TrafficStop(stop)).await {
                tracing::warn!(target: "traffic", error = %e, "cannot stop an incompatible traffic session");
            }
            let mut inner = state.inner.lock().await;
            inner.session_id = None;
            inner.capture = failed(&reason);
            return Err(reason);
        }
    }

    let mut inner = state.inner.lock().await;

    match result {
        Ok(Response::TrafficStart(protocol::StartReply::Started(started))) => {
            tracing::info!(
                target: "traffic",
                session = started.session_id,
                interface = %started.interface.id,
                "traffic session started"
            );
            inner.model.reset();
            inner.cursor = 0;
            inner.gap = false;
            inner.session_id = Some(started.session_id);
            inner.capture = CaptureStatus {
                active: true,
                interface: Some(started.interface.name),
                error: None,
                ended: None,
            };
            Ok(inner.capture.clone())
        }
        Ok(Response::TrafficStart(protocol::StartReply::Failed { reason })) => {
            tracing::warn!(target: "traffic", error = %reason, "traffic capture refused");
            inner.session_id = None;
            inner.capture = failed(&reason);
            Err(reason)
        }
        Ok(_) => {
            let reason = "unexpected response from the Gnosis VPN service".to_string();
            inner.session_id = None;
            inner.capture = failed(&reason);
            Err(reason)
        }
        Err(reason) => {
            tracing::warn!(target: "traffic", error = %reason, "traffic capture unavailable");
            inner.session_id = None;
            inner.capture = failed(&reason);
            Err(reason)
        }
    }
}

#[tauri::command]
pub async fn traffic_frame(state: State<'_, TrafficState>) -> Result<FrameResponse, String> {
    let mut inner = state.inner.lock().await;
    let session_id = inner.session_id;
    let mut stop_session = None;

    if let Some(session_id) = session_id {
        let request = protocol::ReadRequest {
            session_id,
            cursor: inner.cursor,
        };
        match call(Request::TrafficRead(request)).await {
            Ok(Response::TrafficRead(read)) => {
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
                    inner.session_id = None;
                    stop_session = Some(session_id);
                } else if let Some(reason) = read.ended {
                    tracing::warn!(target: "traffic", reason = %reason, "traffic capture ended");
                    inner.capture.ended = Some(reason);
                    inner.session_id = None;
                }
            }
            Ok(_) => {
                inner.capture = failed("unexpected response from the Gnosis VPN service");
                inner.session_id = None;
            }
            Err(reason) => {
                inner.capture = failed(&reason);
                inner.session_id = None;
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
        if let Err(e) = call(Request::TrafficStop(stop)).await {
            tracing::warn!(target: "traffic", error = %e, "cannot stop an incompatible traffic session");
        }
    }
    Ok(response)
}

#[tauri::command]
pub async fn traffic_stop(state: State<'_, TrafficState>) -> Result<(), String> {
    stop_inner(&state.inner).await;
    Ok(())
}

const SERVICE_NOT_RUNNING: &str = "The Gnosis VPN service is not running";
const SERVICE_IN_USE: &str = "Another user on this computer is using Gnosis VPN";
const SERVICE_UNSUPPORTED: &str =
    "This Gnosis VPN version does not support traffic capture; update the client";

async fn call(request: Request) -> Result<Response, String> {
    crate::commands::on_socket(move |p| gnosis_vpn_ipc::call(p, request))
        .await
        .map_err(describe_error)
}

fn describe_error(error: CallError) -> String {
    match error {
        CallError::ServiceNotRunning => SERVICE_NOT_RUNNING.to_string(),
        CallError::Service(ServiceError::InUseByOtherUser) => SERVICE_IN_USE.to_string(),
        // A service without the traffic API cannot decode the request variant.
        CallError::Service(ServiceError::InvalidRequest { .. }) => SERVICE_UNSUPPORTED.to_string(),
        e => format!("Cannot reach the Gnosis VPN service: {e}"),
    }
}

fn failed(reason: &str) -> CaptureStatus {
    CaptureStatus {
        active: false,
        interface: None,
        error: Some(reason.to_string()),
        ended: None,
    }
}

fn incompatible_protocol(version: u16) -> Option<String> {
    (version != protocol::PROTOCOL_VERSION).then(|| {
        format!(
            "The Gnosis VPN service speaks traffic protocol {version}, this app needs {}. Update the client and app together.",
            protocol::PROTOCOL_VERSION
        )
    })
}

async fn stop_inner(inner: &Mutex<Inner>) {
    let mut guard = inner.lock().await;
    if let Some(session_id) = guard.session_id.take() {
        let request = protocol::StopRequest { session_id };
        match call(Request::TrafficStop(request)).await {
            Ok(Response::TrafficStop(stop)) if !stop.stopped => {
                tracing::debug!(target: "traffic", session = session_id, "traffic session was already gone");
            }
            Ok(_) => {}
            Err(e) => {
                tracing::warn!(target: "traffic", error = %e, "cannot stop traffic capture");
            }
        }
        tracing::info!(target: "traffic", session = session_id, "traffic session stopped");
    }
    guard.model.reset();
    guard.cursor = 0;
    guard.gap = false;
    guard.capture = CaptureStatus::default();
}

/// For the window-close and app-exit paths, which have no command `State`.
pub async fn stop(app: &AppHandle) {
    if let Some(state) = app.try_state::<TrafficState>() {
        stop_inner(&state.inner).await;
    }
}

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

/// Same path as the tray entry, so both start a fresh session.
#[tauri::command]
pub fn open_traffic_window(app: AppHandle) {
    show(&app);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_service_without_the_traffic_api_asks_for_a_client_update() {
        let error = CallError::Service(ServiceError::InvalidRequest {
            reason: "unknown variant `traffic_interfaces`".to_string(),
        });
        assert_eq!(describe_error(error), SERVICE_UNSUPPORTED);
    }

    #[test]
    fn another_users_worker_is_reported_as_in_use() {
        let error = CallError::Service(ServiceError::InUseByOtherUser);
        assert_eq!(describe_error(error), SERVICE_IN_USE);
    }

    #[test]
    fn a_missing_socket_reports_the_service_as_down() {
        assert_eq!(
            describe_error(CallError::ServiceNotRunning),
            SERVICE_NOT_RUNNING
        );
    }

    #[test]
    fn another_protocol_version_names_both_sides() {
        assert!(incompatible_protocol(protocol::PROTOCOL_VERSION).is_none());
        let theirs = protocol::PROTOCOL_VERSION + 1;
        let error = incompatible_protocol(theirs).expect("mismatch");
        assert!(
            error.contains(&format!("traffic protocol {theirs}")),
            "{error}"
        );
        assert!(
            error.contains(&format!("needs {}", protocol::PROTOCOL_VERSION)),
            "{error}"
        );
    }
}
