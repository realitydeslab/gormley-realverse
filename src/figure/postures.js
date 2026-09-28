// Gormley postures as rotations applied on top of the mocap idle pose.
// Each entry: [boneSuffix, axis, degrees] with axes in the figure's own frame
// (+X = figure's left, +Y = up, +Z = forward). Applied root-first, in order.
// "Mirror" entries ending in '*' are applied to Left and Right (Z/Y angles mirrored).

// Applied to the idle pose before every posture: Gormley stands feet close, legs and arms straight.
export const NEUTRAL = [ [ 'UpLeg*', 'z', - 7 ], [ 'Leg*', 'x', - 5 ], [ 'Foot*', 'z', 4 ], [ 'Arm*', 'z', - 5 ], [ 'Arm*', 'x', 4 ], [ 'ForeArm*', 'x', 22 ], [ 'ForeArm*', 'z', - 6 ] ];

export const POSTURES = {
	stand: {
		label: 'STAND', ref: 'Another Place, 1997 · Event Horizon, 2007',
		rot: [ [ 'Head', 'x', 4 ] ],
	},
	bow: {
		label: 'SENSE', ref: 'Sense, 1991 · Critical Mass II, 1995',
		rot: [ [ 'Spine1', 'x', 8 ], [ 'Neck', 'x', 18 ], [ 'Head', 'x', 26 ] ],
	},
	swerve: {
		label: 'SWERVE', ref: 'SWERVE IV, 2024',
		rot: [ [ 'Hips', 'z', 4 ], [ 'Spine', 'z', - 5 ], [ 'Spine2', 'z', - 4 ], [ 'Head', 'z', 8 ],
			[ 'RightUpLeg', 'x', - 10 ], [ 'RightLeg', 'x', 18 ], [ 'LeftUpLeg', 'z', 4 ] ],
	},
	crouch: {
		label: 'COTCH', ref: 'COTCH XIII, 2024 · Cotch XI, 2013',
		rot: [ [ 'UpLeg*', 'x', - 118 ], [ 'Leg*', 'x', 136 ], [ 'Foot*', 'x', - 12 ],
			[ 'Spine', 'x', 18 ], [ 'Spine1', 'x', 16 ], [ 'Spine2', 'x', 10 ], [ 'Neck', 'x', 12 ], [ 'Head', 'x', 18 ],
			[ 'Arm*', 'x', - 58 ], [ 'Arm*', 'z', - 12 ], [ 'ForeArm*', 'x', - 62 ], [ 'ForeArm*', 'y', 30 ] ],
	},
	kneel: {
		label: 'STAY', ref: 'STAY I–III, 2024',
		rot: [ [ 'UpLeg*', 'x', - 12 ], [ 'Leg*', 'x', 104 ], [ 'Foot*', 'x', 40 ],
			[ 'Spine', 'x', 26 ], [ 'Spine1', 'x', 22 ], [ 'Spine2', 'x', 14 ], [ 'Neck', 'x', 16 ], [ 'Head', 'x', 24 ],
			[ 'Arm*', 'x', - 18 ], [ 'ForeArm*', 'x', - 20 ] ],
	},
	sit: {
		label: 'SLUMP', ref: 'RETREAT: SLUMP, 2022',
		rot: [ [ 'UpLeg*', 'x', - 88 ], [ 'Leg*', 'x', 14 ], [ 'Spine', 'x', 12 ], [ 'Spine1', 'x', 14 ], [ 'Spine2', 'x', 8 ],
			[ 'Neck', 'x', 14 ], [ 'Head', 'x', 18 ], [ 'Arm*', 'x', - 26 ], [ 'ForeArm*', 'x', - 30 ] ],
	},
	lie: {
		label: 'LIE', ref: 'Sleeping Field, 2015–16 · Lost Subject I, 1994',
		rot: [ [ 'Hips', 'x', - 90 ], [ 'Head', 'x', - 4 ] ],
	},
	fetal: {
		label: 'HOLD', ref: 'Resting Place II, 2024',
		rot: [ [ 'Hips', 'z', - 90 ], [ 'UpLeg*', 'x', - 96 ], [ 'Leg*', 'x', 110 ],
			[ 'Spine', 'x', 22 ], [ 'Spine1', 'x', 18 ], [ 'Spine2', 'x', 12 ], [ 'Neck', 'x', 16 ], [ 'Head', 'x', 22 ],
			[ 'Arm*', 'x', - 70 ], [ 'ForeArm*', 'x', - 80 ] ],
	},
	reach: {
		label: 'PLUCK', ref: 'PLUCK 2, 2024',
		rot: [ [ 'Arm*', 'x', - 168 ], [ 'Arm*', 'z', 6 ], [ 'ForeArm*', 'x', - 6 ], [ 'Head', 'x', - 22 ], [ 'Spine2', 'x', - 6 ] ],
	},
	angel: {
		label: 'OPEN', ref: 'Angel of the North, 1998 · Bearing, 1988',
		rot: [ [ 'Arm*', 'z', 80 ], [ 'Arm*', 'x', - 8 ], [ 'ForeArm*', 'x', 6 ], [ 'Head', 'x', 6 ] ],
	},
};

export const POSTURE_ORDER = [ 'stand', 'bow', 'swerve', 'crouch', 'kneel', 'sit', 'lie', 'fetal', 'reach', 'angel' ];
