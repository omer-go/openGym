import { describe, expect, it } from 'vitest'
import { cleanCombo, savedCombosOf, saveCombo, removeCombo, SAVED_COMBOS_MAX } from './saved-combos.js'
import { SG_NAME_MAX } from './superset-meta.js'

const combo = (over = {}) => ({ id: 'c1', name: 'Abs finisher', ids: ['0472', '0175', '0463'], rounds: 3, rest: 60, kind: 'conditioning', ...over })

describe('cleanCombo', () => {
  it('keeps a combo as it is', () => {
    expect(cleanCombo(combo())).toEqual(combo())
  })
  it('needs two different exercises', () => {
    expect(cleanCombo(combo({ ids: ['0472'] }))).toBe(null)
    expect(cleanCombo(combo({ ids: ['0472', '0472'] }))).toBe(null)
    expect(cleanCombo(null)).toBe(null)
  })
  it('mends what it can', () => {
    const c = cleanCombo({ ids: ['0472', '0472', '0175', 7], rounds: 99, rest: -5, kind: 'odd', name: '  x'.padEnd(80, 'y') })
    expect(c.ids).toEqual(['0472', '0175'])
    expect(c.rounds).toBe(20)
    expect(c.rest).toBe(0)
    expect(c.kind).toBe('conditioning')
    expect(c.name.length).toBe(SG_NAME_MAX)
    expect(typeof c.id).toBe('string')
    expect(cleanCombo(combo({ kind: 'strength', rounds: undefined })).rounds).toBe(3)
  })
})

describe('saveCombo / removeCombo', () => {
  it('puts a new combo first', () => {
    const list = saveCombo([combo()], combo({ id: 'c2', name: 'Plank ladder' }))
    expect(list.map(c => c.id)).toEqual(['c2', 'c1'])
  })
  it('updates a saved combo where it is', () => {
    const list = [combo(), combo({ id: 'c2' }), combo({ id: 'c3' })]
    const out = saveCombo(list, combo({ id: 'c2', rounds: 5 }))
    expect(out.map(c => c.id)).toEqual(['c1', 'c2', 'c3'])
    expect(out[1].rounds).toBe(5)
  })
  it('keeps at most SAVED_COMBOS_MAX', () => {
    const many = Array.from({ length: SAVED_COMBOS_MAX }, (_, k) => combo({ id: 'c' + k }))
    const out = saveCombo(many, combo({ id: 'new' }))
    expect(out).toHaveLength(SAVED_COMBOS_MAX)
    expect(out[0].id).toBe('new')
  })
  it('removes by id, and reads a missing list as empty', () => {
    expect(removeCombo([combo(), combo({ id: 'c2' })], 'c1').map(c => c.id)).toEqual(['c2'])
    expect(savedCombosOf(undefined)).toEqual([])
    expect(saveCombo(undefined, combo({ ids: [] }))).toEqual([])
  })
})
