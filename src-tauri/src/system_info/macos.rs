/// OS release name from `sw_vers`, e.g. "macOS 15.2".
pub fn os_distribution() -> Option<String> {
    let out = std::process::Command::new("sw_vers")
        .arg("-productVersion")
        .output()
        .ok()?;
    let version = String::from_utf8(out.stdout).ok()?.trim().to_string();
    (out.status.success() && !version.is_empty()).then(|| format!("macOS {version}"))
}
