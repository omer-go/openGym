// A combo is conditioning unless it is set to Strength (`sgKind: 'strength'`). Light weights,
// many rounds and no rest between exercises keep the heart rate up; the sets are far from
// failure, so they say little about how strong you are and are not the hard sets a muscle grows
// from. So a conditioning set:
// - never moves the progression of the lift, or seeds the rows of its next strength session
//   (history.js lastEntryFor, progression.js sessionsFor), and a conditioning combo carries its
//   own numbers forward from the last conditioning session of the exercise instead;
// - is no estimate of a one-rep max and no record (onerm.js bestSetOf, history.js bestWeightFor);
// - is not counted in the weekly hard sets per muscle or the muscle balance (coverage.js,
//   muscles.js), which show it as a layer of its own instead;
// - still tires the muscles, at CONDITIONING_FATIGUE of a hard set (recovery.js);
// - does not make a muscle "trained lately" for a one-tap workout (generate.js trainingIndex).
// A Strength combo is a superset like any other and counts as one.
//
// The kind rides with the combo flag: on a routine exercise itself, on a session entry's
// `target` (lib/superset-meta.js), and so on the saved workout's entries.

export const KIND_CONDITIONING = 'conditioning'
export const KIND_STRENGTH = 'strength'

/** How much a conditioning set tires a muscle, against a hard set. */
export const CONDITIONING_FATIGUE = 0.5

const fieldsOf = x => (x && typeof x === 'object' ? x : {})

/** Is this config — a routine exercise, an entry's `target`, an add's seed — a conditioning combo? */
export function isConditioningCfg(cfg) {
  const f = fieldsOf(cfg)
  return f.sgCombo === true && f.sgKind !== KIND_STRENGTH
}

/** Is this session or saved entry part of a conditioning combo? */
export const isConditioning = entry => isConditioningCfg(entry?.target)

/** The kind a history read is for: a conditioning combo reads its own sessions, all else strength. */
export const kindOfCfg = cfg => (isConditioningCfg(cfg) ? KIND_CONDITIONING : KIND_STRENGTH)
export const kindOfEntry = entry => kindOfCfg(entry?.target)

/** Does `entry` belong to the history of `kind`? */
export const entryOfKind = (entry, kind) => (kindOfEntry(entry) === KIND_CONDITIONING) === (kind === KIND_CONDITIONING)

/** The kind of a group, from its members' fields: Strength only when one says so. */
export function comboKindOf(list, unit, { onTarget = false } = {}) {
  for (const idx of unit || []) {
    const item = list?.[idx]
    const f = fieldsOf(onTarget ? item?.target : item)
    if (f.sgKind === KIND_STRENGTH) return KIND_STRENGTH
  }
  return KIND_CONDITIONING
}

const memo = new WeakMap()

/**
 * The workouts with their conditioning entries left out, for the reads that measure strength or
 * hard sets. A workout without any is passed through as it is; the list is cached per array, so
 * a stats screen that asks many times pays once.
 */
export function strengthWorkouts(workouts) {
  if (!Array.isArray(workouts)) return []
  const hit = memo.get(workouts)
  if (hit) return hit
  const out = workouts.map(w => {
    const entries = w?.entries
    if (!Array.isArray(entries) || !entries.some(isConditioning)) return w
    return { ...w, entries: entries.filter(e => !isConditioning(e)) }
  })
  memo.set(workouts, out)
  return out
}

/** The workouts with only their conditioning entries, for the conditioning layer of a stat. */
export function conditioningWorkouts(workouts) {
  return (Array.isArray(workouts) ? workouts : [])
    .map(w => (Array.isArray(w?.entries) && w.entries.some(isConditioning) ? { ...w, entries: w.entries.filter(isConditioning) } : null))
    .filter(Boolean)
}
