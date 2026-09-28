"""Builds public/report/index.html: every official Gormley series next to our renders.

Reference photos are hotlinked from the artist's own CDN (never copied); our still and walking
clip come from public/report/still/<slug>.webp and public/report/walk/<slug>.webp.
Verdicts and notes are read from plan/assessment.json (slug -> {verdict, match, gap}).
Usage: python3 plan/build_report.py [--compact]
"""
import html
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CDN = "https://cdn.sanity.io/images/rgmbly0p/production/"
SITE = "https://www.antonygormley.com/works/sculpture/series/"


def load():
    rows = [l.rstrip("\n").split("\t") for l in open(os.path.join(ROOT, "plan/series.tsv"))][1:]
    path = os.path.join(ROOT, "plan/assessment.json")
    notes = json.load(open(path)) if os.path.exists(path) else {}
    return rows, notes


def cell(slug, name, years, ref, notes, compact):
    n = notes.get(slug, {})
    verdict = n.get("verdict", "")
    walk = f"walk/{slug}.webp"
    has_walk = os.path.exists(os.path.join(ROOT, "public/report", walk))
    ours_walk = (f'<figure><img src="{walk}" alt="Our walking render of {html.escape(name)}" loading="lazy">'
                 f'<figcaption>ours · walking</figcaption></figure>') if has_walk else ""
    text = "" if compact else (
        f'<dl><dt>Matches</dt><dd>{html.escape(n.get("match", "—"))}</dd>'
        f'<dt>Differs</dt><dd>{html.escape(n.get("gap", "—"))}</dd></dl>')
    tag = f'<span class="v {verdict}">{ {"close": "Close", "partial": "Partial", "weak": "Far"}.get(verdict, "") }</span>' if verdict else ""
    interp = ' <span class="i">interpretation</span>' if n.get("interpretation") else ""
    return f'''<article id="{slug}">
<header><h3><a href="{SITE}{slug}" target="_blank" rel="noopener">{html.escape(name)}</a>, <span>{years}</span>{interp}</h3>{tag}</header>
<div class="imgs">
{'' if PUBLIC else f'<figure><img src="{CDN}{ref}?w=520&h=390&fit=crop&auto=format" alt="Antony Gormley, {html.escape(name)} (reference photo, antonygormley.com)" loading="lazy"><figcaption>Gormley · reference</figcaption></figure>'}
<figure><img src="still/{slug}.webp" alt="Our still render of {html.escape(name)}" loading="lazy"><figcaption>ours · still</figcaption></figure>
{ours_walk}
</div>{text}<a class="ref" href="{SITE}{slug}" target="_blank" rel="noopener">See Gormley's {html.escape(name)} on antonygormley.com ↗</a></article>'''


PUBLIC = "--public" in sys.argv


def main():
    compact = "--compact" in sys.argv
    rows, notes = load()
    counts = {"close": 0, "partial": 0, "weak": 0}
    for r in rows:
        v = notes.get(r[0], {}).get("verdict")
        if v in counts:
            counts[v] += 1
    cards = "\n".join(cell(*r, notes, compact) for r in rows)
    LEDE = ("Our still (same gallery and camera for every series) and the same style walking. Gormley's photographs are not reproduced here; each card links to the series on antonygormley.com. Verdicts are a visual judgement." if PUBLIC else
            "Left: a reference photograph from each series page on antonygormley.com, loaded directly from the artist's site (not copied). Middle: our still, same gallery and camera for every series. Right: the same style walking. Verdicts are a visual judgement. LOCAL ONLY: do not deploy.")
    page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gormley Series Comparison</title>
<style>
:root{{--wall:#f1f0ec;--card:#fbfaf7;--ink:#1f1e1c;--mute:#6e6962;--line:#d9d6cf;--close:#3e6a4e;--partial:#94722a;--weak:#9b3d2e;--rust:#8c4b22}}
body{{margin:0;background:var(--wall);color:var(--ink);font:14px/1.5 "Helvetica Neue",Helvetica,Arial,sans-serif}}
main{{max-width:1500px;margin:0 auto;padding:32px 20px 80px}}
h1{{font-size:30px;margin:0 0 6px;font-weight:600}} .lede{{color:var(--mute);max-width:80ch;margin:0 0 8px}}
.sum{{font-variant-numeric:tabular-nums;margin:10px 0 26px}} .sum b{{margin-right:14px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax({440 if compact else 560}px,1fr));gap:18px}}
article{{background:var(--card);border:1px solid var(--line);padding:12px;display:grid;gap:8px;align-content:start}}
article header{{display:flex;justify-content:space-between;gap:8px;align-items:baseline}}
h3{{margin:0;font-size:15px;font-weight:600}} h3 a{{color:inherit;text-decoration:none}} h3 span{{font-weight:400;color:var(--mute)}}
.i{{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--rust);margin-left:6px}}
.imgs{{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px}}
figure{{margin:0}} img{{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;background:#e6e4df}}
figcaption{{font-size:10.5px;color:var(--mute);letter-spacing:.06em;text-transform:uppercase;margin-top:3px}}
.ref{{font-size:12.5px;color:var(--rust)}}
.v{{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;border:1px solid currentColor;padding:1px 6px;white-space:nowrap}}
.v.close{{color:var(--close)}} .v.partial{{color:var(--partial)}} .v.weak{{color:var(--weak)}}
dl{{margin:0;font-size:13px;display:grid;gap:2px}} dt{{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--mute);margin-top:4px}} dd{{margin:0}}
</style></head><body><main>
<h1>Antony Gormley, 84 series: our WebGPU renders{'' if PUBLIC else ' vs. references'}</h1>
<p class="lede">{LEDE}</p>
<p class="sum"><b style="color:var(--close)">{counts["close"]} close</b><b style="color:var(--partial)">{counts["partial"]} partial</b><b style="color:var(--weak)">{counts["weak"]} far</b> of {len(rows)} series</p>
<div class="grid">{cards}</div></main></body></html>'''
    out = "index.html" if PUBLIC else "compare.html"
    open(os.path.join(ROOT, "public/report", out), "w").write(page)
    print("series", len(rows), "counts", counts)


main()
