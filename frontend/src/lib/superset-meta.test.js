import { describe, it, expect } from 'vitest'
import { supersetMeta, setSupersetMeta, syncSupersetMeta, syncComboEntries, syncComboState } from './superset-meta.js'
import { isConditioning, strengthWorkouts } from './conditioning.js'
import { pairAdjacent } from './history.js'
import { restSecFor } from './supersetFlow.js'

describe('a superset\'s name and rest between rounds (#292)', () => {
  it('is written onto every member and read back from the group', () => {
    const ex = [{ id: 'a', sg: 'g' }, { id: 'b', sg: 'g' }, { id: 'c' }]
    setSupersetMeta(ex, 'g', { name: '  Arms finisher ', rest: 75 })
    expect(ex[0]).toMatchObject({ sgName: 'Arms finisher', sgRest: 75 })
    expect(ex[1]).toMatchObject({ sgName: 'Arms finisher', sgRest: 75 })
    expect(ex[2].sgName).toBeUndefined()
    expect(supersetMeta(ex, [0, 1])).toEqual({ name: 'Arms finisher', rest: 75, combo: false, kind: '' })
    setSupersetMeta(ex, 'g', { name: '', rest: 0 })
    expect(ex[0].sgName).toBeUndefined()
    expect(ex[0].sgRest).toBeUndefined()
  })
  it('a new member takes the group\'s values, one that left drops them', () => {
    const ex = [{ id: 'a', sg: 'g', sgName: 'Pair', sgRest: 60 }, { id: 'b', sg: 'g' }, { id: 'c', sgName: 'Old', sgRest: 30 }]
    syncSupersetMeta(ex)
    expect(ex[1]).toMatchObject({ sgName: 'Pair', sgRest: 60 })
    expect(ex[2].sgName).toBeUndefined()
  })
  it('the group\'s rest replaces the longest member rest after a round', () => {
    const entries = [{ target: { restSec: 120, sgRest: 45 } }, { target: { restSec: 90, sgRest: 45 } }]
    expect(restSecFor(entries, [0, 1], 90)).toBe(45)
    // On a single exercise a leftover value means nothing.
    expect(restSecFor(entries, [0], 90)).toBe(120)
    expect(restSecFor([{ target: { restSec: 120 } }, { target: {} }], [0, 1], 90)).toBe(120)
  })
  it('a combo is a superset laid out as one card: the flag follows the group like its name', () => {
    const ex = [{ id: 'a', sg: 'g' }, { id: 'b', sg: 'g' }, { id: 'c', sg: 'g' }, { id: 'd' }]
    setSupersetMeta(ex, 'g', { name: 'Core', rest: 60, combo: true })
    expect(ex.slice(0, 3).every(e => e.sgCombo === true)).toBe(true)
    expect(ex[3].sgCombo).toBeUndefined()
    expect(supersetMeta(ex, [0, 1, 2])).toEqual({ name: 'Core', rest: 60, combo: true, kind: 'conditioning' })
    // A lone exercise left with the flag is no combo.
    expect(supersetMeta(ex, [0]).combo).toBe(false)
    // Read off a session entry's target too.
    expect(supersetMeta([{ target: { sgCombo: true } }, { target: {} }], [0, 1], { onTarget: true }).combo).toBe(true)
    // Leaving the group drops it; joining takes it.
    delete ex[2].sg
    ex[3].sg = 'g'
    syncSupersetMeta(ex)
    expect(ex[2].sgCombo).toBeUndefined()
    // Not adjacent any more, but sync only reads the id: d takes the group's values.
    expect(ex[3].sgCombo).toBe(true)
    setSupersetMeta(ex, 'g', { name: 'Core', rest: 60 })
    expect(ex[0].sgCombo).toBeUndefined()
  })
})

describe('a member paired onto a combo joins it', () => {
  const combo = { sgCombo: true, sgName: 'Abs combo', sgRest: 60 }
  const done = { w: 0, r: 15, done: true }
  const abs = () => [
    { id: '0622', sg: 'g1', target: { sets: 3, ...combo }, sets: [done] },
    { id: '0274', sg: 'g1', target: { sets: 3, ...combo }, sets: [done] },
    { id: '4156', target: { sets: 3 }, sets: [done] },
  ]

  it('pairing then syncing gives the new member the combo flag, name and rest', () => {
    const next = pairAdjacent(abs(), 1, 2)
    expect(syncComboEntries(next)).toBe(true)
    expect(next[2].sg).toBe('g1')
    expect(next[2].target).toMatchObject({ sets: 3, sgCombo: true, sgName: 'Abs combo', sgRest: 60 })
    expect(isConditioning(next[2])).toBe(true)
  })

  it('a strength combo passes its kind on', () => {
    const list = abs().map(e => ({ ...e, sg: 'g1', target: { ...e.target, ...(e.id === '0622' ? { sgKind: 'strength' } : {}) } }))
    syncComboEntries(list)
    expect(list[2].target.sgKind).toBe('strength')
    expect(isConditioning(list[2])).toBe(false)
  })

  it('a plain superset is left as it is', () => {
    const list = [{ id: 'a', sg: 's', target: {} }, { id: 'b', sg: 's', target: {} }]
    expect(syncComboEntries(list)).toBe(false)
    expect(list[1].target).toEqual({})
  })

  it('a saved workout that lost the flag is repaired, so its sets leave the strength counts', () => {
    const w = { d: '2026-10-23', entries: abs().map(e => ({ ...e, sg: 'g1' })) }
    w.entries[2].target = { sets: 3 }
    const S = { workouts: [w] }
    expect(syncComboState(S)).toBe(true)
    expect(strengthWorkouts(S.workouts)[0].entries).toHaveLength(0)
    expect(syncComboState(S)).toBe(false)
  })
})
