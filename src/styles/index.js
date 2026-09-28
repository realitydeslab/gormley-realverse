// Registry: one preset per official series (84), keyed by the slug used on
// antonygormley.com/works/sculpture/series/<slug>. `pose` is the posture used for stills.
import { Blockworks } from './blockworks.js';
import { Boxworks } from './boxworks.js';
import { Beamers } from './beamers.js';
import { SkinnedElements } from './skinned.js';
import { CastBody } from './cast.js';
import { EnvWorks } from './environment.js';
import * as gen from './generators.js';

export const FAMILIES = [
	{ id: 'mass', label: 'Blocks & slabs' },
	{ id: 'linear', label: 'Beams & rods' },
	{ id: 'frame', label: 'Frames & lines' },
	{ id: 'network', label: 'Networks, clouds & wire' },
	{ id: 'skin', label: 'Cast body' },
	{ id: 'room', label: 'Room works' },
];

const B = ( o ) => ( { Class: Boxworks, family: 'mass', ...o } );
const V = ( o ) => ( { Class: Blockworks, family: 'mass', ...o } );
const L = ( o ) => ( { Class: Beamers, family: 'linear', ...o } );
const S = ( generate, o ) => ( { Class: SkinnedElements, generate, ...o } );
const C = ( o ) => ( { Class: CastBody, family: 'skin', ...o } );
const E = ( o ) => ( { Class: EnvWorks, family: 'room', ...o } );

const leadSeams = { field: 'fine', iso: 0.47, seams: true };

export const STYLE_DEFS = [
	// ---- blocks & slabs -------------------------------------------------------------------------
	B( { id: 'big-stone-blockworks', label: 'Big Stone Blockworks', years: '2026', finish: 'granite', pose: 'stand', params: { course: [ 0.18, 0.34 ], q: 0.06, merge: 0.3, inset: 0.006, jitter: 0.03 } } ),
	B( { id: 'big-double-blockworks', label: 'Big Double Blockworks', years: '2023', finish: 'corten', pose: 'stand', params: { double: true, course: [ 0.1, 0.2 ], q: 0.08, merge: 0.3, jitter: 0.03 } } ),
	B( { id: 'bunkers', label: 'Bunkers', years: '2022–26', finish: 'concrete', pose: 'crouch', params: { course: [ 0.14, 0.32 ], q: 0.05, merge: 0.12, inset: 0.003, aperture: true, jitter: 0.04, minHalf: 0.05 } } ),
	B( { id: 'blockworks-wrestling-with-modernism', label: 'Blockworks: Wrestling with Modernism', years: '2019–20', finish: 'corten', pose: 'crouch', params: { course: [ 0.2, 0.4 ], merge: 0.1, minHalf: 0.06, jitter: 0.05 } } ),
	B( { id: 'big-assembled-blockworks', label: 'Big Assembled Blockworks', years: '2019', finish: 'iron', pose: 'stand', params: { course: [ 0.1, 0.2 ], q: 0.08, jitter: 0.015, inset: 0.006 } } ),
	V( { id: 'aggregate-blockworks', label: 'Aggregate Blockworks', years: '2018–19', finish: 'corten', pose: 'bow', params: { fine: true, elong: 1.4, protrude: 0.5, coarse: 0.6, shrink: 0.9 } } ),
	B( { id: 'double-blockworks', label: 'Double Blockworks', years: '2017–25', finish: 'corten', pose: 'stand', params: { double: true, course: [ 0.12, 0.26 ], jitter: 0.02 } } ),
	B( { id: 'lead-blockworks', label: 'Lead Blockworks', years: '2015–16', finish: 'lead', pose: 'crouch', params: { course: [ 0.12, 0.26 ], merge: 0.2, minHalf: 0.05, jitter: 0.02 } } ),
	B( { id: 'extrusions', label: 'Extrusions', years: '2015', finish: 'corten', pose: 'lie', params: { course: [ 0.45, 0.9 ], q: 0.04, merge: 0.6, jitter: 0.03 } } ),
	B( { id: 'small-blockworks', label: 'Small Blockworks', years: '2013–26', finish: 'iron', pose: 'stand', scale: 0.4, params: { course: [ 0.08, 0.16 ], jitter: 0.01 } } ),
	B( { id: 'big-blockworks', label: 'Big Blockworks', years: '2013–25', finish: 'iron', pose: 'stand', params: { course: [ 0.1, 0.24 ], q: 0.1, merge: 0.3, inset: 0.004, jitter: 0.02 } } ),
	B( { id: 'cube-works', label: 'Cube Works', years: '2013–16', finish: 'rust', pose: 'crouch', params: { cube: true, rotate: 0.5, course: [ 0.12, 0.25 ], merge: 0.2 } } ),
	B( { id: 'tankers', label: 'Tankers', years: '2013–15', finish: 'iron', pose: 'crouch', params: { course: [ 0.25, 0.45 ], merge: 0.05, minHalf: 0.12, inset: 0.01 } } ),
	B( { id: 'raised-blockworks', label: 'Raised Blockworks', years: '2012–19', finish: 'iron', pose: 'bow', params: { course: [ 0.1, 0.2 ], jitter: 0.04, minHalf: 0.04 } } ),
	B( { id: 'plaster-works', label: 'Plaster Works', years: '2012–13', finish: 'plaster', pose: 'stand', params: { course: [ 0.12, 0.24 ], jitter: 0.02 } } ),
	B( { id: 'massive-blockworks', label: 'Massive Blockworks', years: '2011–12', finish: 'iron', pose: 'bow', params: { course: [ 0.14, 0.3 ], minHalf: 0.07, jitter: 0.03 } } ),
	B( { id: 'extended-blockworks', label: 'Extended Blockworks', years: '2010–15', finish: 'rust', pose: 'stand', params: { course: [ 0.1, 0.2 ], extend: 5, extendLen: [ 0.4, 0.9 ] } } ),
	B( { id: 'memes', label: 'Memes', years: '2009–21', finish: 'corten', pose: 'lie', scale: 0.35, params: { course: [ 0.06, 0.12 ], jitter: 0.01 } } ),
	B( { id: 'double-extended-memes', label: 'Double Extended Memes', years: '2011–12', finish: 'corten', pose: 'stand', scale: 0.35, params: { double: true, course: [ 0.06, 0.12 ], extend: 3, extendLen: [ 0.5, 1.0 ] } } ),
	V( { id: 'cast-blockworks', label: 'Cast Blockworks', years: '2005–26', finish: 'rust', pose: 'crouch', params: { fine: false, skinLevel: 2, elong: 1.6, protrude: 0.5, gap: 0.14, shrink: 0.9, levels: [ 3 ] } } ),
	V( { id: 'blockworks', label: 'Blockworks', years: '2003–07', finish: 'iron', pose: 'crouch', params: { fine: true, elong: 2.4, protrude: 0.4, gap: 0.0, shrink: 0.88, coarse: 0.7 } } ),
	V( { id: 'early-blockworks', label: 'Early Blockworks', years: '2001–02', finish: 'verdigris', pose: 'stand', params: { fine: true, elong: 3.0, protrude: 0.6, gap: 0.05, shrink: 0.85, coarse: 0.9 } } ),
	B( { id: 'box-works', label: 'Box Works', years: '1987–93', finish: 'lead', pose: 'crouch', note: 'interpretation', params: { cube: true, course: [ 0.25, 0.4 ], merge: 0.05, aperture: true } } ),
	B( { id: 'big-double-clay-slabworks', label: 'Big Double Clay Slabworks', years: '2025–26', finish: 'clay', pose: 'sit', params: { slabs: 2, double: true, course: [ 0.12, 0.24 ] } } ),
	B( { id: 'constructed-slabworks', label: 'Constructed Slabworks', years: '2016–21', finish: 'iron', pose: 'sit', params: { slabs: 3, course: [ 0.14, 0.3 ], jitter: 0.02 } } ),
	B( { id: 'cast-slabworks', label: 'Cast Slabworks', years: '2015–26', finish: 'rust', pose: 'sit', params: { slabs: 2, course: [ 0.16, 0.3 ] } } ),

	// ---- beams & rods ---------------------------------------------------------------------------
	L( { id: 'big-beamers', label: 'Big Beamers', years: '2014–26', finish: 'steel', pose: 'stand', params: { pattern: 'courses', w: 0.05, pitch: 0.058, vert: 0.35, iso: 0.45, overshoot: 0.03 } } ),
	L( { id: 'cast-beamers', label: 'Cast Beamers', years: '2009–26', finish: 'rust', pose: 'stand', params: { pattern: 'courses', w: 0.04, pitch: 0.05, vert: 0.3, iso: 0.45, overshoot: 0.02 } } ),
	L( { id: 'constructed-beamers', label: 'Constructed Beamers', years: '2010–26', finish: 'steel', pose: 'stand', params: { pattern: 'courses', w: 0.028, pitch: 0.075, vert: 0.85, keep: 1.0, iso: 0.5, overshoot: 0.015 } } ),
	L( { id: 'hermitage-blockworks', label: 'Hermitage Blockworks', years: '2010–11', finish: 'rust', pose: 'stand', params: { pattern: 'courses', w: 0.034, pitch: 0.042, vert: 0.25, jitter: 0.07, keep: 0.9, iso: 0.5 } } ),
	V( { id: 'ataxia', label: 'Ataxia Works', years: '2008–09', finish: 'rust', alt: 'steel', family: 'linear', pose: 'bow', params: { fine: false, elong: 1.2, protrude: 0.4, gap: 0.04, shrink: 0.92, altShare: 0.35 } } ),
	V( { id: 'constructed-ataxia', label: 'Constructed Ataxia Works', years: '2007', finish: 'steel', family: 'linear', pose: 'stand', params: { fine: false, elong: 2.0, protrude: 0.4, gap: 0.08, shrink: 0.9 } } ),
	L( { id: 'grid-works', label: 'Grid Works', years: '2014–19', finish: 'rust', pose: 'stand', params: { pattern: 'grid', w: 0.008, pitch: 0.045, vert: 1.0, keep: 0.9, iso: 0.5, minLen: 0.02 } } ),
	L( { id: 'mined-gridworks', label: 'Mined Gridworks', years: '2015–19', finish: 'rust', pose: 'stand', params: { pattern: 'grid', w: 0.006, pitch: 0.06, vert: 0.9, keep: 0.85, iso: 0.5, minLen: 0.02, nodes: 0.016 } } ),
	L( { id: 'scaffold', label: 'Scaffolds', years: '2014–18', finish: 'black', pose: 'stand', params: { pattern: 'grid', w: 0.006, pitch: 0.06, vert: 0.8, keep: 0.75, overshoot: 0.18, iso: 0.55, minLen: 0.03 } } ),
	L( { id: 'weave-works', label: 'Weave Works', years: '2018–25', finish: 'steel', pose: 'stand', params: { pattern: 'courses', w: 0.012, pitch: 0.03, vert: 0.8, iso: 0.5, jitter: 0.03 } } ),

	// ---- frames & lines -------------------------------------------------------------------------
	B( { id: 'open-blockworks', label: 'Open Blockworks', years: '2014–26', finish: 'iron', family: 'frame', pose: 'stand', params: { mode: 'frame', course: [ 0.06, 0.12 ], q: 0.08, merge: 0.3, bar: 0.012, plates: 0.35, inset: 0.008 } } ),
	B( { id: 'station', label: 'Stations', years: '2013–15', finish: 'black', family: 'frame', pose: 'stand', params: { mode: 'frame', course: [ 0.05, 0.1 ], q: 0.06, merge: 0.4, bar: 0.008, plates: 0.3, inset: 0.004 } } ),
	B( { id: 'proppers', label: 'Proppers', years: '2011–18', finish: 'corten', family: 'frame', pose: 'stand', params: { mode: 'frame', course: [ 0.07, 0.14 ], q: 0.07, merge: 0.3, bar: 0.014, plates: 0.45, inset: 0.006, jitter: 0.01 } } ),
	B( { id: 'framers', label: 'Framers', years: '2009–21', finish: 'black', family: 'frame', pose: 'stand', params: { mode: 'frame', course: [ 0.06, 0.2 ], q: 0.04, merge: 0.5, bar: 0.007, extra: 2, inset: 0 } } ),
	B( { id: 'cast-framers', label: 'Cast Framers', years: '2020–25', finish: 'corten', family: 'frame', pose: 'stand', params: { mode: 'frame', cube: true, rotate: 0.6, course: [ 0.1, 0.18 ], merge: 0.5, bar: 0.012, inset: 0 } } ),
	S( gen.straps, { id: 'strapworks', label: 'Strapworks', years: '2018–26', finish: 'corten', family: 'frame', pose: 'stand', params: { segments: 420, strand: 26, len: [ 0.05, 0.15 ], margin: 0.014, extend: 0, t: 0.006, w: 0.026, cap: 0.5 } } ),
	S( gen.straps, { id: 'knotworks', label: 'Knotworks', years: '2020–26', finish: 'corten', family: 'frame', pose: 'stand', seed: 11, params: { segments: 700, strand: 40, len: [ 0.03, 0.09 ], margin: 0.008, extend: 0, t: 0.012, w: 0.02, cap: 0.5 } } ),
	S( gen.straps, { id: 'extended-strapworks', label: 'Extended Strapworks', years: '2022–26', finish: 'corten', family: 'frame', pose: 'stand', seed: 5, params: { segments: 380, strand: 30, len: [ 0.05, 0.16 ], margin: 0.014, extend: 0.04, t: 0.006, w: 0.03, cap: 0.5 } } ),
	S( gen.straps, { id: 'cast-liners', label: 'Cast Liners', years: '2015–26', finish: 'corten', family: 'frame', pose: 'lie', seed: 3, params: { segments: 260, strand: 60, len: [ 0.06, 0.18 ], margin: 0.01, extend: 0, t: 0.013, w: 0.013, cap: 0.5 } } ),
	S( gen.straps, { id: 'liners', label: 'Liners', years: '2011–17', finish: 'black', family: 'frame', pose: 'stand', seed: 9, params: { segments: 300, strand: 80, len: [ 0.05, 0.2 ], margin: 0.006, extend: 0.015, t: 0.004, w: 0.004, cap: 0.5 } } ),
	S( gen.rooter, { id: 'rooter', label: 'Rooters', years: '2017–19', finish: 'black', family: 'frame', pose: 'angel', params: { step: 0.14, jog: 0.03, t: 0.014, w: 0.026 } } ),
	S( gen.straps, { id: 'branchers', label: 'Branchers', years: '2016–25', finish: 'rust', family: 'frame', pose: 'stand', seed: 21, params: { segments: 520, strand: 8, branch: 0.85, len: [ 0.03, 0.1 ], margin: 0.01, extend: 0, t: 0.013, w: 0.013, cap: 0.5 } } ),

	// ---- networks, clouds & wire ------------------------------------------------------------------
	S( gen.domains, { id: 'domain', label: 'Domains', years: '1999–2025', finish: 'black', family: 'network', pose: 'stand', params: { nodes: 1000, shell: 0.75, k: 3, maxLen: 0.13, bar: 0.0055, overrun: 0.012 } } ),
	S( gen.aperture, { id: 'aperture', label: 'Aperture Works', years: '2009–12', finish: 'black', family: 'network', pose: 'stand', params: { cells: [ 0.085 ], layerDepth: 0.045, bar: 0.006 } } ),
	S( gen.aperture, { id: 'hive', label: 'Hive Works', years: '2006–09', finish: 'black', family: 'network', pose: 'stand', params: { cells: [ 0.05, 0.04 ], layerDepth: 0.03, bar: 0.004 } } ),
	S( gen.polyNet, { id: 'net-polyhedra-works', label: 'Net Polyhedra Works', years: '2008–25', finish: 'stainless', family: 'network', pose: 'reach', params: { cell: 0.05, bar: 0.004 } } ),
	S( gen.domains, { id: 'drift', label: 'Drift Works', years: '2007–12', finish: 'black', family: 'network', pose: 'angel', params: { nodes: 1800, outward: 0.45, falloff: 1.8, k: 3, maxLen: 0.12, bar: 0.003, overrun: 0.0 } } ),
	S( gen.polyNet, { id: 'open-expansion-works', label: 'Open Expansion Works', years: '2007–08', finish: 'stainless', family: 'network', pose: 'stand', params: { cell: 0.14, push: 0.22, bar: 0.004 } } ),
	S( gen.quantum, { id: 'quantum-cloud', label: 'Quantum Clouds', years: '1999–2007', finish: 'stainless', family: 'network', pose: 'stand', params: { bars: 2600, core: 0.62, halo: 0.45, gap: 0, falloff: 2.2, len: [ 0.1, 0.24 ], bar: 0.006 } } ),
	S( gen.quantum, { id: 'quantum-void', label: 'Quantum Voids', years: '2008–10', finish: 'stainless', family: 'network', pose: 'stand', params: { bars: 3600, core: 0, halo: 0.42, gap: 0.01, falloff: 2.4, len: [ 0.08, 0.2 ], bar: 0.005, tangent: 0.06 } } ),
	S( gen.needles, { id: 'under-my-skin', label: 'Under My Skin Works', years: '2001–03', finish: 'black', family: 'network', pose: 'stand', params: { count: 420, len: [ 0.45, 1.1 ], bar: 0.004 } } ),
	S( gen.coils, { id: 'feeling-material', label: 'Feeling Material Works', years: '2003–08', finish: 'black', family: 'network', pose: 'stand', params: { pitch: 0.035, perLoop: 22, tilt: 0.9, gap: 0.02, loose: 0.12, looseR: 1.2, bar: 0.0035 } } ),
	S( gen.bubbles, { id: 'bubble-works', label: 'Bubble Works', years: '2015–26', finish: 'black', family: 'network', pose: 'stand', params: { count: 170, r: [ 0.03, 0.09 ], perRing: 16, bar: 0.003 } } ),
	S( gen.cage, { id: 'cage-works', label: 'Cage Works', years: '1996–99', finish: 'black', family: 'network', pose: 'stand', params: { pitch: 0.07, perRing: 12, meridian: 2, gap: 0.03, bar: 0.004 } } ),
	S( gen.balls, { id: 'ball-works', label: 'Ball Works', years: '2000–09', finish: 'iron', family: 'network', pose: 'fetal', params: { count: 2600, r: [ 0.012, 0.045 ] } } ),
	S( gen.polyNet, { id: 'transfusers', label: 'Transfusers', years: '2001–02', finish: 'black', family: 'network', pose: 'lie', params: { cell: 0.028, bar: 0.0028 } } ),
	S( gen.clay, { id: 'clay-works', label: 'Clay Works', years: '2017–20', finish: 'clay', family: 'network', pose: 'fetal', params: { pitch: 0.12, perRing: 7, roll: 0.05, shape: 'roll' } } ),

	// ---- cast body --------------------------------------------------------------------------------
	C( { id: 'expansion-works', label: 'Expansion Works', years: '1990–94', finish: 'corten', pose: 'fetal', params: { field: 'inflate', iso: 0.13, step: 0.016 } } ),
	C( { id: 'cast-expansion-works', label: 'Cast Expansion Works', years: '2012', finish: 'iron', pose: 'stand', params: { field: 'inflate', iso: 0.18, step: 0.016 } } ),
	C( { id: 'insiders', label: 'Insiders', years: '1997–2003', finish: 'iron', pose: 'stand', params: { field: 'erode', iso: 0.7 } } ),
	C( { id: 'polyhedra-works', label: 'Polyhedra Works', years: '2008–26', finish: 'corten', pose: 'stand', params: { field: 'fine', iso: 0.5, facets: 0.09 } } ),
	C( { id: 'concrete-works', label: 'Concrete Works', years: '1990–93', finish: 'concrete', pose: 'lie', params: { block: true, iso: 0.5 } } ),
	C( { id: 'a-case-for-an-angel', label: 'A Case For An Angel', years: '1989–90', finish: 'iron', pose: 'stand', params: { ...leadSeams, seams: false, props: [ { bone: 'Spine2', offset: [ 0, 0.02, - 0.06 ], size: [ 3.0, 0.3, 0.07 ] } ] } } ),
	C( { id: 'pierced-lead-works', label: 'Pierced Lead Works', years: '1988–93', finish: 'lead', pose: 'lie', params: { ...leadSeams, props: [ { bone: 'Spine1', offset: [ 0, 0, 0.16 ], size: [ 0.035, 0.035, 0.2 ] } ] } } ),
	C( { id: 'double-bodycase-works-in-lead-and-cast-iron', label: 'Double Bodycase Works In Lead And Cast Iron', years: '1987–2004', finish: 'lead', pose: 'fetal', params: { ...leadSeams, iso: 0.4 } } ),
	C( { id: 'suspended-and-gravity-works', label: 'Suspended And Gravity Works', years: '1984–2012', finish: 'lead', pose: 'stand', params: { ...leadSeams, props: [ { bone: 'root', offset: [ 0.3, 0.03, 0 ], size: [ 3.2, 0.06, 0.2 ], alt: true, finish: 'wood' } ] } } ),
	C( { id: 'extended-works', label: 'Extended Works', years: '1984–96', finish: 'iron', pose: 'stand', params: { ...leadSeams, seams: false, props: [ { bone: 'Head', offset: [ 0, 1.25, 0 ], size: [ 0.05, 2.4, 0.05 ] } ] } } ),
	C( { id: 'hermetic-lead-bodycase', label: 'Hermetic Lead Bodycase Works', years: '1983–95', finish: 'lead', pose: 'stand', params: { ...leadSeams } } ),
	C( { id: 'early-single-lead-bodycase-works', label: 'Early Single Lead Bodycase Works', years: '1983–88', finish: 'lead', pose: 'crouch', params: { ...leadSeams } } ),
	C( { id: 'three-part-lead-bodycase-works', label: 'Three Part Lead Bodycase Works', years: '1981–85', finish: 'lead', pose: 'fetal', params: { ...leadSeams, cuts: [ 'Spine1', 'Neck' ] } } ),
	C( { id: 'terracotta-and-lead-works', label: 'Terracotta And Lead Works', years: '1983–88', finish: 'lead', pose: 'lie', note: 'interpretation', params: { ...leadSeams, props: [ { bone: 'Head', offset: [ 0, 0.1, 0.35 ], size: [ 0.4, 0.42, 0.46 ], alt: true, finish: 'terracotta' } ] } } ),
	C( { id: 'man-rock-and-planets', label: 'Man Rock And Planets', years: '1982–2024', finish: 'limestone', pose: 'fetal', params: { field: 'rock', iso: 0.16, step: 0.016 } } ),
	C( { id: 'blanket-drawings', label: 'Blanket Drawings', years: '1982–83', finish: 'black', pose: 'swerve', note: 'interpretation', params: { flatten: 0.05, iso: 0.5, props: [ { bone: 'root', offset: [ 0, 0.98, - 0.03 ], size: [ 1.25, 1.95, 0.012 ], alt: true, finish: 'lead' } ] } } ),
	S( gen.objects, { id: 'object-works', label: 'Object Works', years: '1981–93', finish: 'lead', family: 'skin', pose: 'lie', note: 'interpretation', params: { shape: 'roll' } } ),
	C( { id: 'bodyform', label: 'Cast iron bodyforms', years: '1997–2007', finish: 'iron', pose: 'stand', extra: 'Another Place, Event Horizon (works, not a listed series)', params: { field: 'fine', iso: 0.5 } } ),

	// ---- room works (the space the figure walks through) ----------------------------------------------
	E( { id: 'run', label: 'Run', years: '2016–22', finish: 'steel', pose: 'stand', companion: 'liners', note: 'interpretation', params: { mode: 'run' } } ),
	E( { id: 'co-ordinate', label: 'Co-ordinate Works', years: '2014–24', finish: 'black', pose: 'stand', companion: 'big-blockworks', params: { mode: 'coordinate' } } ),
	E( { id: 'natural-selection', label: 'Natural Selection Works', years: '1981', finish: 'iron', pose: 'stand', companion: 'hermetic-lead-bodycase', note: 'interpretation', params: { mode: 'trail' } } ),
	E( { id: 'room-series', label: 'Room Series', years: '1980–90', finish: 'black', pose: 'stand', companion: 'early-single-lead-bodycase-works', note: 'interpretation', params: { mode: 'room' } } ),
];

for ( const d of STYLE_DEFS ) {

	d.series = `${ d.label }, ${ d.years }`;
	d.params = { ...d.params };

}
