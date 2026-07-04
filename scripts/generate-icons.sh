#!/usr/bin/env bash
# Renders the committed SVG icon sources to the PNGs bundled as Tauri resources.
# Run after changing an SVG; commit the regenerated PNGs.
# Requires rsvg-convert (librsvg, on the devShell PATH on Linux).
set -euo pipefail
cd "$(dirname "$0")/.."

app_svg_dir=src-tauri/icons/app-icons/svg
app_png_dir=src-tauri/icons/app-icons

for svg in "$app_svg_dir"/*.svg; do
    name=$(basename "$svg" .svg)
    rsvg-convert -w 512 -h 512 "$svg" -o "$app_png_dir/$name.png"
    echo "rendered $app_png_dir/$name.png"
done
