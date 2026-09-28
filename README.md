# Gormley Realverse

A walking digital study after Antony Gormley, built with Three.js WebGPU.
One skinned body walks through a gallery; every frame it is rebuilt on the GPU in one of the
84 sculpture series listed on [antonygormley.com](https://www.antonygormley.com/works/sculpture/series).

Live: **https://gormley.reality.design** · series report: **https://gormley.reality.design/report/**

- Click the figure: it turns into another series, spreading from the point you clicked.
- Click the floor: it walks there.
- Right panel: pick a series or a posture. Auto evolve keeps changing it.

## How it works

- `src/figure/` loads the Mixamo X Bot, reshapes it toward Gormley's proportions, and drives walking plus Gormley postures.
- `src/gpu/volume.js` skins the body on the GPU every frame. It voxelizes it (signed crossings, 2 cm) into a density field with mips.
- `src/styles/` holds one generator family per construction language: voxel blocks, box decomposition, world-lattice beams, body-attached networks, ray-marched casts, and room works. Instances are written by compute shaders and drawn with indirect draws.
- `src/styles/index.js` is the registry. It has one preset per official series slug.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (WebGPU browser required)
npm run build
```

## Report

`plan/build_report.py --public` writes `public/report/index.html`, which shows our renders and links to each series.
Without `--public` it writes a local-only `compare.html`. That page loads Gormley's reference photographs from his site for a side-by-side comparison. It is gitignored and must not be deployed, because the photographs are copyrighted.

This is an independent study. It is not affiliated with or endorsed by Antony Gormley or his studio.

Body model: X Bot (Mixamo), as distributed in the three.js examples.
