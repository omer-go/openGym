// Cardio speed, in mph — the only unit. Stored in mph everywhere (a routine, a logged set, a
// shared plan file, what the Coach and the MCP bridge read) and shown as stored: no conversion.
import { fmtNum } from './format.js'

/** The default cardio speed for a new target or set. */
export const DEFAULT_SPEED = 5

/** The unit speeds are in: always 'mph'. */
export const speedUnitOf = () => 'mph'

/** The unit's short label. */
export const speedLabel = () => 'mph'

/* What is shown and what is stored are the same number. Kept as functions so the screens that
   step a speed read the same either way. */
export const toSpeed = v => v
export const fromSpeed = v => v

/** "5 mph". */
export const fmtSpeed = mph => `${fmtNum(Number(mph) || 0)} mph`
