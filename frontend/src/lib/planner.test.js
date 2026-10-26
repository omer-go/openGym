import { describe, it, expect } from 'vitest'
import { plan, blocker, fixFor, configOf, prescribe, scheduleOf, planLift, PLAN_LIB, PLAN_GROUPS, EQUIPMENT, DAY_TYPES } from './planner.js'
import { EXDB } from './exercises-data.js'

const ids = new Set(EXDB.map(e => e.id))

describe('planner', () => {
  it('only names exercises the library has', () => {
    for (const e of PLAN_LIB) expect(ids.has(e.id), e.id).toBe(true)
  })

  it('fills in defaults and the goal\'s own weekly sets', () => {
    expect(configOf({ goal: 'strength' }).base).toBe(8)
    expect(configOf({ goal: 'growth', base: 'auto' }).base).toBe(10)
    expect(configOf({ goal: 'growth', base: 15 }).base).toBe(15)
    expect(configOf({ template: 'nope' }).template).toBe('full')
  })

  it('cycles the template\'s day types over the week', () => {
    expect(scheduleOf(configOf({ template: 'ppl', days: 4 }))).toEqual(['push', 'pull', 'legs', 'push'])
    expect(scheduleOf(configOf({ template: 'ul', days: 3 }))).toEqual(['upper', 'lower', 'upper'])
  })

  it('takes reps and rest from the goal and effort from the level', () => {
    const ex = planLift('0025')
    const s = prescribe(configOf({ goal: 'strength', level: 'beginner' }), ex, 'lead', 'chest')
    expect([s.lo, s.hi, s.rest, s.rir]).toEqual([3, 5, 240, 3])
    const a = prescribe(configOf({ goal: 'growth', level: 'advanced' }), planLift('0605'), 'accessory', 'calves')
    expect([a.lo, a.hi, a.rir]).toEqual([12, 20, 0])
  })

  it('keeps each day to the lifts its type trains and the equipment on hand', () => {
    for (const template of ['full', 'ul', 'ppl']) for (const equipment of ['gym', 'db', 'bw']) {
      const p = plan({ template, equipment, days: 4, minutes: 60 })
      for (const d of p.days) {
        for (const i of d.items) {
          expect(EQUIPMENT[equipment].has).toContain(i.ex.need)
          expect(i.ex.p.some(g => DAY_TYPES[d.type].groups.includes(g))).toBe(true)
        }
        expect(new Set(d.items.map(i => i.ex.id)).size).toBe(d.items.length)
      }
    }
  })

  it('leads every day and keeps it within the session', () => {
    const p = plan({ template: 'ppl', goal: 'growth', days: 6, minutes: 45 })
    for (const d of p.days) {
      expect(d.items[0].slot).toBe('lead')
      expect(d.minutes).toBeLessThanOrEqual(45)
    }
  })

  it('reaches the weekly goal of every group when the settings allow it', () => {
    const p = plan({ template: 'full', goal: 'growth', equipment: 'gym', days: 4, minutes: 60 })
    expect(p.feasible).toBe(true)
    for (const g of PLAN_GROUPS) expect(p.total[g]).toBeGreaterThanOrEqual(p.goals[g] * 0.85)
  })

  it('is the same week from the same settings, another from another seed', () => {
    const o = { template: 'ul', days: 4, minutes: 60 }
    const names = p => p.days.map(d => d.items.map(i => i.ex.id).join()).join('|')
    expect(names(plan(o))).toBe(names(plan(o)))
    const seeds = new Set([1, 2, 3, 4, 5].map(seed => names(plan({ ...o, seed }))))
    expect(seeds.size).toBeGreaterThan(1)
  })

  it('leaves out skipped lifts while their pattern has another', () => {
    const p = plan({ template: 'full', days: 3, exclude: ['0043', '0042'] })
    const used = p.days.flatMap(d => d.items.map(i => i.ex.id))
    expect(used).not.toContain('0043')
    expect(used).not.toContain('0042')
  })

  it('blames the time when a short session can\'t fit the goal, and finds the fewest minutes that do', () => {
    const o = { template: 'full', goal: 'strength', equipment: 'gym', days: 4, minutes: 60 }
    expect(blocker(o).map(x => x.cause)).toContain('time')
    const fix = fixFor(o)
    expect(fix.days * fix.minutes).toBeGreaterThan(4 * 60)
    expect(blocker({ ...o, ...fix })).toEqual([])
    expect(fixFor(o, 'days').days).toBe(4)
  })

  it('finds nothing to add when the settings already work', () => {
    const o = { template: 'full', goal: 'growth', days: 4, minutes: 60 }
    expect(blocker(o)).toEqual([])
    expect(fixFor(o)).toEqual({ days: 4, minutes: 60 })
  })
})
