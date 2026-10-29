import { describe, it, expect, beforeAll } from 'vitest'
import { plan, blocker, fixFor, configOf, prescribe, scheduleOf, planLift, creditOf, partCreditOf, PLAN_LIB, PLAN_GROUPS, EQUIPMENT, DAY_TYPES, DIRECT_MIN, PRIORITY } from './planner.js'
import { EXDB } from './exercises-data.js'
import { plannedSets, loadsBack } from './coverage.js'
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
    // The muscle goal's groups add up to 128 sets a week, and the side and rear delts want lifts of
    // their own on top: about five hours. Strength's fit in three.
    for (const o of [{ days: 4, minutes: 75 }, { days: 5, minutes: 60 }, { goal: 'strength', days: 3, minutes: 75 }]) {
      const p = plan({ template: 'full', goal: 'growth', equipment: 'gym', ...o })
      expect(p.feasible).toBe(true)
      for (const g of PLAN_GROUPS) expect(p.total[g], `${o.days}d ${g}`).toBeGreaterThanOrEqual(p.goals[g] - 1e-9)
      // A day holds one lift for the shoulders, so the delts can end a set or so short.
      for (const pt of p.parts) expect(pt.total, `${o.days}d ${pt.name}`).toBeGreaterThanOrEqual(pt.goal - 1.5)
    }
  })

  it('counts sets and sets goals the way the app does, so the program page shows what it planned', () => {
    const p = plan({ template: 'ul', goal: 'growth', days: 4, minutes: 60, base: 15 })
    const app = {}
    for (const d of p.days) for (const [g, v] of Object.entries(plannedSets(d.items.map(i => ({ id: i.ex.id, sets: i.sets }))))) app[g] = (app[g] || 0) + v
    for (const g of PLAN_GROUPS) expect(p.total[g] || 0).toBeCloseTo(app[g] || 0, 6)
    expect(p.goals).toEqual(weeklyTargets({ goals: { weeklySets: 15 } }, PLAN_GROUPS))
    // A squat counts for the glutes beside the quads but not the calves, which only hold the
    // ankle; a good morning for the hamstrings in full, a close-grip bench press for the chest;
    // a pulldown for the biceps. A leg curl bends the knee with the calves' help, but they don't
    // count for it; a dip counts for the triceps as much as the chest, a chin-up or a straight-arm
    // pulldown not for the chest at all.
    expect(creditOf(planLift('1760')).glutes).toBeGreaterThan(0)
    expect(creditOf(planLift('1760')).calves).toBeUndefined()
    expect(creditOf({ id: '0044' }).hamstrings).toBe(1)
    expect(creditOf({ id: '0030' })).toMatchObject({ chest: 1, triceps: 1 })
    expect(creditOf({ id: '0599' }).calves).toBeUndefined()
    expect(creditOf({ id: '0251' })).toMatchObject({ chest: 1, triceps: 1 })
    expect(creditOf({ id: '0238' }).chest).toBeUndefined()
    expect(creditOf({ id: '1326' }).chest).toBeUndefined()
    expect(plan({ template: 'full', byGroup: { biceps: 4 } }).goals.biceps).toBe(4)
  })

  it('takes off what goes past the goal: no set comes off without a group falling short', () => {
    for (const template of ['full', 'ul', 'ppl']) for (const days of [3, 4, 6]) {
      const p = plan({ template, goal: 'growth', days, minutes: 60 })
      const cfg = p.cfg, direct = {}
      for (const d of p.days) for (const i of d.items) for (const g of i.ex.p) direct[g] = (direct[g] || 0) + i.sets
      for (const d of p.days) for (const i of d.items) {
        const least = i.slot === 'accessory' ? cfg.accMin : i.slot === 'lead' ? Math.min(cfg.leadSets, 3) : cfg.slotMin
        if (i.sets <= least) continue
        const c = Object.entries(creditOf(i.ex))
        const free = c.every(([g, v]) => p.total[g] - v >= p.goals[g]) && i.ex.p.every(g => direct[g] - 1 >= Math.ceil(DIRECT_MIN[g] * p.goals[g]))
          && p.parts.every(pt => pt.total - (partCreditOf(i.ex)[pt.name] || 0) >= pt.goal)
        expect(free, `${template} ${days}d ${i.ex.id}`).toBe(false)
      }
    }
  })

  it('leads an upper day with a pull every other time, so three upper days aren\'t three heavy presses', () => {
    const p = plan({ template: 'ul', goal: 'strength', days: 5, minutes: 60 })
    const leads = p.days.filter(d => d.type === 'upper').map(d => d.items[0].ex.pat)
    expect(leads).toEqual(['hpress', 'hpull', 'vpress'])
    expect(p.total.chest).toBeLessThanOrEqual(p.goals.chest * 1.5)
    // The shoulders' presses, that is: the side and rear delts' own lifts come on top.
    const own = p.days.flatMap(d => d.items).filter(i => ['Side delts', 'Rear delts'].some(n => partCreditOf(i.ex)[n] >= 1))
    expect(p.total.shoulders - own.reduce((n, i) => n + i.sets * creditOf(i.ex).shoulders, 0)).toBeLessThanOrEqual(p.goals.shoulders * 1.5)
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

  it('cuts the arms, abs and calves, not the chest, back and legs, when the time can\'t hold every goal', () => {
    const o = { template: 'full', goal: 'growth', equipment: 'gym', days: 3, minutes: 75 }
    const atGoal = (p, t) => PLAN_GROUPS.filter(g => PRIORITY[g] <= t).every(g => p.total[g] >= p.goals[g] - 1e-9)
      && p.parts.filter(pt => PRIORITY[pt.g] <= t).every(pt => pt.total >= pt.goal - 1e-9)
    // Built without priorities the week leaves a bigger group short, here the back.
    expect(atGoal(plan({ ...o, priority: false }), 1)).toBe(false)
    const p = plan(o)
    expect(atGoal(p, 1)).toBe(true)
    for (const s of p.short) expect(PRIORITY[s.g], s.g).toBeGreaterThanOrEqual(2)
    // They give way, not away: a curl and a pushdown still, half their goal at least.
    for (const g of Object.keys(p.yields)) expect(p.total[g], g).toBeGreaterThanOrEqual(p.goals[g] / 2)
    for (const d of p.days) expect(d.minutes).toBeLessThanOrEqual(75)
    // Still too little time for the whole goal, and it says so.
    expect(p.feasible).toBe(false)
    expect(p.short.map(x => x.cause)).toContain('time')
  })

  it('doesn\'t cut the glutes for a set or two when the time is far too short for the rest anyway', () => {
    const p = plan({ template: 'full', goal: 'growth', equipment: 'gym', days: 3, minutes: 45 })
    expect(p.yields.glutes ?? 1).toBeGreaterThan(0)
    expect(p.total.glutes).toBeGreaterThan(0)
  })

  it('finds nothing to add when the settings already work', () => {
    const o = { template: 'full', goal: 'growth', days: 4, minutes: 75 }
    expect(blocker(o)).toEqual([])
    expect(fixFor(o)).toEqual({ days: 4, minutes: 75 })
  })

  const weeks = (o = {}) => ['full', 'ul', 'ppl'].flatMap(template => [3, 4, 5].map(days => ({ template, days, p: plan({ template, goal: 'growth', days, minutes: 75, ...o }) })))

  it('gives the side and rear delts lifts aimed at them, not just the presses\' share', () => {
    for (const days of [4, 5]) {
      const p = plan({ template: 'full', goal: 'growth', days, minutes: 75 })
      for (const name of ['Side delts', 'Rear delts']) {
        const aimed = p.days.flatMap(d => d.items).filter(i => partCreditOf(i.ex)[name] >= 1)
        expect(aimed.length, `${days}d ${name}`).toBeGreaterThan(0)
      }
      // The front delts and upper traps aren't planned for: the presses and carries see to them.
      expect(p.parts.map(pt => pt.name).sort()).toEqual(['Lats', 'Mid back', 'Rear delts', 'Side delts'])
    }
  })

  it('takes one lift for the shoulders a day, a press or a raise, whichever delt it is for', () => {
    for (const { template, days, p } of weeks()) for (const d of p.days) {
      const delts = d.items.filter(i => i.ex.p.includes('shoulders'))
      expect(delts.length, `${template} ${days}d`).toBeLessThanOrEqual(1)
    }
    // Over the week both delts get their turn: four days, side and rear raises both.
    const p = plan({ template: 'full', goal: 'growth', equipment: 'gym', days: 4, minutes: 75 })
    for (const name of ['Side delts', 'Rear delts']) expect(p.days.some(d => d.items.some(i => partCreditOf(i.ex)[name] >= 1)), name).toBe(true)
  })

  it('gives the shoulders way with the arms, since the presses and rows already work them', () => {
    expect(PRIORITY.shoulders).toBe(PRIORITY.biceps)
  })

  it('pulls from above once a day: a chin-up for the biceps is a pulldown too', () => {
    for (const { template, days, p } of weeks()) for (const d of p.days) {
      const vpulls = d.items.filter(i => (i.ex.move || i.ex.pat) === 'vpull')
      expect(vpulls.length, `${template} ${days}d`).toBeLessThanOrEqual(1)
    }
  })

  it('works the arms with curls and extensions: chin-ups and diamond push-ups are pulls and presses', () => {
    expect(planLift('1326')).toMatchObject({ kind: 'compound', pat: 'vpull' })
    expect(planLift('0283')).toMatchObject({ kind: 'compound', pat: 'hpress' })
    expect(planLift('0279')).toMatchObject({ kind: 'compound', pat: 'hpress' })
    for (const { template, days, p } of weeks()) for (const d of p.days) for (const i of d.items) {
      if (i.ex.p.includes('biceps') || i.ex.p.includes('triceps')) expect(i.ex.kind, `${template} ${days}d ${i.ex.id}`).toBe('iso')
    }
  })

  it('loads the lower back once a day at most, and never two days running', () => {
    for (const { template, days, p } of weeks()) {
      const heavy = p.days.map(d => d.items.filter(i => i.ex.pat === 'hinge' && loadsBack(i.ex.id)).length)
      for (const [k, n] of heavy.entries()) {
        expect(n, `${template} ${days}d day ${k}`).toBeLessThanOrEqual(1)
        if (k) expect(n && heavy[k - 1], `${template} ${days}d days ${k - 1}-${k}`).toBeFalsy()
      }
    }
  })

  it('meets the calves\' goal with calf raises, not with what a squat lends them', () => {
    const p = plan({ template: 'full', goal: 'growth', days: 4, minutes: 75 })
    const raised = p.days.flatMap(d => d.items).filter(i => i.ex.p.includes('calves')).reduce((n, i) => n + i.sets, 0)
    expect(raised).toBeGreaterThanOrEqual(p.goals.calves)
  })

  it('presses for the chest, and overhead only as a lead: the chest presses feed the front delts', () => {
    for (const days of [3, 4, 5, 6]) {
      const p = plan({ template: 'full', goal: 'growth', days, minutes: 75 })
      for (const d of p.days) {
        const presses = d.items.filter(i => ['hpress', 'vpress'].includes(i.ex.pat) && i.slot !== 'accessory')
        expect(presses.length, `${days}d`).toBeLessThanOrEqual(1)
        if (presses[0] && presses[0].slot !== 'lead') expect(presses[0].ex.pat).toBe('hpress')
      }
    }
  })
})
