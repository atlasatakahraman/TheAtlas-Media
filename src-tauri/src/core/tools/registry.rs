//! The managed-tool registry — the backend half of `src/registry/tools.ts`.
//!
//! Everything the rest of the backend needs to know about ffmpeg, ffprobe and
//! yt-dlp is one `ToolSpec` literal and one `BundleSpec` literal in this file.
//! Adding a fourth tool touches no `match` arm anywhere else: before this,
//! `Tool` was an enum whose every property was a match, and adding a tool meant
//! editing four of them in two files and hoping you found them all.
//!
//! Two separate tables, because the two concepts genuinely differ in
//! cardinality: ffmpeg and ffprobe are two *tools* that arrive in one
//! *bundle* (BtbN ships them in a single archive), and the install path must
//! download that archive once no matter which of the two was requested.

use std::path::{Path, PathBuf};

/// How a downloaded artifact is packed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArchiveKind {
    /// The download *is* the binary. No unpacking step.
    Raw,
    Zip,
    TarXz,
}

impl ArchiveKind {
    /// Extension used for the on-disk temp file. Only meaningful for the
    /// packed kinds; `Raw` downloads straight to its final name.
    pub fn extension(self) -> &'static str {
        match self {
            ArchiveKind::Raw => "bin",
            ArchiveKind::Zip => "zip",
            ArchiveKind::TarXz => "xz",
        }
    }
}

/// How to read an expected hash out of a published checksum manifest.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ManifestFormat {
    /// `<hash>  <filename>` — the coreutils `sha256sum` convention, two spaces.
    /// yt-dlp's `SHA2-256SUMS` uses this.
    Sha256Sums,
    /// `<hash> <filename>` with arbitrary whitespace. BtbN's
    /// `checksums.sha256` uses this.
    Whitespace,
}

/// One published build of a bundle, for a specific OS and architecture.
#[derive(Debug, Clone, Copy)]
pub struct PlatformBuild {
    /// Matched against `std::env::consts::OS`.
    pub os: &'static str,
    /// Matched against `std::env::consts::ARCH`.
    pub arch: &'static str,
    pub url: &'static str,
    /// The file name as it appears in the checksum manifest — which is not
    /// always the name we save it under, and is never the URL's last segment
    /// for a `/releases/latest/download/` redirect.
    pub manifest_name: &'static str,
    pub archive: ArchiveKind,
}

/// A downloadable artifact that provides one or more tools.
#[derive(Debug, Clone, Copy)]
pub struct BundleSpec {
    pub key: &'static str,
    /// Keys of the tools this bundle can install.
    pub provides: &'static [&'static str],
    pub builds: &'static [PlatformBuild],
    /// Where the published hashes live, and how to parse them.
    pub checksum_url: &'static str,
    pub checksum_format: ManifestFormat,
}

impl BundleSpec {
    /// The build for the running platform, if this bundle publishes one.
    pub fn current_build(&self) -> Option<&'static PlatformBuild> {
        let (os, arch) = (std::env::consts::OS, std::env::consts::ARCH);
        self.builds
            .iter()
            .find(|build| build.os == os && build.arch == arch)
    }
}

/// One managed binary.
#[derive(Debug, Clone, Copy)]
pub struct ToolSpec {
    /// Canonical key. Matches the `DependencyReport` field name and the
    /// `key` in `src/registry/tools.ts`.
    pub key: &'static str,
    /// Every spelling accepted from IPC. Must include `key`.
    pub aliases: &'static [&'static str],
    pub display_name: &'static str,
    /// Environment override, highest-priority auto-detected source.
    pub env_var: &'static str,
    /// File name without a platform extension.
    pub exe_stem: &'static str,
    /// Arguments that make the binary print its version.
    pub version_args: &'static [&'static str],
    /// Which bundle installs it.
    pub bundle: &'static str,
}

impl ToolSpec {
    /// Platform-correct executable file name.
    pub fn exe_name(&self) -> String {
        if cfg!(windows) {
            format!("{}.exe", self.exe_stem)
        } else {
            self.exe_stem.to_string()
        }
    }

    pub fn exe_path_in(&self, dir: &Path) -> PathBuf {
        dir.join(self.exe_name())
    }

    pub fn bundle(&self) -> Option<&'static BundleSpec> {
        bundle(self.bundle)
    }
}

// ---------------------------------------------------------------------------
// The tables
// ---------------------------------------------------------------------------

const FFMPEG_BUILDS: &[PlatformBuild] = &[
    PlatformBuild {
        os: "linux",
        arch: "x86_64",
        url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz",
        manifest_name: "ffmpeg-master-latest-linux64-gpl.tar.xz",
        archive: ArchiveKind::TarXz,
    },
    PlatformBuild {
        os: "linux",
        arch: "aarch64",
        url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linuxarm64-gpl.tar.xz",
        manifest_name: "ffmpeg-master-latest-linuxarm64-gpl.tar.xz",
        archive: ArchiveKind::TarXz,
    },
    PlatformBuild {
        os: "windows",
        arch: "x86_64",
        url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
        manifest_name: "ffmpeg-master-latest-win64-gpl.zip",
        archive: ArchiveKind::Zip,
    },
];

const YTDLP_BUILDS: &[PlatformBuild] = &[
    PlatformBuild {
        os: "linux",
        arch: "x86_64",
        url: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux",
        manifest_name: "yt-dlp_linux",
        archive: ArchiveKind::Raw,
    },
    PlatformBuild {
        os: "linux",
        arch: "aarch64",
        url: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64",
        manifest_name: "yt-dlp_linux_aarch64",
        archive: ArchiveKind::Raw,
    },
    PlatformBuild {
        os: "windows",
        arch: "x86_64",
        url: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe",
        manifest_name: "yt-dlp.exe",
        archive: ArchiveKind::Raw,
    },
];

pub const BUNDLES: &[BundleSpec] = &[
    BundleSpec {
        key: "ffmpeg",
        provides: &["ffmpeg", "ffprobe"],
        builds: FFMPEG_BUILDS,
        checksum_url:
            "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/checksums.sha256",
        checksum_format: ManifestFormat::Whitespace,
    },
    BundleSpec {
        key: "yt-dlp",
        provides: &["ytdlp"],
        builds: YTDLP_BUILDS,
        checksum_url: "https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS",
        checksum_format: ManifestFormat::Sha256Sums,
    },
];

pub const TOOLS: &[ToolSpec] = &[
    ToolSpec {
        key: "ffmpeg",
        aliases: &["ffmpeg"],
        display_name: "FFmpeg",
        env_var: "THEATLAS_FFMPEG_PATH",
        exe_stem: "ffmpeg",
        version_args: &["-version"],
        bundle: "ffmpeg",
    },
    ToolSpec {
        key: "ffprobe",
        aliases: &["ffprobe"],
        display_name: "FFprobe",
        env_var: "THEATLAS_FFPROBE_PATH",
        exe_stem: "ffprobe",
        version_args: &["-version"],
        bundle: "ffmpeg",
    },
    ToolSpec {
        key: "ytdlp",
        // The IPC layer, the frontend and the binary itself disagree on the
        // spelling; all three are accepted rather than normalised at N call
        // sites. `src/lib/tool-names.ts` does the same on the frontend.
        aliases: &["ytdlp", "yt-dlp"],
        display_name: "yt-dlp",
        env_var: "THEATLAS_YTDLP_PATH",
        exe_stem: "yt-dlp",
        version_args: &["--version"],
        bundle: "yt-dlp",
    },
];

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/// Resolve a tool from any of its aliases. Case-insensitive, since the name
/// arrives from the webview.
pub fn tool(name: &str) -> Option<&'static ToolSpec> {
    let needle = name.trim();
    TOOLS.iter().find(|spec| {
        spec.aliases
            .iter()
            .any(|alias| alias.eq_ignore_ascii_case(needle))
    })
}

pub fn bundle(key: &str) -> Option<&'static BundleSpec> {
    BUNDLES.iter().find(|spec| spec.key == key)
}

/// The tools a bundle provides, as specs.
pub fn tools_in_bundle(bundle_key: &str) -> Vec<&'static ToolSpec> {
    TOOLS.iter().filter(|t| t.bundle == bundle_key).collect()
}

/// Group tool keys by the bundle that installs them, preserving registry
/// order within each group.
///
/// This is what removes the old `DownloadTarget::FfmpegBundle` special case:
/// "install ffmpeg and ffprobe" and "install ffmpeg" are now the same code
/// path with a different member list, not two enum variants.
pub fn group_by_bundle(names: &[String]) -> Vec<(&'static BundleSpec, Vec<&'static ToolSpec>)> {
    let mut groups: Vec<(&'static BundleSpec, Vec<&'static ToolSpec>)> = Vec::new();

    for spec in TOOLS {
        let requested = names.iter().any(|name| {
            spec.aliases
                .iter()
                .any(|alias| alias.eq_ignore_ascii_case(name.trim()))
        });
        if !requested {
            continue;
        }

        let Some(bundle_spec) = spec.bundle() else {
            continue;
        };

        match groups.iter_mut().find(|(b, _)| b.key == bundle_spec.key) {
            Some((_, members)) => members.push(spec),
            None => groups.push((bundle_spec, vec![spec])),
        }
    }

    groups
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_tool_names_a_real_bundle_that_provides_it() {
        for spec in TOOLS {
            let bundle = spec
                .bundle()
                .unwrap_or_else(|| panic!("{} points at unknown bundle {}", spec.key, spec.bundle));
            assert!(
                bundle.provides.contains(&spec.key),
                "{} claims bundle {} but the bundle does not list it",
                spec.key,
                bundle.key
            );
        }
    }

    #[test]
    fn every_bundle_entry_names_a_real_tool() {
        for bundle in BUNDLES {
            for key in bundle.provides {
                assert!(
                    TOOLS.iter().any(|t| t.key == *key),
                    "bundle {} provides unknown tool {key}",
                    bundle.key
                );
            }
        }
    }

    #[test]
    fn aliases_are_unique_across_tools_and_include_the_key() {
        let mut seen = std::collections::HashSet::new();
        for spec in TOOLS {
            assert!(
                spec.aliases.contains(&spec.key),
                "{} does not list its own key as an alias",
                spec.key
            );
            for alias in spec.aliases {
                assert!(seen.insert(*alias), "duplicate alias {alias}");
            }
        }
    }

    #[test]
    fn lookup_accepts_every_alias_case_insensitively() {
        for spec in TOOLS {
            for alias in spec.aliases {
                assert_eq!(tool(alias).map(|s| s.key), Some(spec.key));
                assert_eq!(tool(&alias.to_uppercase()).map(|s| s.key), Some(spec.key));
            }
        }
        assert!(tool("nonesuch").is_none());
    }

    #[test]
    fn ffmpeg_and_ffprobe_group_into_one_bundle_job() {
        let names = vec!["ffmpeg".to_string(), "ffprobe".to_string()];
        let groups = group_by_bundle(&names);

        assert_eq!(groups.len(), 1, "one archive should cover both");
        assert_eq!(groups[0].0.key, "ffmpeg");
        assert_eq!(groups[0].1.len(), 2);
    }

    #[test]
    fn requesting_one_tool_of_a_bundle_extracts_only_that_one() {
        let groups = group_by_bundle(&["ffprobe".to_string()]);
        assert_eq!(groups.len(), 1);
        assert_eq!(
            groups[0].1.iter().map(|t| t.key).collect::<Vec<_>>(),
            vec!["ffprobe"]
        );
    }

    #[test]
    fn all_three_tools_produce_two_jobs() {
        let names = vec!["ffmpeg".into(), "ffprobe".into(), "yt-dlp".into()];
        let groups = group_by_bundle(&names);
        assert_eq!(groups.len(), 2);
    }

    #[test]
    fn unknown_names_are_dropped_rather_than_grouped() {
        assert!(group_by_bundle(&["definitely-not-a-tool".to_string()]).is_empty());
    }

    #[test]
    fn no_platform_declares_two_builds_of_the_same_bundle() {
        for bundle in BUNDLES {
            let mut seen = std::collections::HashSet::new();
            for build in bundle.builds {
                assert!(
                    seen.insert((build.os, build.arch)),
                    "{} declares {}/{} twice",
                    bundle.key,
                    build.os,
                    build.arch
                );
            }
        }
    }

    #[test]
    fn raw_downloads_never_claim_an_archive_extension() {
        for bundle in BUNDLES {
            for build in bundle.builds {
                if build.archive == ArchiveKind::Raw {
                    assert!(
                        !build.url.ends_with(".zip") && !build.url.ends_with(".xz"),
                        "{} looks packed but is declared Raw",
                        build.url
                    );
                }
            }
        }
    }
}
