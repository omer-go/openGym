// The workout's one-tap Swap: trade an exercise for the next similar one, no picker. Each tap
// steps one further down a short list that wraps back to where the slot started, so a few taps
// find something the gym has free and a few more bring the original back. The full picker stays
// in the exercise's ⋯ menu.
//
// "Similar" is what generate.js would build the slot from (what you have logged on the same
// primary muscle, stalest first, then the staple lifts) followed by the rest of the catalogue on
// the same target muscle, same equipment first (similar-exercises.js) — the lifts you know come
// before the 40th variation of a shrug. An entry remembers where its swaps began in `swapOf`, a
// live-session field only (finish-workout.js keeps a whitelist), so the order never drifts.
import { EXIDX, allExercises, isCardio } from './exercises.js'
import { exAvailable } from './equipment.js'
import { primaryMuscleOf } from './strength-exercises.js'
import { candidatesFor } from './generate.js'
import { sameMuscleFirst } from './similar-exercises.js'

// The slot's own exercise and the alternatives it rotates through.
export const SWAP_CYCLE = 8

/** The ids a slot that started as `fromId` cycles through, `fromId` itself first. */
export function swapCycle(S, fromId) {
  const all = allExercises(S || {})
  const from = EXIDX[fromId] || all.find(e => e.id === fromId)
  if (!from) return [fromId]
  const usable = ex => ex && !isCardio(ex) && exAvailable(S, ex)
  const slug = primaryMuscleOf(from)?.slug
  const ids = [fromId]
  const add = id => { if (!ids.includes(id)) ids.push(id) }
  if (slug) candidatesFor(S, slug).forEach(add)
  for (const ex of sameMuscleFirst(all, from)) if (usable(ex)) add(ex.id)
  return ids.slice(0, SWAP_CYCLE)
}

/**
 * What the entry at `index` of the active workout swaps to next: { id, swapOf }, `swapOf` being
 * where its cycle began (null once back there), or null when nothing similar is left. Exercises
 * already elsewhere in the workout are skipped.
 */
export function nextSwap(S, index) {
  const entries = S?.active?.entries || []
  const entry = entries[index]
  if (!entry) return null
  const origin = entry.swapOf || entry.id
  const cycle = swapCycle(S, origin)
  const taken = new Set(entries.filter((_, i) => i !== index).map(e => e.id))
  const at = Math.max(0, cycle.indexOf(entry.id))
  for (let k = 1; k < cycle.length; k++) {
    const id = cycle[(at + k) % cycle.length]
    if (taken.has(id)) continue
    return { id, swapOf: id === origin ? null : origin }
  }
  return null
}
