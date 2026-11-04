import { describe, expect, it } from 'vitest'
import { workoutPace, setPaceOf } from './pace.js'

const T0 = Date.UTC(2026, 9, 29, 17)
// A workout of `n` work sets ticked every `gap` seconds, from `at` on.
const session = (d, n, gap, { at = T0, warmups = 0, breakAfter, breakSec = 0 } = {}) => {
  const sets = []
  let t = at
  for (let i = 0; i < warmups + n; i++) {
    sets.push({ w: 100, r: 10, done: true, at: t, ...(i < warmups ? { phase: 'warmup' } : {}) })
    t += gap * 1000 + (i === breakAfter ? breakSec * 1000 : 0)
  }
  return { d, start: at, end: t, entries: [{ id: '0025', sets }] }
}

describe('your pace a set', () => {
  it('is the time from the first ticked set to the last over the sets between them', () => {
    expect(workoutPace(session('2026-10-29', 20, 105))).toBe(105)
  })

  it('leaves out a break longer than ten minutes', () => {
    // The set before the break goes without its rest too: 18 gaps of 90 s over 19.
    expect(workoutPace(session('2026-10-29', 20, 90, { breakAfter: 5, breakSec: 900 }))).toBe(85)
  })

  it('gives the time of the warm-ups to the work sets, which are what the planner counts', () => {
    // 3 warm-ups and 10 work sets a minute apart: 12 minutes over 9 gaps between work sets.
    expect(workoutPace(session('2026-10-29', 10, 60, { warmups: 3 }))).toBe(80)
  })

  it('reads a per-side set by its sides, and skips sets never ticked', () => {
    const w = session('2026-10-29', 10, 60)
    w.entries.push({ id: '2290', sets: [
      { done: true, sides: { L: { done: true, at: w.end }, R: { done: true, at: w.end + 60e3 } } },
      { w: 20, r: 8, done: false },
    ] })
    expect(workoutPace(w)).toBe(66) // 11 minutes over 10 gaps
  })

  it('says nothing about a session with too few sets', () => {
    expect(workoutPace(session('2026-10-29', 5, 90))).toBe(null)
    expect(workoutPace({ d: '2026-10-29', entries: [{ id: '0025', sets: [{ w: 100, r: 10, done: true }] }] })).toBe(null)
  })

  it('is the median of the last ten sessions, once there are three', () => {
    expect(setPaceOf([session('2026-10-27', 20, 90), session('2026-10-29', 20, 110)])).toBe(null)
    const ws = [session('2026-10-25', 20, 100), session('2026-10-27', 20, 90), session('2026-10-29', 20, 120)]
    expect(setPaceOf(ws)).toBe(100)
    expect(setPaceOf([...ws, session('2026-10-31', 20, 130)])).toBe(110)
    const old = Array.from({ length: 10 }, (_, i) => session(`2026-09-${10 + i}`, 20, 200))
    expect(setPaceOf([...old, ...ws])).toBe(200) // ten of the 13: three new ones and seven old
    expect(setPaceOf([...old.slice(0, 7), ...ws])).toBe(200)
    expect(setPaceOf([...old.slice(0, 5), ...ws])).toBe(200)
    expect(setPaceOf([...old.slice(0, 2), ...ws])).toBe(120)
  })

  it('is null with no workouts', () => {
    expect(setPaceOf(undefined)).toBe(null)
    expect(setPaceOf([])).toBe(null)
  })
})
