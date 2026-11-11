import { describe, it, expect } from 'vitest'
import { SCHEMES, slotOf, slotScheme, sessionSlots, leadPattern, restRangeOf, REST_DEFAULT, rangedRest, rangedScheme } from './engine.js'


describe('slots', () => {
  it('a big lift leads only when asked, a small group never does', () => {
    expect(slotOf('compound')).toBe('main')
    expect(slotOf('compound', true)).toBe('lead')
    expect(slotOf('isolation', true)).toBe('acc')
    expect(slotOf('small', true)).toBe('small')
  })
  it('the first big lift of a session leads, the rest go by their kind', () => {
    expect(sessionSlots(['isolation', 'compound', 'compound', 'small'])).toEqual(['acc', 'lead', 'main', 'small'])
    expect(sessionSlots(['isolation', 'small'])).toEqual(['acc', 'small'])
  })
})

describe('slot schemes', () => {
  it('take the goal’s rep ranges and rest', () => {
    for (const goal of Object.keys(SCHEMES)) {
      const sc = SCHEMES[goal]
      expect(slotScheme('lead', goal)).toEqual({ sets: sc.leadSets, lo: sc.lead.lo, hi: sc.lead.hi, rest: sc.lead.rest })
      expect(slotScheme('main', goal).sets).toBe(sc.slotSets)
      for (const slot of ['acc', 'small']) {
        const { sets } = slotScheme(slot, goal)
        expect(sets >= sc.accMin && sets <= sc.accMax).toBe(true)
      }
    }
  })
  it('growth by default, and an unknown goal falls back to it', () => {
    expect(slotScheme('lead')).toEqual({ sets: 4, lo: 6, hi: 8, rest: 180 })
    expect(slotScheme('small', 'nope')).toEqual({ sets: 2, lo: 12, hi: 20, rest: 60 })
  })
})

describe('the lead of each day', () => {
  it('a full body alternates a lower-body lead with an upper-body one', () => {
    expect([0, 1, 2].map(i => leadPattern('full', i, 3))).toEqual(['squat', 'push-horizontal', 'hinge'])
    expect([0, 1, 2, 3].map(i => leadPattern('full', i, 4))).toEqual(['squat', 'push-horizontal', 'hinge', 'pull-vertical'])
    expect([0, 1].map(i => leadPattern('full', i, 2))).toEqual(['squat', 'push-horizontal'])
  })
  it('the same day keeps its lead through a block, the week repeating', () => {
    expect(leadPattern('full', 4, 3)).toBe(leadPattern('full', 1, 3))
  })
  it('the upper-body lead moves on with the block, the lower-body ones stay', () => {
    expect([0, 1, 2, 3].map(b => leadPattern('full', 1, 3, b))).toEqual(['push-horizontal', 'pull-vertical', 'push-vertical', 'pull-horizontal'])
    expect(leadPattern('full', 0, 3, 2)).toBe('squat')
    expect(leadPattern('full', 2, 3, 3)).toBe('hinge')
  })
  it('a day of one kind takes its kind’s in turn', () => {
    expect([0, 1, 2].map(i => leadPattern('legs', i, 2))).toEqual(['squat', 'hinge', 'squat'])
    expect(leadPattern('pull', 0, 1)).toBe('pull-vertical')
    expect(leadPattern('push', 1, 1)).toBe('push-vertical')
    expect(leadPattern('cardio', 0, 1)).toBeNull()
  })
})

describe('the rests you keep to', () => {
  const R = { min: 20, max: 60 }
  it('reads a range off the state, and 20 to 60 seconds with none or a broken one', () => {
    expect(restRangeOf({ restRange: { min: 30, max: 90 } })).toEqual({ min: 30, max: 90 })
    expect(restRangeOf({ restRange: { min: '30', max: '30' } })).toEqual({ min: 30, max: 30 })
    for (const r of [undefined, null, {}, { min: 60, max: 20 }, { min: 0, max: 60 }, { min: 20, max: 9999 }, { min: 'a', max: 60 }])
      expect(restRangeOf({ restRange: r })).toEqual(REST_DEFAULT)
    expect(restRangeOf(null)).toEqual(R)
  })
  it('is off when switched off, or never chosen with a rest timer of your own for every lift', () => {
    expect(restRangeOf({ restRange: false })).toBe(null)
    expect(restRangeOf({ restAll: true, restSec: 90 })).toBe(null)
    expect(restRangeOf({ restSec: 90 })).toEqual(R)
    expect(restRangeOf({ restAll: true, restSec: 90, restRange: { min: 20, max: 60 } })).toEqual(R)
  })
  it('the lead rests the longest, calves the shortest, the rest between', () => {
    expect(['lead', 'main', 'acc', 'small'].map(k => rangedRest(SCHEMES.growth[k].rest, R, 'growth'))).toEqual([60, 40, 30, 20])
    for (const goal of Object.keys(SCHEMES)) {
      const sc = rangedScheme(goal, R)
      expect(sc.lead.rest).toBe(60)
      for (const k of ['lead', 'main', 'acc', 'small']) {
        expect(sc[k].rest).toBeGreaterThanOrEqual(20)
        expect(sc[k].rest).toBeLessThanOrEqual(60)
        expect(sc[k].rest % 5).toBe(0)
        expect([sc[k].sets, sc[k].lo, sc[k].hi]).toEqual([SCHEMES[goal][k].sets, SCHEMES[goal][k].lo, SCHEMES[goal][k].hi])
      }
      expect(sc.small.rest).toBeLessThanOrEqual(sc.acc.rest)
      expect(sc.acc.rest).toBeLessThanOrEqual(sc.main.rest)
    }
  })
  it('a rest outside the goal’s own stays inside the range, and nothing moves without one', () => {
    expect(rangedRest(600, R, 'growth')).toBe(60)
    expect(rangedRest(10, R, 'growth')).toBe(20)
    expect(rangedRest(180, null, 'growth')).toBe(180)
    expect(rangedScheme('growth', null)).toBe(SCHEMES.growth)
  })
})
