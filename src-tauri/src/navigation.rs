//! Keeps every webview on the app's own pages; external http(s) URLs go to the system browser.

use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, Runtime, Url};
use tauri_plugin_opener::OpenerExt;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("navigation-guard")
        .on_navigation(|webview, url| {
            let dev_url = if tauri::is_dev() {
                webview.config().build.dev_url.as_ref()
            } else {
                None
            };
            if is_app_url(url, dev_url) {
                return true;
            }
            tracing::info!(%url, "blocked in-app navigation");
            if matches!(url.scheme(), "http" | "https") {
                if let Err(e) = webview.opener().open_url(url.as_str(), None::<&str>) {
                    tracing::warn!(%url, error = %e, "failed to open url in browser");
                }
            }
            false
        })
        .build()
}

fn is_app_url(url: &Url, dev_url: Option<&Url>) -> bool {
    url.scheme() == "tauri"
        || url.host_str() == Some("tauri.localhost")
        || dev_url.is_some_and(|dev| dev.origin() == url.origin())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn allows_app_urls() {
        assert!(is_app_url(&url("tauri://localhost/"), None));
        assert!(is_app_url(&url("tauri://localhost/index.html"), None));
        assert!(is_app_url(&url("http://tauri.localhost/"), None));
    }

    #[test]
    fn allows_dev_origin_only_when_given() {
        let dev = url("http://localhost:1420");
        assert!(is_app_url(
            &url("http://localhost:1420/index.html"),
            Some(&dev)
        ));
        assert!(!is_app_url(&url("http://localhost:1420/"), None));
        assert!(!is_app_url(&url("http://localhost:8080/"), Some(&dev)));
    }

    #[test]
    fn rejects_external_urls() {
        let dev = url("http://localhost:1420");
        for s in [
            "https://github.com/gnosis/gnosis_vpn-app/pull/123",
            "http://gnosisvpn.io/",
            "https://tauri.localhost.evil.com/",
            "file:///etc/passwd",
            "data:text/html,hi",
        ] {
            assert!(!is_app_url(&url(s), Some(&dev)), "{s}");
        }
    }
}
