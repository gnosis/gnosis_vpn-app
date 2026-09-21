//! Spawns the toolkit's `gnosis_vpn-update` binary: the source of truth for the installed
//! package version and update manifests. stdout is NDJSON; the exit code is not gated on.

use serde::{Deserialize, Serialize};

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use crate::settings::UpdateChannel;

/// Where the installers put it: the macOS pkg at the first (the path its sudoers entries name),
/// the Linux .deb at the second. A fixed list, not `$PATH`, so the environment cannot redirect us.
const CANDIDATE_PATHS: &[&str] = &[
    "/usr/local/bin/gnosis_vpn-update",
    "/usr/bin/gnosis_vpn-update",
];

/// `check-update` fetches two files with a 30 s request timeout each; leave headroom.
const TIMEOUT: Duration = Duration::from_secs(75);

/// The installed updater, if any.
pub fn locate() -> Option<PathBuf> {
    CANDIDATE_PATHS
        .iter()
        .map(Path::new)
        .find(|p| p.is_file())
        .map(Path::to_path_buf)
}

#[derive(Debug)]
pub enum ToolkitError {
    /// No binary at any known path.
    NotInstalled,
    /// It ran and spoke JSON, but not the shape this app needs — a toolkit older than 0.4,
    /// before `check-update` carried the manifest and `version` the package version.
    TooOld,
    TimedOut,
    /// Could not run it, or it produced nothing usable; carries the detail for the log.
    Failed(String),
}

impl std::fmt::Display for ToolkitError {
    /// The frontend branches on these strings, so the structured cases stay as bare codes.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ToolkitError::NotInstalled => f.write_str("ToolkitMissing"),
            ToolkitError::TooOld => f.write_str("ToolkitTooOld"),
            ToolkitError::TimedOut => f.write_str("ToolkitTimedOut"),
            ToolkitError::Failed(msg) => write!(f, "Toolkit: {msg}"),
        }
    }
}

/// `gnosis_vpn-update version`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ToolkitInfo {
    /// The updater's own version.
    pub version: String,
    /// The installed client package, from `/etc/gnosisvpn/version.txt`; `None` when that file
    /// is missing — the binary still exits 0 in that case.
    pub package_version: Option<String>,
}

/// An update manifest, exactly as the binary re-emits it. Fields stay wire strings rather than
/// `Url`/`DateTime`/`ByteSize` — the app only ever displays and forwards them.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Manifest {
    pub schema_version: u32,
    pub generated_at: String,
    pub channels: ManifestChannels,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ManifestChannels {
    pub stable: Option<ChannelRelease>,
    pub snapshot: Option<ChannelRelease>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChannelRelease {
    pub version: String,
    pub published_at: String,
    pub download_url: String,
    /// The published manifest carries a number, the binary re-emits `ByteSize`'s string
    /// (`"117.7 MiB"`). Accept either; always hand on the string the frontend schema expects.
    #[serde(deserialize_with = "string_or_number")]
    pub size_bytes: String,
    pub sha256: String,
    pub artifact_signature: String,
    pub release_notes: String,
    pub min_os_version: String,
    pub min_app_version: String,
}

fn string_or_number<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Raw {
        Text(String),
        Number(u64),
    }
    Ok(match Raw::deserialize(d)? {
        Raw::Text(s) => s,
        Raw::Number(n) => n.to_string(),
    })
}

/// The decision `check-update` reached, as the frontend receives it: `kind`-tagged, the same
/// shape `InstallStatus` uses, so the frontend has one enum style to deal with.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind")]
pub enum CheckOutcome {
    UpToDate {
        current: String,
    },
    Available {
        current: String,
        release: Box<ChannelRelease>,
    },
    NoReleaseForChannel {
        channel: UpdateChannel,
    },
    VpnNotConnected,
    IntegrityError {
        error: String,
    },
    Error {
        error: String,
    },
}

/// `gnosis_vpn-update check-update`.
#[derive(Clone, Debug, Serialize)]
pub struct CheckResult {
    /// The channel that was checked — the one asked for, or the one the binary inferred from
    /// the installed version.
    pub channel: UpdateChannel,
    pub outcome: CheckOutcome,
    /// Both channel entries, exactly as fetched. Absent on the three outcomes that never got one
    /// (`VpnNotConnected`, `IntegrityError`, `Error`) — the frontend then keeps its last known.
    pub manifest: Option<Manifest>,
}

/// The same decision as the binary prints it: serde's externally-tagged encoding, e.g.
/// `{"Available":{…}}`, `{"NoReleaseForChannel":"snapshot"}` or the bare `"VpnNotConnected"`.
#[derive(Debug, Deserialize)]
enum WireOutcome {
    UpToDate {
        current: String,
    },
    Available {
        current: String,
        release: Box<ChannelRelease>,
    },
    NoReleaseForChannel(UpdateChannel),
    VpnNotConnected,
    IntegrityError(String),
    Error(String),
}

impl From<WireOutcome> for CheckOutcome {
    fn from(w: WireOutcome) -> Self {
        match w {
            WireOutcome::UpToDate { current } => CheckOutcome::UpToDate { current },
            WireOutcome::Available { current, release } => {
                CheckOutcome::Available { current, release }
            }
            WireOutcome::NoReleaseForChannel(channel) => {
                CheckOutcome::NoReleaseForChannel { channel }
            }
            WireOutcome::VpnNotConnected => CheckOutcome::VpnNotConnected,
            WireOutcome::IntegrityError(error) => CheckOutcome::IntegrityError { error },
            WireOutcome::Error(error) => CheckOutcome::Error { error },
        }
    }
}

#[derive(Debug, Deserialize)]
struct WireCheckResult {
    channel: UpdateChannel,
    outcome: WireOutcome,
    #[serde(default)]
    manifest: Option<Manifest>,
}

impl From<WireCheckResult> for CheckResult {
    fn from(w: WireCheckResult) -> Self {
        CheckResult {
            channel: w.channel,
            outcome: w.outcome.into(),
            manifest: w.manifest,
        }
    }
}

/// Runs the binary and returns its stdout, whatever the exit code.
async fn run(args: &[&str]) -> Result<String, ToolkitError> {
    let path = locate().ok_or(ToolkitError::NotInstalled)?;
    let child = tokio::process::Command::new(&path)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // A timeout must not leave a stray updater running.
        .kill_on_drop(true)
        .output();

    let output = tokio::time::timeout(TIMEOUT, child)
        .await
        .map_err(|_| ToolkitError::TimedOut)?
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound => ToolkitError::NotInstalled,
            _ => ToolkitError::Failed(e.to_string()),
        })?;

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    if stdout.trim().is_empty() {
        // Nothing on the protocol channel: the only time stderr is worth quoting.
        let stderr = String::from_utf8_lossy(&output.stderr);
        let tail = stderr.lines().rev().take(3).collect::<Vec<_>>();
        return Err(ToolkitError::Failed(format!(
            "no output ({}); {}",
            output.status,
            tail.into_iter().rev().collect::<Vec<_>>().join(" | ")
        )));
    }
    Ok(stdout)
}

/// The protocol is one JSON value per line; take the last, tolerating stray blank lines.
fn last_json_line(stdout: &str) -> Result<serde_json::Value, ToolkitError> {
    let line = stdout
        .lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .ok_or_else(|| ToolkitError::Failed("empty output".to_string()))?;
    serde_json::from_str(line)
        .map_err(|e| ToolkitError::Failed(format!("unparseable output: {e}: {line}")))
}

fn parse_version(stdout: &str) -> Result<ToolkitInfo, ToolkitError> {
    let value = last_json_line(stdout)?;
    // 0.4 added `package_version`, as a key that is present even when null. An older toolkit
    // prints only `version`, and cannot tell us what is installed.
    if value.get("package_version").is_none() {
        return Err(ToolkitError::TooOld);
    }
    serde_json::from_value(value).map_err(|e| ToolkitError::Failed(e.to_string()))
}

fn parse_check(stdout: &str) -> Result<CheckResult, ToolkitError> {
    let value = last_json_line(stdout)?;
    // Before 0.4 `check-update` printed the bare outcome; the `{channel, outcome, manifest}`
    // envelope is what makes it usable as a manifest source.
    if value.get("channel").is_none() || value.get("outcome").is_none() {
        return Err(ToolkitError::TooOld);
    }
    serde_json::from_value::<WireCheckResult>(value)
        .map(CheckResult::from)
        .map_err(|e| ToolkitError::Failed(e.to_string()))
}

/// `gnosis_vpn-update version`: the updater's version and the installed package's.
pub async fn version() -> Result<ToolkitInfo, ToolkitError> {
    // Explicit `--output json`: `version` alone is the human-readable form.
    parse_version(&run(&["version", "--output", "json"]).await?)
}

/// `gnosis_vpn-update check-update`. `channel: None` lets the binary infer it from the installed
/// version; `force` skips its VPN-connected gate, which is what "check anyway" means.
pub async fn check_update(
    channel: Option<UpdateChannel>,
    force: bool,
) -> Result<CheckResult, ToolkitError> {
    let mut args = vec!["check-update"];
    let name;
    if let Some(channel) = channel {
        name = channel_arg(channel);
        args.extend(["--channel", name]);
    }
    if force {
        args.push("--force");
    }
    parse_check(&run(&args).await?)
}

fn channel_arg(channel: UpdateChannel) -> &'static str {
    match channel {
        UpdateChannel::Stable => "stable",
        UpdateChannel::Snapshot => "snapshot",
    }
}

/// The updater's version and the installed package version, or why neither is available:
/// `"ToolkitMissing"` (not on disk) or `"ToolkitTooOld"` (predates the contract this app needs).
#[tauri::command]
pub async fn get_toolkit_version() -> Result<ToolkitInfo, String> {
    match version().await {
        Ok(info) => {
            tracing::debug!(target: "toolkit", version = %info.version, package_version = ?info.package_version, "toolkit version");
            Ok(info)
        }
        Err(e) => {
            // A machine without the toolkit is an expected state, not an error worth alarming on.
            match e {
                ToolkitError::NotInstalled => {
                    tracing::debug!(target: "toolkit", "toolkit not installed")
                }
                ref other => {
                    tracing::warn!(target: "toolkit", error = %other, "toolkit version failed")
                }
            }
            Err(e.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // One line, like the binary's own output: the parser reads the last stdout line.
    const RELEASE: &str = r#"{"version":"0.78.0","published_at":"2026-04-21T12:24:58Z","download_url":"https://download.gnosisvpn.io/stable/gnosisvpn_amd64.deb","size_bytes":"27.1 MiB","sha256":"b839afa4f389249d969f9f2be98720e8d3a3cc6b4f085a1ff54ab312950116fa","artifact_signature":"","release_notes":"notes","min_os_version":"22.04","min_app_version":"0.77.0"}"#;

    fn manifest_json() -> String {
        format!(
            r#"{{"schema_version":1,"generated_at":"2026-05-05T01:41:17Z","channels":{{"stable":{RELEASE},"snapshot":null}}}}"#
        )
    }

    #[test]
    fn version_parses_both_fields() {
        let info = parse_version(r#"{"version":"0.4.0","package_version":"0.78.0"}"#).unwrap();
        assert_eq!(info.version, "0.4.0");
        assert_eq!(info.package_version.as_deref(), Some("0.78.0"));
    }

    // The binary exits 0 with `null` when /etc/gnosisvpn/version.txt is missing; that is a
    // known state, not a parse failure.
    #[test]
    fn version_keeps_a_null_package_version() {
        let info = parse_version(r#"{"version":"0.4.0","package_version":null}"#).unwrap();
        assert!(info.package_version.is_none());
    }

    #[test]
    fn a_toolkit_without_package_version_is_too_old() {
        assert!(matches!(
            parse_version(r#"{"version":"0.3.1"}"#),
            Err(ToolkitError::TooOld)
        ));
    }

    #[test]
    fn check_available_carries_release_and_manifest() {
        let line = format!(
            r#"{{"channel":"stable","outcome":{{"Available":{{"current":"0.77.0","release":{RELEASE}}}}},"manifest":{}}}"#,
            manifest_json()
        );
        let result = parse_check(&line).unwrap();
        assert_eq!(result.channel, UpdateChannel::Stable);
        match result.outcome {
            CheckOutcome::Available { current, release } => {
                assert_eq!(current, "0.77.0");
                assert_eq!(release.version, "0.78.0");
            }
            other => panic!("unexpected: {other:?}"),
        }
        let manifest = result.manifest.expect("manifest attached");
        assert_eq!(manifest.channels.stable.unwrap().version, "0.78.0");
        assert!(manifest.channels.snapshot.is_none());
    }

    // The three outcomes that never fetched a manifest omit the key entirely.
    #[test]
    fn check_without_manifest_parses_each_bare_outcome() {
        let result = parse_check(r#"{"channel":"snapshot","outcome":"VpnNotConnected"}"#).unwrap();
        assert!(matches!(result.outcome, CheckOutcome::VpnNotConnected));
        assert!(result.manifest.is_none());

        let result =
            parse_check(r#"{"channel":"stable","outcome":{"IntegrityError":"bad sig"}}"#).unwrap();
        assert!(
            matches!(result.outcome, CheckOutcome::IntegrityError { ref error } if error == "bad sig")
        );

        let result = parse_check(r#"{"channel":"stable","outcome":{"Error":"offline"}}"#).unwrap();
        assert!(matches!(result.outcome, CheckOutcome::Error { ref error } if error == "offline"));
    }

    #[test]
    fn check_no_release_names_the_channel() {
        let line = format!(
            r#"{{"channel":"snapshot","outcome":{{"NoReleaseForChannel":"snapshot"}},"manifest":{}}}"#,
            manifest_json()
        );
        let result = parse_check(&line).unwrap();
        assert!(matches!(
            result.outcome,
            CheckOutcome::NoReleaseForChannel {
                channel: UpdateChannel::Snapshot
            }
        ));
    }

    #[test]
    fn a_bare_outcome_without_the_envelope_is_too_old() {
        assert!(matches!(
            parse_check(r#"{"UpToDate":{"current":"0.78.0"}}"#),
            Err(ToolkitError::TooOld)
        ));
    }

    #[test]
    fn takes_the_last_line_and_ignores_blank_ones() {
        let info =
            parse_version("\n{\"version\":\"0.4.0\",\"package_version\":\"1\"}\n\n").unwrap();
        assert_eq!(info.package_version.as_deref(), Some("1"));
    }

    // The published manifest has a number here; the binary re-emits a string. Both must land
    // as the string the frontend schema expects.
    #[test]
    fn size_bytes_accepts_number_or_string_and_emits_string() {
        let numeric = RELEASE.replace(r#""size_bytes":"27.1 MiB""#, r#""size_bytes":28369426"#);
        let release: ChannelRelease = serde_json::from_str(&numeric).unwrap();
        assert_eq!(release.size_bytes, "28369426");
        let release: ChannelRelease = serde_json::from_str(RELEASE).unwrap();
        assert_eq!(release.size_bytes, "27.1 MiB");
        let out = serde_json::to_value(&release).unwrap();
        assert!(out["size_bytes"].is_string());
    }

    // The frontend sees `kind`-tagged outcomes, the same style InstallStatus uses.
    #[test]
    fn outcome_serializes_kind_tagged() {
        let v = serde_json::to_value(CheckOutcome::VpnNotConnected).unwrap();
        assert_eq!(v, serde_json::json!({"kind": "VpnNotConnected"}));
        let v = serde_json::to_value(CheckOutcome::NoReleaseForChannel {
            channel: UpdateChannel::Snapshot,
        })
        .unwrap();
        assert_eq!(
            v,
            serde_json::json!({"kind": "NoReleaseForChannel", "channel": "snapshot"})
        );
        let v = serde_json::to_value(CheckOutcome::UpToDate {
            current: "0.78.0".to_string(),
        })
        .unwrap();
        assert_eq!(
            v,
            serde_json::json!({"kind": "UpToDate", "current": "0.78.0"})
        );
    }

    #[test]
    fn error_codes_are_stable_strings() {
        assert_eq!(ToolkitError::NotInstalled.to_string(), "ToolkitMissing");
        assert_eq!(ToolkitError::TooOld.to_string(), "ToolkitTooOld");
        assert_eq!(ToolkitError::TimedOut.to_string(), "ToolkitTimedOut");
    }
}
