#!/usr/bin/env bash
set -euo pipefail

command -v rg >/dev/null 2>&1 || { echo "ripgrep (rg) is required but not installed. Please install it."; exit 1; }

RG_OPTS=(--hidden --no-ignore-vcs --glob '!node_modules/**' --glob '!.next/**' --glob '!out/**' --glob '!target/**' --glob '!dist/**' --glob '!.git/**')

FE_DIRS=()
[ -d app ]            && FE_DIRS+=(app)
[ -d components ]     && FE_DIRS+=(components)
[ -d src/app ]        && FE_DIRS+=(src/app)
[ -d src/components ] && FE_DIRS+=(src/components)
[ -d src/layout ]     && FE_DIRS+=(src/layout)

if [ ${#FE_DIRS[@]} -eq 0 ]; then
    echo "No frontend dirs found — skipping animation checks."
    exit 0
fi

if rg "${RG_OPTS[@]}" -n 'transition-(all|width|height|top|left|right|bottom|padding|margin)' "${FE_DIRS[@]}"; then
    echo "ANIMATION.md R1 violation — replace with transition-transform / transition-opacity"
    exit 1
fi

rg "${RG_OPTS[@]}" -n 'requestAnimationFrame' "${FE_DIRS[@]}" | while read -r line; do
  file="${line%%:*}"
  rg "${RG_OPTS[@]}" -q "useState" "$file" || continue
  if rg "${RG_OPTS[@]}" -nq 'useState[^;]+(?:setX|setY|setPosition|setProgress)' "$file"; then
    echo "ANIMATION.md R4 potential violation in $file — confirm RAF loops use refs only"
    exit 1
  fi
done

echo "All animation checks passed."
exit 0
