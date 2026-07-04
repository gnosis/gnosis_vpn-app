# Derives the transparent-background tray SVGs from the app icon SVGs.
# Run after changing an app icon SVG, then run generate-icons.sh and commit
# the regenerated tray SVGs and PNGs.
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
APP = REPO / "src-tauri/icons/app-icons/svg"
TRAY = REPO / "src-tauri/icons/tray-icons/svg"
TRAY.mkdir(exist_ok=True)

# tray name -> app svg source
MAPPING = {
    "tray-icon-disconnected": "app-icon-disconnected",
    "tray-icon-disconnected-low-funds": "app-icon-disconnected-low-funds",
    "tray-icon-disconnected-out-of-funds": "app-icon-disconnected-out-of-funds",
    "tray-icon-connecting-1": "app-icon-connecting-1",
    "tray-icon-connecting-2": "app-icon-connecting-2",
    "tray-icon-connecting-low-funds-1": "app-icon-connecting-low-funds-1",
    "tray-icon-connecting-low-funds-2": "app-icon-connecting-low-funds-2",
    "tray-icon-connecting-out-of-funds-1": "app-icon-connecting-out-of-funds-1",
    "tray-icon-connecting-out-of-funds-2": "app-icon-connecting-out-of-funds-2",
    "tray-icon-connected": "app-icon-connected",
    "tray-icon-connected-low-funds": "app-icon-connected-low-funds",
    "tray-icon-connected-out-of-funds": "app-icon-connected-out-of-funds",
}

# Black-filled backdrop shapes (badge circle / wallet pill) start with M19x;
# the warning triangle's exclamation mark starts with M101.736. On the black
# dock background these read as gaps; on the transparent tray they must become
# cutouts (masks) or macOS template mode would render them as solid blobs.
BACKDROP = re.compile(r'^<path d="M19\d ')
EXCLAMATION = re.compile(r'^<path d="M101\.736 ')


def transform(lines):
    header, body, footer = lines[0], lines[1:-1], lines[-1]
    out = []
    backdrops = []
    exclamation = None
    seen_owl = False

    for line in body:
        s = line.strip()
        if s.startswith("<rect") and not seen_owl:
            continue  # background square
        if BACKDROP.match(s) and s.endswith('fill="black"/>'):
            backdrops.append(s)
            continue
        if EXCLAMATION.match(s) and s.endswith('fill="black"/>'):
            exclamation = s
            continue
        if s.startswith('<path d="M99.6523 '):  # warning triangle
            line = line.replace("/>", ' mask="url(#excl-cut)"/>')
        if not seen_owl and s.startswith("<path"):
            seen_owl = True
            if any(BACKDROP.match(l.strip()) for l in body):
                line = line.replace("/>", ' mask="url(#backdrop-cut)"/>')
        out.append(line)

    defs = []
    if backdrops:
        defs.append(
            '<mask id="backdrop-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="206" height="206">'
            '<rect width="206" height="206" fill="white"/>' + "".join(backdrops) + "</mask>"
        )
    if exclamation:
        defs.append(
            '<mask id="excl-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="206" height="206">'
            '<rect width="206" height="206" fill="white"/>' + exclamation + "</mask>"
        )
    return "\n".join([header, *defs, *out, footer]) + "\n"


for tray_name, app_name in MAPPING.items():
    lines = (APP / f"{app_name}.svg").read_text().rstrip("\n").split("\n")
    (TRAY / f"{tray_name}.svg").write_text(transform(lines))
    print(tray_name)
