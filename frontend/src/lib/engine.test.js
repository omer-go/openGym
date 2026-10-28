import { describe, it, expect } from 'vitest'
import { SCHEMES, slotOf, slotScheme, sessionSlots, leadPattern } from './engine.js'


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
