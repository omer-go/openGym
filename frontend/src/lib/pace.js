// How long a work set takes you, rest and moving between lifts included, read off the times the
// sets were ticked (`set.at`, or each side's). The planner's minutes use it in place of the rest a
// slot prescribes (planner.js minutesOf), so a day's length is the one you'd actually train.
import { isWarmupRow } from './workout-model.js'

const IDLE = 10 * 60e3 // a gap longer than this is a break, not a set's rest
const MIN_SETS = 8     // fewer work sets than this say little about a session's pace
const MIN_WORKOUTS = 3 // and fewer sessions than this, little about yours
const LAST = 10        // the sessions it reads, latest first

const stampsOf = set => [set?.at, set?.sides?.L?.at, set?.sides?.R?.at]
  .map(Number).filter(n => Number.isFinite(n) && n > 0)

/** Seconds a work set takes in workout `w`, or null when it has too few ticked sets to say. */
export function workoutPace(w) {
  const stamps = [], seen = new Set()
  let work = 0
  for (const e of w?.entries || []) for (const s of e?.sets || []) {
    const at = stampsOf(s)
    if (!at.length) continue
    for (const a of at) if (!seen.has(a)) { seen.add(a); stamps.push(a) }
    if (!isWarmupRow(s)) work++
  }
  if (work < MIN_SETS) return null
  stamps.sort((a, b) => a - b)
  let active = 0
  for (let i = 1; i < stamps.length; i++) if (stamps[i] - stamps[i - 1] <= IDLE) active += stamps[i] - stamps[i - 1]
  // The time from the first set to the last spans one set fewer than were done.
  return active > 0 ? Math.round(active / 1000 / (work - 1)) : null
}

/**
 * Your seconds a work set, rest included: the median of your last workouts' paces, or null
 * until there are enough of them to go by.
 */
export function setPaceOf(workouts) {
  const paces = (workouts || []).filter(w => w && typeof w.d === 'string')
    .sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : (Number(b.start) || 0) - (Number(a.start) || 0)))
    .map(workoutPace).filter(p => p > 0).slice(0, LAST)
  if (paces.length < MIN_WORKOUTS) return null
  const s = paces.sort((a, b) => a - b), m = s.length >> 1
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}
