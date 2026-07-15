#!/usr/bin/env bash
set -euo pipefail

command -v rg >/dev/null 2>&1 || { echo "ripgrep (rg) is required but not installed. Please install it."; exit 1; }
command -v bun >/dev/null 2>&1 || { echo "bun is required but not found on PATH."; exit 1; }

node -v | grep -qE 'v(20\.(9|[1-9][0-9]+)|2[1-9])' || { echo "Node ≥ 20.9 required (Next.js 16)"; exit 1; }
bun -v
cargo --version | awk '{print $2}' | awk -F. '{exit !($1==1 && $2>=89)}' || { echo "Rust ≥ 1.89 required (Tauri 2.11 transitive deps: darling, serde_with, time, plist require ≥1.88; we pin to 1.89 for one-minor headroom)"; exit 1; }
bunx tsc --version
echo "Checking TypeScript types (full)..."
if command -v bun >/dev/null 2>&1; then
    bun tsc --noEmit || { echo "✗ TypeScript errors — fix before commit"; exit 1; }
fi
echo "Generating Icons for compat"
if [ -d src-tauri ] && command -v bun run icon >/dev/null 2>&1; then
    (cd src-tauri && cargo clippy --all-targets -- -D warnings) || { echo "✗ Couldn't create icons for compat"})
fi
echo "Checking Rust formatting..."
if [ -d src-tauri ] && command -v cargo >/dev/null 2>&1; then
    (cd src-tauri && cargo fmt --check) || { echo "✗ Rust formatting — run 'cd src-tauri && cargo fmt --all'"; exit 1; }
fi

echo "Checking Rust lints (clippy)..."
if [ -d src-tauri ] && command -v cargo >/dev/null 2>&1; then
    (cd src-tauri && cargo clippy --all-targets -- -D warnings) || { echo "✗ Rust clippy errors"; exit 1; }
fi
echo "Compatibility checks passed."
exit 0
