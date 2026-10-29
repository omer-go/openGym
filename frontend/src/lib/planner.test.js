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

  it('fills in defaults', () => {
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
          // A pull day also takes the rear delts' fly.
          const parts = (DAY_TYPES[d.type].parts || []).filter(n => partCreditOf(i.ex)[n] >= 1)
          expect(i.ex.p.some(g => DAY_TYPES[d.type].groups.includes(g)) || parts.length > 0).toBe(true)
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
    const p = plan({ template: 'ul', goal: 'growth', days: 4, minutes: 60 })
    const app = {}
    for (const d of p.days) for (const [g, v] of Object.entries(plannedSets(d.items.map(i => ({ id: i.ex.id, sets: i.sets }))))) app[g] = (app[g] || 0) + v
    for (const g of PLAN_GROUPS) expect(p.total[g] || 0).toBeCloseTo(app[g] || 0, 6)
    expect(p.goals).toEqual(weeklyTargets({ goals: { type: 'growth' } }, PLAN_GROUPS))
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
    // The overhead press only leads: a day's one shoulder lift is otherwise a raise or a fly.
    expect(p.days.flatMap(d => d.items).filter(i => i.ex.pat === 'vpress').every(i => i.slot === 'lead')).toBe(true)
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

  it('takes the most popular lift a slot allows, and with a shift the one after it', () => {
    const o = { template: 'full', goal: 'growth', days: 3, minutes: 75 }
    const ids = p => p.days.flatMap(d => d.items.map(i => i.ex.id))
    // The barbell back squat and bench press, the first lifts of the quads' and the chest's lists.
    expect(ids(plan(o))).toEqual(expect.arrayContaining(['0043', '0025']))
    const a = ids(plan(o)), b = ids(plan({ ...o, shift: 1 }))
    expect(b).not.toEqual(a)
    expect(b).not.toContain('0043')
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

  it('cuts the abs, glutes and calves, then the arms and shoulders, not the chest, back and legs, when the time can\'t hold every goal', () => {
    const o = { template: 'full', goal: 'growth', equipment: 'gym', days: 3, minutes: 60 }
    // To the whole set, as giveWay counts: a deadlift's share of a set for the quads is no set.
    const atGoal = (p, t) => PLAN_GROUPS.filter(g => PRIORITY[g] <= t).every(g => p.total[g] >= p.goals[g] - 0.5)
      && p.parts.filter(pt => PRIORITY[pt.g] <= t).every(pt => pt.total >= pt.goal - 0.5)
    // Built without priorities the week leaves a bigger group short, here the back.
    expect(atGoal(plan({ ...o, priority: false }), 0)).toBe(false)
    const p = plan(o)
    expect(atGoal(p, 0)).toBe(true)
    for (const s of p.short) expect(PRIORITY[s.g], s.g).toBeGreaterThanOrEqual(1)
    // They give way, not away: the abs keep half their goal at least, and only the bottom tier
    // (glutes, calves, forearms) may go to none.
    for (const g of Object.keys(p.yields)) if (PRIORITY[g] < 3) expect(p.total[g], g).toBeGreaterThanOrEqual(p.goals[g] / 2)
    for (const d of p.days) expect(d.minutes).toBeLessThanOrEqual(60)
    // Still too little time for the whole goal, and it says so: the minutes, or the accessories a
    // day has room for.
    expect(p.feasible).toBe(false)
    expect(p.short.some(x => ['time', 'accessories'].includes(x.cause))).toBe(true)
  })

  it('gives the bottom tier away first when the time is far too short, though the squats and hinges still train the glutes', () => {
    const p = plan({ template: 'full', goal: 'growth', equipment: 'gym', days: 3, minutes: 45 })
    for (const g of ['glutes', 'calves', 'forearms']) expect(p.yields[g] ?? 1, g).toBeLessThan(1)
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
      expect(p.parts.map(pt => pt.name).sort()).toEqual(['Lats', 'Mid and lower chest', 'Mid back', 'Rear delts', 'Side delts', 'Upper chest'])
    }
  })

  it('gives every part of a group a lift aimed at it, on a day that trains it: the rear delts\' fly on a pull day', () => {
    for (const { template, days, p } of weeks()) for (const pt of p.parts) {
      // Its group's own lifts: a pullover, a back lift, counts for the chest wherever it lands.
      const on = p.days.filter(d => d.items.some(i => i.ex.p.includes(pt.g) && partCreditOf(i.ex)[pt.name] >= 1))
      expect(on.length, `${template} ${days}d ${pt.name}`).toBeGreaterThan(0)
      for (const d of on) expect(DAY_TYPES[d.type].groups.includes(pt.g) || !!DAY_TYPES[d.type].parts?.includes(pt.name), `${template} ${d.type} ${pt.name}`).toBe(true)
    }
    const ppl = plan({ template: 'ppl', goal: 'growth', days: 3, minutes: 75 })
    const fly = ppl.days.filter(d => d.items.some(i => partCreditOf(i.ex)['Rear delts'] >= 1))
    expect(fly.map(d => d.type)).toEqual(['pull'])
  })

  it('takes the week\'s lifts for a group\'s parts in turn: a side raise, then a rear fly', () => {
    const p = plan({ template: 'full', goal: 'growth', days: 3, minutes: 75 })
    const aimed = p.days.map(d => d.items.find(i => ['Side delts', 'Rear delts'].some(n => partCreditOf(i.ex)[n] >= 1)))
      .filter(Boolean).map(i => (partCreditOf(i.ex)['Side delts'] >= 1 ? 'side' : 'rear'))
    expect(new Set(aimed)).toEqual(new Set(['side', 'rear']))
  })

  it('only the bottom tier gives way to none; the rest keep half their goal', () => {
    for (const template of ['full', 'ul', 'ppl']) for (const days of [2, 3, 4]) for (const minutes of [45, 60, 75]) {
      const p = plan({ template, goal: 'growth', days, minutes })
      for (const [g, y] of Object.entries(p.yields)) expect(y, `${template} ${days}x${minutes} ${g}`).toBeGreaterThanOrEqual(PRIORITY[g] === 3 ? 0 : 0.5)
    }
  })

  it('a group that gave way gets whole exercises, one a day, not a set or two on each', () => {
    let seen = 0
    for (const template of ['full', 'ul', 'ppl']) for (const days of [2, 3, 4, 5]) for (const minutes of [45, 60, 75, 90]) {
      const p = plan({ template, goal: 'growth', days, minutes })
      if (!(p.yields.calves < 1)) continue
      const on = p.days.map(d => d.items.filter(i => i.slot === 'accessory' && i.ex.p.includes('calves')))
      if (!on.flat().length) continue
      seen++
      for (const c of on) expect(c.length, `${template} ${days}x${minutes}`).toBeLessThanOrEqual(1)
      // At its most sets, but for the one the time given back (topUp) adds at its fewest.
      expect(on.flat().filter(i => i.sets < p.cfg.accMax).length, `${template} ${days}x${minutes}`).toBeLessThanOrEqual(1)
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('three days of 75 minutes keep the chest, back and legs at their goal, the shoulders at theirs', () => {
    const p = plan({ template: 'full', goal: 'growth', days: 3, minutes: 75 })
    for (const g of ['chest', 'back', 'quads', 'hamstrings']) expect(p.total[g], g).toBeGreaterThanOrEqual(p.goals[g] - 0.5)
    expect(p.goals.shoulders).toBe(12)
    expect(p.total.shoulders).toBeGreaterThanOrEqual(12)
    expect(p.total.shoulders).toBeLessThanOrEqual(12 * 1.5)
    for (const d of p.days) expect(d.minutes).toBeLessThanOrEqual(75)
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

  it('gives way in order: the arms and shoulders after the chest, back and legs, the abs next, the glutes, calves and forearms first', () => {
    const tier = g => PRIORITY[g]
    for (const g of ['back', 'quads', 'hamstrings']) expect(tier(g), g).toBe(tier('chest'))
    // The shoulders with the arms, since the presses and rows already work them.
    for (const g of ['shoulders', 'biceps', 'triceps']) expect(tier(g), g).toBe(tier('chest') + 1)
    expect(tier('abs')).toBe(tier('biceps') + 1)
    // The squats, lunges and hinges work the glutes hard: what gives way is a hip thrust.
    for (const g of ['glutes', 'calves', 'forearms']) expect(tier(g), g).toBe(tier('abs') + 1)
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

  it('fills the chest, back and legs with any lift that works them; only the arms and shoulders take isolations', () => {
    const acc = weeks().flatMap(({ p }) => p.days.flatMap(d => d.items.filter(i => i.slot === 'accessory')))
    for (const i of acc) if (['biceps', 'triceps', 'shoulders'].includes(i.ex.p[0])) expect(i.ex.kind, i.ex.id).toBe('iso')
    expect(acc.some(i => i.ex.kind === 'compound' && ['chest', 'back', 'quads', 'hamstrings'].includes(i.ex.p[0]))).toBe(true)
  })

  it('does one movement once a day: a pullover on one tool, a shrug standing or not', () => {
    const move = e => EXDB.find(x => x.id === e.id).n.replace(/\b(ez barbell|ez bar|trap bar|barbell|dumbbell|kettlebell|cable|lever|smith|band|weighted|sled|standing)\b/g, '').replace(/\s+/g, ' ').trim()
    for (const { template, days, p } of weeks()) for (const d of p.days) {
      const moves = d.items.filter(i => i.slot === 'accessory').map(i => move(i.ex))
      expect(new Set(moves).size, `${template} ${days}d ${moves}`).toBe(moves.length)
    }
  })

  it('takes no third lift of one movement: after two presses a fly, after two rows a pullover', () => {
    for (const { template, days, p } of weeks()) for (const d of p.days) {
      const pats = {}
      for (const i of d.items) if (i.ex.kind === 'compound') pats[i.ex.pat] = (pats[i.ex.pat] || 0) + 1
      for (const [pat, n] of Object.entries(pats)) expect(n, `${template} ${days}d ${pat}`).toBeLessThanOrEqual(2)
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
