import { supersetUnits, unitOf, modeOf } from './history.js'

function hasLoggedSet(entry) {
  return Array.isArray(entry?.sets) && entry.sets.some(set => set?.done === true)
}

// The rest belongs to the slot, not the exercise: the replacement is built from the new
// exercise's defaults, which carry none, and would fall back to the app-wide rest timer. One the
// replacement was given (typed in the config sheet) wins.
function withSlotRest(replacement, current) {
  const rest = Number(current?.target?.restSec)
  if (!(rest > 0) || replacement.target?.restSec > 0) return replacement
  return { ...replacement, target: { ...(replacement.target || {}), restSec: rest } }
}

/**
 * `cfg` for the exercise going into a slot, with the slot's own settings: its rest, its warm-ups
 * and their rest, and a last set to failure. They were chosen for the slot (the routine's, or the
 * one-tap workout's), and a new exercise's defaults carry none of them. One `cfg` sets itself
 * wins. Warm-ups only carry between exercises done the same way: a run has no ramp.
 */
export function withSlotSettings(cfg, slot) {
  if (!cfg || !slot) return cfg
  const out = { ...cfg }
  if (slot.restSec > 0 && !(out.restSec > 0)) out.restSec = slot.restSec
  if (slot.warmupSets > 0 && !(out.warmupSets > 0) && modeOf(slot) === modeOf(out) && modeOf(out) !== 'cardio') {
    out.warmupSets = slot.warmupSets
    if (slot.warmupRestSec > 0 && !(out.warmupRestSec > 0)) out.warmupRestSec = slot.warmupRestSec
  }
  if (slot.lastToFailure === true && out.lastToFailure === undefined && modeOf(out) !== 'cardio') out.lastToFailure = true
  return out
}

/**
 * Swap one exact active-workout occurrence.
 *
 * Unlogged occurrences are replaced in place. Logged results are never relabelled: after explicit
 * confirmation, the replacement is inserted beside the original. A logged group member also
 * requires an explicit choice to keep the replacement in the group or detach it after the group.
 */
export function swapActiveExercise(active, index, replacement, {
  loggedConfirmed = false,
  groupDisposition
} = {}) {
  if (!active || !Array.isArray(active.entries) || !replacement || index < 0 || index >= active.entries.length) return null

  const current = active.entries[index]
  replacement = withSlotRest(replacement, current)
  if (!hasLoggedSet(current)) {
    const metadata = Object.fromEntries(Object.entries(current).filter(([key]) => (
      !['id', 'target', 'plan', 'planned', 'carried', 'sets', 'sg'].includes(key)
    )))
    active.entries[index] = { ...metadata, ...replacement, ...(current.sg ? { sg: current.sg } : {}) }
    active.cur = index
    return { inserted: false, index }
  }

  if (!loggedConfirmed) return { needsConfirmation: true, grouped: !!current.sg, index }
  if (current.sg && !['keep', 'detach'].includes(groupDisposition)) {
    return { needsConfirmation: true, grouped: true, index }
  }

  const unit = unitOf(supersetUnits(active.entries), index)
  const keepGroup = current.sg && groupDisposition === 'keep'
  const insertAt = keepGroup ? index + 1 : (unit.length > 1 ? unit.at(-1) + 1 : index + 1)
  active.entries.splice(insertAt, 0, {
    ...replacement,
    // A swap does not change which routine the slot belongs to — carry its `rid` the same
    // way `sg` is carried, so a combined session's WorkoutDetail groups stay contiguous.
    ...(current.rid ? { rid: current.rid } : {}),
    ...(keepGroup ? { sg: current.sg } : {})
  })
  active.cur = insertAt
  return { inserted: true, index: insertAt }
}
