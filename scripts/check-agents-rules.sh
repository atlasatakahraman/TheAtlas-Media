#!/usr/bin/env bash
set -euo pipefail

command -v rg >/dev/null 2>&1 || { echo "ripgrep (rg) is required but not installed. Please install it."; exit 1; }

RG_OPTS=(--hidden --no-ignore-vcs --glob '!node_modules/**' --glob '!.next/**' --glob '!out/**' --glob '!target/**' --glob '!dist/**' --glob '!.git/**')

# Guard against empty root-level app/ directory shadowing src/app/
# (Next.js prefers root app/ over src/app/ when both exist)
if [ -d app ]; then
    file_count=$(find app -type f 2>/dev/null | wc -l)
    if [ "$file_count" -eq 0 ]; then
        echo "ERROR: Empty 'app/' directory at repo root shadows src/app/."
        echo "       Run 'rmdir app' to remove it."
        exit 1
    fi
    echo "WARN: 'app/' directory exists at repo root with $file_count file(s)."
    echo "      This shadows src/app/. Either move files to src/app/ or remove app/."
    exit 1
fi

FE_DIRS=()
[ -d app ]            && FE_DIRS+=(app)
[ -d components ]     && FE_DIRS+=(components)
[ -d src/app ]        && FE_DIRS+=(src/app)
[ -d src/components ] && FE_DIRS+=(src/components)
[ -d src/layout ]     && FE_DIRS+=(src/layout)

D8_DIRS=()
[ -d src/app ]    && D8_DIRS+=(src/app)
[ -d src/layout ] && D8_DIRS+=(src/layout)

echo "Checking for missing D8 verification stamp..."
if [ ${#D8_DIRS[@]} -gt 0 ]; then
    MISSING_STAMP_FILES=$(rg "${RG_OPTS[@]}" --files-without-match "next@16.2.9 — verified against node_modules/next/dist/docs/" -g "*.tsx" "${D8_DIRS[@]}" 2>/dev/null || true)
    if [ -n "$MISSING_STAMP_FILES" ]; then
      echo "The following .tsx files are missing the Next 16 verification stamp:"
      echo "$MISSING_STAMP_FILES"
      exit 1
    fi
fi

if [ ${#FE_DIRS[@]} -gt 0 ]; then
    echo "Checking for Server-only APIs leaking into static export..."
    rg "${RG_OPTS[@]}" -n "from ['\"]next/headers['\"]" "${FE_DIRS[@]}" && { echo "Violation found"; exit 1; } || true
    rg "${RG_OPTS[@]}" -n "from ['\"]next/server['\"]" "${FE_DIRS[@]}" && { echo "Violation found"; exit 1; } || true
    rg "${RG_OPTS[@]}" -n "use server" "${FE_DIRS[@]}" && { echo "Violation found"; exit 1; } || true
    rg "${RG_OPTS[@]}" -n "export const dynamic" "${FE_DIRS[@]}" && { echo "Violation found"; exit 1; } || true
    rg "${RG_OPTS[@]}" -n "export const revalidate" "${FE_DIRS[@]}" && { echo "Violation found"; exit 1; } || true
    rg "${RG_OPTS[@]}" -n "export const fetchCache" "${FE_DIRS[@]}" && { echo "Violation found"; exit 1; } || true
    rg "${RG_OPTS[@]}" -n "unstable_after" "${FE_DIRS[@]}" && { echo "Violation found"; exit 1; } || true

    echo "Checking for Old Next idioms..."
    rg "${RG_OPTS[@]}" -n "from ['\"]next/router['\"]" "${FE_DIRS[@]}" && { echo "Violation found"; exit 1; } || true

    echo "Checking for Image without unoptimized..."
    rg "${RG_OPTS[@]}" -n "<Image" "${FE_DIRS[@]}" && { echo "Violation found"; exit 1; } || true
fi

echo "Checking for Old Next idioms globally..."
rg "${RG_OPTS[@]}" -n "getServerSideProps|getStaticProps|getInitialProps" . || true
rg "${RG_OPTS[@]}" -n "middleware\.(ts|js)$" . || true

echo "Checking for Tauri APIs that don't exist in v2..."
rg "${RG_OPTS[@]}" -n "tauri::api::" src-tauri || true
rg "${RG_OPTS[@]}" -n "@tauri-apps/api/tauri" . || true

echo "All checks passed."
exit 0
