# Skill: SPDX-style license header (mandatory on every new substantive file)

**Rust / TS / JS / JSX / TSX:**
```
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Atlas Ata Kahraman (atlasfirarda)
// Part of TheAtlas Media Processing. Licensed under GPL-3.0-only.
// Full terms: /LICENSE
```

**CSS / SCSS:**
```
/* SPDX-License-Identifier: GPL-3.0-only
 * Copyright (c) 2025 Atlas Ata Kahraman (atlasfirarda)
 * Part of TheAtlas Media Processing. Licensed under GPL-3.0-only.
 * Full terms: /LICENSE
 */
```

**TOML / YAML / JSON5:** skip — config formats. JSON: cannot carry comments; skip.

For `.tsx` client components, the license header goes **above** the `'use client'` directive? No — `'use client'` must be the first statement. Pattern:

```tsx
'use client';
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Atlas Ata Kahraman (atlasfirarda)
// Part of TheAtlas Media Processing. Licensed under GPL-3.0-only.
// next@16.2.6 — verified against node_modules/next/dist/docs/<file>.md on YYYY-MM-DD
```

CI script `scripts/stamp-license.sh --check` rejects files missing the header.
