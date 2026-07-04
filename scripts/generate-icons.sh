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

# macOS/Windows tray icons: transparent-background derivations of the app icons
# (macOS renders them alpha-only via template mode).
tray_svg_dir=src-tauri/icons/tray-icons/svg
tray_png_dir=src-tauri/icons/tray-icons

for svg in "$tray_svg_dir"/*.svg; do
    name=$(basename "$svg" .svg)
    rsvg-convert -w 46 -h 46 "$svg" -o "$tray_png_dir/$name.png"
    echo "rendered $tray_png_dir/$name.png"
done

# Linux tray icons: the app icon design as-is, at tray size.
linux_png_dir=src-tauri/icons/tray-icons/linux

for state in disconnected connected; do
    for suffix in "" "-low-funds" "-out-of-funds"; do
        rsvg-convert -w 201 -h 201 "$app_svg_dir/app-icon-$state$suffix.svg" -o "$linux_png_dir/$state$suffix.png"
        echo "rendered $linux_png_dir/$state$suffix.png"
    done
done
for suffix in "" "-low-funds" "-out-of-funds"; do
    rsvg-convert -w 201 -h 201 "$app_svg_dir/app-icon-connecting$suffix-1.svg" -o "$linux_png_dir/connecting$suffix.png"
    echo "rendered $linux_png_dir/connecting$suffix.png"
done
