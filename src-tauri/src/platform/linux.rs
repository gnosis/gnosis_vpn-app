use super::PlatformInterface;

pub struct LinuxPlatform;

impl PlatformInterface for LinuxPlatform {
    fn setup_system_tray() -> Result<(), String> {
        // System tray setup will be handled in the main Tauri application
        // This is just a placeholder for any Linux-specific setup
        Ok(())
    }
}

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
            let value = unquote(line.strip_prefix(key)?.strip_prefix('=')?.trim())?;
            (!value.is_empty()).then_some(value)
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

/// Decodes a shell-style os-release(5) value; `None` when its quoting is malformed.
fn unquote(raw: &str) -> Option<String> {
    let mut out = String::new();
    if let Some(rest) = raw.strip_prefix('\'') {
        let (inner, tail) = rest.split_once('\'')?;
        return tail.is_empty().then(|| inner.to_string());
    }
    if let Some(rest) = raw.strip_prefix('"') {
        let mut chars = rest.chars();
        loop {
            match chars.next()? {
                '"' => return chars.as_str().is_empty().then_some(out),
                '\\' => match chars.next()? {
                    c @ ('"' | '\\' | '`' | '$') => out.push(c),
                    c => out.extend(['\\', c]),
                },
                c => out.push(c),
            }
        }
    }
    let mut chars = raw.chars();
    while let Some(c) = chars.next() {
        out.push(if c == '\\' { chars.next()? } else { c });
    }
    Some(out)
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

    #[test]
    fn os_release_pretty_name_decodes_shell_escapes() {
        assert_eq!(
            os_release_pretty_name(r#"PRETTY_NAME="Foo \"Bar\"""#).as_deref(),
            Some(r#"Foo "Bar""#)
        );
        assert_eq!(
            os_release_pretty_name(r#"PRETTY_NAME="a \$b \\ \`c\` \d""#).as_deref(),
            Some(r"a $b \ `c` \d")
        );
        assert_eq!(
            os_release_pretty_name(r"PRETTY_NAME='C:\dir'").as_deref(),
            Some(r"C:\dir")
        );
        assert_eq!(
            os_release_pretty_name(r"PRETTY_NAME=Foo\ Bar").as_deref(),
            Some("Foo Bar")
        );
    }

    #[test]
    fn malformed_pretty_name_falls_back_to_name_and_version() {
        for pretty in [r#""Ubuntu"#, r#""Ubuntu\""#, r#""Ubuntu"x"#, "'Ubuntu"] {
            let contents = format!("PRETTY_NAME={pretty}\nNAME=Ubuntu\nVERSION_ID=24.04\n");
            assert_eq!(
                os_release_pretty_name(&contents).as_deref(),
                Some("Ubuntu 24.04"),
                "{pretty}"
            );
        }
    }
}
