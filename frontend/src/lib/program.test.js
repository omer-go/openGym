import { beforeAll, describe, expect, it } from 'vitest'
import { MIN_DAY, DAY_NAME, dayShare, isPlanProgram, newPlanProgram, planEntries, programDayEntries, evenCount, isProgram, programShare, newProgram, programCalendar, programForecast, programLayout, programMonths, programOver, programSummary, programWeek, planAhead, sizeDay, suggestDay, weekOf } from './program.js'
import { MAX_GEN_COUNT, genDefaults, genScheme, genSets, generateWorkout } from './generate.js'
import { EXIDX } from './exercises.js'
import { USEFUL, entryWeights, groupCredit } from './coverage.js'
import { loadMuscleRoles } from './muscle-roles.js'
import { OVERLAP, weeklyTargetOf } from './goals.js'

const row = () => ({ w: 60, r: 8, done: true })
const session = (d, genType, ids = ['0025'], n = 3, start = 0) => ({
  id: 'w' + d + genType + start, d, start, name: 'x', genType,
  entries: ids.map(id => ({ id, target: { reps: 8 }, sets: Array.from({ length: n }, row) })),
})
const state = (over = {}) => ({ unit: 'kg', workouts: [], exWeights: {}, routines: [], weekStart: 1, ...over })
const at = (y, m, d) => new Date(y, m - 1, d, 12).getTime()
const THU = at(2026, 9, 17)
const PPLF = newProgram('ppl-full-4', { weeks: 8, today: '2026-09-02' })

describe('a program', () => {
  it('starts from a template', () => {
    expect(PPLF).toEqual({ template: 'ppl-full-4', days: ['push', 'pull', 'legs', 'full'], startedAt: '2026-09-02', weeks: 8 })
    expect(newProgram('nope')).toBe(null)
    expect(isProgram(PPLF)).toBe(true)
    expect(isProgram({ days: ['upper'], startedAt: '2026-09-02' })).toBe(false)
  })
  it('moves to its next week once every day of one is done, and is over after its last', () => {
    const one = ['push', 'pull', 'legs', 'full'].map((k, i) => session('2026-09-0' + (3 + i), k))
    expect(weekOf(state({ program: PPLF }), THU)).toBe(1)
    expect(weekOf(state({ program: PPLF, workouts: one.slice(0, 3) }), THU)).toBe(1)
    expect(weekOf(state({ program: PPLF, workouts: one }), THU)).toBe(2)
    const short = { ...PPLF, weeks: 1 }
    expect(programOver(state({ program: short, workouts: one.slice(0, 3) }), THU)).toBe(false)
    expect(programOver(state({ program: short, workouts: one }), THU)).toBe(true)
  })
})

describe('the week of a program', () => {
  it('ticks the first day of a session’s kind; a skipped day stays open into the next week', () => {
    const st = state({ program: PPLF, workouts: [
      session('2026-09-11', 'push'),          // last week
      session('2026-09-14', 'pull'),
      session('2026-09-15', 'free'),          // no day of its kind
      session('2026-09-16', 'legs'),
    ] })
    const pw = programWeek(st, THU)
    expect(pw.week).toBe(1)
    expect(pw.items.map(it => !!it.w)).toEqual([true, true, true, false])
    expect(pw.done).toBe(3)
    expect(pw.next).toBe(3)
    expect(suggestDay(st, THU)).toBe('full')
  })
  it('two sessions of a kind fill two days of it, in order', () => {
    const p = newProgram('ppl-6', { today: '2026-09-14' })
    const st = state({ program: p, workouts: [session('2026-09-14', 'push', undefined, 3, 1), session('2026-09-15', 'push', undefined, 3, 2)] })
    const pw = programWeek(st, THU)
    expect(pw.items.map(it => !!it.w)).toEqual([true, false, false, true, false, false])
    expect(pw.next).toBe(1)
  })
  it('a session of a kind already done counts for the week after', () => {
    const st = state({ program: PPLF, workouts: [session('2026-09-14', 'push', undefined, 3, 1), session('2026-09-16', 'push', undefined, 3, 2)] })
    expect(programWeek(st, THU).done).toBe(1)
    expect(programLayout(st, '2026-09-14', THU).flatMap(d => d.items).filter(it => it.state === 'done')).toHaveLength(2)
  })
  it('leaves out sessions from before it started', () => {
    const st = state({ program: newProgram('full-3', { today: '2026-09-16' }), workouts: [session('2026-09-14', 'full')] })
    expect(programWeek(st, THU).done).toBe(0)
  })
  it('starts its next week once one is done, and has nothing next once over', () => {
    const three = ['14', '15', '16'].map(d => session('2026-09-' + d, 'full'))
    const st = state({ program: newProgram('full-3', { today: '2026-09-14' }), workouts: three })
    expect(programWeek(st, THU)).toMatchObject({ week: 2, done: 0, next: 0 })
    const over = state({ program: newProgram('full-3', { today: '2026-09-14', weeks: 1 }), workouts: three })
    expect(programWeek(over, THU)).toMatchObject({ week: 1, done: 3, next: null })
    expect(suggestDay(over, THU)).toBe(null)
  })
})

describe('sizing a day to the goal', () => {
  it('shares what a group lacks over the days forecast this week that train it', () => {
    const st = state({ program: PPLF, workouts: [session('2026-09-14', 'pull', ['0025'], 4)] })  // 4 chest sets
    // Push Thu, legs Sat; full falls next Monday. Chest lacks 10 of 14, and push is its only day left.
    const share = dayShare(st, 'push', THU)
    expect(share.chest).toBeCloseTo(10)
    expect(share.quads).toBeUndefined()
    // Quads lack all 12, but legs and full share them: 6 each, so legs takes at most 9.
    expect(dayShare(st, 'legs', THU).quads).toBeCloseTo(9)
  })
  it('never piles the week onto one day: a program started on a Saturday', () => {
    const sat = newProgram('full-3', { weeks: 8, today: '2026-09-19' })
    const st = state({ program: sat })
    const share = dayShare(st, 'full', at(2026, 9, 19))
    for (const [g, v] of Object.entries(share)) expect(v).toBeLessThanOrEqual(weeklyTargetOf(st, g) / 3 + 1e-9)
    expect(sizeDay(st, 'full', { now: at(2026, 9, 19) })).toBeLessThan(MAX_GEN_COUNT)
  })
  describe('with muscle roles', () => {
    beforeAll(loadMuscleRoles)
    // Sized in the order the generator picks, not the order the day runs in: counted back lifts
    // first, the shrugs filled the back before a curl was reached, and the pull day came to eleven,
    // four of them shrugs.
    it('a pull day is sized by what it picks first, not by its back lifts', () => {
      const st = state({ program: newProgram('ppl-3', { weeks: 8, today: '2026-09-14' }),
        workouts: [session('2026-09-14', 'push', ['0025', '0426', '0030', '5609', '0241'], 3)] })
      const now = at(2026, 9, 16)
      const n = sizeDay(st, 'pull', { now })
      expect(n).toBeLessThanOrEqual(7)
      const shrugs = generateWorkout(st, 'pull', { count: n, now }).filter(p => /shrug/i.test(EXIDX[p.id].n))
      expect(shrugs.length).toBeLessThanOrEqual(1)
    })
    // What sizeDay counts on: an n-exercise day is the first n the generator picks for a longer
    // one, and `at` says which those are; the order the day runs in does not.
    it('a shorter day is the first picks of a longer one', () => {
      const st = state({ program: newProgram('full-3', { weeks: 8, today: '2026-09-14' }),
        workouts: [session('2026-09-14', 'full', ['0025', '0043', '0652'], 3)] })
      const now = at(2026, 9, 16)
      const share = programShare(st, 'full', now)
      const long = generateWorkout(st, 'full', { count: MAX_GEN_COUNT, now, share }).sort((a, b) => a.at - b.at).map(p => p.id)
      for (const n of [4, 7, 10]) {
        const short = generateWorkout(st, 'full', { count: n, now, share }).map(p => p.id)
        expect(short.slice().sort()).toEqual(long.slice(0, n).sort())
      }
    })
    // Each group to its own share, not 85% of the sum: that stopped a day at six with back,
    // biceps and hamstrings each a set or more short, chest over. On the week's last program day,
    // which its even part caps one exercise later. Each lift counts the sets it takes, extra
    // sets for its group's share too.
    it('fills every group to its share, and ends with the last exercise that adds a set', () => {
      // The strength goal's groups add up to about the 100 sets a week this was measured at
      const st = state({ program: newProgram('full-3', { weeks: 8, today: '2026-09-07' }), goals: { type: 'strength' },
        workouts: [session('2026-09-14', 'full', ['0025', '0043', '0426', '0241'], 4), session('2026-09-16', 'full', ['0652', '0085'], 3)] })
      const now = at(2026, 9, 18)
      const share = dayShare(st, 'full', now)
      const n = sizeDay(st, 'full', { now })
      const picks = generateWorkout(st, 'full', { count: MAX_GEN_COUNT, now, share }).sort((a, b) => a.at - b.at)
      const got = {}, adds = []
      for (const p of picks) {
        let add = 0
        for (const [g, c] of Object.entries(groupCredit(entryWeights(p)))) {
          const sets = genSets(p.id, undefined, p.slot, p.extra)
          add += Math.min(c * sets, Math.max(0, (share[g] || 0) - (got[g] || 0)))
          got[g] = (got[g] || 0) + c * sets
        }
        adds.push(add)
        if (adds.length === n) for (const [g, v] of Object.entries(share)) expect(got[g] || 0, g).toBeGreaterThan(v - USEFUL)
      }
      expect(adds[n - 1]).toBeGreaterThanOrEqual(USEFUL)
      expect(adds.slice(n).every(a => a < USEFUL)).toBe(true)
    })
    // The first day of a week took 13 exercises and the last 9: what the first overshot, the last
    // no longer lacked. A day with days after it stops near its even part of the sets. The last,
    // uncapped, took 14: a second curl, press and ab lift for a set or two each.
    it('a day with more to come this week stops near its even part; the last one exercise later', () => {
      const st = state({ program: newProgram('full-3', { weeks: 8, today: '2026-09-07' }) })
      const mon = at(2026, 9, 14)
      const share = dayShare(st, 'full', mon)
      const n = sizeDay(st, 'full', { now: mon })
      const picks = generateWorkout(st, 'full', { count: MAX_GEN_COUNT, now: mon, share }).sort((a, b) => a.at - b.at)
      const setsOf = p => genScheme(p.id).sets
      const sets = picks.slice(0, n).reduce((a, p) => a + setsOf(p), 0)
      const sum = Object.values(share).reduce((a, b) => a + b, 0)
      expect(sets - setsOf(picks[n - 1])).toBeLessThan(sum / OVERLAP + 1.5)
      expect(n).toBeGreaterThanOrEqual(MIN_DAY)
      const fri = at(2026, 9, 18)
      expect(sizeDay(st, 'full', { now: fri })).toBeGreaterThan(sizeDay(st, 'full', { now: fri - 2 * 864e5 }))
      // Fourteen lifts of three sets, a share of 42: the even part is 42 / OVERLAP + 1.5 = 31.5 sets,
      // reached at the eleventh. Friday, Monday and Wednesday done, is the week's last day: one more.
      const lifts = Array.from({ length: 14 }, () => ({ id: '0025' }))
      const even = { chest: 42 }
      expect(evenCount(st, 'full', lifts, even, undefined, mon)).toBe(11)
      const done = { ...st, workouts: [session('2026-09-14', 'full'), session('2026-09-16', 'full')] }
      expect(evenCount(done, 'full', lifts, even, undefined, fri)).toBe(12)
    })
  })
  it('a program started this week does not catch up on the days before it', () => {
    const st = state({ program: newProgram('full-3', { weeks: 8, today: '2026-09-17' }) })
    const share = dayShare(st, 'full', THU)
    for (const [g, v] of Object.entries(share)) expect(v).toBeLessThanOrEqual(weeklyTargetOf(st, g) / 3 + 1e-9)
    expect(share.chest).toBeCloseTo(weeklyTargetOf(st, 'chest') / 3)
  })
  it('a higher goal makes a longer day, within bounds', () => {
    const low = sizeDay(state({ program: PPLF, goals: { type: 'maintain' } }), 'push', { now: THU })
    const high = sizeDay(state({ program: PPLF, goals: { type: 'growth' } }), 'push', { now: THU })
    expect(low).toBeGreaterThanOrEqual(MIN_DAY)
    expect(high).toBeGreaterThan(low)
    expect(high).toBeLessThanOrEqual(MAX_GEN_COUNT)
  })
  it('without a program suggests the day whose groups need it most', () => {
    const st = state({ workouts: [session('2026-09-16', 'push', ['0025', '0426', '0241'], 10)] })
    expect(['pull', 'legs']).toContain(suggestDay(st, THU))
  })
})

describe('the days ahead', () => {
  const show = days => days.map(d => d.items.map(it => it.type + (it.state === 'done' ? '✓' : it.state === 'next' ? '*' : '')).join('+') || '-')
  const dates = f => f.map(x => x.type + ' ' + x.iso.slice(5))

  it('started midweek, keeps a rest day between and carries the rest into next week', () => {
    const st = state({ program: newProgram('ppl-full-4', { today: '2026-09-17' }) })
    expect(show(programLayout(st, '2026-09-14', THU))).toEqual(['-', '-', '-', 'push*', '-', 'pull', '-'])
    expect(show(programLayout(st, '2026-09-21', THU))).toEqual(['legs', '-', 'full', '-', 'push', '-', 'pull'])
  })

  it('puts done days on their dates and the next a rest day after the last', () => {
    // Week of Mon 14 Sep; today Thu 17. Pull done Mon, legs done Wed: push Fri, full Sun.
    const st = state({ program: PPLF, workouts: [session('2026-09-14', 'pull'), session('2026-09-16', 'legs')] })
    expect(show(programLayout(st, '2026-09-14', THU))).toEqual(['pull✓', '-', 'legs✓', '-', 'push*', '-', 'full'])
  })

  it('is next today after a rest day, or after a long break', () => {
    const st = state({ program: PPLF, workouts: [session('2026-09-03', 'push')] })
    expect(programForecast(st, THU)[0]).toEqual({ type: 'pull', k: 1, iso: '2026-09-17', r: 0 })
  })

  it('keeps a three-day week on a seven-day beat, and a six-day one rests a day after it', () => {
    const MON = at(2026, 9, 14)
    expect(dates(programForecast(state({ program: newProgram('full-3', { today: '2026-09-14', weeks: 2 }) }), MON)))
      .toEqual(['full 09-14', 'full 09-16', 'full 09-18', 'full 09-21', 'full 09-23', 'full 09-25'])
    expect(dates(programForecast(state({ program: newProgram('ppl-6', { today: '2026-09-14', weeks: 2 }) }), MON)).map(x => x.slice(-5)))
      .toEqual(['09-14', '09-15', '09-16', '09-17', '09-18', '09-19', '09-21', '09-22', '09-23', '09-24', '09-25', '09-26'])
  })

  it('a past week shows only what was done', () => {
    const st = state({ program: PPLF, workouts: [session('2026-09-09', 'push')] })
    expect(show(programLayout(st, '2026-09-07', THU))).toEqual(['-', '-', 'push✓', '-', '-', '-', '-'])
  })

  it('is empty before it starts and once over, null without one', () => {
    expect(show(programLayout(state({ program: PPLF }), '2026-08-24', THU)).every(x => x === '-')).toBe(true)
    const three = ['14', '15', '16'].map(d => session('2026-09-' + d, 'full'))
    const over = state({ program: newProgram('full-3', { today: '2026-09-14', weeks: 1 }), workouts: three })
    expect(show(programLayout(over, '2026-09-21', THU)).every(x => x === '-')).toBe(true)
    expect(programLayout(state(), '2026-09-14', THU)).toBe(null)
  })
})

describe('planning the days ahead', () => {
  beforeAll(loadMuscleRoles)
  const MON = at(2026, 9, 21)
  const st = state({ program: newProgram('full-3', { weeks: 8, today: '2026-09-14' }), workouts: [
    session('2026-09-15', 'full', ['0025', '0043', '0027']), session('2026-09-17', 'full', ['0025', '0085', '0652']),
    session('2026-09-19', 'full', ['0025', '0043', '0027']),
  ] })
  let plan
  beforeAll(() => { plan = planAhead(st, { days: 5, now: MON }) })
  const ids = d => d.entries.map(e => e.id)

  it('is nothing without a program', () => {
    expect(planAhead(state(), { now: MON })).toEqual([])
  })
  it('goes day by day where the forecast puts them, the first as Start builds it now', () => {
    expect(plan.map(d => d.iso)).toEqual(programForecast(st, MON).slice(0, 5).map(f => f.iso))
    const setup = genDefaults('full')
    const count = sizeDay(st, 'full', { now: MON, groups: setup.groups, setup })
    expect(ids(plan[0])).toEqual(generateWorkout(st, 'full', { ...setup, count, now: MON, share: programShare(st, 'full', MON) }).map(p => p.id))
    expect(plan[0].sets).toBe(plan[0].entries.reduce((n, e) => n + e.target.sets, 0))
    expect(plan[0].entries[0].target).toMatchObject({ sets: 4, repsMin: 6, reps: 8, prog: 'double' })
    expect(plan[0].groups.chest).toBeGreaterThan(0)
  })
  it('builds a day still to come on its own date, not today', () => {
    const sun = at(2026, 9, 20)
    const ahead = planAhead(st, { days: 1, now: sun })[0]
    expect(ahead.iso).toBe(plan[0].iso)
    expect(ids(ahead)).toEqual(ids(plan[0]))
  })
  it('builds each day as if the ones before it were done in full', () => {
    const d = plan[0], t = new Date(d.iso + 'T12:00:00').getTime()
    const done = { ...st, workouts: [...st.workouts, {
      id: 'x', d: d.iso, start: t, end: t + 36e5, name: 'full', genType: 'full', routineIds: [],
      entries: d.entries.map(e => ({ id: e.id, target: e.target, sets: e.sets.filter(x => !x.warm).map(x => ({ ...x, done: true })) })),
    }] }
    const next = new Date(plan[1].iso + 'T12:00:00').getTime()   // built on its own day
    expect(ids(planAhead(done, { days: 1, now: next })[0])).toEqual(ids(plan[1]))
    expect(ids(plan[1])).not.toEqual(ids(plan[0]))
  })
})

describe('a program built from settings', () => {
  const UL = newPlanProgram({ template: 'ul', goal: 'growth', level: 'intermediate', equipment: 'gym', days: 4, minutes: 60 }, { weeks: 6, today: '2026-09-14' })
  const planSession = (d, k, start = 0) => ({ ...session(d, UL.days[k], [UL.week[k].items[0].id], 3, start), programDay: k })

  it('keeps its settings and the week they build', () => {
    expect(UL.days).toEqual(['upper', 'lower', 'upper', 'lower'])
    expect(UL.plan).toEqual({ goal: 'growth', level: 'intermediate', equipment: 'gym', days: 4, minutes: 60, seed: 1 })
    expect(UL.week).toHaveLength(4)
    for (const d of UL.week) expect(d.items[0]).toMatchObject({ slot: 'lead', lo: 6, hi: 8, rest: 180 })
    expect(isProgram(UL)).toBe(true)
    expect(isPlanProgram(UL)).toBe(true)
    expect(isPlanProgram(PPLF)).toBe(false)
    expect(DAY_NAME.upper).toBe('Upper body')
  })

  it('leaves out what is excluded', () => {
    const ids = p => p.week.flatMap(d => d.items.map(i => i.id))
    const lead = UL.week[0].items[0].id
    expect(ids(newPlanProgram({ template: 'ul', days: 4 }, { exclude: [lead] }))).not.toContain(lead)
  })

  it('ticks the day a session was done as, not the first of its kind', () => {
    const st = state({ program: UL, workouts: [planSession('2026-09-15', 2)] })
    const pw = programWeek(st, at(2026, 9, 16))
    expect(pw.items.map(it => !!it.w)).toEqual([false, false, true, false])
    expect(pw.next).toBe(0)
    // A session of its kind without a day still takes the first open one.
    const free = state({ program: UL, workouts: [session('2026-09-15', 'upper')] })
    expect(programWeek(free, at(2026, 9, 16)).items.map(it => !!it.w)).toEqual([true, false, false, false])
  })

  it('forecasts each day with its place in the week', () => {
    const st = state({ program: UL, workouts: [planSession('2026-09-14', 0)] })
    expect(programForecast(st, at(2026, 9, 15)).slice(0, 3).map(f => f.k)).toEqual([1, 2, 3])
  })

  it('builds a day from its own lifts, a rep range on double progression and its rest', () => {
    const items = [{ id: '0025', sets: 4, lo: 6, hi: 8, rest: 180 }, { id: '2290', sets: 3, lo: 8, hi: 12, rest: 120 }]
    const [bench, split] = planEntries(state(), items)
    expect(bench.target).toMatchObject({ sets: 4, reps: 8, repsMin: 6, prog: 'double', restSec: 180 })
    expect(bench.sets.filter(x => !x.warmup && !x.wu).length).toBeGreaterThanOrEqual(4)
    // A one-leg lift counts both legs.
    expect(split.target).toMatchObject({ reps: 24, repsMin: 16 })
    expect(bench.gen.g).toBe('chest')
  })

  it('plans the days ahead from the week it built', () => {
    const st = state({ program: UL })
    const ahead = planAhead(st, { days: 4, now: at(2026, 9, 14) })
    expect(ahead.map(d => d.k)).toEqual([0, 1, 2, 3])
    for (const d of ahead) expect(d.entries.map(e => e.id)).toEqual(UL.week[d.k].items.map(i => i.id))
    expect(programDayEntries(st, { type: 'lower', k: 1 }).map(e => e.id)).toEqual(UL.week[1].items.map(i => i.id))
  })
})

describe('the calendar of a program', () => {
  const p = newProgram('full-3', { today: '2026-09-14', weeks: 2 })
  const st = state({ program: p, workouts: [session('2026-09-14', 'full', ['0025'], 3, 1), session('2026-09-16', 'full', ['0025'], 3, 2)] })
  it('lays the month out in weeks, done days on their date and the rest where the forecast puts them', () => {
    const rows = programCalendar(st, '2026-09', THU)
    expect(rows[0].start).toBe('2026-08-31')
    expect(rows.length).toBe(5)
    const wk = rows.find(r => r.start === '2026-09-14')
    expect(wk.week).toBe(1)
    expect(wk.days.flatMap(d => d.items.map(it => it.state + ' ' + d.iso))).toEqual(['done 2026-09-14', 'done 2026-09-16', 'next 2026-09-18'])
    expect([wk.done, wk.planned]).toEqual([2, 1])
    const next = rows.find(r => r.start === '2026-09-21')
    expect(next.week).toBe(2)
    expect(next.days.flatMap(d => d.items).every(it => it.r === 1 && it.state === 'planned')).toBe(true)
    expect(rows[0].week).toBe(0)
    expect(rows[0].days[0].inMonth).toBe(false)
  })
  it('spans the months from its start to its last day', () => {
    expect(programMonths(st, THU)).toEqual({ from: '2026-09', to: '2026-09', end: programForecast(st, THU).at(-1).iso })
    expect(programCalendar(state(), '2026-09', THU)).toBe(null)
  })
})

describe('what a program added up to', () => {
  it('counts its sessions, sets and bests, and the lifts that gained most', () => {
    const p = newProgram('full-3', { today: '2026-09-14', weeks: 1 })
    const lift = (d, id, w, start) => ({ ...session(d, 'full', [id], 2, start), entries: [{ id, sets: [{ w, r: 8, done: true }, { w: w + 100, r: 8, done: false }] }] })
    const ws = [lift('2026-09-14', '0025', 60, 1), lift('2026-09-16', '0025', 70, 2), { ...lift('2026-09-18', '0025', 75, 3), prs: ['0025'] }]
    const sum = programSummary(state({ program: p, workouts: ws }), { now: at(2026, 9, 20) })
    expect(sum).toMatchObject({ workouts: 3, total: 3, weeks: 1, sets: 3, prs: 1, from: '2026-09-14', to: '2026-09-18' })
    expect(sum.gains).toEqual([{ id: '0025', from: 60, to: 75 }])
  })
})
