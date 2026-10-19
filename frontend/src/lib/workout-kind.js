// What kind of workout a session was, for the colours on Home: one of the four one-tap day types
// (lib/generate.js), a saved routine, or freestyle. The same colour marks a kind's Start tile and
// its days in the week strip, so the calendar reads at a glance. A one-tap session keeps its day
// type as `genType` (finish-workout.js); one logged before that reads by its routine, if any.
export const KIND_COLOR = {
  full: 'var(--blue)', pull: 'var(--purple)', push: 'var(--orange)', legs: 'var(--pink)',
  free: 'var(--yellow)', routine: 'var(--mint)',
}
const GEN_KINDS = ['full', 'pull', 'push', 'legs']

/** 'full' | 'pull' | 'push' | 'legs' | 'routine' | 'free'. */
export function workoutKind(w) {
  if (GEN_KINDS.includes(w?.genType)) return w.genType
  const ids = Array.isArray(w?.routineIds) ? w.routineIds : w?.routineId ? [w.routineId] : []
  return ids.length ? 'routine' : 'free'
}

/** The sessions logged on `iso`, in the order they started, each with its kind. */
export function workoutsOn(workouts, iso) {
  return (workouts || []).filter(w => w?.d === iso)
    .sort((a, b) => (a.start || 0) - (b.start || 0))
    .map(w => ({ w, kind: workoutKind(w) }))
}
