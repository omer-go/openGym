import { describe, expect, it } from 'vitest'
import {
  CONDITIONING_FATIGUE, KIND_CONDITIONING, KIND_STRENGTH, comboKindOf, conditioningWorkouts,
  isConditioning, isConditioningCfg, kindOfCfg, kindOfEntry, strengthWorkouts,
} from './conditioning.js'
import { bestWeightFor, buildSets, freestyleConfig, lastEntryFor } from './history.js'
import { policyFor, sessionsFor } from './progression.js'
import { best1RM, bestSetOf } from './onerm.js'
import { bestSetFor } from './exercise-history.js'
import { rebuildPrHistory } from './workout-date.js'
import { groupSetsOf } from './coverage.js'
import { trainingIndex } from './generate.js'
import { fatigueOf, strengthOf } from './recovery.js'
import { asComboMember } from './combo.js'
import { setSupersetMeta, supersetMeta, syncSupersetMeta } from './superset-meta.js'

// barbell bench press, squat
const BENCH = '0025', SQUAT = '0043'
const COND = { reps: 15, sgCombo: true, sg: 'c1' }
const STRONG = { reps: 15, sgCombo: true, sgKind: 'strength', sg: 'c2' }
const row = (w, r = 5) => ({ w, r, done: true })
const entry = (id, sets, target = { reps: 5 }) => ({ id, target, sets })
const session = (d, entries, extra = {}) => ({ id: 'w' + d, d, start: new Date(d + 'T10:00:00').getTime(), name: 'x', entries, ...extra })
const state = workouts => ({ unit: 'kg', workouts, exWeights: {}, routines: [] })

// Heavy bench on the 1st, a light 20 kg × 20 conditioning combo on the 10th.
const HEAVY = session('2026-09-01', [entry(BENCH, [row(80), row(80), row(80)])])
const LIGHT = session('2026-09-10', [entry(BENCH, [row(20, 20), row(20, 20), row(20, 20), row(20, 20)], COND)])
const S = state([HEAVY, LIGHT])

describe('the kind of a combo', () => {
  it('a combo is conditioning unless it says strength; anything else is strength', () => {
    expect(isConditioningCfg({ sgCombo: true })).toBe(true)
    expect(isConditioningCfg({ sgCombo: true, sgKind: 'strength' })).toBe(false)
    expect(isConditioningCfg({ sg: 'a' })).toBe(false)
    expect(isConditioningCfg(null)).toBe(false)
    expect(isConditioning(LIGHT.entries[0])).toBe(true)
    expect(kindOfEntry(HEAVY.entries[0])).toBe(KIND_STRENGTH)
    expect(kindOfCfg(COND)).toBe(KIND_CONDITIONING)
  })
  it('a group is strength when any member says so', () => {
    expect(comboKindOf([{ sgCombo: true }, { sgCombo: true }], [0, 1])).toBe(KIND_CONDITIONING)
    expect(comboKindOf([{ target: { sgCombo: true } }, { target: { sgKind: 'strength' } }], [0, 1], { onTarget: true })).toBe(KIND_STRENGTH)
  })
  it('splits the history into strength and conditioning workouts, leaving clean ones as they are', () => {
    const mixed = session('2026-09-12', [entry(SQUAT, [row(100)]), entry(BENCH, [row(20, 20)], COND)])
    const all = [HEAVY, mixed]
    const sw = strengthWorkouts(all)
    expect(sw[0]).toBe(HEAVY)
    expect(sw[1].entries.map(e => e.id)).toEqual([SQUAT])
    expect(strengthWorkouts(all)).toBe(sw)  // cached per array
    expect(conditioningWorkouts(all).map(w => w.entries.map(e => e.id))).toEqual([[BENCH]])
  })
})

describe('progression and the next session', () => {
  it('a strength session reads last time past the conditioning combo', () => {
    expect(lastEntryFor(S, BENCH).d).toBe('2026-09-01')
    expect(sessionsFor(S, BENCH).every(x => x.d !== '2026-09-10')).toBe(true)
  })
  it('a conditioning combo reads its own last combo, never the heavy session', () => {
    expect(lastEntryFor(S, BENCH, undefined, KIND_CONDITIONING).d).toBe('2026-09-10')
    expect(lastEntryFor(state([HEAVY]), BENCH, undefined, KIND_CONDITIONING)).toBe(null)
    const seeded = freestyleConfig(S, { id: BENCH, reps: 8, sgCombo: true })
    expect(seeded.sets).toBe(4)
    expect(seeded.sgCombo).toBe(true)
    const rows = buildSets(S, { id: BENCH, reps: 20, sets: 4, sgCombo: true }, { preferLast: true })
    expect(rows.every(r => r.w === 20)).toBe(true)
  })
  it('a strength add takes the heavy numbers, not the combo’s', () => {
    const rows = buildSets(S, { id: BENCH, reps: 5, sets: 3 }, { preferLast: true })
    expect(rows.every(r => r.w === 80)).toBe(true)
    expect(freestyleConfig(S, { id: BENCH, reps: 5 }).sgCombo).toBeUndefined()
  })
  it('a conditioning combo is never progressed; a strength combo is', () => {
    expect(policyFor({ id: BENCH, ...COND }, null, 'reps')).toBe('off')
    expect(policyFor({ id: BENCH, ...STRONG }, null, 'reps')).not.toBe('off')
  })
})

describe('records and estimates', () => {
  // the combo's 20 × 25 would estimate above the heavy 80 × 1 by Epley if it counted
  const PUMP = session('2026-09-10', [entry(BENCH, [row(60, 25)], COND)])
  const SOLO = session('2026-09-01', [entry(BENCH, [row(80, 1)])])
  it('a conditioning set is no 1RM estimate and no best set', () => {
    expect(bestSetOf(PUMP.entries[0])).toBe(null)
    expect(best1RM(state([SOLO, PUMP]), BENCH).d).toBe('2026-09-01')
    expect(bestSetFor(state([SOLO, PUMP]), BENCH).d).toBe('2026-09-01')
  })
  it('the heaviest weight and the PR rebuild skip it', () => {
    const heavyCombo = session('2026-09-10', [entry(BENCH, [row(100, 3)], COND)])
    expect(bestWeightFor(state([SOLO, heavyCombo]), BENCH)).toBe(80)
    const rebuilt = rebuildPrHistory([SOLO, { ...heavyCombo, prs: [BENCH] }], [BENCH])
    expect(rebuilt[1].prs || []).not.toContain(BENCH)
  })
  it('a strength combo still sets records', () => {
    const strong = session('2026-09-10', [entry(BENCH, [row(100, 3)], STRONG)])
    expect(bestWeightFor(state([SOLO, strong]), BENCH)).toBe(100)
    expect(bestSetOf(strong.entries[0])).not.toBe(null)
  })
})

describe('weekly sets, recovery and one-tap', () => {
  it('conditioning sets are not hard sets of a group', () => {
    expect(groupSetsOf([LIGHT]).chest || 0).toBe(0)
    expect(groupSetsOf([HEAVY]).chest).toBe(3)
  })
  it('they tire the muscles at a discount, and keep no strength', () => {
    const now = new Date('2026-09-10T12:00:00').getTime()
    const asStrength = session('2026-09-10', [entry(BENCH, LIGHT.entries[0].sets, { reps: 20 })])
    const cond = fatigueOf([LIGHT], now).chest
    const full = fatigueOf([asStrength], now).chest
    expect(cond).toBeGreaterThan(0)
    expect(cond).toBeLessThan(full)
    expect(CONDITIONING_FATIGUE).toBe(0.5)
    expect(strengthOf([LIGHT], now).chest).toBe(strengthOf([], now).chest)
  })
  it('a combo keeps the exercise known but leaves its muscles due', () => {
    const { muscles, exercises } = trainingIndex(state([LIGHT]))
    expect(exercises[BENCH].d).toBe('2026-09-10')
    expect(muscles.chest).toBeUndefined()
  })
})

describe('the kind on a combo’s members', () => {
  it('asComboMember writes strength only when asked', () => {
    expect(asComboMember({ id: BENCH }, { sg: 'a', rounds: 3 }).sgKind).toBeUndefined()
    expect(asComboMember({ id: BENCH }, { sg: 'a', rounds: 3, kind: 'strength' }).sgKind).toBe('strength')
    expect(asComboMember({ id: BENCH, target: {}, sets: [] }, { sg: 'a', rounds: 2, kind: 'strength' }, { onTarget: true }).target.sgKind).toBe('strength')
  })
  it('the superset meta reads, writes and syncs it', () => {
    const ex = [{ id: BENCH, sg: 'a' }, { id: SQUAT, sg: 'a' }]
    setSupersetMeta(ex, 'a', { combo: true, kind: 'strength' })
    expect(ex.every(e => e.sgKind === 'strength')).toBe(true)
    expect(supersetMeta(ex, [0, 1]).kind).toBe('strength')
    setSupersetMeta(ex, 'a', { combo: true, kind: 'conditioning' })
    expect(ex.some(e => 'sgKind' in e)).toBe(false)
    expect(supersetMeta(ex, [0, 1]).kind).toBe('conditioning')
    setSupersetMeta(ex, 'a', { combo: false, kind: 'strength' })
    expect(ex.some(e => 'sgKind' in e)).toBe(false)
    const joined = [{ id: BENCH, sg: 'a', sgCombo: true, sgKind: 'strength' }, { id: SQUAT, sg: 'a' }, { id: '0032', sgKind: 'strength' }]
    syncSupersetMeta(joined)
    expect(joined[1].sgKind).toBe('strength')
    expect(joined[2].sgKind).toBeUndefined()
  })
})
