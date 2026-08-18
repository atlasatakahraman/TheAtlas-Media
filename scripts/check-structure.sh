#!/usr/bin/env bash
set -euo pipefail

# Structural conventions for the component and page units.
#
# The rules themselves are in CLAUDE.md; this script is what makes them hold.
# Everything needing the nav registry lives in scripts/check-registry.ts, which
# runs under bun so it can import the registry directly instead of parsing it.

FAILED=0

fail() {
    echo "  - $1"
    FAILED=1
}

# ── 1. src/components/ui/ stays flat vendored shadcn ─────────────────────────
#
# Not a style rule: the shadcn CLI owns that directory and can overwrite it on
# an add or update. A custom component planted inside would be deleted without
# warning, so subdirectories are refused outright. Ours go in components/custom/.

echo "Checking src/components/ui/ is flat vendored shadcn..."
if [ -d src/components/ui ]; then
    while IFS= read -r dir; do
        [ -z "$dir" ] && continue
        fail "src/components/ui/${dir#src/components/ui/} is a subdirectory — the shadcn CLI can overwrite this tree. Move it to src/components/custom/."
    done < <(find src/components/ui -mindepth 1 -type d 2>/dev/null)
fi

# ── 2. Every component folder has an index.tsx ───────────────────────────────
#
# A folder is a component unit; its default export lives in index.tsx. Folders
# that only group other units (they contain no files of their own) are fine.

echo "Checking every component folder has an index.tsx..."
for base in src/components src/layout; do
    [ -d "$base" ] || continue
    while IFS= read -r dir; do
        [ -z "$dir" ] && continue
        case "$dir" in
            src/components/ui|src/components/ui/*) continue ;;
        esac

        # Only leaf-ish folders that hold source of their own must export one.
        file_count=$(find "$dir" -maxdepth 1 -type f \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null | wc -l)
        [ "$file_count" -eq 0 ] && continue

        if [ ! -f "$dir/index.tsx" ] && [ ! -f "$dir/index.ts" ]; then
            # A route-ish or grouping folder (header/, sidebar/, view/, page/)
            # is allowed to hold named modules with no single default export.
            if find "$dir" -maxdepth 1 -type f -name '*.tsx' | grep -q .; then
                case "$dir" in
                    src/layout/*) continue ;;
                    *) fail "$dir has .tsx files but no index.tsx" ;;
                esac
            fi
        fi
    done < <(find "$base" -mindepth 1 -type d 2>/dev/null)
done

# ── 3. Registry ↔ filesystem, and validateRegistry() ─────────────────────────

echo "Checking nav registry against the app directory..."
if ! bun --bun scripts/check-registry.ts; then
    FAILED=1
fi

if [ "$FAILED" -ne 0 ]; then
    echo ""
    echo "Structure check failed."
    exit 1
fi

echo "All structure checks passed."
exit 0
