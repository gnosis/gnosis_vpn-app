//! Minimal client for the root daemon's Unix socket.
//!
//! The daemon speaks one JSON request and one JSON response per connection. The
//! request/response shapes live in [`super::protocol`] so the app does not need
//! to build against an unreleased client library to use them.

use gnosis_vpn_lib::socket::root::DEFAULT_PATH;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::UnixStream;

use std::path::{Path, PathBuf};

use super::protocol::{Request, Response};

pub const SERVICE_NOT_RUNNING: &str = "The Gnosis VPN service is not running";
pub const SERVICE_REFUSED: &str = "The Gnosis VPN service refused the request";
/// The daemon closes the connection without answering unknown commands, which is
/// how a version without the traffic API reacts to one.
pub const SERVICE_UNSUPPORTED: &str =
    "This Gnosis VPN version does not support traffic capture; update the client";

pub async fn call(request: &Request<'_>) -> Result<Response, String> {
    call_at(&PathBuf::from(DEFAULT_PATH), request).await
}

async fn call_at(path: &Path, request: &Request<'_>) -> Result<Response, String> {
    if !path.exists() {
        return Err(SERVICE_NOT_RUNNING.to_string());
    }
    let payload = serde_json::to_string(request)
        .map_err(|e| format!("Cannot encode traffic request: {e}"))?;

    let mut stream = UnixStream::connect(path)
        .await
        .map_err(|e| format!("Cannot reach the Gnosis VPN service: {e}"))?;
    stream
        .write_all(payload.as_bytes())
        .await
        .map_err(|e| format!("Cannot send traffic request: {e}"))?;
    stream
        .flush()
        .await
        .map_err(|e| format!("Cannot send traffic request: {e}"))?;
    // The daemon reads a single line and answers once the request side closes.
    stream
        .shutdown()
        .await
        .map_err(|e| format!("Cannot finish traffic request: {e}"))?;

    let mut body = String::new();
    stream
        .read_to_string(&mut body)
        .await
        .map_err(|e| format!("Cannot read traffic response: {e}"))?;
    if body.trim().is_empty() {
        return Err(SERVICE_UNSUPPORTED.to_string());
    }
    match serde_json::from_str::<Response>(&body) {
        Ok(Response::TrafficDenied) => Err(SERVICE_REFUSED.to_string()),
        Ok(response) => Ok(response),
        Err(e) => Err(format!("Cannot decode traffic response: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::UnixListener;

    use std::sync::atomic::{AtomicU32, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    /// Distinguishes sockets bound by tests running in the same process; the
    /// clock alone is too coarse for that.
    static NEXT_SOCKET: AtomicU32 = AtomicU32::new(0);

    fn socket_path() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let sequence = NEXT_SOCKET.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "gvpn-traffic-{}-{nanos}-{sequence}.sock",
            std::process::id()
        ))
    }

    /// Answers one connection with `reply`, after recording what was asked.
    async fn serve_once(listener: UnixListener, reply: &'static str) -> String {
        let (mut stream, _) = listener.accept().await.expect("accept");
        let mut request = String::new();
        stream.read_to_string(&mut request).await.expect("read");
        stream.write_all(reply.as_bytes()).await.expect("write");
        request
    }

    /// Binds before the client runs, so the socket is visible to it.
    fn listener(path: &Path) -> UnixListener {
        UnixListener::bind(path).expect("bind")
    }

    #[tokio::test]
    async fn sends_the_command_and_parses_the_answer() {
        let path = socket_path();
        let listener = listener(&path);
        let server =
            tokio::spawn(async move { serve_once(listener, r#"{"TrafficInterfaces":[]}"#).await });
        let request = Request::TrafficInterfaces;
        let response = call_at(&path, &request).await.expect("response");
        assert!(matches!(response, Response::TrafficInterfaces(_)));
        assert_eq!(server.await.expect("server"), r#""TrafficInterfaces""#);
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn an_empty_answer_means_the_daemon_has_no_traffic_api() {
        let path = socket_path();
        let listener = listener(&path);
        let server = tokio::spawn(async move { serve_once(listener, "").await });
        let request = Request::TrafficInterfaces;
        let error = call_at(&path, &request).await.expect_err("unsupported");
        assert_eq!(error, SERVICE_UNSUPPORTED);
        server.await.expect("server");
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn a_refusal_surfaces_without_details() {
        let path = socket_path();
        let listener = listener(&path);
        let server = tokio::spawn(async move { serve_once(listener, r#""TrafficDenied""#).await });
        let request = Request::TrafficStop(&super::super::protocol::StopRequest { session_id: 1 });
        let error = call_at(&path, &request).await.expect_err("denied");
        assert_eq!(error, SERVICE_REFUSED);
        server.await.expect("server");
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn a_missing_socket_reports_the_service_as_down() {
        let path = socket_path();
        let request = Request::TrafficInterfaces;
        let error = call_at(&path, &request).await.expect_err("missing");
        assert_eq!(error, SERVICE_NOT_RUNNING);
    }
}
