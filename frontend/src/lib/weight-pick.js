// The weight picker on an exercise's settings sheet: set the weight in a few taps instead of
// stepping a number. Two one-tap cards (what to do next, and last time again), then a grid of
// nearby weights in the equipment's own steps, with lighter/heavier pages and ± steppers.
// Pure: the sheet passes the history and the unit, nothing here reads or writes the store.
import { EXIDX } from './exercises.js'

/** Weights shown in the grid at once. */
export const GRID_N = 12
/** The rep counts offered as chips. */
export const REP_CHIPS = [5, 6, 8, 10, 12, 15, 20]
export const MAX_PICK_REPS = 20

const BAR = new Set(['barbell', 'olympic barbell', 'ez barbell', 'trap bar', 'landmine'])
const BELL = new Set(['dumbbell', 'kettlebell'])
const MACHINE = new Set(['leverage machine', 'smith machine', 'sled machine', 'assisted'])

const kindOf = exOrId => {
  const eq = (typeof exOrId === 'string' ? EXIDX[exOrId] : exOrId)?.eq
  return BAR.has(eq) ? 'bar' : BELL.has(eq) ? 'bell' : MACHINE.has(eq) ? 'machine' : eq === 'cable' ? 'cable' : 'other'
}

// What one step of the grid is, per equipment and unit: the jumps a gym actually has.
const STEP = {
  bar: { lb: 5, kg: 2.5 }, bell: { lb: 5, kg: 1 }, cable: { lb: 5, kg: 2.5 },
  machine: { lb: 10, kg: 5 }, other: { lb: 5, kg: 2.5 },
}
// A light first-time start, for an exercise with no history: the empty bar, a pair of light
// bells, a light stack.
const START = {
  bar: { lb: 45, kg: 20 }, bell: { lb: 15, kg: 6 }, cable: { lb: 30, kg: 12.5 },
  machine: { lb: 50, kg: 20 }, other: { lb: 20, kg: 10 },
}
const MAX = { lb: 1000, kg: 450 }

const unitOf = u => (u === 'lb' ? 'lb' : 'kg')
export const pickStep = (ex, unit) => STEP[kindOf(ex)][unitOf(unit)]
export const startWeight = (ex, unit) => START[kindOf(ex)][unitOf(unit)]
export const maxWeight = unit => MAX[unitOf(unit)]

// Float-safe: 2.5-steps and 0.25-rounded kg conversions never land on 47.49999.
const tidy = v => Math.round(v * 100) / 100
/** `w` on the nearest step, within 0..max. */
export const snapWeight = (w, step, unit) =>
  tidy(Math.min(maxWeight(unit), Math.max(0, Math.round((Number(w) || 0) / step) * step)))

/** Step index of the grid's first weight, so `w` sits about a third of the way in. */
export function gridBase(w, step, unit, n = GRID_N) {
  const top = Math.round(maxWeight(unit) / step)
  const at = Math.round((Number(w) || 0) / step)
  return Math.min(Math.max(0, top - n + 1), Math.max(0, at - 5))
}
/** The grid's weights from step index `base`. */
export function gridWeights(base, step, unit, n = GRID_N) {
  const top = Math.round(maxWeight(unit) / step)
  const out = []
  for (let i = base; i < base + n && i <= top; i++) out.push(tidy(i * step))
  return out
}
/** Keep the grid where it is unless `w` has walked off it. */
export const keepBase = (base, w, step, unit, n = GRID_N) => {
  const at = Math.round((Number(w) || 0) / step)
  return at < base || at >= base + n ? gridBase(w, step, unit, n) : base
}

/**
 * Last time's work, read off `last` (history.js lastEntryFor): the heaviest weight and the
 * fewest reps any set managed at it, so "you hit 8" means every heavy set did. null when there
 * is nothing loaded to read.
 */
export function lastTop(last) {
  const sets = (last?.sets || []).filter(s => Number(s.w) > 0 && Number(s.r) > 0)
  if (!sets.length) return null
  const w = Math.max(...sets.map(s => Number(s.w)))
  const reps = Math.min(...sets.filter(s => Number(s.w) === w).map(s => Number(s.r)))
  return { w, reps, sets: (last.sets || []).length, d: last.d || null }
}

/**
 * The two one-tap cards. With history: `next` is one step heavier at the target reps if every
 * heavy set reached the target last time, else the same weight for one more rep; `same` repeats
 * last time. Without history: `next` is a light start at the target reps, `same` is null.
 * Weights are in `unit`; `step` is its step for the equipment (pickStep).
 */
export function quickPicks({ ex, last, reps, unit, step = pickStep(ex, unit) }) {
  const target = Math.max(1, Math.round(reps) || 10)
  const top = lastTop(last)
  if (!top) return { next: { w: startWeight(ex, unit), reps: target, why: 'start' }, same: null }
  const next = top.reps >= target
    ? { w: snapWeight(top.w + step, step, unit), reps: target, why: 'hit' }
    : { w: top.w, reps: Math.min(MAX_PICK_REPS, top.reps + 1), why: 'rep' }
  return { next, same: { w: top.w, reps: top.reps, sets: top.sets, d: top.d } }
}

