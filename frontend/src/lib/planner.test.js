import { describe, it, expect, beforeAll } from 'vitest'
import { plan, blocker, fixFor, configOf, prescribe, scheduleOf, planLift, creditOf, PLAN_LIB, PLAN_GROUPS, EQUIPMENT, DAY_TYPES, DIRECT_MIN } from './planner.js'
import { EXDB } from './exercises-data.js'
import { plannedSets } from './coverage.js'
import { weeklyTargets } from './goals.js'
import { loadMuscleRoles } from './muscle-roles.js'

const ids = new Set(EXDB.map(e => e.id))

describe('planner', () => {
  beforeAll(() => loadMuscleRoles())

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

  it('reaches the weekly goal of every group when the settings allow it, not just close to it', () => {
    // 3 × 75 min: fill leaves the quads a set short and no quad lift on the third day; top-up adds one.
    for (const o of [{ days: 4, minutes: 60 }, { days: 3, minutes: 75 }]) {
      const p = plan({ template: 'full', goal: 'growth', equipment: 'gym', ...o })
      expect(p.feasible).toBe(true)
      for (const g of PLAN_GROUPS) expect(p.total[g], `${o.days}d ${g}`).toBeGreaterThanOrEqual(p.goals[g] - 1e-9)
    }
  })

  it('counts sets and sets goals the way the app does, so the program page shows what it planned', () => {
    const p = plan({ template: 'ul', goal: 'growth', days: 4, minutes: 60, base: 15 })
    const app = {}
    for (const d of p.days) for (const [g, v] of Object.entries(plannedSets(d.items.map(i => ({ id: i.ex.id, sets: i.sets }))))) app[g] = (app[g] || 0) + v
    for (const g of PLAN_GROUPS) expect(p.total[g] || 0).toBeCloseTo(app[g] || 0, 6)
    expect(p.goals).toEqual(weeklyTargets({ goals: { weeklySets: 15 } }, PLAN_GROUPS))
    // A squat counts for the calves that help it, a pulldown for the biceps.
    expect(creditOf(planLift('1760')).calves).toBeGreaterThan(0)
    expect(plan({ template: 'full', byGroup: { biceps: 4 } }).goals.biceps).toBe(4)
  })

  it('takes off what goes past the goal: no set comes off without a group falling short', () => {
    for (const template of ['full', 'ul', 'ppl']) for (const days of [3, 4, 6]) {
      const p = plan({ template, goal: 'growth', days, minutes: 60 })
      const cfg = p.cfg, direct = {}
      for (const d of p.days) for (const i of d.items) for (const g of i.ex.p) direct[g] = (direct[g] || 0) + i.sets
      for (const d of p.days) for (const i of d.items) {
        if (i.slot === 'lead' || i.sets <= (i.slot === 'accessory' ? cfg.accMin : cfg.slotMin)) continue
        const c = Object.entries(creditOf(i.ex))
        const free = c.every(([g, v]) => p.total[g] - v >= p.goals[g]) && i.ex.p.every(g => direct[g] - 1 >= Math.ceil(DIRECT_MIN[g] * p.goals[g]))
        expect(free, `${template} ${days}d ${i.ex.id}`).toBe(false)
      }
    }
  })

  it('paces the compound slots, so six full-body days don\'t pile up the presses and rows', () => {
    const p = plan({ template: 'full', goal: 'growth', days: 6, minutes: 60 })
    for (const g of ['chest', 'back']) expect(p.total[g]).toBeLessThanOrEqual(p.goals[g] * 1.5)
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
    const o = { template: 'full', goal: 'strength', equipment: 'gym', days: 3, minutes: 45 }
    expect(blocker(o).map(x => x.cause)).toContain('time')
    const fix = fixFor(o)
    expect(fix.days * fix.minutes).toBeGreaterThan(3 * 45)
    expect(blocker({ ...o, ...fix })).toEqual([])
    expect(fixFor(o, 'days').days).toBe(3)
  })

  it('finds nothing to add when the settings already work', () => {
    const o = { template: 'full', goal: 'growth', days: 4, minutes: 60 }
    expect(blocker(o)).toEqual([])
    expect(fixFor(o)).toEqual({ days: 4, minutes: 60 })
  })
})
