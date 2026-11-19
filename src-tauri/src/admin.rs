//! Runs shell commands as root behind the macOS administrator password dialog.

use std::process::Command;

/// The rejection a cancelled password dialog maps to; the frontend shows no error for it.
pub const CANCELLED: &str = "Cancelled";

/// Arguments travel through argv, so neither the command nor the prompt needs AppleScript escaping.
pub fn admin_command(shell: &str, prompt: &str) -> Command {
    let mut cmd = Command::new("/usr/bin/osascript");
    cmd.args([
        "-e",
        "on run argv",
        "-e",
        "do shell script (item 1 of argv) with prompt (item 2 of argv) with administrator privileges",
        "-e",
        "end run",
        "--",
        shell,
        prompt,
    ]);
    cmd
}

pub fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', r"'\''"))
}

/// osascript reports a cancelled dialog as error -128.
pub fn is_cancelled(stderr: &str) -> bool {
    stderr.contains("(-128)")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_single_quotes() {
        assert_eq!(shell_quote("/usr/local/bin/x"), "'/usr/local/bin/x'");
        assert_eq!(shell_quote("a'b"), r"'a'\''b'");
    }

    #[test]
    fn detects_cancel() {
        assert!(is_cancelled("0:73: execution error: User canceled. (-128)"));
        assert!(!is_cancelled(
            "0:73: execution error: Bootstrap failed: 5: Input/output error (5)"
        ));
    }
}
