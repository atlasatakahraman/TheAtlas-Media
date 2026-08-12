#!/usr/bin/env bash
set -euo pipefail

# Build deb bundle first using the Linux build wrapper
bun run build:linux --bundles deb

DEB_FILE=$(find src-tauri/target/release/bundle/deb/ -name "*.deb" | head -n 1)

if [ -z "${DEB_FILE}" ]; then
	echo "Error: No .deb package found in src-tauri/target/release/bundle/deb/"
	exit 1
fi

mkdir -p packaging/arch
cp "${DEB_FILE}" packaging/arch/TheAtlas_Media_0.0.1_amd64.deb

cd packaging/arch
makepkg --printsrcinfo > .SRCINFO
makepkg -f -p PKGBUILD

echo "Successfully built Arch Linux package (.pkg.tar.zst) in packaging/arch/"
