# Task Plan v0.3: all 84 Gormley series, walking, compared image-to-image

## Goal
Every one of the 84 series on antonygormley.com/works/sculpture/series has a live, walking
WebGPU preset, and a report shows each Gormley reference photo next to our still + walking clip.

## Facts (2026-09-27)
- Official list = 84 series (page lazy-loads; earlier I counted 72). Inventory: plan/series.tsv
- v0.2 had 27 presets covering ~45 series by grouping (plan/task_plan_v02.md).
- Reference photos are copyrighted: the report hotlinks them from the artist's CDN (local file),
  never copies them into the repo or a published page.

## Key visual findings from the reference sheet
- Gormley's body is slimmer than X Bot: narrow hips/shoulders, arms tight, legs together, small head.
- Several series are not axis-aligned (Cube Works, Cast Framers), several are slabs, rolls,
  single lines, rings, or room-scale (Run, Co-ordinate) -> need new generators.

## Phases
- [x] P1 Infra: capture endpoint, frame capture, material tint/alt finish, Gormley proportions, per-style figure scale
- [x] P2 Boxworks: rotate/cube, double, slab, extend, extrude
- [x] P3 Beamers: nodes (Mined Gridworks), weave, co-ordinate axes
- [x] P4 Paths & nets: rooter, branchers, bubbles, cage, liners, clay rolls, drift/open-expansion/hive/transfusers
- [x] P5 Cast: seams, cuts, flatten, wings, rods, props, concrete block, rock
- [x] P6 Interpretive/environment: Run, Room Series, Natural Selection, Object Works, Box Works
- [x] P7 Registry of 84 presets keyed by official slug; UI grouped by family
- [x] P8 Capture still + walking clip for all 84 -> animated WebP
- [x] P9 Report (local, hotlinked refs) + verdicts
- [x] P10 Verify all 84: no GPU errors, perf

## Errors Encountered
- Series count: page lazy-loads; 48 -> 72 -> 84 on full scroll.
- Hidden browser tab never presents the WebGPU canvas -> stale/blank captures. Fixed: offscreen HDR target + tone-map pass + readRenderTargetPixelsAsync.
- Pipeline pass output read back without the scene -> render scene directly into own HDR target.
- Scaled figures (Memes, Small Blockworks) floated: grounding offset was world units applied in model space.
- Concrete Works void colour used a TSL node outside Fn -> wrapped.

## Status
**Done v0.3** (2026-09-27): 84/84 series have presets (+1 extra bodyform), all render with no GPU errors,
still + 32-frame walking clip each. Verdicts: 38 close / 37 partial / 9 far (plan/assessment.json).
Local side-by-side with Gormley photos: http://localhost:5199/report/  (npm run dev)
Shareable (ours + links): https://claude.ai/artifact/NM4tJei23SQf4Ugha6SYRF
