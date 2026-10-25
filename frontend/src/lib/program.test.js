import { beforeAll, describe, expect, it } from 'vitest'
import { MIN_DAY, dayShare, isProgram, programShare, newProgram, programForecast, programLayout, programOver, programWeek, sizeDay, suggestDay, weekOf } from './program.js'
import { MAX_GEN_COUNT, generateWorkout } from './generate.js'
import { EXIDX } from './exercises.js'
import { USEFUL, entryWeights, groupCredit } from './coverage.js'
import { loadMuscleRoles } from './muscle-roles.js'

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
    // Push Thu, legs Sat; full falls next Monday. Chest lacks 6, and push is its only day left.
    const share = dayShare(st, 'push', THU)
    expect(share.chest).toBeCloseTo(6)
    expect(share.quads).toBeUndefined()
    // Quads lack all 10, but legs and full share them: 5 each, so legs takes at most 7.5.
    expect(dayShare(st, 'legs', THU).quads).toBeCloseTo(7.5)
  })
  it('never piles the week onto one day: a program started on a Saturday', () => {
    const sat = newProgram('full-3', { weeks: 8, today: '2026-09-19' })
    const st = state({ program: sat, goals: { weeklySets: 15 } })
    const share = dayShare(st, 'full', at(2026, 9, 19))
    for (const v of Object.values(share)) expect(v).toBeLessThanOrEqual(15 / 3 + 1e-9)
    expect(sizeDay(st, 'full', { now: at(2026, 9, 19) })).toBeLessThan(MAX_GEN_COUNT)
  })
  describe('with muscle roles', () => {
    beforeAll(loadMuscleRoles)
    // Sized in the order the generator picks, not the order the day runs in: counted back lifts
    // first, the shrugs filled the back before a curl was reached, and the pull day came to eleven,
    // four of them shrugs.
    it('a pull day is sized by what it picks first, not by its back lifts', () => {
      const st = state({ program: newProgram('ppl-3', { weeks: 8, today: '2026-09-14' }), goals: { weeklySets: 10 },
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
      const st = state({ program: newProgram('full-3', { weeks: 8, today: '2026-09-14' }), goals: { weeklySets: 15 },
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
    // biceps and hamstrings each a set or more short, chest over.
    it('fills every group to its share, and ends with the last exercise that adds a set', () => {
      const st = state({ program: newProgram('full-3', { weeks: 8, today: '2026-09-07' }), goals: { weeklySets: 15 },
        workouts: [session('2026-09-14', 'full', ['0025', '0043', '0426', '0241'], 4)] })
      const now = at(2026, 9, 16)
      const share = dayShare(st, 'full', now)
      const n = sizeDay(st, 'full', { now })
      const picks = generateWorkout(st, 'full', { count: MAX_GEN_COUNT, now, share }).sort((a, b) => a.at - b.at)
      const got = {}, adds = []
      for (const p of picks) {
        let add = 0
        for (const [g, c] of Object.entries(groupCredit(entryWeights(p)))) {
          add += Math.min(c * 3, Math.max(0, (share[g] || 0) - (got[g] || 0)))
          got[g] = (got[g] || 0) + c * 3
        }
        adds.push(add)
        if (adds.length === n) for (const [g, v] of Object.entries(share)) expect(got[g] || 0, g).toBeGreaterThan(v - USEFUL)
      }
      expect(adds[n - 1]).toBeGreaterThanOrEqual(USEFUL)
      expect(adds.slice(n).every(a => a < USEFUL)).toBe(true)
    })
  })
  it('a program started this week does not catch up on the days before it', () => {
    const st = state({ program: newProgram('full-3', { weeks: 8, today: '2026-09-17' }), goals: { weeklySets: 15 } })
    const share = dayShare(st, 'full', THU)
    for (const v of Object.values(share)) expect(v).toBeLessThanOrEqual(5 + 1e-9)
    expect(share.chest).toBeCloseTo(5)
  })
  it('a higher goal makes a longer day, within bounds', () => {
    const low = sizeDay(state({ program: PPLF, goals: { weeklySets: 6 } }), 'push', { now: THU })
    const high = sizeDay(state({ program: PPLF, goals: { weeklySets: 20 } }), 'push', { now: THU })
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
    expect(programForecast(st, THU)[0]).toEqual({ type: 'pull', iso: '2026-09-17' })
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
