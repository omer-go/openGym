import { describe, expect, it } from 'vitest'
import { GYM_KIT, gymOf, gymRows, rowOn, flipRow, gymFit, saveGym, onList, inList, groupPool, pilesOf, progressOf, deckOf, decide, reviewedIds } from './curate.js'
import { ALL_EQUIPMENT } from './equipment.js'
import { kitOf } from './exercise-facets.js'
import { POPULAR_IDS } from './popular.js'
import { CATALOGUE, isCardio } from './exercises.js'

const row = id => GYM_KIT.find(k => k.id === id)
const BENCH = '0025', DBBENCH = '0289'   // barbell / dumbbell bench press, the first popular chest lifts
const GYM = ['body weight', 'barbell', 'dumbbell', 'cable', 'rope', 'bench', 'pull-up bar', 'leverage machine']

describe('Your gym', () => {
  it('is everything until a profile is on, then that profile', () => {
    expect(gymOf({})).toEqual(ALL_EQUIPMENT)
    const p = { id: 'g', name: 'Gym', equipment: ['dumbbell'], accV: 1 }
    expect(gymOf({ equipProfiles: [p], activeEquipId: 'g' })).toEqual(ALL_EQUIPMENT)   // filter off
    expect(gymOf({ equipProfiles: [p], activeEquipId: 'g', equipFilterOn: true })).toEqual(['dumbbell'])
  })
  it('flips a switch for all the equipment it stands for', () => {
    const on = flipRow(['dumbbell'], row('barbell'))
    expect(rowOn(on, row('barbell'))).toBe(true)
    expect(on).toEqual(expect.arrayContaining(['dumbbell', 'barbell', 'ez barbell', 'trap bar']))
    // half there reads as off, and turning it on completes it
    expect(rowOn(['barbell'], row('barbell'))).toBe(false)
    expect(flipRow(on, row('barbell'))).toEqual(['dumbbell'])
  })
  it('counts the exercises behind each switch, and never offers body weight', () => {
    const rows = gymRows({})
    expect(rows.slice(0, GYM_KIT.length).map(r => r.id)).toEqual(GYM_KIT.map(k => k.id))
    expect(rows.every(r => r.count > 0)).toBe(true)
    expect(rows.some(r => r.eq.includes('body weight'))).toBe(false)
    // the bench counts the dumbbell bench press, which names it only in its name
    expect(row('bench') && rows.find(r => r.id === 'bench').count).toBeGreaterThan(100)
  })
  it('says how much of the catalogue fits', () => {
    const all = gymFit({}, ALL_EQUIPMENT), some = gymFit({}, ['dumbbell'])
    expect(all.fit).toBe(all.total)
    expect(some.fit).toBeLessThan(all.fit)
    expect(some.fit).toBeGreaterThan(0)   // body weight, at least
  })
  it('saves into a new profile and switches the filter on', () => {
    const s = {}
    const p = saveGym(s, ['dumbbell'], 'My gym')
    expect(s.equipProfiles).toEqual([p])
    expect(p).toMatchObject({ name: 'My gym', equipment: ['dumbbell'], accV: 1 })
    expect(s).toMatchObject({ activeEquipId: p.id, equipFilterOn: true })
  })
  it('saves into the profile already picked, not a new one', () => {
    const s = { equipProfiles: [{ id: 'h', name: 'Home', equipment: [] }, { id: 'g', name: 'Gym', equipment: [] }], activeEquipId: 'g' }
    saveGym(s, ['cable'], 'My gym')
    expect(s.equipProfiles).toHaveLength(2)
    expect(s.equipProfiles[1]).toMatchObject({ name: 'Gym', equipment: ['cable'], accV: 1 })
    expect(s.equipFilterOn).toBe(true)
  })
})

describe('a pile', () => {
  it('holds strength work of the group that the gym has kit for, the popular lifts first', () => {
    const pool = groupPool({}, 'chest', GYM)
    expect(pool.map(e => e.id).slice(0, 2)).toEqual([BENCH, DBBENCH])
    expect(pool.some(isCardio)).toBe(false)
    expect(pool.some(e => kitOf(e) === 'kettlebell')).toBe(false)
    // the popular lifts it has kit for, most popular first, before anything else
    const listed = POPULAR_IDS.filter(id => pool.some(e => e.id === id))
    expect(pool.slice(0, listed.length).map(e => e.id)).toEqual(listed)
  })
  it('leaves out form checks and camera angles', () => {
    const pool = groupPool({}, 'chest', GYM)
    expect(pool.some(e => /form check|\bpov\b/.test(e.n.toLowerCase()))).toBe(false)
    expect(CATALOGUE.some(e => e.n.toLowerCase() === 'barbell bench press (side pov)')).toBe(true)
  })
  it('leaves out what needs a bench when there is none', () => {
    const pool = groupPool({}, 'chest', GYM.filter(e => e !== 'bench'))
    expect(pool.map(e => e.id)).not.toContain(DBBENCH)
  })
  it('splits a group into a pile per kit, Other last', () => {
    const piles = pilesOf({}, groupPool({}, 'chest', GYM))
    expect(piles.map(p => p.id)).toEqual(['barbell', 'dumbbell', 'cable', 'machine', 'body'])
    for (const p of piles) expect(p.list.every(e => kitOf(e) === p.id)).toBe(true)
  })
  it('puts the popular lifts and your own on the list, not the rest', () => {
    expect(onList(CATALOGUE.find(e => e.id === BENCH))).toBe(true)
    expect(onList({ id: 'c1', n: 'My weird (left) press v. 2', eq: 'cable', custom: true, bp: 'chest' })).toBe(true)
    const tail = CATALOGUE.find(e => /\bv\. ?\d/.test(e.n.toLowerCase()))
    expect(onList(tail)).toBe(false)
    expect(onList({ id: 'x', n: 'barbell bench press (paused)', eq: 'barbell' })).toBe(false)
  })
  it('deals plainly named lifts first among the rest', () => {
    const pool = groupPool({}, 'chest', GYM)
    const rest = pool.filter(e => !onList(e))
    expect(pool.slice(-rest.length)).toEqual(rest)
    expect(/[()]/.test(rest[0].n)).toBe(false)
  })
  it('keeps a popular lift on your list until you drop it, and adds what you keep', () => {
    const bench = CATALOGUE.find(e => e.id === BENCH), tail = CATALOGUE.find(e => /\bv\. ?\d/.test(e.n.toLowerCase()))
    expect(inList({}, bench)).toBe(true)
    expect(inList({ skipEx: [BENCH] }, bench)).toBe(false)
    expect(inList({}, tail)).toBe(false)
    expect(inList({ favEx: [tail.id] }, tail)).toBe(true)
  })
})

describe('the deck', () => {
  const pool = groupPool({}, 'chest', GYM).filter(e => kitOf(e) === 'barbell')
  it('deals the lifts on the list you have not reviewed, the rest only when asked', () => {
    const deck = deckOf({}, pool)
    expect(deck[0].id).toBe(BENCH)
    expect(deck.every(onList)).toBe(true)
    expect(deckOf({}, pool, { all: true })).toHaveLength(pool.length)
  })
  it('leaves out what you kept, dropped or passed on', () => {
    const S = { favEx: [BENCH] }
    const next = deckOf(S, pool)[0].id
    expect(deckOf(S, pool).map(e => e.id)).not.toContain(BENCH)
    expect(deckOf({ skipEx: [BENCH] }, pool)[0].id).toBe(next)
    expect(deckOf({}, pool, { passed: [BENCH] })[0].id).toBe(next)
  })
  it('records a card one way only, and Undo forgets it', () => {
    const s = { favEx: ['other'] }
    decide(s, BENCH, 'keep')
    expect(s).toMatchObject({ favEx: ['other', BENCH], skipEx: [] })
    decide(s, BENCH, 'drop')
    expect(s).toMatchObject({ favEx: ['other'], skipEx: [BENCH] })
    decide(s, BENCH, null)
    expect(s).toMatchObject({ favEx: ['other'], skipEx: [] })
    expect(reviewedIds(s).has(BENCH)).toBe(false)
  })
  it('counts how far along a pile is', () => {
    const p0 = progressOf({}, pool)
    expect(p0).toMatchObject({ total: pool.length, reviewed: 0, kept: 0, listed: p0.common, left: p0.common, rare: pool.length - p0.common })
    const off = pool.find(e => !onList(e)).id
    const p1 = progressOf({ favEx: [BENCH, off], skipEx: [pool[1].id] }, pool)
    // the dropped popular lift leaves the list, the kept rarer one joins it
    expect(p1).toMatchObject({ reviewed: 3, kept: 2, listed: p0.common, left: p0.common - 2, rare: p0.rare - 1 })
  })
})
