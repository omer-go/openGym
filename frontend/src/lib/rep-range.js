// Normalize the two bounds used by double progression.
// `reps` is the upper bound and `repsMin` is the lower bound in persisted configs.
export function normalizeRepRange(reps, repsMin, stride = 1) {
  const step = Number.isInteger(stride) && stride > 0 ? stride : 1
  const upper = align(positiveInt(reps, 10), step)
  const lower = align(positiveInt(repsMin, Math.max(1, upper - 2)), step)
  return lower >= upper
    ? { reps: lower + step, repsMin: lower }
    : { reps: upper, repsMin: lower }
}

/**
 * The range once its top is picked as `reps` (the reps chips, the weight picker): a top at or
 * under the floor takes the floor down with it, the range as wide as it was. Without this, picking
 * 11 under a floor of 16 snapped back to 17, and a lower range could not be picked at all.
 */
export function pickTopReps(reps, { reps: top, repsMin } = {}, stride = 1) {
  const step = Number.isInteger(stride) && stride > 0 ? stride : 1
  const upper = align(positiveInt(reps, 10), step)
  const lower = positiveInt(repsMin, 0)
  if (!lower || lower < upper) return normalizeRepRange(upper, lower || undefined, step)
  const width = Math.max(step, positiveInt(top, lower + step) - lower)
  return normalizeRepRange(upper, Math.max(step, upper - width), step)
}

/**
 * The reps of a config with "Per side" turned `on` or off. A per-side target counts both sides
 * (22 is 11 a side), so turning it on doubles the reps and the range's floor, and turning it off
 * halves them: 11 a side is a set of 11 with both arms. The work asked for stays the same.
 */
export function repsForSides({ reps, repsMin } = {}, on) {
  const r = positiveInt(reps, 0), m = positiveInt(repsMin, 0)
  const out = on
    ? { reps: r ? r * 2 : undefined, repsMin: m ? m * 2 : undefined }
    : { reps: r ? Math.max(1, Math.ceil(r / 2)) : undefined, repsMin: m ? Math.max(1, Math.ceil(m / 2)) : undefined }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined))
}

function align(value, stride) {
  return Math.max(stride, Math.ceil(value / stride) * stride)
}

function positiveInt(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n)) : fallback
}
