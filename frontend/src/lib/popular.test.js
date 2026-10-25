import { describe, expect, it } from 'vitest'
import { POPULAR, POPULAR_IDS, popularBySlug } from './popular.js'
import { EXIDX } from './exercises.js'
import { primaryMuscleOf } from './strength-exercises.js'
import { STAPLES, candidatesFor } from './generate.js'

describe('the popular list', () => {
  it('names catalogue exercises, each once', () => {
    expect(POPULAR_IDS.filter(id => !EXIDX[id])).toEqual([])
    expect(new Set(POPULAR_IDS).size).toBe(POPULAR_IDS.length)
    expect(POPULAR_IDS).toHaveLength(296)
  })
  it('has body-weight work only for push-ups, pull-ups and chin-ups', () => {
    const bw = POPULAR_IDS.map(id => EXIDX[id]).filter(ex => ex.eq === 'body weight')
    expect(bw.filter(ex => !/push[- ]?up|pull-up|chin-up/.test(ex.n.toLowerCase()))).toEqual([])
  })
  it('sorts every lift under the muscle it works, in list order', () => {
    const by = popularBySlug()
    expect(Object.values(by).flat().sort()).toEqual([...POPULAR_IDS].sort())
    for (const [slug, ids] of Object.entries(by)) for (const id of ids) expect(primaryMuscleOf(EXIDX[id]).slug).toBe(slug)
    expect(by.chest[0]).toBe(POPULAR.Chest[0][1][0])
  })
})

describe('what a workout picks from', () => {
  it('keeps to the list where a muscle has two staples on it', () => {
    const on = new Set(POPULAR_IDS)
    for (const ids of Object.values(STAPLES)) if (ids.filter(id => on.has(id)).length >= 2) expect(ids.every(id => on.has(id))).toBe(true)
  })
  it('offers only the staples while they last', () => {
    expect(candidatesFor({}, 'chest')).toEqual(STAPLES.chest)
  })
  it('reaches for the rest of the list once you drop all but one staple', () => {
    const S = { skipEx: STAPLES.chest.slice(1) }
    const c = candidatesFor(S, 'chest')
    expect(c[0]).toBe(STAPLES.chest[0])
    expect(c.length).toBeGreaterThan(1)
    expect(c.every(id => POPULAR_IDS.includes(id) && !S.skipEx.includes(id))).toBe(true)
  })
})
