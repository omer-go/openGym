// The workout's one-tap Swap: trade an exercise for the next similar one, no picker. Each tap
// steps one further down a short list that wraps back to where the slot started, so a few taps
// find something the gym has free and a few more bring the original back. The full picker stays
// in the exercise's ⋯ menu.
//
// "Similar" is what generate.js would build the slot from (what you have logged on the same
// primary muscle, stalest first, then the staple lifts) followed by the rest of the catalogue on
// the same target muscle, same equipment first (similar-exercises.js) — the lifts you know come
// before the 40th variation of a shrug. Where the catalogue has muscle roles, all of that is
// ordered by them first: a lateral raise swaps to other side-delt work before a shoulder press,
// a reverse fly to other rear-delt work. An entry remembers where its swaps began in `swapOf`, a
// live-session field only (finish-workout.js keeps a whitelist), so the order never drifts.
import { EXIDX, allExercises, isCardio } from './exercises.js'
import { suggestable } from './skipped.js'
import { primaryMuscleOf } from './strength-exercises.js'
import { candidatesFor } from './generate.js'
import { sameMuscleFirst, roleLikeness } from './similar-exercises.js'
import { muscleRolesOf } from './muscle-roles.js'
import { activityOf, activityGroup, isStretch } from './activities.js'

// The slot's own exercise and the alternatives it rotates through.
export const SWAP_CYCLE = 8

/** The ids a slot that started as `fromId` cycles through, `fromId` itself first. */
export function swapCycle(S, fromId, rolesOf = muscleRolesOf) {
  const all = allExercises(S || {})
  const from = EXIDX[fromId] || all.find(e => e.id === fromId)
  if (!from) return [fromId]
  const ids = [fromId]
  const add = id => { if (!ids.includes(id)) ids.push(id) }
  // A run swaps for another run, a stretch for another stretch of the same muscle, a lift for
  // another lift: the area's staples first, then what shares the target muscle.
  const act = activityOf(from)
  if (act) {
    const g = activityGroup(act.group)
    const area = all.filter(ex => g.of(ex) === act.area && suggestable(S, ex))
    g.areas.find(a => a.id === act.area).staples.filter(id => area.some(ex => ex.id === id)).forEach(add)
    area.filter(ex => ex.tg === from.tg).forEach(ex => add(ex.id))
    area.forEach(ex => add(ex.id))
    return ids.slice(0, SWAP_CYCLE)
  }
  const usable = ex => ex && !isCardio(ex) && !isStretch(ex) && suggestable(S, ex)
  const slug = primaryMuscleOf(from)?.slug
  if (slug) candidatesFor(S, slug).forEach(add)
  for (const ex of sameMuscleFirst(all, from, rolesOf)) if (usable(ex)) add(ex.id)
  // By target muscles first; within each tier the order above (stable sort).
  const byId = new Map(all.map(ex => [ex.id, ex]))
  const tier = new Map(ids.map(id => [id, roleLikeness(from, byId.get(id), rolesOf).target]))
  return [fromId, ...ids.slice(1).sort((a, b) => tier.get(b) - tier.get(a))].slice(0, SWAP_CYCLE)
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
