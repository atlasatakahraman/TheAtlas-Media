# ADR-006: src/ Directory Layout

## Status
Accepted

## Context
Initial agent plans (01-09) assumed that the Next.js frontend codebase (`app/`, `components/`, `lib/`) would live at the repository root. However, the initialized codebase utilizes the `src/` directory pattern (`src/app/`, `src/components/`, etc.), which is standard in modern Next.js 16+ projects.

## Decision
We will retain the `src/` directory layout. All plans and the Knowledge Base will be updated to reference `src/app`, `src/components`, and `src/lib`. Scripts like `check-animation-rules.sh` and `check-agents-rules.sh` will dynamically detect and target the `src/` directory.

## Consequences
- Keeps the repository root clean and dedicated to configuration files.
- Aligns perfectly with the existing `tsconfig.json` path aliases (`@/*` -> `./src/*`).
- Requires a one-time update to existing plans (01-09) and scripts to adjust file paths.
