#!/usr/bin/env bash
set -uo pipefail

# Capture the evidence base for docs/plans/2026-08-19-media-capability-layer.md.
#
# Two outputs, one pass:
#
#   1. Parser fixtures    -> src-tauri/src/core/media/capability/fixtures/[linux/]
#   2. A measurement report -> docs/plans/evidence/<os>-<date>.md
#
# The plan's §3 numbers were taken by hand on Windows and are not portable. This
# script exists so the Linux and Arch equivalents are captured the same way
# rather than estimated, and so §3 can be regenerated instead of trusted.
#
# Deliberately NOT `set -e`: probing a binary that fails is data, not an error.
# Every probe records its outcome and the script keeps going.
#
# Usage:
#   bash scripts/capture-media-evidence.sh                 # discover tools on PATH
#   bash scripts/capture-media-evidence.sh --ffmpeg /usr/bin/ffmpeg --ytdlp /usr/bin/yt-dlp
#   bash scripts/capture-media-evidence.sh --no-fixtures   # measurements only

FFMPEG=""
FFPROBE=""
YTDLP=""
WRITE_FIXTURES=1

while [ $# -gt 0 ]; do
    case "$1" in
        --ffmpeg)  FFMPEG="$2"; shift 2 ;;
        --ffprobe) FFPROBE="$2"; shift 2 ;;
        --ytdlp)   YTDLP="$2"; shift 2 ;;
        --no-fixtures) WRITE_FIXTURES=0; shift ;;
        -h|--help) sed -n '3,25p' "$0"; exit 0 ;;
        *) echo "unknown argument: $1" >&2; exit 2 ;;
    esac
done

# ── Platform identity ────────────────────────────────────────────────────────

case "$(uname -s)" in
    Linux*)  OS=linux ;;
    Darwin*) OS=macos ;;
    MINGW*|MSYS*|CYGWIN*) OS=windows ;;
    *) OS="$(uname -s | tr '[:upper:]' '[:lower:]')" ;;
esac
ARCH="$(uname -m)"

DISTRO=""
if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    DISTRO="$(. /etc/os-release && echo "${PRETTY_NAME:-$NAME}")"
fi

# Fixtures from a non-Windows box go in a subdirectory so both sets coexist and
# every parser test can assert against both (plan §4.11).
FIXTURE_ROOT="src-tauri/src/core/media/capability/fixtures"
if [ "$OS" = "windows" ]; then
    FIXTURE_DIR="$FIXTURE_ROOT"
    FIXTURE_PREFIX=""
else
    FIXTURE_DIR="$FIXTURE_ROOT/$OS"
    FIXTURE_PREFIX="$OS-"
fi

REPORT_DIR="docs/plans/evidence"
REPORT="$REPORT_DIR/$OS-$(date +%Y-%m-%d).md"

# ── Tool discovery ───────────────────────────────────────────────────────────

find_tool() {
    # $1 = stem. Honours the app's own env overrides first, matching the
    # resolution order in core/tools/probe.rs.
    local stem="$1" env_override="$2"
    if [ -n "${env_override:-}" ] && [ -x "$env_override" ]; then echo "$env_override"; return; fi
    command -v "$stem" 2>/dev/null || true
}

[ -z "$FFMPEG" ]  && FFMPEG="$(find_tool ffmpeg  "${THEATLAS_FFMPEG_PATH:-}")"
[ -z "$FFPROBE" ] && FFPROBE="$(find_tool ffprobe "${THEATLAS_FFPROBE_PATH:-}")"
[ -z "$YTDLP" ]   && YTDLP="$(find_tool yt-dlp   "${THEATLAS_YTDLP_PATH:-}")"

if [ -z "$FFMPEG" ]; then
    echo "ffmpeg not found. Pass --ffmpeg /path/to/ffmpeg." >&2
    exit 1
fi

echo "os        : $OS/$ARCH${DISTRO:+  ($DISTRO)}"
echo "ffmpeg    : $FFMPEG"
echo "ffprobe   : ${FFPROBE:-<not found>}"
echo "yt-dlp    : ${YTDLP:-<not found>}"
echo "fixtures  : $([ "$WRITE_FIXTURES" = 1 ] && echo "$FIXTURE_DIR" || echo '(skipped)')"
echo "report    : $REPORT"
echo

mkdir -p "$REPORT_DIR"
[ "$WRITE_FIXTURES" = 1 ] && mkdir -p "$FIXTURE_DIR"

# ── Timing helper ────────────────────────────────────────────────────────────
#
# `date +%s%N` is GNU-specific but present on Linux and in Git Bash. macOS's
# BSD date lacks %N, so fall back to whole seconds there rather than printing a
# confidently wrong number.

if date +%s%N 2>/dev/null | grep -qv 'N$'; then
    now_ms() { echo $(( $(date +%s%N) / 1000000 )); }
    TIMING_PRECISION="ms"
else
    now_ms() { echo $(( $(date +%s) * 1000 )); }
    TIMING_PRECISION="s (BSD date: no nanoseconds — install coreutils for ms)"
fi

# Mean wall time of $2 runs of the remaining arguments, in ms.
time_mean() {
    local runs="$1"; shift
    local start end i
    start="$(now_ms)"
    for ((i = 0; i < runs; i++)); do "$@" >/dev/null 2>&1; done
    end="$(now_ms)"
    echo $(( (end - start) / runs ))
}

# ── Report header ────────────────────────────────────────────────────────────

{
    echo "# Media capability evidence — $OS/$ARCH"
    echo
    echo "Captured $(date '+%Y-%m-%d %H:%M %Z') by \`scripts/capture-media-evidence.sh\`."
    echo "Feeds §3 of \`docs/plans/2026-08-19-media-capability-layer.md\`."
    echo
    echo "| Field | Value |"
    echo "|---|---|"
    echo "| OS | \`$OS/$ARCH\` |"
    [ -n "$DISTRO" ] && echo "| Distro | $DISTRO |"
    echo "| Kernel | \`$(uname -r)\` |"
    echo "| ffmpeg | \`$FFMPEG\` |"
    echo "| ffmpeg version | \`$("$FFMPEG" -hide_banner -version 2>/dev/null | head -1)\` |"
    echo "| yt-dlp | \`${YTDLP:-<not found>}\` |"
    echo "| Timing precision | $TIMING_PRECISION |"
    echo
} > "$REPORT"

# ── 1. Inventory probes: fixtures + per-probe cost ───────────────────────────

PROBES="encoders decoders muxers demuxers filters pix_fmts protocols bsfs hwaccels buildconf"

echo "== inventory probes =="
{
    echo "## 1. Inventory probe cost"
    echo
    echo "Mean of 3 warm runs each."
    echo
    echo "| Probe | Lines | Mean | Tier |"
    echo "|---|---:|---:|:--:|"
} >> "$REPORT"

for probe in $PROBES; do
    lines="$("$FFMPEG" -hide_banner "-$probe" 2>/dev/null | grep -c '' || echo 0)"
    ms="$(time_mean 3 "$FFMPEG" -hide_banner "-$probe")"
    case "$probe" in
        encoders|muxers) tier="**A**" ;;
        *) tier="B" ;;
    esac
    printf '  %-11s %5s lines %6s ms\n' "$probe" "$lines" "$ms"
    echo "| \`-$probe\` | $lines | $ms ms | $tier |" >> "$REPORT"

    if [ "$WRITE_FIXTURES" = 1 ]; then
        # Underscores in the flag become hyphens in the file name, matching the
        # plan's fixture table (`ffmpeg-pix-fmts.txt`).
        name="$(echo "$probe" | tr '_' '-')"
        "$FFMPEG" -hide_banner "-$probe" > "$FIXTURE_DIR/${FIXTURE_PREFIX}ffmpeg-${name}.txt" 2>/dev/null
    fi
done

if [ "$WRITE_FIXTURES" = 1 ]; then
    "$FFMPEG" -hide_banner -version > "$FIXTURE_DIR/${FIXTURE_PREFIX}ffmpeg-version.txt" 2>/dev/null
    [ -n "$FFPROBE" ] && "$FFPROBE" -hide_banner -version > "$FIXTURE_DIR/${FIXTURE_PREFIX}ffprobe-version.txt" 2>/dev/null
    for enc in libx265 aac; do
        if "$FFMPEG" -hide_banner -h "encoder=$enc" 2>/dev/null | grep -q "^Encoder $enc"; then
            "$FFMPEG" -hide_banner -h "encoder=$enc" > "$FIXTURE_DIR/${FIXTURE_PREFIX}ffmpeg-h-encoder-$enc.txt" 2>/dev/null
        else
            echo "  note: this build has no $enc encoder — detail fixture skipped"
        fi
    done
fi

# ── 2. Serial vs concurrent ──────────────────────────────────────────────────

echo "== aggregate =="

start="$(now_ms)"
for probe in $PROBES; do "$FFMPEG" -hide_banner "-$probe" >/dev/null 2>&1; done
serial=$(( $(now_ms) - start ))

start="$(now_ms)"
for probe in $PROBES; do "$FFMPEG" -hide_banner "-$probe" >/dev/null 2>&1 & done
wait
concurrent=$(( $(now_ms) - start ))

start="$(now_ms)"
"$FFMPEG" -hide_banner -encoders >/dev/null 2>&1 &
"$FFMPEG" -hide_banner -muxers   >/dev/null 2>&1 &
wait
tier_a=$(( $(now_ms) - start ))

printf '  serial %s ms | concurrent %s ms | tier A %s ms\n' "$serial" "$concurrent" "$tier_a"

{
    echo
    echo "## 2. Aggregate strategies"
    echo
    echo "| Strategy | Wall time |"
    echo "|---|---:|"
    echo "| All ten, serial | $serial ms |"
    echo "| All ten, concurrent | $concurrent ms |"
    echo "| Tier A only, concurrent | $tier_a ms |"
    echo
    echo "Tiering saves $(( concurrent - tier_a )) ms on the path the user feels."
    echo
    echo "### Batching (expected: not possible)"
    echo
    combined="$("$FFMPEG" -hide_banner -encoders -muxers -hwaccels 2>/dev/null | grep -cE '^(Encoders:|File formats:|Hardware acceleration methods:)')"
    echo "\`ffmpeg -encoders -muxers -hwaccels\` emits **$combined** of 3 section headers."
    if [ "$combined" -le 1 ]; then
        echo "Confirms the plan's negative finding: each listing flag is \`OPT_EXIT\`, one flag per spawn."
    else
        echo "> [!warning] This build serviced more than one listing flag. Revisit plan §3.1 —"
        echo "> batching may be possible here, which would change the probe strategy."
    fi
} >> "$REPORT"

# ── 3. yt-dlp ────────────────────────────────────────────────────────────────

{
    echo
    echo "## 3. yt-dlp"
    echo
} >> "$REPORT"

if [ -n "$YTDLP" ]; then
    echo "== yt-dlp =="
    start="$(now_ms)"; yt_version="$("$YTDLP" --version 2>&1 | tail -1)"; yt_cold=$(( $(now_ms) - start ))
    yt_warm="$(time_mean 2 "$YTDLP" --version)"
    yt_help="$(time_mean 2 "$YTDLP" --help)"
    yt_flags="$("$YTDLP" --help 2>/dev/null | grep -oE '^\s+--[a-z0-9-]+' | tr -d ' ' | sort -u | grep -c '' || echo 0)"
    printf '  version %s | cold %s ms | warm %s ms | help %s ms | %s flags\n' \
        "$yt_version" "$yt_cold" "$yt_warm" "$yt_help" "$yt_flags"

    {
        echo "| Command | Wall time |"
        echo "|---|---:|"
        echo "| \`--version\`, first run this session | $yt_cold ms |"
        echo "| \`--version\`, warm | $yt_warm ms |"
        echo "| \`--help\`, warm | $yt_help ms |"
        echo
        echo "Version \`$yt_version\`, $yt_flags distinct flags."
        echo
        echo "Compare Windows (plan §3.2): 3706 / 1502 / 1480 ms. A native distro package"
        echo "should be well under the PyInstaller \`.EXE\` figures; if it is not, the"
        echo "on-demand probing in §10.3 matters more here, not less."
    } >> "$REPORT"

    [ "$WRITE_FIXTURES" = 1 ] && "$YTDLP" --help > "$FIXTURE_DIR/${FIXTURE_PREFIX}ytdlp-help.txt" 2>/dev/null
else
    echo "_yt-dlp not found on this machine._" >> "$REPORT"
fi

# ── 4. Hardware: render nodes, advertised encoders, smoke tests ──────────────

echo "== hardware =="

{
    echo
    echo "## 4. Hardware"
    echo
} >> "$REPORT"

# Render node enumeration — plan §9.3. Openability, not mere existence, is what
# decides between HwDeviceUnavailable and a working VAAPI device.
RENDER_NODE=""
if [ "$OS" = "linux" ]; then
    {
        echo "### Render nodes (\`/dev/dri\`)"
        echo
    } >> "$REPORT"
    if [ -d /dev/dri ]; then
        for node in /dev/dri/renderD*; do
            [ -e "$node" ] || continue
            if [ -r "$node" ] && [ -w "$node" ]; then
                state="readable+writable"
                [ -z "$RENDER_NODE" ] && RENDER_NODE="$node"
            else
                state="**not openable** — check \`render\`/\`video\` group membership"
            fi
            echo "- \`$node\` — $state" >> "$REPORT"
            echo "  $node: $state"
        done
        [ -z "$RENDER_NODE" ] && {
            echo >> "$REPORT"
            echo "> No openable render node. Every VAAPI smoke test below should report" >> "$REPORT"
            echo "> \`HwDeviceUnavailable\`, **not** \`HwSmokeFailed\` (plan §9.3)." >> "$REPORT"
            echo "  groups: $(id -nG 2>/dev/null)"
            echo >> "$REPORT"
            echo "Current groups: \`$(id -nG 2>/dev/null)\`" >> "$REPORT"
        }
    else
        echo "- \`/dev/dri\` does not exist — no VAAPI/QSV hardware path on this machine." >> "$REPORT"
    fi
    echo >> "$REPORT"
fi

adv="$("$FFMPEG" -hide_banner -encoders 2>/dev/null | grep -cE '_(nvenc|qsv|amf|vaapi|videotoolbox|mf|v4l2m2m|rkmpp)\b' || echo 0)"
{
    echo "### Advertised hardware encoders"
    echo
    echo "This build advertises **$adv** hardware encoders. An \`-encoders\` row means the"
    echo "binary was compiled with the wrapper and says nothing about this machine —"
    echo "the smoke results below are the only ground truth."
    echo
    echo '```'
    "$FFMPEG" -hide_banner -encoders 2>/dev/null \
        | grep -E '_(nvenc|qsv|amf|vaapi|videotoolbox|mf|v4l2m2m|rkmpp)\b' \
        | sed 's/  */ /g'
    echo '```'
    echo
} >> "$REPORT"
echo "  $adv hardware encoders advertised"

# Per-EncoderKind smoke argv — plan §9.3. A universal argv is invalid for VAAPI
# and is exactly the defect this section exists to verify is fixed.
smoke_one() {
    local encoder="$1" out rc start ms kind extra_pre extra_vf

    case "$encoder" in
        *_vaapi) kind=Vaapi ;;
        *_qsv)   kind=Qsv ;;
        *_nvenc) kind=Nvenc ;;
        *_amf)   kind=Amf ;;
        *_mf)    kind=MediaFoundation ;;
        *_videotoolbox) kind=VideoToolbox ;;
        *_v4l2m2m|*_rkmpp) kind=V4l2 ;;
        *) kind=Software ;;
    esac

    extra_pre=(); extra_vf=(-pix_fmt yuv420p)
    case "$kind" in
        Vaapi)
            if [ -n "$RENDER_NODE" ]; then
                extra_pre=(-init_hw_device "vaapi=va:$RENDER_NODE" -filter_hw_device va)
            else
                extra_pre=(-init_hw_device vaapi=va -filter_hw_device va)
            fi
            extra_vf=(-vf format=nv12,hwupload)
            ;;
        Qsv)
            extra_pre=(-init_hw_device qsv=hw -filter_hw_device hw)
            ;;
    esac

    # `${a[@]+"${a[@]}"}` rather than `"${a[@]}"`: under `set -u`, expanding an
    # empty array is an unbound-variable error on bash 3.2 (which macOS still
    # ships). Every Software/Nvenc/Amf probe has an empty extra_pre.
    start="$(now_ms)"
    out="$("$FFMPEG" -hide_banner -loglevel error ${extra_pre[@]+"${extra_pre[@]}"} \
        -f lavfi -i nullsrc=s=256x144 -frames:v 1 ${extra_vf[@]+"${extra_vf[@]}"} \
        -c:v "$encoder" -f null - 2>&1)"
    rc=$?
    ms=$(( $(now_ms) - start ))

    local first verdict
    first="$(echo "$out" | head -1 | cut -c1-110)"

    if [ "$rc" -eq 0 ]; then
        verdict="Passed"
    elif echo "$out" | grep -qiE 'failed to init|device creation failed|no va display|permission denied|failed to open|cannot open'; then
        verdict="**HwDeviceUnavailable** (fixable)"
    else
        verdict="HwSmokeFailed"
    fi

    printf '  %-18s rc=%-4s %5s ms  %s\n' "$encoder" "$rc" "$ms" "$verdict"
    echo "| \`$encoder\` | $kind | $rc | $ms ms | $verdict | \`$first\` |" >> "$REPORT"
}

{
    echo "### Smoke results (per-\`EncoderKind\` argv, plan §9.3)"
    echo
    echo "| Encoder | Kind | rc | Wall | Verdict | First stderr line |"
    echo "|---|---|---:|---:|---|---|"
} >> "$REPORT"

# One software baseline, then every advertised hardware encoder for the codecs
# the catalog actually offers.
for enc in libx264 libx265 \
           h264_nvenc hevc_nvenc av1_nvenc \
           h264_vaapi hevc_vaapi av1_vaapi vp9_vaapi \
           h264_qsv hevc_qsv av1_qsv \
           h264_amf hevc_amf av1_amf \
           h264_mf hevc_mf \
           h264_videotoolbox hevc_videotoolbox \
           h264_v4l2m2m h264_rkmpp; do
    "$FFMPEG" -hide_banner -encoders 2>/dev/null | grep -qE "^ \S+ $enc\b" && smoke_one "$enc"
done

{
    echo
    echo "> [!important] Check X5 (plan §14.2)"
    echo "> If this machine has working VAAPI, at least one \`*_vaapi\` row above must read"
    echo "> **Passed**. A filter-graph error (\`Impossible to convert between the formats\`)"
    echo "> means the per-kind argv did not take effect — that is the defect §3.5 found,"
    echo "> not a hardware limitation."
} >> "$REPORT"

# ── 5. Fingerprint inputs ────────────────────────────────────────────────────

{
    echo
    echo "## 5. Fingerprint inputs (plan §10.1)"
    echo
    echo "| Tool | Size | mtime | Inode |"
    echo "|---|---:|---|---:|"
} >> "$REPORT"

for tool in "$FFMPEG" "$FFPROBE" "$YTDLP"; do
    [ -n "$tool" ] && [ -e "$tool" ] || continue
    if stat -c '%s' "$tool" >/dev/null 2>&1; then
        size="$(stat -c '%s' "$tool")"; mtime="$(stat -c '%y' "$tool")"; inode="$(stat -c '%i' "$tool")"
    else
        size="$(stat -f '%z' "$tool" 2>/dev/null || echo '?')"
        mtime="$(stat -f '%Sm' "$tool" 2>/dev/null || echo '?')"
        inode="$(stat -f '%i' "$tool" 2>/dev/null || echo '?')"
    fi
    real="$(readlink -f "$tool" 2>/dev/null || echo "$tool")"
    note=""
    if [ "$real" != "$tool" ]; then
        note=" (symlink → \`$real\`)"
        SAW_SYMLINK=1
    fi
    echo "| \`$(basename "$tool")\`$note | $size | $mtime | $inode |" >> "$REPORT"
done

if [ "${SAW_SYMLINK:-0}" = 1 ]; then
    {
        echo
        echo "At least one tool is a symlink — which is why the plan specifies \`metadata()\`"
        echo "and not \`symlink_metadata()\`: the target's identity determines capabilities,"
        echo "and a \`pacman\`/\`apt\` replace changes the target's inode."
    } >> "$REPORT"
fi

# ── Done ─────────────────────────────────────────────────────────────────────

echo
echo "Report written: $REPORT"
if [ "$WRITE_FIXTURES" = 1 ]; then
    echo "Fixtures written: $FIXTURE_DIR"
    echo
    echo "Next: commit the fixtures with a .gitattributes pin so git does not rewrite them —"
    echo "  echo '$FIXTURE_ROOT/** -text' >> .gitattributes"
fi
