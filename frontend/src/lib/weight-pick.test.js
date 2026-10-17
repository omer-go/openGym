import { describe, it, expect } from 'vitest'
import { pickStep, startWeight, snapWeight, gridBase, gridWeights, keepBase, lastTop, quickPicks, GRID_N } from './weight-pick.js'

const bar = { id: 'x', eq: 'barbell' }
const bell = { id: 'y', eq: 'dumbbell' }
const machine = { id: 'z', eq: 'leverage machine' }

describe('steps and starts', () => {
  it('steps by equipment and unit', () => {
    expect(pickStep(bar, 'lb')).toBe(5)
    expect(pickStep(bar, 'kg')).toBe(2.5)
    expect(pickStep(bell, 'kg')).toBe(1)
    expect(pickStep(machine, 'lb')).toBe(10)
    expect(pickStep({ eq: 'band' }, 'kg')).toBe(2.5)
  })
  it('starts a barbell at the empty bar', () => {
    expect(startWeight(bar, 'lb')).toBe(45)
    expect(startWeight(bar, 'kg')).toBe(20)
  })
})

describe('snapping and the grid', () => {
  it('snaps to the step, never below 0', () => {
    expect(snapWeight(133, 5, 'lb')).toBe(135)
    expect(snapWeight(61.3, 2.5, 'kg')).toBe(62.5)
    expect(snapWeight(-10, 5, 'lb')).toBe(0)
    expect(snapWeight(5000, 5, 'lb')).toBe(1000)
  })
  it('puts the weight about a third of the way into a 12-weight grid', () => {
    const base = gridBase(135, 5, 'lb')
    const ws = gridWeights(base, 5, 'lb')
    expect(ws).toHaveLength(GRID_N)
    expect(ws.indexOf(135)).toBe(5)
    expect(gridWeights(gridBase(5, 5, 'lb'), 5, 'lb')[0]).toBe(0)
  })
  it('stops at the top', () => {
    const ws = gridWeights(gridBase(1000, 5, 'lb'), 5, 'lb')
    expect(ws.at(-1)).toBe(1000)
    expect(ws).toHaveLength(GRID_N)
  })
  it('keeps the grid still while the weight stays on it', () => {
    const base = gridBase(135, 5, 'lb')
    expect(keepBase(base, 150, 5, 'lb')).toBe(base)
    expect(keepBase(base, 200, 5, 'lb')).not.toBe(base)
  })
  it('kg steps stay clean numbers', () => {
    expect(gridWeights(gridBase(60, 2.5, 'kg'), 2.5, 'kg')).toContain(57.5)
  })
})

describe('quick picks', () => {
  const last = (sets, d = '2026-10-10') => ({ d, sets: sets.map(([w, r]) => ({ w, r, done: true })) })
  it('reads the heaviest weight and the fewest reps at it', () => {
    expect(lastTop(last([[135, 8], [135, 7], [115, 10]]))).toEqual({ w: 135, reps: 7, sets: 3, d: '2026-10-10' })
    expect(lastTop(last([[0, 10]]))).toBeNull()
    expect(lastTop(null)).toBeNull()
  })
  it('goes one step heavier when every heavy set hit the target', () => {
    const p = quickPicks({ ex: bar, last: last([[135, 8], [135, 8], [135, 9]]), reps: 8, unit: 'lb' })
    expect(p.next).toEqual({ w: 140, reps: 8, why: 'hit' })
    expect(p.same).toEqual({ w: 135, reps: 8, sets: 3, d: '2026-10-10' })
  })
  it('adds a rep at the same weight when a set fell short', () => {
    const p = quickPicks({ ex: bar, last: last([[135, 8], [135, 6]]), reps: 8, unit: 'lb' })
    expect(p.next).toEqual({ w: 135, reps: 7, why: 'rep' })
  })
  it('never suggests more than 20 reps', () => {
    expect(quickPicks({ ex: bar, last: last([[20, 20]]), reps: 30, unit: 'kg' }).next.reps).toBe(20)
  })
  it('offers a light start the first time', () => {
    expect(quickPicks({ ex: bar, last: null, reps: 10, unit: 'kg' })).toEqual({ next: { w: 20, reps: 10, why: 'start' }, same: null })
  })
  it('steps in the exercise’s own unit', () => {
    expect(quickPicks({ ex: bell, last: last([[20, 10]]), reps: 10, unit: 'kg' }).next.w).toBe(21)
  })
})

