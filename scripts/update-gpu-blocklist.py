#!/usr/bin/env python3
# Refreshes src/assets/gpu-blocklist/ from Chromium's GPU blocklist. Commit what it writes.
# Run by .github/workflows/update-gpu-blocklist.yaml; GITHUB_TOKEN, when set, lifts the API rate limit.
import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "src/assets/gpu-blocklist"
LIST_PATH = "gpu/config/software_rendering_list.json"
# GitHub's mirror shares chromium/src's commit hashes, and its API lists history without a login.
LATEST_COMMIT_API = f"https://api.github.com/repos/chromium/chromium/commits?path={LIST_PATH}&per_page=1"
RAW_URL = "https://raw.githubusercontent.com/chromium/chromium/{sha}/{path}"
COMMIT_URL = "https://chromium.googlesource.com/chromium/src/+/{sha}"


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "gnosis_vpn-app"})
    token = os.environ.get("GITHUB_TOKEN")
    if token and url.startswith("https://api.github.com/"):
        request.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def applies_to_linux(entry: dict) -> bool:
    return entry.get("os", {}).get("type", "any") in ("linux", "any")


def summarize(old: list, new: list, sha: str, subject: str) -> str:
    """Markdown listing which entries changed, Linux ones flagged since only those reach the app."""
    before = {e["id"]: e for e in old}
    after = {e["id"]: e for e in new}
    lines = [
        f"Chromium's GPU blocklist at [{sha[:12]}]({COMMIT_URL.format(sha=sha)}): {subject}",
        "",
        "Only entries that apply to Linux affect the app; `render/blocklist.rs` evaluates them.",
        "",
    ]
    changes = []
    for entry_id in sorted(before.keys() | after.keys()):
        old_entry, new_entry = before.get(entry_id), after.get(entry_id)
        if old_entry == new_entry:
            continue
        kind = "added" if old_entry is None else "removed" if new_entry is None else "changed"
        entry = new_entry or old_entry
        linux = any(applies_to_linux(e) for e in (old_entry, new_entry) if e)
        changes.append(f"- #{entry_id} {kind}{' **(Linux)**' if linux else ''}: {entry.get('description', '')}")
    lines += changes or ["- No entry changed (formatting or metadata only)."]
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--summary", type=Path, help="write a Markdown change summary here")
    args = parser.parse_args()

    commit = json.loads(fetch(LATEST_COMMIT_API))[0]
    sha = commit["sha"]
    subject = commit["commit"]["message"].splitlines()[0]
    revision_file = OUT / "REVISION"
    if revision_file.exists() and revision_file.read_text().strip() == sha:
        print(f"Up to date at {sha}")
        return 0

    raw_list = fetch(RAW_URL.format(sha=sha, path=LIST_PATH))
    new_entries = json.loads(raw_list)["entries"]
    if not new_entries:
        print("Refusing an empty list", file=sys.stderr)
        return 1
    license_text = fetch(RAW_URL.format(sha=sha, path="LICENSE"))

    list_file = OUT / "software_rendering_list.json"
    old_entries = json.loads(list_file.read_text())["entries"] if list_file.exists() else []
    OUT.mkdir(parents=True, exist_ok=True)
    list_file.write_bytes(raw_list)
    (OUT / "LICENSE").write_bytes(license_text)
    revision_file.write_text(f"{sha}\n")

    summary = summarize(old_entries, new_entries, sha, subject)
    print(summary, end="")
    if args.summary:
        args.summary.write_text(summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())
