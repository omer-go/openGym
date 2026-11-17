import { describe, it, expect, beforeAll } from 'vitest'
import { plan, planDay, canLead, blocker, fixFor, configOf, prescribe, scheduleOf, planLift, creditOf, partCreditOf, familyOf, familyLog, PLAN_LIB, PLAN_GROUPS, EQUIPMENT, DAY_TYPES, DIRECT_MIN, PRIORITY } from './planner.js'
import { EXDB } from './exercises-data.js'
import { plannedSets, loadsBack } from './coverage.js'
import { weeklyTargets, PARTS, partTierOf } from './goals.js'
import { loadMuscleRoles } from './muscle-roles.js'
import { equivalentsOf } from './equivalents.js'
import { moveOf, kitOf } from './exercise-facets.js'

const ids = new Set(EXDB.map(e => e.id))

describe('planner', () => {
  beforeAll(() => loadMuscleRoles())

  it('only names exercises the library has', () => {
    for (const e of PLAN_LIB) expect(ids.has(e.id), e.id).toBe(true)
  })

  it('times a day at your own pace a set when it has one, and fits more in the same minutes', () => {
    const o = { template: 'full', goal: 'growth', days: 3, minutes: 75 }
    const slot = plan(o), own = plan({ ...o, pace: 60 })
    for (const d of own.days) expect(d.minutes).toBe(Math.round(5 + d.sets))
    for (const d of slot.days) expect(d.minutes).toBeLessThanOrEqual(75)
    const more = plan({ ...o, minutes: 45, byGroup: { chest: 16, back: 16, quads: 16 } })
    const fast = plan({ ...o, minutes: 45, byGroup: { chest: 16, back: 16, quads: 16 }, pace: 60 })
    const sets = p => p.days.reduce((n, d) => n + d.sets, 0)
    expect(sets(fast)).toBeGreaterThan(sets(more))
    expect(configOf({ pace: 0 }).pace).toBe(null)
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
    // The seed only breaks ties between lifts at the same place on the popular list, so it takes a
    // week with such a tie in it: three upper/lower days of an hour have one.
    const o = { template: 'ul', days: 3, minutes: 60 }
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
    // every group with a goal of its own, as before a focus was each group's default
    const o = { template: 'full', goal: 'growth', equipment: 'gym', days: 3, minutes: 60, focus: { glutes: 'normal', forearms: 'normal', abs: 'normal' } }
    // To the whole set, as giveWay counts: a deadlift's share of a set for the quads is no set.
    const atGoal = (p, t) => PLAN_GROUPS.filter(g => PRIORITY[g] <= t).every(g => p.total[g] >= p.goals[g] - 0.5)
      && p.parts.filter(pt => PRIORITY[pt.g] <= t && pt.tier === 1).every(pt => pt.total >= pt.goal - 0.5)
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

  it('gives way a day at a time as a week does: the calves and the arms before the back and the legs', () => {
    // A full-body day owing more than 75 minutes hold, as a program's last day of the week can.
    const goals = { chest: 7, back: 9, shoulders: 6, biceps: 6, triceps: 5, abs: 7, quads: 6, hamstrings: 8, calves: 4 }
    const o = { type: 'full', goal: 'growth', equipment: 'gym', level: 'advanced', minutes: 75, goals }
    const got = d => {
      const t = {}
      for (const i of d.items) for (const [g, c] of Object.entries(creditOf(i.ex))) t[g] = (t[g] || 0) + c * i.sets
      return t
    }
    const shortAt = (t, tier) => Object.entries(goals).filter(([g]) => PRIORITY[g] === tier).reduce((n, [g, v]) => n + Math.max(0, v - (t[g] || 0)), 0)
    const flat = got(planDay({ ...o, priority: false })), d = got(planDay(o))
    // Picked by the sets each lacks, the abs' plank and a second row came before the chest's
    // second lift, and the chest ended four short.
    expect(shortAt(d, 0)).toBeLessThan(shortAt(flat, 0))
    // The chest takes its push-ups for the plank's minutes; nothing at the top is left over two short.
    expect(d.chest).toBeGreaterThan(flat.chest)
    for (const [g, v] of Object.entries(goals)) if (v - (d[g] || 0) > 2) expect(PRIORITY[g], g).toBeGreaterThanOrEqual(1)
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
      // Every tier-1 and tier-2 part is planned, tier 1 first; a tier-3 one (the lower back) is
      // only tracked.
      const want = Object.entries(PARTS).flatMap(([g, parts]) => Object.entries(parts).filter(([, [t, share]]) => t <= 2 && share > 0).map(([name]) => name))
      expect(p.parts.map(pt => pt.name).sort()).toEqual([...want].sort())
      expect(p.parts.map(pt => pt.tier)).toEqual([...p.parts.map(pt => pt.tier)].sort((a, b) => a - b))
      expect(p.parts.map(pt => pt.name)).not.toContain('Lower back')
    }
  })

  it('leaves a tier-2 part to the compounds that already work it: no brachialis lift beside the curls and rows', () => {
    for (const days of [3, 4]) {
      const p = plan({ template: 'full', goal: 'growth', days, minutes: 75 })
      const pt = p.parts.find(x => x.name === 'Brachialis')
      expect(pt.tier).toBe(2)
      expect(pt.total, `${days}d`).toBeGreaterThanOrEqual(pt.goal)
    }
  })

  it('plans the front delts like the side and rear: a press counts a fifth of a set, a front raise is a shoulder lift', () => {
    expect(partTierOf('shoulders', 'Front delts')).toBe(1)
    const press = PLAN_LIB.find(e => e.p.includes('chest') && (partCreditOf(e)['Front delts'] || 0) > 0)
    expect(partCreditOf(press)['Front delts']).toBeCloseTo(0.2)
    const raise = { id: '0041' } // barbell front raise
    expect(Object.entries(partCreditOf(raise)).filter(([, v]) => v >= 1).map(([n]) => n)).toEqual(['Front delts'])
    expect(familyOf('shoulders', raise)).toBe('ohp')
    for (const days of [3, 4]) {
      const pt = plan({ template: 'full', goal: 'growth', days, minutes: 75 }).parts.find(x => x.name === 'Front delts')
      expect(pt.total, `${days}d`).toBeGreaterThanOrEqual(pt.goal * 0.85)
    }
  })

  it('gives every part of a group a lift aimed at it, on a day that trains it: the rear delts\' fly on a pull day', () => {
    for (const { template, days, p } of weeks()) for (const pt of p.parts.filter(x => x.tier === 1 && p.yields[x.g] !== 0)) {
      // Its group's own lifts: a pullover, a back lift, counts for the chest wherever it lands.
      const on = p.days.filter(d => d.items.some(i => i.ex.p.includes(pt.g) && partCreditOf(i.ex)[pt.name] >= 1))
      // Unless the compounds alone bring it within 85% of its goal, the planner's "met": the
      // front delts from the presses.
      if (!on.length) expect(pt.total, `${template} ${days}d ${pt.name}`).toBeGreaterThanOrEqual(pt.goal * 0.85 - 1e-9)
      else expect(on.length).toBeGreaterThan(0)
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

  it('takes a pull-up over the week\'s one pulldown again, a beginner the pulldown', () => {
    // A list with one loaded vertical pull and no row: the day's pull is a pulldown or a pull-up.
    const pool = [...PLAN_LIB.filter(e => e.pat !== 'vpull' && e.pat !== 'hpull').map(e => e.id), '0579', '0652', '1326']
    const pullOf = o => planDay({ type: 'full', pattern: 'squat', goal: 'growth', level: 'intermediate', equipment: 'gym', minutes: 75, pool, goals: { back: 10, chest: 8, quads: 8, hamstrings: 8 }, ...o }).items.find(i => i.slot === 'pull')?.ex.id
    expect(pullOf({})).toBe('0579')
    expect(['0652', '1326']).toContain(pullOf({ used: ['0579'] }))
    expect(['0652', '1326']).toContain(pullOf({ near: ['0579'] }))
    expect(pullOf({ used: ['0579'], level: 'beginner' })).toBe('0579')
  })
  it('every full-body day has a squat or a hinge, and a Nordic curl is a leg curl, not one', () => {
    for (const [level, days, minutes, byGroup] of [['advanced', 3, 75, { calves: 8, hamstrings: 14 }], ['intermediate', 3, 60, {}], ['advanced', 4, 75, {}], ['intermediate', 2, 45, {}]]) {
      const p = plan({ template: 'full', goal: 'growth', level, equipment: 'gym', days, minutes, byGroup })
      p.days.forEach((d, k) => {
        const legs = d.items.filter(i => (i.slot === 'lead' || i.slot === 'lower') && ['squat', 'hinge'].includes(i.ex.pat))
        expect(legs.length, `${level} ${days}d ${minutes}m day ${k + 1}`).toBeGreaterThan(0)
      })
    }
    expect(planLift('7746')).toMatchObject({ pat: 'iso', kind: 'iso', p: ['hamstrings'] })
  })

  it('a short week gives the side delts a raise, not a third curl or row, and the chest and legs keep theirs', () => {
    // Each owes its own sets: the side delts' few lost to the biceps' many, and two upper days
    // had a curl, a triceps lift and three back lifts but no raise.
    const side = p => p.days.some(d => d.items.some(i => partCreditOf(i.ex)['Side delts'] >= 1))
    for (const [template, days, minutes] of [['ul', 2, 60], ['ul', 2, 75], ['ul', 1, 75], ['full', 2, 75], ['ppl', 3, 60]]) {
      const p = plan({ template, goal: 'growth', level: 'intermediate', equipment: 'gym', days, minutes })
      expect(side(p), `${template} ${days}d ${minutes}m`).toBe(true)
    }
    const p = plan({ template: 'ul', goal: 'growth', level: 'intermediate', equipment: 'gym', days: 2, minutes: 60 })
    for (const g of ['chest', 'quads', 'hamstrings']) expect(p.total[g] / p.goals[g], g).toBeGreaterThanOrEqual(0.8)
  })

  it('more minutes never cost the legs: a calf raise the week cut to none takes no slot from the squats', () => {
    // A part of a group that gave way to none (the gastrocnemius, the calves at 0) asked for its
    // lift all the same, and 75 minutes of push / pull / legs built fewer leg sets than 60.
    for (const [template, days] of [['ppl', 3], ['ppl', 4], ['ppl', 5], ['ul', 2]]) {
      const [a, b] = [60, 75].map(minutes => plan({ template, goal: 'growth', level: 'intermediate', days, minutes }))
      for (const g of ['quads', 'hamstrings']) expect(b.total[g], `${template} ${days}d ${g}`).toBeGreaterThanOrEqual(a.total[g] - 1e-9)
    }
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

  it('pulls the other way for the back\'s second lift: a pulldown after the row, not a second row', () => {
    const days = [...weeks().flatMap(({ p }) => p.days)]
    // A one-tap full-body day led by a hinge, owing the back more than its row: the mid back is the
    // part furthest behind, and only rows aim at it.
    for (const minutes of [60, 75, 90]) days.push(planDay({ type: 'full', pattern: 'hinge', goal: 'growth', level: 'advanced', equipment: 'gym', minutes,
      goals: { chest: 7, back: 9, shoulders: 6, biceps: 5, triceps: 5, abs: 4, quads: 6, hamstrings: 8, calves: 2 },
      parts: [{ g: 'back', name: 'Mid back', goal: 6 }, { g: 'back', name: 'Lats', goal: 3 }] }))
    let seen = 0
    for (const d of days) {
      // A pull day's backbone has the pull-up and the row both already.
      const base = new Set(d.items.filter(i => i.slot !== 'accessory' && ['hpull', 'vpull'].includes(i.ex.pat)).map(i => i.ex.pat))
      const slot = d.items.find(i => i.slot === 'pull'), second = d.items.find(i => i.slot === 'accessory' && i.ex.p[0] === 'back')
      if (!slot || !second || base.size > 1) continue
      seen++
      expect(second.ex.pat, `${slot.ex.id} then ${second.ex.id}`).not.toBe(slot.ex.pat)
    }
    expect(seen).toBeGreaterThan(3)
  })

  it('gives a day one abs exercise, however much time and abs goal it has', () => {
    // A day's abs are one slot, the combo or a weighted lift by turn (generate.js turnAbs). A long
    // day at a two-minute pace, owing the abs a lot and topped up with accessories to fill its time,
    // used to take two or three of them: on the combo turn that was six abs exercises.
    const days = [...weeks().flatMap(({ p }) => p.days)]
    const goals = { chest: 4, back: 5, shoulders: 5, biceps: 5.5, triceps: 7.5, abs: 9, quads: 4, hamstrings: 8, calves: 9 }
    for (const pattern of ['squat', 'hpress', 'hinge']) for (const moreAcc of [0, 1, 2, 3, 4]) for (const seed of [1, 2, 3])
      days.push(planDay({ type: 'full', pattern, goal: 'growth', level: 'advanced', equipment: 'gym', minutes: 90, pace: 120, seed, moreAcc, goals }))
    for (const d of days) {
      const abs = d.items.filter(i => i.ex.p.includes('abs'))
      expect(abs.length, `${d.type} ${abs.map(i => i.ex.id)}`).toBeLessThanOrEqual(1)
    }
  })

  // Taking turns (generate.js passes `last`, each lift's last day): the movement done longest
  // ago comes first, then a kit other than the one that movement had last time, and no kit
  // takes more than half the day.
  describe('taking turns with the movement and the kit', () => {
    const goals = { chest: 8, back: 8, shoulders: 6, biceps: 6, triceps: 6, abs: 4, quads: 8, hamstrings: 6, calves: 4 }
    const DAILY = ['chest', 'back', 'quads', 'hamstrings', 'shoulders', 'biceps', 'triceps', 'abs']
    // Your list: the planner's own lifts and curls of every movement on several kits.
    const CURLS = ['0294', '0031', '0868', '0447', '0313', '0165', '0897', '0070', '0372', '0318', '0592']
    const pool = [...PLAN_LIB.map(e => e.id), ...CURLS]
    const day = o => planDay({ type: 'full', goal: 'growth', level: 'advanced', equipment: 'gym', minutes: 90, goals, daily: DAILY, pool, last: {}, ...o })
    const row = id => EXDB.find(e => e.id === id)
    const biceps = d => d.items.find(i => i.slot === 'accessory' && i.ex.p[0] === 'biceps')?.ex
    it('moves the biceps on from the movement done last time', () => {
      for (const seed of [1, 2, 3, 4]) {
        const first = biceps(day({ seed }))
        expect(first, `seed ${seed}`).toBeTruthy()
        const next = biceps(day({ seed, last: { [first.id]: '2026-11-10' } }))
        expect(moveOf(row(next.id)), `seed ${seed}`).not.toBe(moveOf(row(first.id)))
      }
    })
    it('comes back to the movement done longest ago, on another kit than it had', () => {
      const BY_MOVE = { curl: '0294', hammer: '0313', stretchcurl: '0070' }
      expect(Object.entries(BY_MOVE).map(([, id]) => moveOf(row(id)))).toEqual(Object.keys(BY_MOVE))
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        // The dumbbell curl longest ago: a curl is next, and not on dumbbells.
        const last = { [BY_MOVE.curl]: '2026-10-01', [BY_MOVE.hammer]: '2026-11-01', [BY_MOVE.stretchcurl]: '2026-11-08' }
        const next = row(biceps(day({ seed, last })).id)
        expect(moveOf(next), `seed ${seed}`).toBe('curl')
        expect(kitOf(next), `seed ${seed}`).not.toBe(kitOf(row(BY_MOVE.curl)))
      }
    })
    it('gives no kit more than half the day while another will do', () => {
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const d = day({ seed })
        const n = {}
        for (const i of d.items) n[kitOf(row(i.ex.id))] = (n[kitOf(row(i.ex.id))] || 0) + 1
        expect(Math.max(...Object.values(n)), `seed ${seed} ${JSON.stringify(n)}`).toBeLessThanOrEqual(Math.max(2, Math.ceil(d.items.length / 2)))
      }
    })
    it('picks the kit at random, so the days do not all come out on one', () => {
      const kits = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(seed => kitOf(row(biceps(day({ seed })).id))))
      expect(kits.size).toBeGreaterThan(1)
    })
    it('leaves a program week as it was: no history, no turns', () => {
      const o = { template: 'full', goal: 'growth', days: 3, minutes: 60 }
      expect(plan(o).days.map(d => d.items.map(i => i.ex.id))).toEqual(plan(o).days.map(d => d.items.map(i => i.ex.id)))
    })
  })

  // A day's main lifts are the ones a lifter would call main lifts: a renegade row is mostly a
  // plank, a reverse curl mostly a forearm lift, an assisted dip is for a beginner, and a cable
  // press doesn't lead a day however often you log it.
  describe('weak main lifts', () => {
    const goals = { chest: 8, back: 8, shoulders: 6, biceps: 6, triceps: 6, abs: 4, quads: 8, hamstrings: 6, calves: 4 }
    const WEAK = ['2980', '2364', '1608'] // renegade row, assisted kneeling dip, cable reverse curl
    const pool = [...PLAN_LIB.map(e => e.id), ...WEAK]
    it('lets a free weight, a Smith machine, a plate-loaded machine or a pulldown lead, not a cable press', () => {
      for (const id of ['0025', '0043', '0770', '2330']) expect(canLead(id), id).toBe(true)
      for (const id of ['0151', ...WEAK]) expect(canLead(id), id).toBe(false) // 0151: a cable bench press
    })
    it('picks no weak lift while a better one of its slot is on your list', () => {
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) for (const shift of [0, 1, 2]) {
        const d = planDay({ type: 'full', goal: 'growth', level: 'advanced', equipment: 'gym', minutes: 90, goals, pool, seed, shift })
        expect(d.items.map(i => i.ex.id).filter(id => WEAK.includes(id)), `seed ${seed} shift ${shift}`).toEqual([])
      }
    })
    it('still gives a beginner an assisted lift when it is the only one of its slot', () => {
      const d = planDay({ type: 'full', goal: 'growth', level: 'beginner', equipment: 'gym', minutes: 90, goals, pool: ['2364', '0043', '0027'], seed: 1 })
      expect(d.items.map(i => i.ex.id)).toContain('2364')
    })
  })

  // The families of a group that take turns from one workout to the next, with your history:
  // the shoulders' side, rear, side, press; the chest's upper and mid/lower halves; the abs'
  // flexion, rotation and bracing; and the small muscles in pairs, calves and traps, then leg
  // extension and forearms. Each day here is logged before the next is built.
  describe('taking turns within a group', () => {
    const goals = { chest: 8, back: 8, shoulders: 6, biceps: 6, triceps: 6, abs: 4, quads: 8, hamstrings: 6, calves: 4, forearms: 2 }
    const DAILY = ['chest', 'back', 'quads', 'hamstrings', 'shoulders', 'biceps', 'triceps', 'abs']
    // Your list: the planner's own lifts, a russian twist and a cable pallof press for the abs' rotation.
    const pool = [...PLAN_LIB.map(e => e.id), '0687', '1202']
    const day = o => planDay({ type: 'full', goal: 'growth', level: 'advanced', equipment: 'gym', minutes: 90, goals, daily: DAILY, pool, ...o })
    const PATTERNS = ['squat', 'hpress', 'hinge']
    const days = (seed, n = 6, o = {}) => {
      let last = {}
      const out = [], sessions = []
      for (let k = 0; k < n; k++) {
        const log = { shoulders: familyLog(sessions, 'shoulders'), back: familyLog(sessions, 'back') }
        const d = day({ seed, pattern: PATTERNS[k % 3], last, log, ...o })
        out.push(d)
        sessions.push(d.items.map(i => i.ex.id))
        for (const i of d.items) last = { ...last, [i.ex.id]: `2026-11-${String(10 + k).padStart(2, '0')}` }
      }
      return out
    }
    const row = id => EXDB.find(e => e.id === id)
    const acc = (d, g) => d.items.filter(i => i.slot === 'accessory' && i.ex.p.includes(g))

    it('gives the shoulders each delt as often as its share: side four turns in ten, rear and front three', () => {
      for (const seed of [1, 2, 3]) {
        const turns = days(seed, 10).map(d => acc(d, 'shoulders').map(i => familyOf('shoulders', i.ex))[0])
        expect(turns, `seed ${seed}`).toEqual(['side', 'rear', 'ohp', 'side', 'rear', 'ohp', 'side', 'rear', 'side', 'ohp'])
      }
    })
    it('gives the back a row and a pulldown in turn, and the other one of the two after a lead of one', () => {
      for (const seed of [1, 2, 3]) {
        const fams = days(seed, 6).map(d => d.items.filter(i => i.ex.p.includes('back')).map(i => familyOf('back', i.ex)).filter(Boolean))
        for (let k = 1; k < fams.length; k++) {
          // A day with one back lift takes the half the day before did not; one with two has both.
          if (fams[k].length === 1 && fams[k - 1].length === 1) expect(fams[k][0], `seed ${seed} ${JSON.stringify(fams)}`).not.toBe(fams[k - 1][0])
          if (fams[k].length === 2) expect(new Set(fams[k]).size, `seed ${seed}`).toBe(2)
        }
      }
    })
    it('alternates the chest press between the upper and the mid and lower chest', () => {
      for (const seed of [1, 2, 3]) {
        const press = days(seed, 6).map(d => d.items.find(i => i.slot !== 'accessory' && i.ex.p.includes('chest')))
        const halves = press.map(i => familyOf('chest', i.ex))
        for (let k = 2; k < halves.length; k++) expect(halves[k], `seed ${seed} ${halves}`).not.toBe(halves[k - 1])
      }
    })
    it('rotates the abs between flexion, rotation and bracing', () => {
      for (const seed of [1, 2, 3]) {
        const fams = days(seed, 6).map(d => acc(d, 'abs').map(i => familyOf('abs', i.ex))[0])
        expect(new Set(fams.slice(0, 3)).size, `seed ${seed} ${fams}`).toBe(3)
        expect(fams.slice(3), `seed ${seed}`).toEqual(fams.slice(0, 3))
      }
    })
    it('gives a day with no hinge a leg curl for the hamstrings', () => {
      let checked = 0
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const d = day({ seed, pattern: 'hpress', last: {} })
        if (d.items.some(i => i.ex.pat === 'hinge')) continue
        checked++
        expect(acc(d, 'hamstrings').map(i => moveOf(row(i.ex.id))), `seed ${seed}`).toEqual(['legcurl'])
      }
      expect(checked).toBeGreaterThan(1)
    })
    it('takes the small muscles in pairs, a calf raise one workout and a leg extension and a wrist curl the next', () => {
      for (const seed of [1, 2, 3]) {
        // A day with room for two more accessories than the level's, as a longer session has.
        const smalls = days(seed, 4, { moreAcc: 2 }).map(d => d.items.filter(i => i.turn).map(i => moveOf(row(i.ex.id))))
        expect(smalls[0], `seed ${seed}`).toEqual(['calf'])
        expect(smalls[2], `seed ${seed}`).toEqual(['seatedcalf'])
        for (const k of [1, 3]) {
          expect(smalls[k][0], `seed ${seed}`).toBe('legext')
          expect(['wrist', 'grip'], `seed ${seed}`).toContain(smalls[k][1])
        }
      }
    })
    it('leaves the other pair out: no calf raise on a leg extension day', () => {
      for (const seed of [1, 2, 3]) {
        const [, second] = days(seed, 2)
        expect(second.items.filter(i => i.ex.p.includes('calves')), `seed ${seed}`).toEqual([])
      }
    })
  })

  describe('the daily groups of a full-body day', () => {
    const DAILY = ['chest', 'back', 'quads', 'hamstrings', 'shoulders', 'biceps', 'triceps', 'abs']
    // Presses that reach the triceps' total on their own, and a day long enough for everything.
    const goals = { chest: 14, back: 16, shoulders: 12, biceps: 12, triceps: 4, abs: 6, quads: 12, hamstrings: 9, calves: 8 }
    const day = o => planDay({ type: 'full', goal: 'growth', level: 'advanced', equipment: 'gym', minutes: 90, goals, ...o })
    const aimed = (d, g) => d.items.filter(i => i.ex.p.includes(g))

    it('gives each a lift aimed at it, whatever the day leads with', () => {
      for (const pattern of ['squat', 'hpress', 'hinge']) for (const seed of [1, 2, 3]) {
        const d = day({ pattern, seed, daily: DAILY })
        for (const g of DAILY) expect(aimed(d, g).length, `${pattern} ${seed} ${g}`).toBeGreaterThan(0)
        expect(d.items.filter(i => i.ex.p.includes('abs')).length).toBe(1)
      }
    })
    it('a group with no goal left still gets its lift when it is daily', () => {
      const d = day({ pattern: 'hpress', goals: { ...goals, triceps: 0 }, daily: DAILY })
      expect(aimed(d, 'triceps').length).toBeGreaterThan(0)
      expect(aimed(day({ pattern: 'hpress', goals: { ...goals, triceps: 0 } }), 'triceps')).toEqual([])
    })
    it('keeps them when a count cuts the day, taking from the others', () => {
      for (const pattern of ['squat', 'hpress', 'hinge']) {
        const d = day({ pattern, daily: DAILY, count: 8 })
        expect(d.items.length).toBeLessThanOrEqual(9)
        for (const g of DAILY) expect(aimed(d, g).length, `${pattern} ${g}`).toBeGreaterThan(0)
      }
    })
    it('a day too short for all of them takes them in the order given, and stays in its time', () => {
      const order = ['triceps', 'abs', 'biceps', 'shoulders', 'chest', 'back', 'quads', 'hamstrings']
      const d = day({ pattern: 'squat', minutes: 35, daily: order })
      const got = order.filter(g => aimed(d, g).length)
      expect(got.length).toBeLessThan(order.length)
      // The ones it skipped come after the ones it took, the lead's own group aside.
      const left = order.filter(g => !got.includes(g))
      expect(left.every(g => order.indexOf(g) > order.indexOf('triceps'))).toBe(true)
      expect(aimed(d, 'triceps').length).toBeGreaterThan(0)
      expect(d.limit).toBe('time')
    })
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

  it('a higher volume plans more sets, a lower one fewer', () => {
    const total = volume => plan({ template: 'ul', days: 4, minutes: 75, volume }).days
      .reduce((n, d) => n + d.items.reduce((m, i) => m + i.sets, 0), 0)
    expect(total(1)).toBeGreaterThan(total(0))
    expect(total(0)).toBeGreaterThan(total(-2))
    expect(configOf({ volume: 5 }).volume).toBe(0)
  })

  it('a rebuild keeps the lifts each day had, and the same settings build the same week', () => {
    const lifts = p => p.days.map(d => d.items.map(i => i.ex.id))
    for (const template of ['full', 'ul', 'ppl']) for (const days of [3, 4, 5]) {
      const o = { template, days, minutes: 60 }
      const was = lifts(plan(o))
      expect(lifts(plan({ ...o, keep: was })), `${template} ${days}`).toEqual(was)
      const more = lifts(plan({ ...o, volume: 2, keep: was }))
      const kept = more.flat().filter(id => was.flat().includes(id)).length
      const fresh = lifts(plan({ ...o, volume: 2 })).flat().filter(id => was.flat().includes(id)).length
      expect(kept, `${template} ${days}`).toBeGreaterThanOrEqual(fresh)
    }
  })

  it('a lift swapped in takes the slot and sets of the one it replaces, and swaps back', () => {
    let n = 0
    for (const template of ['full', 'ul', 'ppl']) {
      const o = { template, days: 3, minutes: 60 }
      const was = plan(o)
      was.days.forEach((d, k) => d.items.forEach(i => {
        const to = equivalentsOf({}, i.ex.id, { scope: 'all' }).map(x => x.ex.id).find(id => !d.items.some(x => x.ex.id === id))
        if (!to) return
        const at = `${template} day ${k} ${i.ex.id} -> ${to}`
        const swap = []
        swap[k] = { [i.ex.id]: to }
        const now = plan({ ...o, swap })
        const it = now.days[k].items.find(x => x.ex.id === to)
        expect(it, at).toBeTruthy()
        expect([it.from, it.slot, it.sets], at).toEqual([i.ex.id, i.slot, i.sets])
        expect(it.rx, at).toEqual(prescribe(now.cfg, planLift(to), i.slot, planLift(to).p[0]))
        // Every other lift of the week stays where it was.
        const rest = p => p.days.map(x => x.items.filter(y => y.ex.id !== to && y.ex.id !== i.ex.id).map(y => `${y.ex.id}×${y.sets}`).sort())
        expect(rest(now), at).toEqual(rest(was))
        // Back to the planner's own is no swap at all.
        swap[k] = { [i.ex.id]: i.ex.id }
        expect(plan({ ...o, swap }).days[k].items.some(x => x.from), at).toBe(false)
        n++
      }))
    }
    expect(n).toBeGreaterThan(20)
  }, 30000) // every lift of three templates, planned twice each: seconds, more beside the rest of the suite

  it('a swap to a lift the day already has leaves the slot as it was', () => {
    const o = { template: 'full', days: 3, minutes: 60 }
    const [a, b] = plan(o).days[0].items
    const now = plan({ ...o, swap: [{ [a.ex.id]: b.ex.id }] }).days[0].items
    expect(now.map(i => i.ex.id)).toEqual(plan(o).days[0].items.map(i => i.ex.id))
  })

  it('a change of the volume alone keeps every lift and moves only the sets', () => {
    const asWeek = p => p.days.map(d => ({ type: d.type, items: d.items.map(i => ({ id: i.ex.id, sets: i.sets, slot: i.slot })) }))
    const sets = p => Object.fromEntries(p.days.flatMap(d => d.items.map(i => [`${d.type}:${i.ex.id}`, i.sets])))
    for (const template of ['full', 'ul', 'ppl']) for (const days of [3, 4]) for (const minutes of [60, 75]) {
      const o = { template, days, minutes }
      const was = plan(o), base = { template, plan: { ...o, volume: 0 }, week: asWeek(was), byGroup: { calves: 8 } }
      const at = what => `${template} ${days}×${minutes} ${what}`
      const same = plan({ ...o, byGroup: { calves: 8 }, base })
      expect(asWeek(same), at('same')).toEqual(base.week)
      // More: every lift stays and no group (calves set on their own) comes out lower.
      const up = plan({ ...o, volume: 1, byGroup: { calves: 8 }, base })
      const now = sets(up)
      for (const k of Object.keys(sets(same))) expect(now[k], at(`up ${k}`)).toBeGreaterThan(0)
      for (const g of PLAN_GROUPS) expect(up.total[g] || 0, at(`up ${g}`)).toBeGreaterThanOrEqual((same.total[g] || 0) - 1e-9)
      // More sets where the days have the minutes for them.
      if (minutes === 75 && days === 4) expect(up.days.reduce((s, d) => s + d.sets, 0), at('up sets')).toBeGreaterThan(same.days.reduce((s, d) => s + d.sets, 0))
      // Less: no lift comes in, none goes up.
      const down = sets(plan({ ...o, volume: -1, byGroup: { calves: 8 }, base }))
      for (const [k, n] of Object.entries(down)) expect(n, at(`down ${k}`)).toBeLessThanOrEqual(sets(same)[k] ?? -1)
      // Another setting builds the week again.
      expect(plan({ ...o, days: days + 1, volume: 1, base }).days.length, at('days')).toBe(days + 1)
    }
  })

  it('names a group short of the sets it needs on its own lifts as that, not as under its goal', () => {
    const p = plan({ template: 'full', days: 2, minutes: 30, level: 'beginner' })
    for (const x of p.short) {
      if (x.direct == null) expect(x.total, x.g).toBeLessThan(x.goal * 0.85)
      else expect(x.direct, x.g).toBeLessThan(x.directGoal * 0.85)
    }
  })
  it('keeps every rest inside the range you set, the lead the longest', () => {
    const rests = { min: 20, max: 60 }
    expect(configOf({ rests }).rests).toEqual(rests)
    expect(configOf({ rests: { min: 60, max: 20 } }).rests).toBe(null)
    expect(prescribe(configOf({ goal: 'growth', rests }), planLift('0025'), 'lead', 'chest').rest).toBe(60)
    expect(prescribe(configOf({ goal: 'growth', rests }), planLift('0605'), 'accessory', 'calves').rest).toBe(20)
    const p = plan({ template: 'full', goal: 'growth', days: 3, minutes: 60, rests })
    for (const d of p.days) for (const l of d.items) { expect(l.rx.rest).toBeGreaterThanOrEqual(20); expect(l.rx.rest).toBeLessThanOrEqual(60) }
  })
  it('shorter rests fit more sets in the same minutes', () => {
    const o = { template: 'full', goal: 'growth', days: 3, minutes: 45, byGroup: { chest: 16, back: 16, quads: 16 } }
    const sets = p => p.days.reduce((n, d) => n + d.sets, 0)
    expect(sets(plan({ ...o, rests: { min: 20, max: 60 } }))).toBeGreaterThan(sets(plan(o)))
  })
  it('a group with no goal of its own gets no lift of its own, one with more focus more sets', () => {
    const o = { template: 'full', goal: 'growth', days: 3, minutes: 75 }
    const base = plan({ ...o, focus: { glutes: 'normal', forearms: 'normal', abs: 'normal' } }), mine = plan({ ...o, focus: { glutes: 'none', forearms: 'none', abs: 'more' } })
    const direct = (p, g) => p.days.flatMap(d => d.items).filter(l => l.ex.p[0] === g).reduce((n, l) => n + l.sets, 0)
    expect(direct(mine, 'glutes')).toBe(0)
    expect(direct(mine, 'forearms')).toBe(0)
    expect(direct(mine, 'abs')).toBeGreaterThan(direct(base, 'abs'))
    // and that is the week with no focus given
    for (const g of ['glutes', 'forearms', 'abs']) expect(direct(plan(o), g)).toBe(direct(mine, g))
  })
})
