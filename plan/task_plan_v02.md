# Task Plan v0.2: all Gormley visual languages + comparison against the real works

## Goal
Rebuild the piece so each Gormley series family is reproduced by its own generative rule on a
realistic body, staged like his gallery photos; then compare our renders against the references.

## Diagnosis of v0.1 (see plan/shots/v01_*.png vs plan/gormley_catalogue.md)
1. Body = capsules -> pillar silhouette (no neck/shoulders/waist/calves). Gormley = casts of a real body.
2. Element scale/count wrong for every series (Big Blockworks: 10-25 blocks; Gridworks: 1 cm rods).
3. Staging: no white wall, no env reflections, no AO, muddy materials.
4. Only 3 of ~12 generative rules.

## Architecture decisions
- Body: Mixamo X Bot (public/models/Xbot.glb, from three.js examples r181), watertight (0 boundary edges),
  mocap idle/walk + Gormley postures as bone-rotation overrides.
- Posed body -> GPU per frame: compute skinning -> solid voxelization (atomicXor column parity, 2 cm)
  -> blurred density field + min-pooled occupancy mips. Feeds world-grid styles (families A/B).
- Bind-space generators (families C/D): CPU voxelization of the T-pose once; element endpoints carry
  skin weights of the nearest vertex; GPU LBS per frame -> oriented bars.
- Box decomposition (Big Blockworks, Bunkers, Open Blockworks, Framers): CPU, per course, per limb group.
- Surface styles (family E): the skinned mesh itself with TSL position/fragment variants.
- Instances: StorageInstancedBufferAttribute mat4 + atomic counter + indirect draw (only live instances drawn).
- Stage: white room, concrete floor, RoomEnvironment IBL, GTAO, soft shadows, 50 mm eye-level camera.

## Phases
- [x] P0 Survey all 72 series -> plan/gormley_catalogue.md; v0.1 shots saved
- [x] P1 Figure: load X Bot, idle/walk mixer, postures, grounding, locomotion
- [x] P2 Stage: room, IBL, GTAO, shadows, camera
- [x] P3 GPU volume: skinning -> voxelize -> density + mips (+ debug view)
- [x] P4 Instance core (mat4 storage + indirect compaction) + wave transitions
- [x] P5 Styles A (Blockworks small/cast, Big Blockworks, Bunkers)
- [x] P6 Styles B (Big/Constructed Beamers, Ataxia, Gridworks, Scaffolds)
- [x] P7 Styles C (Open Blockworks, Framers, Strapworks, Knotworks, Extended Strapworks)
- [x] P8 Styles D (Domains, Aperture/Net, Quantum Cloud/Void, Under My Skin, Feeling Material, Ball, Transfusers)
- [x] P9 Styles E (Cast body, Insiders, Expansion, Polyhedra)
- [x] P10 UI (family/series picker), director, click interactions
- [x] P11 Comparison: our shots per style vs reference series, gap table, fix top gaps
- [x] P12 Report

## Errors Encountered
- (v0.1) setLayout Fn shared across pipelines; nested TSL Loop var names; PCFSoft removed; hidden tab throttles rAF.
- XOR parity voxelization: overlapping shells (hand on thigh) cancel -> holes. Fixed with signed winding numbers + column suffix sum.
- Winding sign inverted on first try (FACING = -1).
- WGSL error flood (HMR mid-edit) froze page AND Vite (Vite forwards browser console). Added uncapturederror guard that stops the loop.
- Loop({update:'-='}) emits invalid WGSL; omit update for int loops with '>='.
- GTAO multiply made thin metal look frosted/noisy -> disabled; occlusion baked per element from density field into instance tint + aoNode.

## Status
**Done v0.2** (2026-09-27): 27 presets in 5 families, all verified in Chrome WebGPU, each under 4 ms/frame,
60 s auto-evolve with no console errors, `vite build` passes.
Comparison: 9 close / 15 partial / 3 far -> https://claude.ai/artifact/NM4tJei23SQf4Ugha6SYRF
Shots: plan/shots/v02_*.png (same camera/pose/light for all).

## Next (by impact, from the comparison)
- P0 Replace X Bot with a male scanned / SMPL body (affects all 27 styles)
- P0 Room interaction: postures against walls/corners; Extended Strapworks anchored to walls/floor
- P1 1 cm volume for Blockworks / Grid Works; subdivided cells for Open Blockworks
- P1 Weld beads, lead seams, casting skin
- P2 Area-light key + floor-only contact AO; temporal smoothing of the density field
