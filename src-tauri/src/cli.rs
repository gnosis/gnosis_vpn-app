use clap::Parser;
use tauri::State;
use url::Url;

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
}

impl Cli {
    /// Parses argv, dropping the `-psn_…` process serial older macOS LaunchServices passes.
    pub fn from_env() -> Self {
        Self::parse_from(std::env::args().filter(|a| !a.starts_with("-psn_")))
    }
}

#[tauri::command]
pub fn get_log_uploader_website_url(state: State<Cli>) -> String {
    state.log_uploader_website_url.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::CommandFactory;

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
}
