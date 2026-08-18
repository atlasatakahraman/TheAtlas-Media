import { buildSearchIndex } from "@/lib/search/build-index";
import { runQuery, resolveShortcut } from "@/lib/search/query";
import { fold } from "@/lib/search/normalize";
import { MATCH_SHORTCUT_EXACT, MATCH_TITLE_PREFIX } from "@/lib/search/types";

type Row = { id: string; title: string; shortcut?: string; breadcrumb?: string; group?: string; keywords?: string[] };

const rows: Row[] = [
	{ id: "yt.dl.video", title: "Video", shortcut: "ytdv", breadcrumb: "YouTube › Download", group: "YouTube" },
	{ id: "yt.dl.playlist", title: "Playlist", shortcut: "ytdp", breadcrumb: "YouTube › Download", group: "YouTube" },
	{ id: "yt.dl.audio", title: "Audio", shortcut: "ytda", breadcrumb: "YouTube › Download", group: "YouTube", keywords: ["mp3", "ses"] },
	{ id: "set.deps", title: "Dependencies", shortcut: "sd", breadcrumb: "Settings", group: "Settings" },
	{ id: "tr.goruntu", title: "Görüntü Ayarları", breadcrumb: "Ayarlar", group: "Settings" },
];

const idx = buildSearchIndex(rows, (r) => r);

function ids(q: string, prev?: ReturnType<typeof runQuery>) {
	const res = runQuery(idx, q, prev);
	return { res, list: Array.from(res.order).map((o) => idx.ids[o]) };
}

let fails = 0;
function eq(label: string, actual: unknown, expected: unknown) {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	if (a !== e) {
		console.log(`FAIL ${label}\n  got      ${a}\n  expected ${e}`);
		fails++;
	} else {
		console.log(`ok   ${label}  ${a}`);
	}
}

eq("empty query returns all in source order", ids("").list, rows.map((r) => r.id));
eq("exact shortcut ranks first", ids("ytdv").list[0], "yt.dl.video");
eq("exact shortcut sets fullTitle", ids("ytdv").res.fullTitle[0], 1);
eq("exact shortcut kind", ids("ytdv").res.kinds[0], MATCH_SHORTCUT_EXACT);
eq("shortcut prefix fans out", ids("ytd").list.slice().sort(), ["yt.dl.audio", "yt.dl.playlist", "yt.dl.video"]);
eq("title prefix", ids("vid").res.kinds[0], MATCH_TITLE_PREFIX);
eq("breadcrumb match", ids("download").list.slice().sort(), ["yt.dl.audio", "yt.dl.playlist", "yt.dl.video"]);
eq("keyword-only match", ids("mp3").list, ["yt.dl.audio"]);
eq("turkish fold: goruntu finds Görüntü", ids("goruntu").list, ["tr.goruntu"]);
eq("turkish fold: görüntü finds Görüntü", ids("görüntü").list, ["tr.goruntu"]);
eq("turkish keyword: ses finds Audio", ids("ses").list, ["yt.dl.audio"]);
eq("multiword AND", ids("youtube audio").list, ["yt.dl.audio"]);
eq("one-char leading word still matches", ids("a youtube").list.slice().sort(), ["yt.dl.audio", "yt.dl.playlist", "yt.dl.video"]);
eq("no match", ids("zzzzz").list, []);
eq("resolveShortcut is case/diacritic insensitive", resolveShortcut(idx, "SD")?.id, "set.deps");

const foldedRows = rows.map((r) => {
	const title = fold(r.title);
	const shortcut = r.shortcut ? fold(r.shortcut) : "";
	const breadcrumb = r.breadcrumb ? fold(r.breadcrumb) : "";
	const group = r.group ? fold(r.group) : "";
	const keywords = (r.keywords ?? []).map(fold).join(" ");
	return {
		id: r.id,
		title,
		shortcut,
		breadcrumb,
		group,
		combined: `${title} ${breadcrumb} ${group} ${shortcut} ${keywords}`,
	};
});

// Independent reimplementation of the ladder: no index, no buckets, no
// incremental reuse. Anything the engine's narrowing drops shows up here.
function bruteMatch(raw: string): string[] {
	const query = fold(raw).trim();
	if (!query) return rows.map((r) => r.id);
	const words = query.includes(" ") ? query.split(/\s+/).filter(Boolean) : null;
	return foldedRows
		.filter(
			(e) =>
				(e.shortcut !== "" && e.shortcut === query) ||
				e.title === query ||
				(e.shortcut !== "" && e.shortcut.startsWith(query)) ||
				e.title.includes(query) ||
				e.breadcrumb.includes(query) ||
				e.group.includes(query) ||
				e.combined.includes(query) ||
				(words !== null && words.length > 1 && words.every((w) => e.combined.includes(w)))
		)
		.map((e) => e.id);
}

const alphabet = "abcdefghijklmnopqrstuvwxyzğüşıöç ";

let mismatches = 0;
let checked = 0;
for (const c1 of alphabet) {
	for (const c2 of alphabet) {
		for (const c3 of ["", ...alphabet]) {
			const q = (c1 + c2 + c3).trim();
			if (!q) continue;
			checked++;
			const viaEngine = Array.from(runQuery(idx, q).order).map((o) => idx.ids[o]).sort();
			const brute = bruteMatch(q).sort();
			if (JSON.stringify(viaEngine) !== JSON.stringify(brute)) {
				mismatches++;
				if (mismatches <= 5) {
					console.log(`  MISMATCH q="${q}" engine=${JSON.stringify(viaEngine)} brute=${JSON.stringify(brute)}`);
				}
			}
		}
	}
}
eq(`bucket narrowing lossless over ${checked} queries`, mismatches, 0);

let incMismatch = 0;
let incChecked = 0;
for (const c1 of alphabet) {
	for (const c2 of alphabet) {
		for (const c3 of alphabet) {
			const short = (c1 + c2).trim();
			const long = (c1 + c2 + c3).trim();
			if (!short || !long || !long.startsWith(short)) continue;
			incChecked++;
			const warm = Array.from(runQuery(idx, long, runQuery(idx, short)).order).map((o) => idx.ids[o]).sort();
			const cold = Array.from(runQuery(idx, long).order).map((o) => idx.ids[o]).sort();
			if (JSON.stringify(warm) !== JSON.stringify(cold)) {
				incMismatch++;
				if (incMismatch <= 5) {
					console.log(`  INC MISMATCH "${short}"->"${long}" warm=${JSON.stringify(warm)} cold=${JSON.stringify(cold)}`);
				}
			}
		}
	}
}
eq(`incremental refinement lossless over ${incChecked} pairs`, incMismatch, 0);

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
