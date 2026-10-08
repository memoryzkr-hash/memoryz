/**
 * Units: distances in tiles, time in beats. Working in beats keeps a chart's geometry identical at
 * any tempo — a level is laid out once and only plays faster or slower with its song.
 */

/** Simulation step. Charts sit on half beats, so every chart beat lands exactly on a step. */
export const STEPS_PER_BEAT = 240;
export const DT = 1 / STEPS_PER_BEAT;

/** Horizontal speed, constant: x = SPEED * t. One eighth note = 2 tiles. */
export const SPEED = 4;
export const GRAVITY = 17.6;
/** A ground jump stays in the air exactly one beat on flat ground and peaks at 2.2 tiles. */
export const JUMP_V = (GRAVITY * 1) / 2;
/** Yellow pad: 1.5 beats in the air. */
export const PAD_V = (GRAVITY * 1.5) / 2;
/** Air ring: same kick as a ground jump, from wherever the ball is. */
export const ORB_V = JUMP_V;

/** Drawn ball radius; y in the sim is the bottom of the ball. */
export const BALL_R = 0.4;
/** Spike hit radius around the ball's centre — a little smaller than the drawing, to be fair. */
export const HIT_R = 0.32;
/** Half width of the ball's "feet" for standing on blocks and hitting their sides. */
export const FOOT = 0.3;
/** A falling ball within this distance below a block top still lands on it. */
export const LAND_EPS = 0.14;

/** Spike hitbox: a narrow box over the triangle's middle. */
export const SPIKE_HALF_W = 0.16;
export const SPIKE_H = 0.55;
/** Drawn spike: one tile wide, 0.9 tall. */
export const SPIKE_DRAW_H = 0.9;

export const PAD_HALF_W = 0.45;
/** An air ring triggers when the ball's centre is this close to it. */
export const ORB_REACH = 0.9;

/** A press stays valid this long, so tapping just before landing (or before a ring) still counts. */
export const PRESS_BUFFER = 0.15;

/** Falling this far below the lowest ground is a death. */
export const FALL_DEATH_Y = -5;

/** Every level starts with a one-bar count-in while the ball rolls in. */
export const START_BEAT = -4;

/** Judgement windows in milliseconds. */
export const WINDOW_MS = { perfect: 45, great: 90 } as const;
/** A jump within this many beats of a note is matched to it. */
export const MATCH_BEATS = 0.45;
