/// OS release name from os-release(5), e.g. "Ubuntu 24.04.3 LTS".
pub fn os_distribution() -> Option<String> {
    ["/etc/os-release", "/usr/lib/os-release"]
        .iter()
        .find_map(|path| std::fs::read_to_string(path).ok())
        .and_then(|contents| os_release_pretty_name(&contents))
}

/// `PRETTY_NAME` from an os-release(5) file, falling back to `NAME VERSION_ID`.
fn os_release_pretty_name(contents: &str) -> Option<String> {
    let field = |key: &str| {
        contents.lines().find_map(|line| {
            let value = line.strip_prefix(key)?.strip_prefix('=')?.trim();
            let value = value.trim_matches(|c| c == '"' || c == '\'');
            (!value.is_empty()).then(|| value.to_string())
        })
    };
    field("PRETTY_NAME").or_else(|| {
        let name = field("NAME")?;
        Some(match field("VERSION_ID") {
            Some(version) => format!("{name} {version}"),
            None => name,
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn os_release_pretty_name_prefers_pretty_name() {
        let contents =
            "NAME=\"Ubuntu\"\nVERSION_ID=\"24.04\"\nPRETTY_NAME=\"Ubuntu 24.04.3 LTS\"\n";
        assert_eq!(
            os_release_pretty_name(contents).as_deref(),
            Some("Ubuntu 24.04.3 LTS")
        );
    }

    #[test]
    fn os_release_pretty_name_falls_back_to_name_and_version() {
        assert_eq!(
            os_release_pretty_name("NAME=NixOS\nVERSION_ID='25.11'\n").as_deref(),
            Some("NixOS 25.11")
        );
        assert_eq!(
            os_release_pretty_name("NAME=Arch Linux\n").as_deref(),
            Some("Arch Linux")
        );
        assert_eq!(os_release_pretty_name("ID=foo\n"), None);
    }
}
