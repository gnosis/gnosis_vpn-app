use clap::Parser;
use gnosis_vpn_lib::socket::root as root_socket;
use tauri::State;
use url::Url;

use std::path::PathBuf;
use std::sync::OnceLock;

/// Runtime configuration: CLI flag, else env var, else the default below.
#[derive(Parser, Debug)]
#[command(version)]
pub struct Cli {
    /// Endpoint log bundles are POSTed to.
    #[arg(
        long,
        env = "GNOSISVPN_LOG_UPLOAD_API_URL",
        default_value = "https://log-uploader.gnosisvpn.com/api/upload"
    )]
    pub log_upload_api_url: Url,

    /// Uploader website the UI links to for manual uploads.
    #[arg(
        long,
        env = "GNOSISVPN_LOG_UPLOADER_WEBSITE_URL",
        default_value = "https://log-uploader.gnosisvpn.com/"
    )]
    pub log_uploader_website_url: Url,

    /// Control socket of the Gnosis VPN client service.
    #[arg(
        long,
        env = root_socket::ENV_VAR,
        default_value = root_socket::DEFAULT_PATH
    )]
    pub socket_path: PathBuf,
}

/// Resolved once at startup so socket call sites need no plumbing.
static SOCKET_PATH: OnceLock<PathBuf> = OnceLock::new();

impl Cli {
    /// Parses argv, dropping the `-psn_…` process serial older macOS LaunchServices passes.
    pub fn from_env() -> Self {
        Self::parse_from(std::env::args().filter(|a| !a.starts_with("-psn_")))
    }
}

pub fn init_socket_path(path: PathBuf) {
    let _ = SOCKET_PATH.set(path);
}

/// Overridable so a dev run can talk to a root binary started with its own `--socket-path`.
pub fn socket_path() -> PathBuf {
    SOCKET_PATH
        .get()
        .cloned()
        .unwrap_or_else(|| PathBuf::from(root_socket::DEFAULT_PATH))
}

#[tauri::command]
pub fn get_log_uploader_website_url(state: State<Cli>) -> String {
    state.log_uploader_website_url.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::CommandFactory;

    /// The socket path tests mutate process env, so they must not overlap.
    static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    fn parse(args: &[&str]) -> Cli {
        Cli::try_parse_from(args).expect("valid arguments")
    }

    #[test]
    fn cli_definition_is_valid() {
        Cli::command().debug_assert();
    }

    #[test]
    fn defaults_apply_without_args() {
        let cli = Cli::try_parse_from(["app"]).unwrap();
        assert_eq!(
            cli.log_upload_api_url.as_str(),
            "https://log-uploader.gnosisvpn.com/api/upload"
        );
        assert_eq!(
            cli.log_uploader_website_url.as_str(),
            "https://log-uploader.gnosisvpn.com/"
        );
    }

    #[test]
    fn flag_overrides_default() {
        let cli = Cli::try_parse_from([
            "app",
            "--log-upload-api-url",
            "https://staging.example/api/upload",
        ])
        .unwrap();
        assert_eq!(
            cli.log_upload_api_url.as_str(),
            "https://staging.example/api/upload"
        );
    }

    #[test]
    fn rejects_invalid_url() {
        assert!(Cli::try_parse_from(["app", "--log-upload-api-url", "not-a-url"]).is_err());
    }

    #[test]
    fn socket_path_defaults_to_the_service_socket() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        std::env::remove_var(root_socket::ENV_VAR);
        assert_eq!(
            parse(&["app"]).socket_path,
            PathBuf::from(root_socket::DEFAULT_PATH)
        );
    }

    #[test]
    fn socket_path_comes_from_the_environment_when_no_flag_is_given() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        std::env::set_var(root_socket::ENV_VAR, "/tmp/local-run/gnosisvpn.sock");
        let cli = parse(&["app"]);
        std::env::remove_var(root_socket::ENV_VAR);
        assert_eq!(
            cli.socket_path,
            PathBuf::from("/tmp/local-run/gnosisvpn.sock")
        );
    }

    #[test]
    fn socket_path_flag_overrides_the_environment() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        std::env::set_var(root_socket::ENV_VAR, "/tmp/from-env/gnosisvpn.sock");
        let cli = parse(&["app", "--socket-path", "/tmp/from-flag/gnosisvpn.sock"]);
        std::env::remove_var(root_socket::ENV_VAR);
        assert_eq!(
            cli.socket_path,
            PathBuf::from("/tmp/from-flag/gnosisvpn.sock")
        );
    }

    #[test]
    fn unresolved_socket_path_falls_back_to_the_service_default() {
        // `init_socket_path` is not called by this test binary, so the fallback applies.
        assert_eq!(socket_path(), PathBuf::from(root_socket::DEFAULT_PATH));
    }
}
