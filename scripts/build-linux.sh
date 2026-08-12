#!/usr/bin/env bash
set -euo pipefail

# Script to prepare environment and build Linux packages (AppImage, deb, rpm) reliably across distributions.

CACHE_DIR="${HOME}/.cache/tauri"
mkdir -p "${CACHE_DIR}"

GTK_PLUGIN="${CACHE_DIR}/linuxdeploy-plugin-gtk.sh"

# If linuxdeploy-plugin-gtk.sh doesn't exist yet, download it from Tauri binary releases
if [ ! -f "${GTK_PLUGIN}" ]; then
	echo "Downloading linuxdeploy-plugin-gtk.sh..."
	curl -sSL "https://github.com/tauri-apps/binary-releases/releases/download/linuxdeploy-plugin-gtk/linuxdeploy-plugin-gtk.sh" -o "${GTK_PLUGIN}"
	chmod +x "${GTK_PLUGIN}"
fi

export GTK_PLUGIN="${GTK_PLUGIN}"

# Apply compatibility patches to linuxdeploy-plugin-gtk.sh using bun if needed
bun -e '
const fs = require("fs");
const path = process.env.GTK_PLUGIN;
if (!path || !fs.existsSync(path)) process.exit(0);
let content = fs.readFileSync(path, "utf8");

// Patch 1: Check if gdk_pixbuf_binarydir exists before copying
if (!content.includes("if [ -d \"$gdk_pixbuf_binarydir\" ]; then")) {
	content = content.replace(
		`copy_tree "$gdk_pixbuf_binarydir" "$APPDIR/"`,
		`if [ -d "$gdk_pixbuf_binarydir" ]; then copy_tree "$gdk_pixbuf_binarydir" "$APPDIR/"; fi`
	);
}

// Patch 2 & 3: Ensure loaders.cache parent dir exists and guard sed
if (!content.includes("mkdir -p \"$(dirname \"$APPDIR/$gdk_pixbuf_cache_file\")\"")) {
	content = content.replace(
		`"$gdk_pixbuf_query" > "$APPDIR/$gdk_pixbuf_cache_file"`,
		`mkdir -p "$(dirname "$APPDIR/$gdk_pixbuf_cache_file")"\n    "$gdk_pixbuf_query" > "$APPDIR/$gdk_pixbuf_cache_file" || true`
	);
}

if (!content.includes("if [ -f \"$APPDIR/$gdk_pixbuf_cache_file\" ]; then")) {
	content = content.replace(
		`sed -i "s|$gdk_pixbuf_moduledir/||g" "$APPDIR/$gdk_pixbuf_cache_file"`,
		`if [ -f "$APPDIR/$gdk_pixbuf_cache_file" ]; then sed -i "s|$gdk_pixbuf_moduledir/||g" "$APPDIR/$gdk_pixbuf_cache_file"; fi`
	);
}

fs.writeFileSync(path, content, "utf8");
'

# Export NO_STRIP=1 so linuxdeploy does not fail on modern ELF .relr.dyn sections
export NO_STRIP=1

echo "Building Tauri application for Linux..."
bun --bun tauri build "$@"
