/**
 * Units: distances in tiles, time in beats. A song is a row of bars on a five-line staff: the ball
 * moves right at a constant speed and bounces from note head to note head.
 */

/** Horizontal speed, constant: x = SPEED * beat. An eighth note is 1.5 tiles. */
export const SPEED = 3;
/** Width of a note-head platform. */
export const HEAD_W = 1.2;
/**
 * A press this close to a note (early or late) is matched to it. Early: the head is still under
 * the ball when it lands. Late: the ball has kept falling a little and is caught by the new head.
 */
export const WINDOW_BEATS = 0.25;
/** Height between pitch lines 1..5. */
export const PITCH_STEP = 0.75;
/** Gravity for a ball that missed its note, tiles/beat². */
export const FALL_GRAVITY = 24;
export const BALL_R = 0.38;

export const MAX_HEARTS = 3;

/** Every song starts with a one-bar count-in. */
export const START_BEAT = -4;
/** A ball that fell drops back in from this high, this many beats before the next call note. */
export const RESPAWN_HEIGHT = 5;
export const RESPAWN_LEAD = 1;

/** Judgement windows in milliseconds. */
export const WINDOW_MS = { perfect: 45, great: 90 } as const;
