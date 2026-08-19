# Media capability layer — design & construction plan

Status: design refined after repository audit, then revised against measured probe costs; ready to implement in dependency order.
Date: 2026-08-19 (audited against the workspace on 2026-08-19; performance pass 2026-08-19).

> [!note] Performance revision — what changed and where
> Every probe, smoke test and aggregate in §3 is now **measured on this workstation**
> rather than estimated, and one earlier figure was retracted (§3.2). The design changes
> that follow from those numbers:
>
> - **Probes are tiered** — `-encoders` + `-muxers` publish a usable report at 158 ms; the other eight follow in the background (§9.1).
> - **The fingerprint is stat-only**, so a warm start revalidates the cache with three `metadata()` calls and zero spawns (§10.1). This was the costliest defect in the first draft.
> - **ffmpeg and yt-dlp publish independently**, and yt-dlp is probed on demand (§10.3).
> - **Smoke tests batch** under bounded per-vendor concurrency and persist across restarts (§9.2, §10.2).
> - **Inventories are arena-backed**, trading ~5 000 small allocations for one per probe (§6.2).
> - **The inventory table is virtualized and index-backed**, and derived option lists are projected once per report rather than per render (§12.2, §12.4.1).
> - **§14.1 adds eleven performance acceptance checks**, four of which are spawn counts — unambiguous and hardware-independent.
>
> The probes cannot be batched into fewer processes; §3.1 records the negative result so no
> slice re-tests it.

> [!important] Cross-platform revision — Windows, Linux, Arch
> The performance pass above was measured **entirely on Windows**, and a follow-up audit
> found that several of its conclusions did not port. This project ships to Windows, Linux
> (deb/rpm/AppImage) and Arch, with managed downloads for `linux/{x86_64,aarch64}` and
> `windows/x86_64`; macOS builds in CI but has no managed-tool path (§3.5).
>
> - **A real defect, found by inspection and reproduced at the command line:** the single
>   smoke-test argv in §9 is invalid for VAAPI, so as written the plan would have marked
>   VAAPI `HwSmokeFailed` on Linux machines where it works — hiding the only hardware
>   encoder most Linux users have. Fixed by a per-`EncoderKind` argv table (§9.3).
> - **The hardware surface is mostly false everywhere.** This build advertises 24 hardware
>   encoders, including 7 VAAPI ones on Windows; 2 work. Smoke testing is the only ground
>   truth (§3.5).
> - **`HwDeviceUnavailable` split from `HwSmokeFailed`** — a missing `render` group
>   membership is a one-command fix, not a hardware verdict (§9.3).
> - **The fingerprint is platform-aware**: case-folded paths on Windows/macOS only, a
>   `#[cfg(unix)]` inode that survives reproducible-build mtime pinning and catches
>   `pacman -Syu` under a running app, and `metadata()` rather than `symlink_metadata()`
>   (§10.1).
> - **Two factual corrections:** `-hwaccels` reports **8** methods on this build, not the 6
>   this plan claimed; and the retracted 30 s yt-dlp figure was a Windows Defender
>   first-run artifact with no Linux analogue.
> - **S0b captures Linux fixtures**, and **§14.2 splits acceptance per platform**. Check X5
>   — VAAPI resolving on a working VAAPI box — **cannot be run from this workstation and
>   is currently unverified**. It is the single most important outstanding check.
Scope owner: media layer (`src-tauri/src/core/media/`, `src/components/media/`, `src/app/convert/*`, `src/app/(download)/youtube/*`, `src/app/settings/*`).

> [!important] Implementation boundary
> This is a target architecture, not a description of code already present in
> the working tree. The existing media-job engine and its uncommitted changes
> remain the baseline. Slices must integrate with those files; they must not
> reset, regenerate, or overwrite unrelated media-job work.

---

## 1. Objective

Every codec, container, filter and preset the UI offers must be a capability the **user's actually-resolved binary** possesses. A system `PATH` ffmpeg built without `libx265` must not show H.265 anywhere; a yt-dlp too old for `--progress-template` must not be driven with it.

Today the app lies. `core/media/validate.rs:27-33` hardcodes:

```rust
pub const CONTAINERS: [&str; 3] = ["mp4", "mkv", "webm"];
pub const VIDEO_CODECS: [&str; 5] = ["copy", "h264", "hevc", "vp9", "av1"];
pub const AUDIO_CODECS: [&str; 3] = ["copy", "aac", "opus"];
```

duplicated verbatim in `src/app/convert/quick/data.ts:7-11`, and `ffmpeg_tool.rs:66-84` passes those bare codec names straight to `-c:v`/`-c:a` — never naming a concrete encoder. Nothing in the tree has ever run `-encoders`, `-muxers`, `-filters`, `-hwaccels` or `-buildconf`.

This plan adds the missing layer: probe → parse → resolve → cache → gate, with the backend authoritative and the frontend merely reflecting it.

### Non-goals

- Turning on new routes. `/convert/codec/*`, `/convert/hwaccel/*`, `/process/*` stay `planned`. Only `/settings/ffmpeg` and `/settings/ytdlp` flip to `ready`, because they are the inspector surfaces this layer produces.
- Quality controls (CRF slider, preset select, bitrate) in the convert form. The data is modelled and probed; placing the controls belongs to the codec routes.
- Encoder-option normalisation across x265/nvenc/qsv/amf (`crf` vs `cq` vs `qp` vs `global_quality`).
- Queue resumption, playlist/channel download, subtitle or thumbnail work.

---

## 2. Locked decisions

| Axis | Decision |
|---|---|
| Probe depth | Ten ffmpeg inventory probes, **split into a two-tier wave** (§9.1): tier A (`encoders`, `muxers`) unblocks the convert form, tier B fills the inspector. Reuse the dependency resolver's version result instead of spawning an eleventh version probe; hardware smoke tests are lazy, batched and cached |
| Probe independence | ffmpeg and yt-dlp detect and publish **independently**. Neither waits for the other, and yt-dlp is probed on demand, not at startup (§10.3) |
| Unsupported UX | Hidden from in-page selects; nav entry stays and its page explains why, with install / change-path CTA |
| Granularity | Codec-level picker, backend auto-selects the concrete encoder, Advanced disclosure exposes the encoder list |
| Hardware policy | **Software first**; a hardware encoder is selectable only after its smoke test passes. With `preferHardware` on, a verified hardware encoder ranks above software; an unverified one remains pending rather than being optimistically selected |
| Cache | In-memory + disk, keyed by a **stat-only** binary fingerprint (`path`, `len`, `mtime`) so a warm start revalidates with three `metadata()` calls and **zero process spawns**; the version string is cached *payload*, never part of the key (§10.1). A generation-aware single-flight refresh prevents duplicate probes and stale completion events |
| Storage layout | Inventories are stored as **one arena string per probe plus `(u32, u32)` spans**, not ~1 500 individually boxed strings (§6.2) |
| yt-dlp surface | Flag-set ground truth + version-gate fallback + ffmpeg linkage + lazy impersonate targets. No extractor list |
| Catalog authorship | Requirements/ranking in Rust; labels/icons in `src/registry/media/*.ts`; parity enforced by a guard script |
| Inventories | All ten: encoders, decoders, muxers, demuxers, filters, pix_fmts, protocols, bsfs, hwaccels, buildconf |
| Encoder detail | Probed lazily, modelled fully; UI wires only the Advanced encoder override |
| IPC payload | Compact resolved report by default; raw inventories on demand. Internal cache models and IPC models are separate, explicitly serialisable types |
| Catalog breadth | Everything the nav registry already promises (13 video, 8 audio, 6 containers, presets) |
| UI primitives | **shadcn only** (`style: radix-nova`, `baseColor: neutral`), no bespoke controls |
| Architecture | Approach A — curated catalog resolved against parsed inventories by a pure function |

### One evidence-driven refinement to the approved design

The approved design gated yt-dlp features on a version table. One `--help` capture instead yields the **flag set itself**, which is ground truth rather than inference, at the same cost as the version spawn it replaces (§3.2). Revised: resolve a yt-dlp feature by flag presence first, falling back to the version table only for behaviour with no corresponding flag. Same cost, strictly more truthful.

---

## 3. Evidence base (measured on this workstation, 2026-08-19 — **Windows only**, see §3.5)

Resolved binaries: `C:\ffmpeg\bin\ffmpeg.EXE`, `C:\ffmpeg\bin\ffprobe.EXE`, `C:\Users\atlasfirarda\AppData\Local\Programs\Python\Python312\Scripts\yt-dlp.EXE`.

`ffmpeg -hide_banner -version` line 1:

```
ffmpeg version 7.0-full_build-www.gyan.dev Copyright (c) 2000-2024 the FFmpeg developers
```

### 3.1 What each probe costs

Every figure below is a warm-cache mean of three consecutive runs, taken on this workstation.

| Probe | Lines | Mean wall time | Tier |
|---|---:|---:|:--:|
| `-encoders` | 241 | 119 ms | **A** |
| `-muxers` | 186 | 91 ms | **A** |
| `-decoders` | 544 | 147 ms | B |
| `-demuxers` | 368 | 114 ms | B |
| `-filters` | 565 | 162 ms | B |
| `-pix_fmts` | 236 | 103 ms | B |
| `-protocols` | 75 | 78 ms | B |
| `-bsfs` | 46 | 88 ms | B |
| `-hwaccels` | 10 | 76 ms | B |
| `-buildconf` | 92 | 84 ms | B |

`-hwaccels` reports **8** methods on this build: `cuda vaapi dxva2 qsv d3d11va opencl vulkan d3d12va`. (The pre-audit draft of this plan said 6, omitting `vulkan` and `d3d12va` — corrected here, and the count is platform-specific anyway, see §3.5.)

Aggregate timings, same machine:

| Strategy | Wall time |
|---|---:|
| All ten, serial | **1 014 ms** |
| All ten, concurrent | **319 ms** |
| Tier A only (`-encoders` + `-muxers`), concurrent | **158 ms** |

So concurrency is worth ~3.2×, and tiering buys a further 2× on the number that
users actually feel — the delay before `/convert/quick` can populate its selects.

**Negative finding: the probes cannot be batched.** `ffmpeg -hide_banner -encoders -muxers -hwaccels`
prints 241 lines and exactly one section header (`Encoders:`). Each listing flag is an
`OPT_EXIT` option, so ffmpeg services the first one and exits. One flag per spawn is a
hard floor; concurrency and tiering are the only levers available. Do not spend a slice
re-testing this.

### 3.2 yt-dlp is ~10× an ffmpeg probe, not ~200×

| Command | Wall time | Output |
|---|---:|---|
| `yt-dlp --version`, first run | 3 706 ms | `2026.07.04` |
| `yt-dlp --version`, warm | 1 502 ms | `2026.07.04` |
| `yt-dlp --help`, warm | 1 480 ms | 898 lines |

> [!warning] Correction to the earlier audit
> An earlier reading of this plan recorded `yt-dlp --version` as **exceeding 30 s**. That
> figure does not reproduce — repeated runs land at 1.4–1.5 s — and should not be designed
> around. The likeliest explanation is that it was this binary's first execution after
> install (its mtime is the previous day) and Windows Defender scans a newly written
> `.EXE` synchronously the first time it runs; that is a plausible cause rather than a
> confirmed one, and the actionable fact is simply that the number does not hold.
> Everything downstream of the 30 s figure is revised:
> `VERSION_TIMEOUT` goes to 20 s rather than 30 s (§11.6), and the yt-dlp `--help` timeout
> is 20 s rather than 60 s (§9).

The asymmetry that *does* survive is 1.5 s against ~0.1 s. That is still an order of
magnitude, and it is why ffmpeg and yt-dlp must publish independently (§10.3): a single
joined report makes every convert-page user wait out Python's interpreter startup for
data they are not looking at.

### 3.3 Smoke tests cost ~0.5 s, and the false positive is real

Argv per §9; `rc` is ffmpeg's exit status.

| Encoder | rc | Wall time | stderr |
|---|---:|---:|---|
| `libx264` | 0 | 146 ms | — |
| `h264_nvenc` | 0 | 482 ms | — |
| `hevc_nvenc` | 0 | 441 ms | — |
| `av1_nvenc` | **127** | 643 ms | `No capable devices found` |
| `h264_qsv` | **171** | 643 ms | `Error creating a MFX session: -9` |
| `h264_amf` | **171** | 641 ms | `DLL amfrt64.dll failed to open` |

Three consequences:

- **Failure costs more than success** (~640 ms vs ~460 ms) — the driver is loaded and
  probed before it gives up. A codec's full seven-candidate ranked list verified serially
  is ~4 s, which is far too slow to sit behind a toggle.
- **Concurrent verification is safe here and worth ~3×.** Six mixed-vendor smoke tests
  finished in 1 237 ms against ~3.6 s serial; three simultaneous NVENC sessions all
  returned `rc=0` in 947 ms. Consumer NVENC session caps are real on older drivers, so
  §9 bounds concurrency at 3 per vendor rather than assuming it is unlimited.
- **`av1_nvenc` fails exactly as predicted**, confirming §14 acceptance case 3 before a
  line is written.

### 3.4 Findings that shape the design

1. **ffmpeg states the encoder→codec association inline.** ` V....D libx265              libx265 H.265 / HEVC (codec hevc)`. When the ` (codec X)` suffix is absent the encoder name *is* the codec (` VF...D prores`, ` A....D aac`, ` VFS..D dnxhd`). No hardcoded association table is needed — the catalog carries only judgement.
2. **`av1_nvenc` is listed on a GPU that cannot encode AV1.** This build advertises `av1_nvenc`, but the workstation GPU is a GTX 1650 (Turing — AV1 encode arrived with Ada). This is the exact false-positive the lazy smoke test exists to catch, and §3.3 has already reproduced it.
3. **The whole layer is spawn-bound, not CPU-bound.** 2 403 lines of total inventory output parse in well under a millisecond; the 319 ms is process creation and dynamic linking. Optimisation effort belongs in *how many processes are spawned and when*, never in the parsers.

---

### 3.5 Platform scope, and why every number above is provisional

This app ships to **Windows, Linux (deb/rpm/AppImage) and Arch** — `package.json` has
`build:linux` and `build:arch`, and `core/tools/registry.rs` carries managed-download
entries for `linux/x86_64`, `linux/aarch64` and `windows/x86_64`. CI additionally builds
`macos-14`, but there is **no macOS `BundleSpec`**, so on macOS every tool must come from
`PATH`, an env override, or a manual path. `EncoderKind::VideoToolbox` stays in the model
for that case; it is never a managed install.

> [!warning] Every measurement in §3.1–3.3 is Windows 10 / NTFS / GTX 1650.
> None of it has been reproduced on Linux, and WSL is disabled on this workstation, so it
> could not be. Those numbers are **not portable** and must not be pasted into a
> Linux-facing acceptance test. What is portable is the *shape*: spawn-bound, tier A far
> cheaper than the full wave, failure slower than success. Capturing the Linux and Arch
> equivalents is slice **S0b** (§13), and §14.2 splits acceptance per platform.
>
> **Capturing the Linux side is one command**, on the dual-boot install:
>
> ```bash
> bash scripts/capture-media-evidence.sh
> ```
>
> It discovers the tools (honouring `THEATLAS_*_PATH`), writes the five S0b fixtures into
> `capability/fixtures/linux/`, and emits `docs/plans/evidence/linux-<date>.md` with the
> same tables as §3.1–3.3 plus render-node enumeration, per-kind smoke results and
> fingerprint inputs. Run it on Arch too if the ffmpeg packages differ. The Windows run is
> committed alongside it as `evidence/windows-2026-08-20.md`, so §3 becomes a reproducible
> artifact rather than numbers someone typed once.
>
> Expected direction, to be confirmed rather than assumed: `fork`+`exec` on Linux is
> substantially cheaper than `CreateProcess` on Windows, and there is no on-access
> antivirus scan, so the ~100 ms per probe should fall a long way and the 20 s
> `VERSION_TIMEOUT` headroom (§11.6) is a **Windows-Defender-shaped** allowance that Linux
> will never need. Distro yt-dlp is a native script or zipapp rather than a PyInstaller
> `.EXE`, so §3.2's 1.5 s should also drop — the on-demand probing in §10.3 stays worth
> doing regardless, because it is free.

#### The hardware surface is mostly false, on every platform

This Windows build advertises **24 hardware encoders** across NVENC, QSV, AMF, VAAPI and
Media Foundation. Smoke-testing every one of them (`scripts/capture-media-evidence.sh`,
full results in `docs/plans/evidence/windows-2026-08-20.md`) finds **three** that work:
`h264_nvenc`, `hevc_nvenc`, and — unexpectedly — `h264_mf`, while `hevc_mf` on the same
Media Foundation stack fails with `could not find any MFT`. It also lists **7 VAAPI
encoders on Windows**, where a libva driver essentially never exists.

Three of twenty-four, with one family split down the middle. There is no rule of thumb
here that a catalog could encode — `_mf` is neither reliably present nor reliably absent,
it is per-codec and per-machine. That is the case for smoke testing stated as a
measurement rather than an argument.

So `av1_nvenc` (§3.4 finding 2) is not a curiosity — it is one instance of the dominant
case. An `-encoders` row means *this binary was compiled with the wrapper*, and nothing
whatsoever about the machine it is running on. Every hardware family dlopens its driver
at runtime: `nvcuda`/`libnvidia-encode.so.1`, `amfrt64.dll`/`libamfrt64.so`, `libva`,
`libvpl`. That is why smoke testing is not an optimisation in this design — it is the only
source of truth for the hardware half of the catalog.

#### The smoke argv in §9 is wrong for VAAPI — on Linux too

Measured, with the plan's universal argv:

| Encoder | rc | First stderr line | What it actually means |
|---|---:|---|---|
| `h264_vaapi` | 127 | `Impossible to convert between the formats supported by the filter 'Parsed_null_0' …` | **Our command line is malformed**, not "no hardware" |
| `mjpeg_vaapi` | 127 | same filter-graph error | same |
| `hevc_mf` | 127 | `could not find any MFT for the given media type` | OS/GPU genuinely cannot |
| `av1_amf` | 171 | `DLL amfrt64.dll failed to open` | driver not installed |
| `libx264` | 0 | — | works |

VAAPI encoders take **hardware frames**. `nullsrc → -pix_fmt yuv420p → h264_vaapi` cannot
be negotiated on any platform; it needs an initialised VAAPI device and an explicit
`format=nv12,hwupload`. Supplying those on this Windows machine changes the error to the
honest one — `Failed to initialise VAAPI connection` at device creation, rc=127.

The consequence is the important part: **shipped as written, this plan would mark VAAPI as
`HwSmokeFailed` on a Linux machine whose VAAPI works perfectly**, permanently hiding the
only hardware encoder most Linux users have. That is precisely the lie §1 exists to
remove, aimed at the platform the plan was not measured on. §9.3 fixes it.

Two smaller notes from the same table: **the exit code is a reliable pass/fail signal**
(rc=0 only on success), but it **carries no information about the cause** — three
different failures all return 127. Any reason detail must come from stderr, which is why
§9's 200-character stderr tail is load-bearing rather than cosmetic.

**The per-kind argv is also substantially cheaper.** Re-measured with §9.3's table in
place, a VAAPI probe fails in **119 ms** instead of the 643 ms the universal argv took,
because device creation fails immediately rather than after ffmpeg has built and failed to
negotiate a filter graph. QSV drops from 643 ms to ~350 ms for the same reason. Correcting
the argv makes the pessimistic path both truthful and ~5× faster — the two goals did not
trade off here.

## 4. Parse grammar contracts

These grammars are the sub-agent input contracts. Every rule below was read off real output, not recalled. Parsers are pure `fn(&str) -> …`, allocate once into `Box<[T]>`, and are the only code allowed to know these shapes.

### 4.1 Shared preamble rule

`-encoders`, `-decoders`, `-muxers`, `-demuxers`, `-pix_fmts` all print a legend, then a separator line whose trimmed content is **only** `-` characters (`------` for codec tables, `---` for format tables), then rows. Rule: **skip until the first line whose trimmed value is non-empty and consists solely of `-`; parse rows after it.** `-filters`, `-protocols`, `-bsfs`, `-hwaccels` have no separator and use per-kind discriminators below.

### 4.2 Encoders / decoders — `parse/codecs.rs`

Row: one leading space, exactly 6 flag chars, space, name, whitespace run, description.

```
 V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (codec h264)
 V..... h264_qsv             H.264 / AVC ... (Intel Quick Sync Video acceleration) (codec h264)
 VFS..D dnxhd                VC3/DNxHD
 A....D aac                  AAC (Advanced Audio Coding)
```

- Discriminator: first whitespace-separated token has length 6 and every char is in `VAS.FSXBD`.
- Flags: `[0]` media type `V|A|S`; `[1]` `F` frame threading; `[2]` `S` slice threading; `[3]` `X` experimental; `[4]` `B` draw_horiz_band; `[5]` `D` direct rendering.
- Codec: if the description ends with ` (codec NAME)`, codec = `NAME` and that suffix is **stripped** from the stored description; else codec = encoder name.
- `EncoderKind` classified by name suffix/segment, checked in this order: `_nvenc` → `Nvenc`, `_qsv` → `Qsv`, `_amf` → `Amf`, `_vaapi` → `Vaapi`, `_videotoolbox` → `VideoToolbox`, `_mf` → `MediaFoundation`, `_cuvid` → `Nvenc` (decode), else `Software`.
- Experimental encoders (`X` flag) are parsed and stored but **never** offered by `resolve` (`ResolvePolicy::allow_experimental = false`).

### 4.3 Muxers / demuxers — `parse/formats.rs`

```
 D.. = Demuxing supported
 .E. = Muxing supported
 ..d = Is a device
 ---
  E  3g2             3GP2 (3GPP2 file format)
  D  matroska,webm   Matroska / WebM
```

- Flags field is 3 chars (`D`, `E`, `d`), and in `-muxers`/`-demuxers` output the irrelevant column is a space — so **parse flags positionally from the raw line, not from `split_whitespace`**, then take the name and description from the remainder.
- **Name may be a comma-separated alias list** (`matroska,webm`, `mov,mp4,m4a,3gp,3g2,mj2`). Split on `,` into `aliases: Box<[Box<str>]>`; membership tests match any alias. Missing this is the single most likely parser bug — `mp4` availability is discovered through the `mov,mp4,m4a,3gp,3g2,mj2` demuxer row and the standalone `mp4` muxer row.

### 4.4 Filters — `parse/filters.rs`

```
 ..C scale             V->V       Scale the input video size and/or convert the image format.
 ... loudnorm          A->A       EBU R128 loudness normalization
 T.C cropdetect        V->V       Auto-detect crop size.
```

- No separator line. Discriminator: ≥3 tokens, `tokens[0].len() == 3`, and `tokens[2]` contains `->`.
- Flags: `T` timeline, `S` slice threading, `C` command support. Signature (`V->V`, `A->A`, `N->N`, `|->V`) stored verbatim as `Box<str>`.

### 4.5 pix_fmts — `parse/pix_fmts.rs`

Header includes `FLAGS NAME            NB_COMPONENTS BITS_PER_PIXEL BIT_DEPTHS`, then the `-----` separator, then rows: 5 flag chars (`I` input, `O` output, `H` hardware, `P` paletted, `B` bitstream), name, components `u8`, bits-per-pixel `u8`, and an optional `BIT_DEPTHS` token (`8-8-8`) absent on older builds — model it `Option<Box<str>>`.

### 4.6 protocols / bsfs / hwaccels — `parse/lists.rs`

- `-protocols`: `Input:` section then bare indented names, `Output:` section then bare names → two sets. A name belongs to whichever section precedes it.
- `-bsfs`: header `Bitstream filters:` then bare names.
- `-hwaccels`: header `Hardware acceleration methods:` then bare names. Blank lines ignored everywhere.

### 4.7 buildconf — `parse/buildconf.rs`

`-buildconf` prints one indented flag per line (92 on this build). Keep every trimmed line beginning with `--`. Preferred over the single long `configuration:` line from `-version`. Used for display and as a *hint only* — never as an availability source, because distro builds enable codecs without a matching `--enable-` flag.

### 4.8 Encoder detail — `parse/encoder_detail.rs`

`ffmpeg -hide_banner -h encoder=libx265`:

```
Encoder libx265 [libx265 H.265 / HEVC]:
    General capabilities: dr1 delay threads
    Threading capabilities: other
    Supported pixel formats: yuv420p yuvj420p yuv422p ... gray12le
libx265 AVOptions:
  -crf               <float>      E..V....... set the x265 crf (from -1 to FLT_MAX) (default -1)
  -preset            <string>     E..V....... set the x265 preset
  -x265-params       <dictionary> E..V....... set the x265 configuration using a :-separated list of key=value parameters
```

- `Supported pixel formats:` → `Box<[Box<str>]>`. Audio encoders print `Supported sample formats:` / `Supported sample rates:` / `Supported channel layouts:` instead — all four keys parsed, each `Option<Box<[Box<str>]>>`.
- Option rows: name after `-`, type inside `<…>`, flags token, description; extract `(from X to Y)` → `range: Option<(f64, f64)>` and `(default Z)` → `default: Option<Box<str>>` from the description tail.
- Absent sections are `None`, never an empty-vec lie.

### 4.9 Version — reuse, do not duplicate

`core::tools::probe::parse_version_line` (probe.rs:236-271) already handles `ffmpeg version 7.0-full_build-…` and bare yt-dlp version output. Call it. Adding a second version parser is a defect.

### 4.10 yt-dlp `--help` — `parse/ytdlp_help.rs`

Collect every distinct `--flag` token (strip a trailing `,` or `=`) into a sorted `Box<[Box<str>]>`. `--list-impersonate-targets` output is parsed only for its target names, lazily.

### 4.11 Fixtures — exact capture contract

Capture once into `src-tauri/src/core/media/capability/fixtures/`, consumed via `include_str!`:

| File | Command |
|---|---|
| `ffmpeg-version.txt` | `ffmpeg -hide_banner -version` |
| `ffmpeg-encoders.txt` | `ffmpeg -hide_banner -encoders` |
| `ffmpeg-decoders.txt` | `ffmpeg -hide_banner -decoders` |
| `ffmpeg-muxers.txt` | `ffmpeg -hide_banner -muxers` |
| `ffmpeg-demuxers.txt` | `ffmpeg -hide_banner -demuxers` |
| `ffmpeg-filters.txt` | `ffmpeg -hide_banner -filters` |
| `ffmpeg-pix-fmts.txt` | `ffmpeg -hide_banner -pix_fmts` |
| `ffmpeg-protocols.txt` | `ffmpeg -hide_banner -protocols` |
| `ffmpeg-bsfs.txt` | `ffmpeg -hide_banner -bsfs` |
| `ffmpeg-hwaccels.txt` | `ffmpeg -hide_banner -hwaccels` |
| `ffmpeg-buildconf.txt` | `ffmpeg -hide_banner -buildconf` |
| `ffmpeg-h-encoder-libx265.txt` | `ffmpeg -hide_banner -h encoder=libx265` |
| `ffmpeg-h-encoder-aac.txt` | `ffmpeg -hide_banner -h encoder=aac` |
| `ffprobe-version.txt` | `ffprobe -hide_banner -version` |
| `ytdlp-help.txt` | `yt-dlp --help` |

Plus two **hand-written** fixtures, the negative cases that prove hiding works:

- `minimal-encoders.txt` — legend, separator, and only `libx264`, `aac`, `libvorbis` rows. No `libx265`, no `hevc_*`, no AV1.
- `minimal-muxers.txt` — only `matroska` and `mp4` rows.

Fixtures are captured verbatim, LF-normalised, and **never hand-edited afterwards** (except the two synthetic ones). Parser slices treat them as read-only inputs.

#### One build is not enough evidence for three platforms

The table above captures a single gyan.dev Windows build. The parsers are grammar-based so
they *should* port, but "should" is what this plan exists to replace. A distro build differs
in ways that touch the grammar directly: a much smaller encoder set (Arch's `ffmpeg`
package is not `-full_build`), no Media Foundation rows at all, VAAPI rows that are real
rather than vestigial, and — on `linux/aarch64`, a shipped target — `v4l2m2m`/`rkmpp` rows
this build has never emitted.

Capture a second, reduced set on Linux into `fixtures/linux/`, prefixed `linux-`:
`linux-encoders.txt`, `linux-muxers.txt`, `linux-hwaccels.txt`, `linux-filters.txt`,
`ytdlp-help-linux.txt`. Five files, one machine, and every §14 parser test runs against
both sets. This is slice **S0b**; it is the only part of the plan that cannot be done from
this workstation, and it blocks nothing else — S2–S4 proceed on the Windows fixtures and
gain a second assertion when S0b lands.

**Capture hygiene, since the fixtures cross platforms:**

- Capture through a pipe, not a shell redirect. PowerShell's `>` writes UTF-16LE with CRLF
  and would corrupt every fixture; `Start-Process -RedirectStandardOutput` or piping
  through `Out-File -Encoding utf8NoBOM` is the Windows-safe form. On Linux plain `>` is
  fine.
- The repo root `.gitattributes` is `* text=auto eol=lf`, so git will normalise these on
  commit. That happens to be what we want, but it means git is *rewriting* files the plan
  calls verbatim. Pin the intent explicitly with
  `src-tauri/src/core/media/capability/fixtures/** -text` so the bytes committed are the
  bytes captured, and a CI checkout on any OS gets them unchanged. Without this the
  "never hand-edited" rule is enforced against everything except git itself.
- `include_str!` embeds at compile time, so fixture-driven tests are fully
  platform-independent once captured — they are the part of §14 that genuinely runs
  identically on ubuntu, macos-14 and windows.

---

## 5. Rust module tree

New subtree `src-tauri/src/core/media/capability/`, added via `pub mod capability;` in `core/media/mod.rs`. Tauri-free (constraint 10); `unsafe` impossible here (constraint 11).

```
capability/
  mod.rs                 re-exports; module doc names src/lib/types.ts as its hand-mirror
  types.rs               all models (§6) — authored once, then read-only for other slices
  catalog.rs             CODECS / CONTAINERS / PRESETS static tables + id invariant tests
  resolve.rs             pure: catalog × capabilities × policy -> CapabilityReport
  detect.rs              I/O: concurrent probes -> FfmpegCapabilities / YtDlpCapabilities
  smoke.rs               lazy hardware-encoder validation
  cache.rs               fingerprint-keyed memory + disk cache
  ytdlp_features.rs      flag-set-first feature resolution, version-table fallback
  parse/
    mod.rs codecs.rs formats.rs filters.rs pix_fmts.rs lists.rs buildconf.rs
    encoder_detail.rs ytdlp_help.rs
  fixtures/              §4.11
```

Naming note: this is `capability/detect.rs`, deliberately not `probe.rs`, so it never reads as `core::tools::probe`.

---

## 6. Models (`capability/types.rs`)

S1 owns these models; all later slices consume the public interfaces it freezes. The sketch below names the required fields and relationships, not copy-paste-ready Rust. In particular, every type that crosses IPC or is persisted must derive the required `Debug`/`Clone`/`Serialize`/`Deserialize` traits and use `#[serde(rename_all = "camelCase")]`; an internal indexing type must not accidentally become wire format.

```rust
pub type ToolKey = &'static str;                       // "ffmpeg" | "ffprobe" | "ytdlp"

#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MediaType { Video, Audio, Subtitle }

#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EncoderKind { Software, Nvenc, Qsv, Amf, Vaapi, VideoToolbox, MediaFoundation }

pub struct EncoderFlags { pub frame_threads: bool, pub slice_threads: bool, pub experimental: bool,
                          pub draw_horiz_band: bool, pub direct_rendering: bool }

pub struct EncoderEntry { pub name: Box<str>, pub codec: Box<str>, pub media: MediaType,
                          pub kind: EncoderKind, pub flags: EncoderFlags, pub description: Box<str> }

pub struct FormatEntry { pub aliases: Box<[Box<str>]>, pub demux: bool, pub mux: bool,
                         pub device: bool, pub description: Box<str> }

pub struct FilterEntry { pub name: Box<str>, pub signature: Box<str>, pub timeline: bool,
                         pub slice_threads: bool, pub command: bool, pub description: Box<str> }

pub struct PixFmtEntry { pub name: Box<str>, pub input: bool, pub output: bool, pub hardware: bool,
                         pub paletted: bool, pub bitstream: bool, pub components: u8,
                         pub bits_per_pixel: u8, pub bit_depths: Option<Box<str>> }

/// Sorted-by-name storage with a precomputed codec grouping. No allocation per query.
/// Backed by one arena string per probe — see §6.2.
pub struct Inventory<T> {
    arena: Box<str>,                                     // the probe's raw stdout, owned once
    entries: Box<[T]>,                                   // T holds Span, not Box<str>
    by_codec: Box<[(Span, Box<[u32]>)]>,
}
pub struct Span { pub start: u32, pub end: u32 }         // byte range into the owning arena
impl<T> Inventory<T> {
    pub fn len(&self) -> usize;
    pub fn contains(&self, name: &str) -> bool;          // binary_search
    pub fn get(&self, name: &str) -> Option<&T>;
    pub fn for_codec(&self, codec: &str) -> &[u32];      // empty slice when absent
    pub fn iter(&self) -> impl Iterator<Item = &T>;
    pub fn str(&self, span: Span) -> &str;               // the only way to read a span
}

/// Identity of a binary on disk. Same idiom as core::tools::probe's FileStamped.
/// Stat-only by design — the version is payload, not key. Path normalisation and the
/// Unix-only `inode` field are platform-aware; see §10.1.
pub struct CapabilityFingerprint {
    pub path: Box<str>, pub len: u64, pub mtime_unix_ms: u64,
    #[cfg(unix)] pub inode: u64,
}

pub struct ProbeError { pub probe: Box<str>, pub message: Box<str> }

pub struct FfmpegCapabilities {
    pub fingerprint: CapabilityFingerprint,
    pub source: DependencySource,                        // reused from core::tools::types
    pub encoders: Inventory<EncoderEntry>,
    pub decoders: Inventory<EncoderEntry>,
    pub muxers: Inventory<FormatEntry>,
    pub demuxers: Inventory<FormatEntry>,
    pub filters: Inventory<FilterEntry>,
    pub pix_fmts: Inventory<PixFmtEntry>,
    pub protocols_in: Box<[Box<str>]>,
    pub protocols_out: Box<[Box<str>]>,
    pub bsfs: Box<[Box<str>]>,
    pub hwaccels: Box<[Box<str>]>,
    pub buildconf: Box<[Box<str>]>,
    pub probe_errors: Box<[ProbeError]>,                 // non-empty => Degraded, never fatal
}

pub struct YtDlpCapabilities {
    pub fingerprint: CapabilityFingerprint,
    pub source: DependencySource,
    pub flags: Box<[Box<str>]>,                          // sorted, from --help
    pub impersonate_targets: Option<Box<[Box<str>]>>,    // None = not probed yet
    pub ffmpeg_linked: bool,                             // ffmpeg resolvable at all
    pub probe_errors: Box<[ProbeError]>,
}

pub enum UnavailableReason {
    ToolMissing { tool: Box<str> },
    MissingEncoder { candidates: Box<[Box<str>]> },
    MissingMuxer { name: Box<str> },
    MissingPixFmt { name: Box<str> },
    MissingFilter { name: Box<str> },
    HwUnverified { encoder: Box<str> },                  // smoke test not run yet
    HwSmokeFailed { encoder: Box<str>, detail: Box<str> },       // permanent: hardware cannot
    HwDeviceUnavailable { kind: EncoderKind, detail: Box<str> }, // fixable: driver/permissions (§9.3)
    VersionTooOld { needed: Box<str>, found: Box<str> },
    FlagUnsupported { flag: Box<str> },
    PendingProbe { probe: Box<str> },                    // tier B not in yet (§9.1); not a failure
}

pub struct ResolvedCodec { pub id: &'static str, pub media: MediaType, pub available: bool,
                           pub chosen_encoder: Option<Box<str>>, pub alternatives: Box<[Box<str>]>,
                           pub hardware: bool, pub reason: Option<UnavailableReason> }

pub struct ResolvedContainer { pub id: &'static str, pub available: bool, pub muxer: Option<Box<str>>,
                               pub reason: Option<UnavailableReason> }

pub struct ResolvedPreset { pub id: &'static str, pub available: bool,
                            pub reason: Option<UnavailableReason> }

pub struct ResolvedFeature { pub id: &'static str, pub available: bool,
                             pub reason: Option<UnavailableReason> }

pub struct ToolBuildInfo { pub key: Box<str>, pub path: Box<str>, pub version: Box<str>,
                           pub source: DependencySource, pub buildconf: Box<[Box<str>]>,
                           pub hwaccels: Box<[Box<str>]>, pub counts: InventoryCounts }

pub struct InventoryCounts { pub encoders: u32, pub decoders: u32, pub muxers: u32, pub demuxers: u32,
                             pub filters: u32, pub pix_fmts: u32, pub protocols: u32, pub bsfs: u32 }

pub enum ReportStatus { Building, Ready, Degraded }

pub struct CapabilityReport {
    pub status: ReportStatus,
    pub ffmpeg: Option<ToolBuildInfo>,
    pub ffprobe: Option<ToolBuildInfo>,
    pub ytdlp: Option<ToolBuildInfo>,
    pub video_codecs: Box<[ResolvedCodec]>,
    pub audio_codecs: Box<[ResolvedCodec]>,
    pub containers: Box<[ResolvedContainer]>,
    pub presets: Box<[ResolvedPreset]>,
    pub features: Box<[ResolvedFeature]>,
    pub prefer_hardware: bool,
    pub built_at_unix_ms: u64,
    pub probe_errors: Box<[ProbeError]>,
}

pub struct ResolvePolicy { pub prefer_hardware: bool, pub allow_experimental: bool }  // experimental always false today

pub struct EncoderOption { pub name: Box<str>, pub value_type: Box<str>, pub description: Box<str>,
                           pub range: Option<(f64, f64)>, pub default: Option<Box<str>> }

pub struct EncoderDetail { pub encoder: Box<str>, pub display: Box<str>,
                           pub pix_fmts: Option<Box<[Box<str>]>>,
                           pub sample_fmts: Option<Box<[Box<str>]>>,
                           pub sample_rates: Option<Box<[Box<str>]>>,
                           pub channel_layouts: Option<Box<[Box<str>]>>,
                           pub options: Box<[EncoderOption]> }

pub struct InventoryRow { pub name: Box<str>, pub group: Option<Box<str>>, pub flags: Box<str>,
                          pub description: Box<str> }                 // uniform row -> one shadcn Table renders every kind

pub enum InventoryKind { Encoders, Decoders, Muxers, Demuxers, Filters, PixFmts, Protocols, Bsfs, Hwaccels, Buildconf }

pub struct EncoderChoice { pub video: Option<Box<str>>, pub audio: Option<Box<str>>,
                           pub pix_fmt: Option<Box<str>> }            // concrete ffmpeg names or "copy"
```

### 6.1 Internal, disk, and IPC boundaries

The pseudocode above needs three deliberately different representations:

| Boundary | Representation | Rule |
|---|---|---|
| Parser / resolver | Typed entries plus `Inventory<T>` indexes | `Inventory<T>` is internal, has a `Named`/lookup trait rather than pretending every `T` has a name, and is rebuilt after loading. Its fields stay private. |
| Disk cache | `DiskFfmpegCapabilities` with sorted `Vec`/`Box` entry lists and the fingerprint | Every field derives `Serialize` and `Deserialize`. Never persist mutexes, indexes, task state, `Arc`s, or `Building`. |
| IPC | compact `CapabilitySnapshot` / `CapabilityReport`, `InventoryRow`, `EncoderDetail`, and tagged `UnavailableReason` | Every exposed enum derives `Serialize`; command input enums also derive `Deserialize`. Raw inventory entries remain on the on-demand inventory command. |

Use a serialisable `ToolKey` enum (`Ffmpeg`, `Ffprobe`, `Ytdlp`) for command input, not `String`. It is the allowlist at the IPC boundary. `InventoryKind` likewise derives `Deserialize`; an invalid JSON value is rejected by Tauri before the command reaches core.

`ToolBuildInfo` is split in the implementation: `FfmpegBuildInfo` owns ffmpeg-only counts, build configuration, and hardware methods; `ResolvedTool` owns the common path/version/source; `YtDlpBuildInfo` adds flag count and ffmpeg linkage. ffprobe is represented as `ResolvedTool` only. The layer must not run ffmpeg-specific inventory commands against ffprobe merely to fill a shared struct.

`CapabilitySnapshot` is the command/event envelope: `{ generation, status: "building" | "ready" | "degraded", report: CapabilityReport | null, message: string | null }`. `CapabilityReport` itself has only completed `Ready` or `Degraded` states. This prevents a half-built report from being treated as authoritative by `enqueue_convert`.

### 6.2 Arena-backed entries

The §6 sketch writes `Box<str>` on every entry field for readability. **The implementation
stores `Span` instead**, indexing into the one arena string its `Inventory<T>` owns.

Counting the real output: 241 encoders + 544 decoders + 186 muxers + 368 demuxers +
565 filters + 236 pix_fmts ≈ 2 140 entries, each with a name and a description, plus
per-entry extras. Boxing each field individually is ~5 000 small allocations and ~5 000
pointer-sized headers to hold roughly 190 KB of actual text. The arena form is
**one allocation per probe** (the stdout `String`, already allocated by `Command::output`
and reused rather than re-copied) plus one `Box<[T]>` of fixed-size, pointer-free entries.

The rule, mechanically:

- A parser takes ownership of the probe's stdout `String`, scans it once, and emits
  `entries` whose fields are `Span` values into that same buffer. It never allocates a
  substring.
- Entry structs are `Copy`-friendly plain data — a `Span` is 8 bytes where a `Box<str>`
  is 16 plus a heap block, so `EncoderEntry` shrinks from ~90 bytes plus six heap blocks
  to 40 bytes flat, and the whole encoder table becomes one contiguous, cache-friendly
  scan.
- `Inventory::str(span)` is the only reader. Nothing outside the module sees a `Span`.
- Sizing: count `\n` in the arena first and `Vec::with_capacity` the entry vector. One
  pass, one growth, no reallocation churn.
- **Spans never cross a boundary.** Serialising for disk or IPC materialises `&str`
  through `Inventory::str` at that moment; `Span` is not `Serialize`, which makes the
  mistake unrepresentable rather than merely discouraged.

This is the one place a non-obvious representation is worth it, because these tables are
held for the app's lifetime and re-scanned on every resolve. Parsers stay pure
`fn(String) -> Inventory<T>`; the arena is an allocation strategy, not a new contract.

---

## 7. Catalog (`capability/catalog.rs`) and id stability

```rust
pub struct CodecSpec {
    pub id: &'static str,                  // stable public id, e.g. "hevc"
    pub media: MediaType,
    pub ffmpeg_codec: &'static str,        // codec name as ffmpeg reports it
    pub encoders: &'static [&'static str], // ranked, software first
    pub requires_pix_fmt: Option<&'static str>,
}

pub struct ContainerSpec {
    pub id: &'static str,                 // public id and output extension, e.g. "mkv"
    pub ffmpeg_muxer: &'static str,       // ffmpeg's canonical name, e.g. "matroska"
    pub muxer_aliases: &'static [&'static str],
}

pub struct PresetSpec {
    pub id: &'static str,
    pub container: &'static str,           // ContainerSpec id
    pub video_codec: Option<&'static str>, // CodecSpec id
    pub audio_codec: Option<&'static str>,
    pub pix_fmt: Option<&'static str>,
    pub requires_filters: &'static [&'static str],
}
```

Initial breadth matches the conversion routes the navigation currently promises:
video `h264 hevc av1 vp9 prores prores4444 dnxhr`; audio `aac mp3 opus flac wav alac`; containers `mp4 mkv mov webm avi`; and the twelve existing NLE preset routes. `copy` is a pseudo-codec: it does not require an encoder and is offered only for the current input stream. It is **not** proof that the selected output container accepts that stream.

The catalog is an append-only public contract. Adding `vp8`, `vorbis`, `gif`, or any other future format is a later catalog change with its presentation entry and fixture-driven resolution test; it is not silently bundled into this first implementation.

Ranking is software-first — e.g. `hevc` → `["libx265", "hevc_nvenc", "hevc_qsv", "hevc_amf", "hevc_vaapi", "hevc_videotoolbox", "hevc_mf"]`. `_mf` (Media Foundation) ranks last. With `prefer_hardware = true`, resolution stable-partitions **smoke-verified** hardware encoders before software; it never selects an unverified hardware candidate.

This layer establishes binary availability, not every file-specific stream/container combination. The convert form keeps `copy` tied to the probed input, and the job engine still reports ffmpeg's result for an incompatible copy/remux request. A future output-profile feature may add a curated codec/container compatibility matrix; it is not inferred from `-muxers` output.

### Id stability guarantee (contract, not a convention)

Catalog ids cross IPC, key the frontend presentation registry, are written into `media_history.json` job snapshots, and are compared by the guard script. Therefore:

1. Charset `[a-z0-9-]{2,32}`; never an ffmpeg internal name by coincidence of spelling — `dnxhr` is our id, `dnxhd` is ffmpeg's encoder.
2. **Ids are append-only.** Renaming one is a breaking change; add a new id instead.
3. Removal requires deleting the matching presentation entry in the same commit and noting it here.
4. A `#[test]` in `catalog.rs` asserts: ids unique across all three tables, charset conformance, every `PresetSpec` reference resolves to an existing `CodecSpec`/`ContainerSpec` id, and every non-`copy` `encoders` list is non-empty.

---

## 8. Resolution (`capability/resolve.rs`)

```rust
pub fn resolve(ffmpeg: Option<&FfmpegCapabilities>, ffprobe: Option<&FfmpegCapabilities>,
               ytdlp: Option<&YtDlpCapabilities>, smoke: &SmokeResults,
               policy: &ResolvePolicy, now_unix_ms: u64) -> CapabilityReport;
```

Pure — no I/O, no clock, no locks. Per codec: walk the ranked encoder list, skip any encoder absent from `encoders`, skip experimental entries, skip hardware entries whose smoke result is `Failed`, and exclude an unverified hardware entry from `chosen_encoder`. If `prefer_hardware` is set, first stable-partition the **passed** hardware candidates ahead of software; otherwise keep catalog order. First survivor becomes `chosen_encoder`; the rest become `alternatives` (what the Advanced disclosure lists). Empty → `available: false` with `MissingEncoder { candidates }` naming every encoder tried, so the notice can say precisely *"needs libx265 or hevc_nvenc; your ffmpeg 7.0 has neither"*.

When hardware is preferred, the UI requests `verify_hardware_encoders` with **every** unverified hardware candidate for the codecs currently on screen — one call, not one per codec. That command validates each name against the cached parsed inventory, runs the batch under the §9.2 concurrency bounds, persists all outcomes together, increments the generation once, and emits a single replacement snapshot. Until that event arrives, the report is safely software-resolved and may expose `HwUnverified` as a non-selectable diagnostic — never as an available encoder.

Resolution itself is a linear walk over a catalog of ~27 entries against binary-searched
inventories, so it is microseconds and needs no caching of its own. It is re-run whole on
every generation rather than patched incrementally; a partial-update path would be more
code and more states to get wrong for time that is not measurable.

Containers require a muxer matching the id or any declared alias. Presets require their container, codecs, pix_fmt and filters; the first failure becomes the reason. `ffmpeg = None` → every codec/container is `ToolMissing`, report `Degraded`, and no probe is attempted.

---

## 9. Detection (`capability/detect.rs`)

```rust
pub async fn detect_ffmpeg(path: &Path, source: DependencySource, version: &str) -> FfmpegCapabilities;
pub async fn detect_ytdlp(path: &Path, source: DependencySource, version: &str, ffmpeg_linked: bool) -> YtDlpCapabilities;
pub async fn encoder_detail(path: &Path, encoder: &str) -> AppResult<EncoderDetail>;
```

- Resolve each tool once through `core::tools::probe`; its cached version result rides along as fingerprint *payload* (§10.1), not as part of the key. ffprobe contributes only its resolved path/version/source; it has no capability inventory in this slice.
- Every spawn copies the established shape from `probe.rs:185-215`: `tokio::process::Command`, **args array only** (never a shell string), `.kill_on_drop(true)`, `#[cfg(windows)] .creation_flags(0x0800_0000)` (`CREATE_NO_WINDOW`), `tokio::time::timeout`.
- Timeouts: inventory probes 20 s, `-h encoder=` 20 s, yt-dlp `--help` 20 s (§3.2 — the earlier 60 s rested on a measurement that does not reproduce), smoke test 15 s.
- A single failed probe records a `ProbeError` and leaves that inventory empty; it never fails the whole detection. Ten probes, ten independent failure domains.
- `-h encoder=<name>` needs one argv token, built as `format!("encoder={name}")` where `name` is **validated against the parsed encoder inventory first** — a closed set derived from the binary itself, so no caller-supplied string ever reaches ffmpeg.
- Parsing is pure CPU over ≤600-line strings (sub-millisecond, §3.4 finding 3); it stays on the async task rather than `spawn_blocking`, which is reserved for the existing 150 MB hashing path. Do not add a thread pool for parsing — it would cost more in scheduling than it saves.

### 9.1 Two-tier probe wave

`detect_ffmpeg` publishes **twice**, not once.

```rust
pub async fn detect_ffmpeg(
    path: &Path, source: DependencySource, version: &str,
    on_tier_a: impl FnOnce(FfmpegCapabilities),   // fired at ~160 ms
) -> FfmpegCapabilities;                          // resolves at ~320 ms
```

| Tier | Probes | Unblocks |
|---|---|---|
| **A** | `-encoders`, `-muxers` | Every `ResolvedCodec` and `ResolvedContainer` — i.e. the whole convert form |
| **B** | `-decoders`, `-demuxers`, `-filters`, `-pix_fmts`, `-protocols`, `-bsfs`, `-hwaccels`, `-buildconf` | Preset `requires_filters`/`requires_pix_fmt` gating, `ToolBuildInfo` counts, and the `/settings/ffmpeg` inspector |

Both tiers are one `tokio::task::JoinSet` each, so wall time per tier is its slowest probe
rather than the sum. Tier A is awaited and resolved into a report immediately; tier B
continues in the background and produces a second, complete report at a higher generation.
Measured: **158 ms to a usable convert form** against 319 ms for the all-at-once wave, and
against 1 014 ms if anyone ever writes the serial version by accident.

A tier-A-only report is `ReportStatus::Ready`, not `Building` — it is authoritative for
codecs and containers, which is what `enqueue_convert` validates against. Presets that
declare `requires_filters` or `requires_pix_fmt` resolve to `available: false` with reason
`PendingProbe` until tier B lands, because claiming a preset works on unprobed evidence is
exactly the lie §1 exists to remove. `UnavailableReason` therefore gains one variant:

```rust
PendingProbe { probe: Box<str> },   // tier B has not reported yet; not a failure
```

The UI renders `PendingProbe` as a `Skeleton`, never as a red "unsupported" notice.

### 9.2 Batched, bounded smoke verification

`verify_hardware_encoders` takes a **list**, not a single encoder:

```rust
pub async fn smoke_encoders(ffmpeg: &Path, encoders: &[&str]) -> Box<[(Box<str>, SmokeOutcome)]>;
```

When the user enables `preferHardware`, the UI asks for every unverified hardware
candidate of the codecs currently on screen in **one** call. §3.3 measured six mixed
smoke tests at 1 237 ms concurrent against ~3.6 s serial, and a codec's full seven-candidate
list at ~4 s serial — the difference between a toggle that feels instant and one that
visibly hangs.

Concurrency is bounded, not unlimited:

- **At most 3 in flight per `EncoderKind`.** Consumer NVENC session caps are real on older
  drivers, and a spurious `OpenEncodeSessionEx failed` would be cached as a permanent
  `Failed` verdict — a false negative that hides a working encoder until the binary
  changes. Three concurrent NVENC sessions were verified to pass here (§3.3); that is the
  ceiling this evidence supports, so it is the ceiling used.
- **No cap across kinds** — NVENC, QSV, AMF and VAAPI touch different drivers.
- One global semaphore of 6 total, so a machine advertising many encoders cannot spawn a
  dozen ffmpeg processes at once.

Results are written to the disk cache in **one** batch (§10.2), not one save per encoder.

### 9.3 The smoke argv is per-`EncoderKind`, not universal

§3.5 measured the universal argv failing VAAPI for the wrong reason. One argv per kind,
selected from a static table — no runtime branching on encoder *name*, only on the
`EncoderKind` the parser already assigned:

| `EncoderKind` | Extra argv | Notes |
|---|---|---|
| `Software` | — | baseline; `libx264` measured rc=0 in 146 ms |
| `Nvenc` | — | accepts software frames and uploads internally |
| `Amf` | — | accepts software frames |
| `MediaFoundation` | — | Windows only; absent elsewhere so never reached |
| `Qsv` | `-init_hw_device qsv=hw` (+ `-filter_hw_device hw`) | on Linux QSV runs over VAAPI; explicit init avoids depending on auto-detection |
| `Vaapi` | `-init_hw_device vaapi=va:<render_node>` `-filter_hw_device va` and `-vf format=nv12,hwupload` **replacing** `-pix_fmt yuv420p` | mandatory — see §3.5 |
| `VideoToolbox` | — | macOS only, PATH-installed ffmpeg only |

The VAAPI form, in full, is the one verified against this build:

```
-hide_banner -loglevel error -init_hw_device vaapi=va:/dev/dri/renderD128 -filter_hw_device va
-f lavfi -i nullsrc=s=256x144 -frames:v 1 -vf format=nv12,hwupload -c:v h264_vaapi -f null -
```

**Render node selection (Linux).** `<render_node>` is not a constant. Enumerate
`/dev/dri/renderD*` — a hybrid laptop has `renderD128` **and** `renderD129` — and use the
first node the process can actually open. Enumerate once per detection and cache it on the
ffmpeg record; it is a directory read, not a spawn. On Windows and macOS the device
specifier is omitted entirely (`vaapi=va`), which is what produced the honest
`Failed to initialise VAAPI connection` result in §3.5.

**Permission failures are not hardware failures.** If `/dev/dri` exists but no render node
is openable, the user is simply not in the `render` (or `video`) group — a one-command
fix, and overwhelmingly the most common VAAPI complaint on Arch. Reporting that as
"your GPU cannot encode H.264" would be both wrong and unactionable. `UnavailableReason`
therefore gains a variant distinct from `HwSmokeFailed`:

```rust
HwDeviceUnavailable { kind: EncoderKind, detail: Box<str> },   // fixable: driver, permissions, no device
```

Classification is by stderr substring, checked before falling through to `HwSmokeFailed`:
`Failed to initialise VAAPI connection`, `Device creation failed`, `failed to open`
(the AMF `amfrt64.dll` shape), `No VA display found`, `Permission denied` →
`HwDeviceUnavailable`. `No capable devices found` (the measured `av1_nvenc` case) and
`could not find any MFT` are genuine capability answers → `HwSmokeFailed`. Anything
unmatched is `HwSmokeFailed` with the stderr tail attached, because the conservative
answer is to not offer the encoder.

`capability-notice/` renders the two differently: `HwDeviceUnavailable` gets the remedy
(`usermod -aG render $USER`, install the driver package), `HwSmokeFailed` states the
hardware cannot do it and offers nothing. Only `HwSmokeFailed` is a permanent verdict;
`HwDeviceUnavailable` is re-tested on the next explicit Refresh, since a group change or
driver install can make it true without the ffmpeg binary changing.

**Platform-filtered ranking.** `catalog.rs` ranked lists stay one flat, platform-agnostic
array — resolution already skips encoders absent from the inventory, so `hevc_mf` simply
never matches on Linux. What *is* platform-aware is the order: with `prefer_hardware`, the
stable partition puts the platform-native family first (`_mf`/`_nvenc`/`_qsv`/`_amf` on
Windows, `_vaapi`/`_nvenc`/`_qsv` on Linux, `_videotoolbox` on macOS) so a Linux box with
both NVENC and VAAPI available does not get an arbitrary answer. `linux/aarch64` is a
shipped target, so `h264_v4l2m2m` and `h264_rkmpp` belong in the ranked lists too, below
the desktop families; they cost nothing when absent and are the only hardware path on an
ARM SBC.

### Smoke test (`capability/smoke.rs`)

```rust
pub async fn smoke_encoder(ffmpeg: &Path, encoder: &str) -> SmokeOutcome;   // Passed | Failed { detail }
```

Argv: `-hide_banner -loglevel error -f lavfi -i nullsrc=s=256x144 -frames:v 1 -pix_fmt yuv420p -c:v <encoder> -f null -`. Writes nothing to disk and decodes nothing. Measured cost is **~460 ms on success and ~640 ms on failure** (§3.3), not the ~200 ms this plan first assumed — a failing driver is loaded and interrogated before it gives up, so the pessimistic path is the expensive one. That asymmetry is the whole reason §9.2 batches. It runs only for a non-`Software` encoder selected through `verify_hardware_encoders`, and its outcome is cached under the binary fingerprint **and persisted to disk**, so a verified GPU is verified once per install rather than once per app launch. `Failed` captures ffmpeg's stderr tail (truncated to 200 characters) as the reason detail. A passed smoke test is necessary but not sufficient: a real job can still fail for its source, pixel format, driver, or output profile.

---

## 10. Caching (`capability/cache.rs`)

```rust
pub struct CapabilityService {
    // short critical sections only; no MutexGuard survives an await
    cache: std::sync::Mutex<CapabilityMemory>,
    // tracks exactly one rebuild task for a resolved tool-set/fingerprint generation
    refresh: std::sync::Mutex<RefreshState>,
}
```

### 10.1 The fingerprint is stat-only

```rust
pub struct CapabilityFingerprint { pub path: Box<str>, pub len: u64, pub mtime_unix_ms: u64 }
```

**The parsed version is cached payload, not part of the key.** This is the single most
consequential caching decision in the plan, and the first draft had it wrong.

`probe.rs` caches versions in memory only, keyed by `(len, mtime)`. That cache dies with
the process. So if the version string were part of the capability key, then *validating*
the disk cache on a cold start would require re-running `--version` on all three tools —
including yt-dlp's ~1.5 s Python startup (§3.2) — before the layer could conclude that
nothing had changed and it need not have spawned anything at all. The cache would pay
almost the full price of a miss on every hit.

With a stat-only key, a warm start validates with **three `tokio::fs::metadata` calls,
microseconds each, and zero process spawns.** The version string is stored inside the
cached record and re-published from there; `(len, mtime)` already changes whenever the
version does, because a new version is a different file. Nothing is lost.

The two facts this rests on are worth stating so a later slice does not "tidy" the key:

1. `len` + `mtime` is precisely the invalidation signal `probe.rs:102-130` already trusts
   for both versions and 150 MB SHA-256 digests. This is not a weaker guarantee than the
   rest of the app uses; it is the same one.
2. A binary edited in place to the same length within the same mtime granularity would be
   missed — which is why "Check Paths" and every install/uninstall/update path calls the
   explicit invalidator below, and why the user-facing Refresh button exists.

#### The key is platform-aware in three ways

```rust
pub struct CapabilityFingerprint {
    pub path: Box<str>,            // normalised per §10.1; the *resolved* path
    pub len: u64,
    pub mtime_unix_ms: u64,
    #[cfg(unix)] pub inode: u64,   // st_ino — free, and much stronger than (len, mtime)
}
```

**Path comparison.** Windows and macOS (APFS, case-insensitive by default) treat
`C:\FFmpeg\bin\ffmpeg.EXE` and `c:\ffmpeg\bin\ffmpeg.exe` as one file; Linux does not.
Comparing raw strings gives a spurious cache miss on Windows — a full 319 ms re-probe
because a picker returned different casing than `PATH` did. Normalise with
`cfg!(windows) || cfg!(target_os = "macos")` → case-fold, otherwise byte-exact. Never
case-fold on Linux: two files there genuinely can differ only by case.

**Inode on Unix.** `std::os::unix::fs::MetadataExt::ino()` is already in the `metadata()`
result, so it costs nothing, and it closes the one gap `(len, mtime)` leaves on Linux:
Arch and other distros increasingly build reproducibly with `SOURCE_DATE_EPOCH`, which
*pins mtime across rebuilds*. `pacman` installs by writing a new file and renaming, so the
inode always changes even when mtime deliberately does not. The Windows equivalent
(`file_index()`) is still unstable in std, so it is deliberately not used — `#[cfg(unix)]`
on the field rather than a cross-platform abstraction that would only ever have one
implementation.

**mtime granularity.** ext4/btrfs/xfs and NTFS are sub-millisecond, so `mtime_unix_ms` is
lossless there. FAT32/exFAT is **2-second** granularity — reachable when a portable install
or a manual override points at a USB drive. That widens the in-place-edit window from
milliseconds to seconds; it does not create a new failure class, and on Unix the inode
covers it anyway. Worth a comment at the struct, not a mechanism.

**Symlinks.** Use `metadata()` (follows) and not `symlink_metadata()`. On Arch,
`/usr/bin/ffmpeg` can be a symlink, and it is the *target's* identity that determines
capabilities. Following also makes the common Arch upgrade flow correct for free: a
`pacman -Syu` that replaces ffmpeg under a running app changes the target's inode and
mtime, so the next `get_media_capabilities` misses and re-probes without any explicit
invalidation. That flow is supported, not merely tolerated.

### 10.2 Disk layout and durability

- Disk file `media_capabilities.json` (new `AppPaths::media_capabilities` field, `local_data.join("media_capabilities.json")`) stores `{ schemaVersion: u32, entries: [...] }` and is **LRU-capped at four fingerprinted tool-set entries**, not four disconnected inventories per tool. This keeps one report atomically coherent across ffmpeg, ffprobe, and yt-dlp. A schema mismatch, malformed entry, or fingerprint mismatch is a cache miss, never a migration attempt.
- Each entry carries the raw inventories, the resolved report, the version strings, **and the accumulated smoke-test verdicts**. A GPU verified on Monday is still verified on Tuesday; re-running a 4 s hardware sweep on every launch is exactly the cost the disk cache exists to remove.
- Save the disk cache with the same temp-file + rename durability pattern as the KV store; `state::write_json` is not an adequate substitute because it writes directly to the destination. A partial cache must never replace the last known-good cache.
- **Writes are debounced and coalesced**, reusing `kv.rs`'s `Notify` + `FLUSH_DEBOUNCE` idiom rather than a fresh mechanism. Tier A completion, tier B completion, and a batch of smoke verdicts arriving within a second of each other produce **one** serialise-and-rename, not three. Serialising ~2 100 entries is not free, and it must never land on the path that publishes a report to the UI.
- The disk write happens **after** the in-memory cache is updated and the `media:capabilities` event is emitted. Persistence is a background durability concern; it is never in the user's critical path.

### 10.3 Lifecycle — per-tool, lazy, and warm on start

- **Warm-load at startup.** During Tauri `setup`, spawn one detached task that reads `media_capabilities.json`, stats the three binaries, and — on a hit — populates the in-memory cache. The first navigation to `/convert/quick` then finds a `Ready` report with **zero spawns and zero IPC round-trips beyond the initial `get_media_capabilities`**. This is what turns the 319 ms cold path into a ~0 ms warm path, and it is why §10.1 matters.
- **ffmpeg and yt-dlp are separate cache records with separate generations.** `CapabilityReport` is assembled from whichever records are currently present. ffmpeg's tier-A report publishes at ~160 ms regardless of what yt-dlp is doing; yt-dlp's ~1.5 s help capture patches its slice of the report when it lands. Neither tool's slowness is ever charged to the other's surface.
- **yt-dlp is probed on demand.** Nothing spawns it until a yt-dlp surface is reached — `/youtube/*` or `/settings/ytdlp` — or the user presses Refresh. A user who only converts local files never pays for it at all. The hook exposes `ensureYtDlp()` for those routes to call on mount.
- `get_media_capabilities` returns the current snapshot immediately. A stale/missing record starts at most one detached rebuild and returns `building` with no report for that tool; an already valid record is returned as `ready` or `degraded`. `refresh_media_capabilities` requests a new generation and joins that generation rather than spawning a second concurrent probe. A completion only updates the cache or emits `media:capabilities` if its generation is still current — so an old result cannot overwrite a newer path change.
- Add one `invalidate_media_capabilities()` helper that drops the in-memory records, cancels/invalidates any older refresh generation, and removes the disk record on the next successful save. Call it beside every existing `state.probe.invalidate()` and `invalidate_locations()` call: install, uninstall, update, manual override set/clear, and “Check Paths”.
- **"Check Paths" must not discard capabilities.** `probe.rs` already distinguishes `invalidate()` from `invalidate_locations()` for exactly this reason — a re-scan of *where* tools live is not a claim that the files changed, and commit `cf19698` fixed a regression of this shape once already. Mirror the distinction: a location re-scan keeps every capability record whose `(path, len, mtime)` still matches, and re-probes only tools whose resolved path actually moved. Getting this wrong silently reintroduces a full 319 ms + 1.5 s sweep on a button that should be nearly free.

---

## 11. Backend wiring and cutovers

### 11.1 State

`AppState` gains `pub capability: Arc<CapabilityCache>`; `AppPaths` gains `pub media_capabilities: PathBuf`. Constructed in `AppState::new`, matching the existing `probe`/`kv` fields. No `AppHandle` is stored (existing rule).

### 11.2 Commands — `src-tauri/src/commands/capability.rs` (new, thin)

| Command | Signature |
|---|---|
| `get_media_capabilities` | `(app: AppHandle, state: State<'_>) -> AppResult<CapabilityReport>` |
| `refresh_media_capabilities` | `(app: AppHandle, state: State<'_>) -> AppResult<()>` |
| `get_capability_inventory` | `(state: State<'_>, tool: String, kind: InventoryKind) -> AppResult<Vec<InventoryRow>>` |
| `get_encoder_detail` | `(state: State<'_>, encoder: String) -> AppResult<EncoderDetail>` |
| `set_hardware_preference` | `(app: AppHandle, state: State<'_>, value: bool) -> AppResult<()>` |
| `verify_hardware_encoders` | `(app: AppHandle, state: State<'_>, encoders: Vec<String>) -> AppResult<()>` |
| `ensure_ytdlp_capabilities` | `(app: AppHandle, state: State<'_>) -> AppResult<()>` |

`verify_hardware_encoders` takes a list per §9.2 — the plural is the contract, and a
single-encoder variant must not be added alongside it. Each name is validated against the
parsed encoder inventory before any spawn (§9), results are cached and persisted in one
batch, and the new generation is emitted once for the whole batch rather than per encoder.
`ensure_ytdlp_capabilities` is the on-demand yt-dlp probe (§10.3): idempotent, a no-op when
a valid record exists, and never called from a convert surface.

Registered in `lib.rs` under a `// Capability` group. `set_hardware_preference` writes `kv.set("media", "preferHardware", …)` and re-emits the report. Event `media:capabilities` carries `{ status, report, message }`.

### 11.3 `AppError` gains one kind

`AppError::capability(impl AsRef<str>)` → `{ kind: "capability", message }`, so the frontend can branch with `isAppError(e) && e.kind === "capability"`. `AppErrorKind` in `src/lib/types.ts` updated in the same pass (the `kind` set is the contract).

### 11.4 `validate.rs` cutover

The three `const` arrays are **deleted**. Signatures become:

```rust
pub fn container(value: &str, report: &CapabilityReport) -> AppResult<()>;
pub fn video_codec(value: &str, report: &CapabilityReport) -> AppResult<()>;
pub fn audio_codec(value: &str, report: &CapabilityReport) -> AppResult<()>;
pub fn encoder_override(value: &str, codec_id: &str, report: &CapabilityReport) -> AppResult<()>;
pub fn convert_spec(spec: &ConvertSpec, report: &CapabilityReport) -> AppResult<()>;
```

Each requires **both** membership in the catalog (a closed, Rust-defined set — the vault's allowlist rule) **and** current availability in the report. Unavailable → `AppError::capability`, unknown id → `AppError::validation`. `enqueue_convert` loads the cached report and validates before enqueuing: the frontend hiding an option is UX, never enforcement. `url()` and `format_id()` are unchanged.

### 11.5 `ffmpeg_tool.rs` cutover

```rust
pub fn build_transcode_args(spec: &ConvertSpec, choice: &EncoderChoice, output_path: &Path) -> Vec<String>;
```

Emits concrete encoders — `-c:v libx265`, `-c:a aac`, `-pix_fmt yuv420p` when the choice carries one — instead of bare codec names. `ConvertSpec` gains `video_encoder: Option<String>` and `audio_encoder: Option<String>` (the Advanced override; `None` means backend-ranked). `Vec::with_capacity` sized to the known argument count.

### 11.6 Defect fix — revised down

`core/tools/probe.rs:32`: `VERSION_TIMEOUT` 8 s → **20 s**, with a comment citing the
measured cold/warm split rather than the retracted 30 s figure.

The justification changed with the measurement (§3.2). Steady-state `yt-dlp --version` is
1.5 s and comfortably inside the existing 8 s; the failure mode is the **first execution of
a freshly installed `.EXE`**, which Windows Defender scans synchronously — 3.7 s observed
here, and plausibly several times that on a slower disk or a stricter policy. That is
precisely the moment the app *will* probe, since an install is followed immediately by a
dependency refresh.

20 s covers that tail with margin while still failing a genuinely hung binary in a
tolerable time. 30 s was over-provisioned on a number that does not reproduce, and a
timeout that long is itself a UX defect — it is 20 s of a spinner before the user is told
anything is wrong.

---

## 12. Frontend

### 12.1 Contract mirror

`src/lib/types.ts` gains hand-mirrored types for every `Serialize` model in §6, with the established JSDoc citing `src-tauri/src/core/media/capability/types.rs`, `Option<T>` → `T | null`, `Box<[T]>` → `readonly T[]`. `UnavailableReason` mirrors as a discriminated union on `kind`.

`src/lib/capability-env.ts` (new) — one snake_case wrapper per command, mirroring `dependency-env.ts` exactly: `get_media_capabilities()`, `refresh_media_capabilities()`, `get_capability_inventory(tool, kind)`, `get_encoder_detail(encoder)`, `set_hardware_preference(value)`.

### 12.2 Hook — `src/hooks/use-media-capabilities.ts`

Built on the existing `createAsyncResource` primitive (the same one `use-dependency.ts` uses), TTL infinite, invalidated explicitly:

```ts
useMediaCapabilities(): { report: CapabilityReport | null; status: ReportStatus | "idle" | "error"; error: string | null; refresh(): Promise<void> }
useCodecOptions(media: "video" | "audio"): readonly CapabilityOption[]   // available only, catalog order
useContainerOptions(): readonly CapabilityOption[]
useCapability(id: string): ResolvedCodec | ResolvedContainer | null      // unavailable included, for the notice
ensureYtDlp(): void                                                      // §10.3 on-demand probe, idempotent
```

One app-lifetime `listen("media:capabilities")` behind the `listenerStarted` + `typeof window` guards (the `use-install.ts` shape), patching the resource store. Prerender-safe startup kick, matching `use-dependency.ts:142-144`. No RAF batching — this event is rare, unlike job progress.

**Derive at write time, not read time.** `useCodecOptions` must not `filter`/`map` the
report during render. A fresh array every render is a new identity every render, which
defeats `shallowEqual` in `useStore`, re-renders every `Select`, and rebuilds its option
children — for data that changes a handful of times per session. Instead, the derived
views are computed **once per report**, inside the resource's settle step, and stored
alongside it:

```ts
type CapabilityView = {
	report: CapabilityReport;
	videoOptions: readonly CapabilityOption[];   // available only, catalog order, frozen
	audioOptions: readonly CapabilityOption[];
	containerOptions: readonly CapabilityOption[];
	byId: ReadonlyMap<string, ResolvedCodec | ResolvedContainer>;   // O(1) useCapability
};
```

The hooks then return a stable reference until the next `media:capabilities` event. This
is the same discipline `buildSearchIndex` already applies in `src/lib/search/build-index.ts`
— pay the projection once, never per keystroke and never per render.

`useCapability(id)` reads `byId`, not a linear scan. With ~13 video codecs, 8 audio and
6 containers a scan would be harmless in isolation, but it is called once per rendered
notice and the map costs nothing to build during a projection that is already walking
every entry.

### 12.3 Presentation registry — `src/registry/media/`

`codecs.ts`, `containers.ts`, `presets.ts`, `inventory-kinds.ts`, `index.ts`. Presentation only, keyed by catalog id, mirroring `registry/tools.ts`'s role:

```ts
export type MediaCatalogEntry = { id: string; label: string; description: string; icon: IconName; hint?: string };
```

Unknown id from the backend renders with a `formatFallbackLabel(id)` rather than crashing — the registry is presentation, never a gate. Any missing lucide names are added to `src/registry/icons.ts` per its documented pattern (candidates: `Ban`, `TriangleAlert`, `Info`, `CheckCircle2`, `XCircle` — verify against the existing map before adding).

### 12.4 Components — `src/components/media/`, shadcn only

Each is a component unit (`index.tsx` + `types.ts`, `functions.ts` when there is non-JSX logic). **Prop bounds are contracts** — no component fetches its own capability data except `capability-inventory/`, which owns lazy per-kind loading.

| Unit | shadcn primitives | Props |
|---|---|---|
| `capability-select/` | `Select`, `Label`, `Field` | `{ id?: string; label: string; options: readonly CapabilityOption[]; value: string \| null; onChange: (id: string) => void; placeholder?: string; disabled?: boolean }` — `options` are **pre-filtered available**; the component never reasons about availability |
| `capability-notice/` | `Empty`, `Alert`, `Button`, `Badge` | `{ reason: UnavailableReason; toolKey: "ffmpeg" \| "ffprobe" \| "ytdlp"; onInstall?: () => void; onChangePath?: () => void }` |
| `encoder-advanced/` | `Collapsible`, `Select`, `Badge`, `HoverCard` | `{ codecId: string; chosen: string \| null; alternatives: readonly string[]; value: string \| null; onChange: (encoder: string \| null) => void; detail?: EncoderDetail \| null; onRequestDetail?: (encoder: string) => void }` — `null` value means "let the backend rank" |
| `capability-inventory/` | `Tabs`, `Command`, `Combobox`, `Table`, `ScrollArea`, `Badge`, `Skeleton` | `{ tool: "ffmpeg" \| "ffprobe" }` — loads each `InventoryKind` on first tab activation; **virtualized and index-backed, see §12.4.1** |
| `build-info-card/` | `Card`, `Badge`, `Accordion`, `Separator` | `{ info: ToolBuildInfo; onRefresh?: () => void }` — buildconf flags inside the accordion |
| `hardware-toggle/` | `Switch`, `Label`, `Field`, `Alert` | `{ value: boolean; onChange: (next: boolean) => void; pending?: boolean }` |

Animation stays GPU-only (`transform`/`opacity`), no `transition-all` — constraint 6. `src/components/ui/` is not touched.

#### 12.4.1 The inventory table is the one real frontend performance risk

Everything else in this layer renders tens of rows. This renders thousands, and a naive
`ScrollArea` + `Table` would be the slowest screen in the app:

| Tab | Rows | Cells at 4 columns |
|---|---:|---:|
| Decoders | 544 | 2 176 |
| Filters | 565 | 2 260 |
| Demuxers | 368 | 1 472 |
| Encoders | 241 | 964 |
| Pix_fmts | 236 | 944 |

Three requirements, each satisfied by a primitive this repo already ships and tests:

1. **Virtualize.** Use `useVirtualList` from `src/lib/list/use-virtual-list.ts` with a
   fixed `itemHeight`. Rows are uniform, so this is the cheap fixed-height path — no
   measurement pass. ~20 mounted rows instead of 565, and switching tabs stops being a
   layout-thrash event. Do not hand-roll a windowing loop; the shared hook already owns
   the `frameRef` scroll-coalescing idiom.
2. **Index the filter once per inventory.** Build a `buildSearchIndex` over the loaded
   `InventoryRow[]` on arrival, projecting `name` → title and `description` → keywords.
   Filtering 565 rows by re-folding strings on every keystroke is exactly the cost
   `src/lib/search/build-index.ts` was written to remove, and it is already covered by
   `bun run verify:search`.
3. **Coalesce the query.** Feed the input through `createFrameBatcher` from
   `src/lib/timing.ts` so a fast typist produces one filter pass per frame rather than one
   per keypress.

**Cache the fetch across mounts.** `get_capability_inventory` returns up to 565 rows,
JSON-serialised across IPC. Back it with `createKeyedResource("capability-inventory", …)`
keyed by `` `${tool}:${kind}` `` with an infinite TTL, invalidated by
`invalidate_media_capabilities()`. Navigating away from `/settings/ffmpeg` and back must
not re-serialise ten inventories; the plan's "loads on first tab activation" was only ever
about the first mount, and without a module-level cache it silently becomes "on every
mount". `peek()` also lets a revisited tab paint on frame 0.

### 12.5 Pages

| Route | Work |
|---|---|
| `/convert/quick` | Selects driven by `useCodecOptions`/`useContainerOptions`; `encoder-advanced` disclosure added; `capability-notice` when ffmpeg is missing or the chosen codec is unavailable; **`src/app/convert/quick/data.ts` deleted** |
| `/youtube/download/video` | Audio-only switch and merge-dependent formats gated on `features` (`ffmpegLinked`, `progressTemplate`); `capability-notice` when yt-dlp is missing or too old; calls `ensureYtDlp()` on mount (§10.3) |
| `/settings/ffmpeg` | New real page: `build-info-card` + `capability-inventory` + `hardware-toggle`. Scaffolded with `bun run scaffold settings/ffmpeg --force`; nav `sys.settings.ffmpeg` → `ready` |
| `/settings/ytdlp` | New real page: `build-info-card` + resolved feature table (`Table` + `Badge`). Calls `ensureYtDlp()` on mount and shows a `Skeleton` for the ~1.5 s probe rather than an empty table. Scaffolded the same way; nav `sys.settings.ytdlp` → `ready` |

Every new `.tsx` under `src/app/` carries the verification stamp (constraint 7); the scaffolder fills it in.

### 12.6 Guard script — `scripts/check-media-registry.ts`

Run via `bun --bun scripts/check-media-registry.ts`, wired into `bun run check` beside `check-registry.ts`. Fails when: a catalog id (regex-scanned from `catalog.rs` `id: "…"` inside `CodecSpec`/`ContainerSpec`/`PresetSpec` literals) has no presentation entry; a presentation entry has no catalog id; a presentation `icon` is absent from `src/registry/icons.ts`; or an id violates the §7 charset. Output is a diff of both directions, not a bare exit code.

---

## 13. Construction slices

Contracts are fixed here so slices never negotiate. Every slice: **skip formatters, linters and project-wide test suites** — one validation pass runs at the end (§14). Agents are `sonnet`/`haiku`-class with low-to-medium effort; `bun --bun` for every JS/TS invocation.

`S0` and `S1` are prerequisites (`S0b` is not — it lands whenever a Linux machine is available) — everything else is one parallel wave, because each slice owns disjoint files and consumes only frozen contracts.

| Slice | Owns | Input contract | Acceptance |
|---|---|---|---|
| **S0** fixtures | `capability/fixtures/*` | §4.11 command table | 15 captured files + 2 synthetic; LF endings; no hand edits to captured output |
| **S0b** Linux fixtures | `capability/fixtures/linux/*`, `.gitattributes`, `docs/plans/evidence/linux-*.md` | §4.11 "One build is not enough evidence"; §3.5 | `bash scripts/capture-media-evidence.sh` on the dual-boot install (and again on Arch if its ffmpeg differs); `fixtures/** -text` pinned; **also produces the X5 result** (§14.2) — blocks nothing, adds a second assertion to S2-S4 when it lands |
| **S1** models + catalog | `capability/{types,catalog,mod}.rs`, `core/media/mod.rs` | §6 verbatim, §7 tables and invariants | Compiles standalone; catalog invariant test passes; no other slice's files touched |
| **S2** codec/format parsers | `capability/parse/{mod,codecs,formats}.rs` | §4.1-4.3; S0 fixtures; S1 types read-only | `libx265` → codec `hevc`, kind `Software`; `dnxhd` → codec `dnxhd`; `hevc_nvenc` → `Nvenc`; `mov,mp4,m4a,3gp,3g2,mj2` → 6 aliases; `minimal-encoders.txt` yields no hevc encoder |
| **S3** filter/pix_fmt/list parsers | `capability/parse/{filters,pix_fmts,lists,buildconf}.rs` | §4.4-4.7; S0 fixtures | 565-line filter fixture → `scale`, `crop`, `loudnorm` present with correct signatures; hwaccels → exactly the 8 measured names on the Windows fixture, and the count is read from the fixture rather than hardcoded; protocols split input/output |
| **S4** detail + yt-dlp parsers | `capability/parse/{encoder_detail,ytdlp_help}.rs` | §4.8, §4.10; S0 fixtures | libx265 fixture → 18 pix_fmts, `crf` option with range and default; aac fixture → sample formats, `pix_fmts: None`; help fixture → sorted flag set containing `--progress-template` |
| **S5** resolve + features | `capability/{resolve,ytdlp_features}.rs` | §8, §2 refinement; S1 types | Full fixture inventory → `hevc` available via `libx265`; `minimal-encoders.txt` → `hevc` unavailable with `MissingEncoder` listing all 7 candidates; `prefer_hardware` partitions without reordering within groups |
| **S6** detect + smoke + cache | `capability/{detect,smoke,cache}.rs` | §9, §9.1, §9.2, §10; S1 types; parser signatures from S2-S4 | Two-tier `JoinSet` wave, tier A publishing before tier B starts resolving; per-probe timeouts as specified; one probe failure degrades only its inventory; **fingerprint is stat-only and a hit spawns nothing**; smoke tests batch with a per-kind cap of 3 and use the **per-`EncoderKind` argv table from §9.3** (a universal argv is a rejected design, not a simplification); `HwDeviceUnavailable` classified from stderr before `HwSmokeFailed`; render node enumerated once on Linux; disk writes debounced and off the publish path; ffmpeg and yt-dlp hold separate records |
| **S7** commands + wiring | `commands/capability.rs`, `commands/mod.rs`, `lib.rs`, `state.rs`, `error.rs`, `core/tools/probe.rs:32` | §11.1-11.3, §11.6 | 7 commands registered; `AppError::capability` added; no `unwrap`/`expect`/`panic` (deny-linted); `AppState`/`AppPaths` fields added |
| **S8** validate + args cutover | `core/media/validate.rs`, `core/media/ffmpeg_tool.rs`, `core/media/types.rs` (`ConvertSpec`), `commands/media.rs` call sites | §11.4, §11.5 | Static consts gone; concrete encoder names in argv; `enqueue_convert` validates against the report |
| **S9** TS contract | `src/lib/types.ts`, `src/lib/capability-env.ts`, `src/hooks/use-media-capabilities.ts` | §12.1, §12.2; §6 as the source of truth | Types mirror field-for-field; wrappers snake_case; single guarded listener; prerender-safe; **`CapabilityView` projected once per report, hooks return stable references across renders**; `useCapability` reads the `byId` map; `ensureYtDlp()` is idempotent |
| **S10** presentation registry | `src/registry/media/*`, `src/registry/icons.ts` | §12.3; §7 id list | Entry per catalog id; icons registered; fallback label for unknown ids |
| **S11** components A | `components/media/{capability-select,capability-notice,hardware-toggle}/` | §12.4 prop tables | shadcn only; props exact; no data fetching; GPU-only animation |
| **S12** components B | `components/media/{encoder-advanced,capability-inventory,build-info-card}/` | §12.4 prop tables, §12.4.1 | Lazy per-tab inventory load; `Table` renders every kind through `InventoryRow`; **`useVirtualList` with fixed row height** (mounted rows bounded regardless of tab); `buildSearchIndex` built once per inventory; query coalesced through `createFrameBatcher`; fetch memoized in a `createKeyedResource` so a revisit re-serialises nothing |
| **S13** pages + guard | `src/app/convert/quick/*`, `src/app/youtube/download/video/page.tsx`, `src/app/settings/{ffmpeg,ytdlp}/*`, `src/registry/nav/system.ts`, `scripts/check-media-registry.ts`, `package.json` | §12.5, §12.6 | `data.ts` deleted; two nav entries `ready`; stamps present; guard wired into `bun run check` |

Cross-slice rule: a slice that needs a symbol another slice owns imports it against the contract in this document and does **not** edit the other slice's files. Overlap is resolved by these contracts, not by reconciliation afterwards.

---

## 14. Verification

Tests are deliberately few and all defend an observable contract. No broad `cargo test` sweeps during construction.

**Unit (~12, pure, fixture-driven):** codec row → encoder/codec/kind mapping · alias splitting on `mov,mp4,…` · filter signature parse · pix_fmt flag parse · hwaccel list exactness · encoder-detail range/default extraction · yt-dlp flag-set extraction · `hevc` resolves to `libx265` on the real fixture · `hevc` unavailable with a complete `MissingEncoder` candidate list on `minimal-encoders.txt` · `prefer_hardware` partition stability · catalog id invariants · fingerprint mismatch causes a cache miss.

Four more defend the caching decisions specifically, because each guards against a
plausible future "simplification":

- **A fingerprint with an unchanged `(path, len, mtime)` hits even when the version string differs** — proves the version stayed out of the key (§10.1).
- **Tier-A-only capabilities resolve `hevc` to `libx265`** while a `requires_filters` preset reports `PendingProbe`, not `MissingFilter` — proves the partial report is honest rather than merely early (§9.1).
- **Round-tripping an `Inventory<T>` through the disk representation preserves every name and description** — proves spans were materialised at the boundary rather than serialised (§6.2).
- **A cached `HwSmokeFailed` verdict is returned without invoking the smoke runner** — inject a runner that panics if called (§10.2).

**Live, on this workstation — the proof that matters:**

1. `bun run dev`, open `/convert/quick`: H.265 offered, Advanced shows `libx265` chosen with `hevc_nvenc`, `hevc_qsv`, `hevc_amf`, `hevc_vaapi`, `hevc_mf` as alternatives.
2. `/settings/ffmpeg`: build card reports `7.0-full_build-www.gyan.dev`, inventory tabs list the real 241 encoders / 186 muxers / 565 filters / 236 pix_fmts / 8 hwaccels.
3. Enable the hardware toggle, select AV1: **`av1_nvenc` must be rejected** by the smoke test on this GTX 1650 and AV1 must fall back to `libsvtav1`/`libaom-av1`. This is the false-positive from §3.4 finding 2, already reproduced at the command line in §3.3 — if it silently passes, the smoke test is not wired.
4. `/settings/ytdlp`: version renders (proving the 20 s timeout fix) and the feature table reflects the real flag set.
5. Point ffmpeg's "Change Path" override at a different build, confirm the report rebuilds and the option list changes without an app restart.

### 14.0 What the five live checks above actually cover

They are **Windows-only**, and were written on a GTX 1650. Case 3 (`av1_nvenc` rejected) is
a statement about one GPU. Case 2's counts are one build's. Re-running them on Linux and
expecting the same numbers is a misreading; §14.2 gives the portable form.

### 14.1 Performance acceptance

The §3 measurements are the baseline these are checked against. Numbers are for this
workstation; on other hardware the *ratios* and the spawn counts are what must hold.

| # | Check | Target | How |
|---|---|---|---|
| P1 | Cold first paint of `/convert/quick` selects | ≤ 250 ms after `get_media_capabilities` | Tier A is 158 ms measured; the budget is tier A plus IPC |
| P2 | Full ffmpeg report (tier A + B) | ≤ 500 ms | 319 ms measured concurrent |
| P3 | **Warm start spawns zero processes** | exactly 0 | The decisive one. Launch, open `/convert/quick`, confirm via Process Monitor (or a temporary `tracing` counter in `detect.rs`) that no `ffmpeg.exe` is created. A non-zero count means the fingerprint picked up the version again (§10.1) |
| P4 | Warm `/convert/quick` report availability | ≤ 20 ms | Served from the startup warm-load (§10.3) |
| P5 | `/convert/quick` never blocks on yt-dlp | 0 yt-dlp spawns | Navigate only to `/convert/quick`; yt-dlp must not be executed at all (§10.3) |
| P6 | Enable `preferHardware`, verify a codec's candidates | ≤ 1.5 s | Batched and bounded (§9.2); ~4 s means it went serial |
| P7 | Hardware verdicts survive a restart | 0 smoke spawns on second launch | Verify AV1, restart, confirm `av1_nvenc` is still `HwSmokeFailed` without re-probing |
| P8 | Filters tab (565 rows) mounted DOM rows | ≤ 40 | Inspect the DOM; unvirtualized renders 565 |
| P9 | Typing in the inventory filter | no dropped frames, ≤ 1 pass/frame | Performance panel while typing fast in the filters tab |
| P10 | Leave and return to `/settings/ffmpeg` | 0 additional `get_capability_inventory` calls | Keyed resource cache (§12.4.1) |
| P11 | "Check Paths" with nothing moved | 0 inventory spawns | The `invalidate_locations` distinction (§10.3) |

P3, P5, P7 and P11 are the ones worth being strict about: each is a *count of spawned
processes*, which is unambiguous, hardware-independent, and the exact thing that regresses
silently when a later change "simplifies" the cache key or the invalidation path.

### 14.2 Per-platform acceptance

Fixture-driven unit tests (§14 "Unit") run identically on all three CI runners and need no
per-platform treatment — that is the point of `include_str!`. Everything that spawns a
process does need it.

| # | Check | Windows | Linux / Arch | macOS |
|---|---|:--:|:--:|:--:|
| X1 | Report builds, tier A then tier B, no `probe_errors` | ✔ | ✔ | ✔ |
| X2 | Managed install path resolves a downloaded ffmpeg | ✔ | ✔ | — (no `BundleSpec`; PATH only) |
| X3 | System-`PATH` ffmpeg resolves and reports | ✔ | ✔ **primary case on Arch** | ✔ |
| X4 | Every advertised hardware encoder is smoke-gated before being offered | ✔ | ✔ | ✔ |
| X5 | **VAAPI encoder on a working VAAPI box resolves `available: true`** | n/a | ✔ **the §3.5 regression test** — `scripts/capture-media-evidence.sh` | n/a |
| X6 | Render-node permission failure reports `HwDeviceUnavailable`, not `HwSmokeFailed` | n/a | ✔ (test by running with the user removed from `render`) | n/a |
| X7 | `pacman -Syu` replacing ffmpeg under the running app invalidates on next read | n/a | ✔ **Arch-specific** | n/a |
| X8 | Media Foundation encoders (`*_mf`) never appear | n/a — they may appear if verified | ✔ absent from inventory | ✔ absent |
| X9 | VideoToolbox resolves for a PATH ffmpeg | n/a | n/a | ✔ |
| X10 | Warm start spawns zero processes (P3) | ✔ | ✔ | ✔ |

**X5 is the one that must not be skipped.** It is the check that would have caught the
defect §3.5 found by inspection. It needs a Linux box with a working `/dev/dri`; the
dual-boot install is that box, and `scripts/capture-media-evidence.sh` runs it — any
`*_vaapi` row reading **Passed** in the generated report *is* X5. A row reading
`Impossible to convert between the formats` means the per-kind argv did not take effect
and the §3.5 defect is still live. Until that report exists, the VAAPI path is *designed*
correctly and *unverified*, and the plan says so rather than implying otherwise.

X7 is worth running once because it is the normal Arch update flow, and the failure mode
is silent: the app would keep offering codecs from a binary that no longer exists at that
inode. §10.1's inode field is what makes it pass.

**Then, once:** `bun run check` · `bash scripts/check-structure.sh` · `bash scripts/check-agents-rules.sh` · `cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test --no-default-features`.

---

## 15. Risks

| Risk | Mitigation |
|---|---|
| Comma-aliased format names missed → `mp4` looks unavailable | Called out as the likeliest bug (§4.3); dedicated test |
| Smoke test passes but the real resolution/pix_fmt fails at encode time | Smoke test is a necessary-not-sufficient gate; job failure still surfaces through the existing `JobStatus::Failed` path |
| Distro ffmpeg enables a codec without an `--enable-` flag | `buildconf` is display/hint only; availability comes from `-encoders` |
| Guard script regex over `catalog.rs` drifts if the literal style changes | Script asserts it found a plausible id count and fails loudly on zero matches; catalog test keeps the literal shape stable |
| Disk cache grows or goes stale across binary swaps | `schemaVersion` + fingerprint keys + 4-entry LRU per tool |
| A future codec route needs quality controls | `EncoderDetail` already models ranges/defaults; only UI remains |
| A later change folds the version back into the fingerprint, silently restoring a ~1.5 s spawn on every warm start | §10.1 states the reason inline; the version-differs-still-hits unit test fails loudly (§14) |
| Tier A ships and tier B is quietly never wired, leaving presets permanently `PendingProbe` | `PendingProbe` renders as a skeleton, so the symptom is visible rather than silent; P2 in §14.1 asserts the complete report |
| Batched smoke tests trip a driver session cap and cache a false `Failed` | Per-kind concurrency capped at 3, the level §3.3 verified; a `Failed` verdict is user-clearable through Refresh |
| Stat-only fingerprint misses an in-place binary edit at identical length and mtime | Same exposure `probe.rs` already accepts for version and hash caches; explicit invalidation on install/uninstall/update/override, plus the Refresh button |
| The inventory table ships unvirtualized because 565 rows "seemed fine" on a fast machine | P8 counts mounted DOM rows rather than judging by feel |
| **The whole layer is tuned against one Windows build and silently misbehaves on Linux** | §3.5 states the measurement scope; S0b captures Linux fixtures; §14.2 splits acceptance per platform; X5 is called out as unrun |
| A universal smoke argv is reinstated as a "simplification", hiding working VAAPI from every Linux user | §9.3 records the measured failure and marks the universal form a rejected design; S6 acceptance names it; X5 is the regression test |
| Windows path casing causes spurious cache misses and full re-probes | §10.1 case-folds on Windows/macOS only, never on Linux |
| A reproducible-build distro pins mtime, weakening `(len, mtime)` | `#[cfg(unix)]` inode in the fingerprint — free, and always changes on a `pacman` replace |
| `HwDeviceUnavailable` is collapsed into `HwSmokeFailed`, turning a `usermod -aG render` fix into "your GPU cannot do this" | Two distinct variants with different UI; only `HwSmokeFailed` is permanent |
| macOS is in CI but has no managed-tool path, so it looks supported and quietly is not | §3.5 states PATH-only explicitly; X2 marks it n/a rather than failing |
