// One-tap workouts: a full-body, push, pull or leg session built from the muscles you have
// trained least lately. Pure: reads state, returns picks and session entries, never writes.
//
// A day type is a list of slots, each a muscle (or a choice of two, 'a|b') and how many
// exercises it gets. Each slot goes to its stalest muscle — the one whose last completed work
// set is longest ago, never trained counting as the stalest of all — and the session is then
// ordered stalest first, so the muscle that needs it most is the one you are freshest for.
//
// Within a muscle, exercises you have already logged come first, longest-ago first so the
// variety rotates; after them a short list of staple lifts, so a muscle you have never trained
// opens on a bench press, not on whichever of 300 catalogue rows sorts first. `shift` walks each
// muscle's list one further: Shuffle in the workout is a shift + 1.
import { EXIDX, isCardio } from './exercises.js'
import { musclesOf } from './muscles.js'
import { primaryMuscleOf } from './strength-exercises.js'
import { exAvailable } from './equipment.js'
import { buildSets, applyIntensifierPlan, defaultConfig, freestyleConfig, modeOf } from './history.js'
import { hasCompletedWork, isWarmupRow } from './workout-model.js'
import { weightIncrement, defaultIncrement } from './progression.js'
import { dropGrid } from './plates.js'
import { withMeaning, historyAs, dbLoadFor, ownedWeightsFor } from './dumbbells.js'

export const GEN_TYPES = {
  full: [['chest', 1], ['upper-back', 1], ['deltoids', 1], ['quadriceps', 1], ['hamstring|gluteal', 1], ['biceps|triceps', 1], ['calves|abs', 1]],
  push: [['chest', 2], ['deltoids', 2], ['triceps', 2]],
  pull: [['upper-back', 3], ['trapezius', 1], ['biceps', 2]],
  legs: [['quadriceps', 2], ['hamstring', 2], ['gluteal', 1], ['calves', 1]],
}

// English names, used as i18n keys where they are shown (t(GEN_NAME[type])).
export const GEN_NAME = { full: 'Full body', push: 'Push day', pull: 'Pull day', legs: 'Leg day' }

// Staple lifts per muscle, best first. Only reached for exercises you have not logged yet.
export const STAPLES = {
  chest: ['0025', '0289', '0047', '0314', '0308', '1030', '0251', '0662', '0188'],
  deltoids: ['0426', '0405', '0091', '0334', '0178', '0603', '2137', '0383', '5609'],
  triceps: ['0241', '0030', '0061', '0814', '2188', '0333', '0187'],
  'upper-back': ['0652', '2330', '0027', '1323', '0861', '0293', '2393', '1326', '0327', '1350'],
  biceps: ['0031', '0313', '0447', '0318', '0868', '0372', '0070'],
  quadriceps: ['0043', '0739', '0042', '0585', '2290', '5516', '0770'],
  hamstring: ['0085', '0586', '0599', '1543', '0044', '1459'],
  gluteal: ['1060', '0032', '0336', '0054', '1409', '2146'],
  calves: ['0605', '1372', '0594', '0417', '0088'],
  abs: ['0175', '0472', '0274', '0463', '0276', '3449'],
  trapezius: ['0406', '0095', '0220', '0604'],
}

// A muscle counts as trained by an exercise that works it at least this hard: every primary, not
// a supporting role (muscles.js weighs a secondary at 0.4) — a bench press is not a shoulder day.
const TRAINED_AT = 0.5

const weightsOfEntry = entry => {
  const ex = EXIDX[entry?.id]
  if (ex) return musclesOf(ex)
  const snap = entry?.muscleSnapshot?.muscleWeights || entry?.muscleWeights
  return snap && typeof snap === 'object' ? snap : {}
}
const worked = entry => (entry?.sets || []).some(s => hasCompletedWork(s) && !isWarmupRow(s))

/** Muscle slug -> the latest ISO day it was trained, and exercise id -> { d, n } of logged use. */
export function trainingIndex(S) {
  const muscles = {}, exercises = {}
  for (const w of S?.workouts || []) {
    const d = typeof w?.d === 'string' ? w.d : null
    if (!d) continue
    for (const entry of w.entries || []) {
      if (!worked(entry)) continue
      const seen = exercises[entry.id] || (exercises[entry.id] = { d, n: 0 })
      seen.n++
      if (d > seen.d) seen.d = d
      for (const [slug, weight] of Object.entries(weightsOfEntry(entry))) {
        if (weight >= TRAINED_AT && !(muscles[slug] >= d)) muscles[slug] = d
      }
    }
  }
  return { muscles, exercises }
}

// Never trained sorts before any day; otherwise the earlier day is the staler one.
const staleKey = d => d || ''
const staler = (a, b) => (staleKey(a) < staleKey(b) ? -1 : staleKey(a) > staleKey(b) ? 1 : 0)

/** The exercises a slot on `slug` may use, in the order they are offered. */
export function candidatesFor(S, slug, index = trainingIndex(S)) {
  const usable = ex => ex && !isCardio(ex) && exAvailable(S, ex)
  const logged = Object.entries(index.exercises)
    .filter(([id]) => usable(EXIDX[id]) && primaryMuscleOf(EXIDX[id])?.slug === slug)
    .sort(([a, x], [b, y]) => staler(x.d, y.d) || y.n - x.n || (a < b ? -1 : 1))
    .map(([id]) => id)
  const staples = (STAPLES[slug] || []).filter(id => usable(EXIDX[id]) && !logged.includes(id))
  return [...logged, ...staples]
}

/**
 * The exercises of a `type` session: [{ id, muscle, last }], stalest muscle first. `last` is
 * the ISO day that muscle was last trained, null when never. A slot with nothing to offer
 * (an equipment profile that rules every candidate out) is left out.
 */
export function generateWorkout(S, type, { shift = 0 } = {}) {
  const slots = GEN_TYPES[type]
  if (!slots) return []
  const index = trainingIndex(S)
  const lastOf = slug => index.muscles[slug] || null
  const lists = {}, used = {}, taken = new Set(), picks = []
  for (const [spec, count] of slots) {
    const options = spec.split('|')
    const slug = options.slice().sort((a, b) => staler(lastOf(a), lastOf(b)))[0]
    const list = lists[slug] || (lists[slug] = candidatesFor(S, slug, index))
    for (let k = 0; k < count && list.length; k++) {
      for (let tries = 0; tries < list.length; tries++) {
        const id = list[(shift + (used[slug] || 0) + tries) % list.length]
        if (taken.has(id)) continue
        used[slug] = (used[slug] || 0) + tries + 1
        taken.add(id)
        picks.push({ id, muscle: slug, last: lastOf(slug) })
        break
      }
    }
  }
  // Array#sort is stable: a slot's own order holds within one muscle.
  return picks.sort((a, b) => staler(a.last, b.last))
}

/**
 * Session entries for `picks`, built the way a freestyle exercise added mid-workout is
 * (Workout.jsx): last time's target and loads, in the exercise's dumbbell meaning today.
 * `gen` says why it was picked; the finish path keeps only what was logged, so it never
 * reaches the saved workout.
 */
export function generatedEntries(S, picks) {
  return picks.map(({ id, muscle, last }) => {
    const cfg = freestyleConfig(S, { id, ...defaultConfig(id) })
    const full = { ...cfg, id }
    const step = modeOf(full) === 'reps' ? (ownedWeightsFor(S, full) || weightIncrement(full, S.unit)) : defaultIncrement(id, S.unit)
    const sets = applyIntensifierPlan(buildSets(historyAs(S, id, dbLoadFor(S, full)), full, { step, preferLast: true }), full, dropGrid(S, full))
    return { id, target: withMeaning(S, cfg, id), plan: null, sets, gen: { m: muscle, d: last } }
  })
}
