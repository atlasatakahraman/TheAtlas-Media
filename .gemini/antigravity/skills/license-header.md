# Skill: SPDX-style license header (mandatory on every new substantive file)

**Rust / TS / JS / JSX / TSX:**
```
// SPDX-License-Identifier: LicenseRef-AAKNCL-1.0
// Copyright (c) 2025 Atlas Ata Kahraman (atlasfirarda)
// Part of TheAtlas Media Processing. Non-commercial use only.
// Full terms: /LICENSE  |  Commercial licensing: atlasatakahraman.com@gmail.com
```

**CSS / SCSS:**
```
/* SPDX-License-Identifier: LicenseRef-AAKNCL-1.0
 * Copyright (c) 2025 Atlas Ata Kahraman (atlasfirarda)
 * Part of TheAtlas Media Processing. Non-commercial use only.
 * Full terms: /LICENSE  |  Commercial licensing: atlasatakahraman.com@gmail.com
 */
```

**TOML / YAML / JSON5:** skip — config formats. JSON: cannot carry comments; skip.

For `.tsx` client components, the license header goes **above** the `'use client'` directive? No — `'use client'` must be the first statement. Pattern:

```tsx
'use client';
// SPDX-License-Identifier: LicenseRef-AAKNCL-1.0
// Copyright (c) 2025 Atlas Ata Kahraman (atlasfirarda)
// Part of TheAtlas Media Processing. Non-commercial use only.
// next@16.2.6 — verified against node_modules/next/dist/docs/<file>.md on YYYY-MM-DD
```

CI script `scripts/stamp-license.sh --check` rejects files missing the header.
