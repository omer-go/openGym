import { beforeAll, describe, expect, it } from 'vitest'
import { entryWeights, groupCredit, groupSetsOf, groupSetsPerWeek, groupSplitOf, groupSplitPerWeek, roundSplit, groupSetsOfWeeklyPlan, plannedSets, weeklyDone, weeklyNeed, variantHistory, rankForGaps, partsShort, partSets, HELPED_PART, slotMuscleOf, weeklyLack } from './coverage.js'
import { generateWorkout } from './generate.js'
import { EXIDX, patternOf } from './exercises.js'
import { musclesOf } from './muscles.js'
import { variantOf } from './variant.js'
import { groupOfExercise } from './muscle-colors.js'
import { loadMuscleRoles, muscleRolesOf, roleWeights } from './muscle-roles.js'
import { weeklyTargetOf } from './goals.js'

const row = (patch = {}) => ({ w: 60, r: 8, done: true, ...patch })
const sets = n => Array.from({ length: n }, () => row())
const session = (d, ids, s = sets(3)) => ({ id: 'w' + d + ids.join(), d, name: 'x', entries: ids.map(id => ({ id, target: { reps: 8 }, sets: s })) })
const state = (over = {}) => ({ unit: 'kg', workouts: [], exWeights: {}, routines: [], ...over })
const at = (y, m, d) => new Date(y, m - 1, d, 12).getTime()
const NOW = at(2026, 9, 15)
const CHEST_GOAL = weeklyTargetOf({}, 'chest')   // the muscle goal's 14
const credit = id => groupCredit(musclesOf(EXIDX[id]))

// barbell bench press, dumbbell bench press, squat, deadlift, barbell shrug,
// dumbbell standing overhead press
const BENCH = '0025', DB_BENCH = '0289', SQUAT = '0043', DEADLIFT = '0032', SHRUG = '0095'
const OHP = '0426'

describe('groupCredit', () => {
  it('credits each group its best muscle: primary 1, secondary 0.4', () => {
    expect(credit(SQUAT)).toMatchObject({ quads: 1, glutes: 1, hamstrings: 0.4, calves: 0.4, abs: 0.4 })
    expect(credit(BENCH)).toEqual({ chest: 1, shoulders: 0.4, triceps: 0.4 })
  })
  it('a group’s other muscles credit it at a quarter: a deadlift or shrugs are no back exercise', () => {
    expect(credit(DEADLIFT).back).toBe(0.25)  // lower back
    expect(credit(SHRUG).back).toBe(0.25)     // traps
    expect(credit('1323').back).toBe(1)       // a row works the upper back, the group's main muscle
  })
})

describe('weeklyNeed', () => {
  it('counts credit × completed work sets over the last 7 days', () => {
    const st = state({ workouts: [
      session('2026-09-14', [BENCH], [row(), row(), row({ warmup: true }), row({ done: false })]),
      session('2026-09-08', [BENCH]),  // 7 days before today: outside the window
      session('2026-09-09', [OHP]),    // 6 days before: inside
      session('2026-09-16', [BENCH]),  // after now
    ] })
    const done = weeklyDone(st, NOW)
    expect(done.chest).toBeCloseTo(2 + 1.2) // the press works the upper chest in support
    expect(done.shoulders).toBeCloseTo(0.8 + 3)
  })
  it('a week of the goal in effective sets leaves nothing, rested or not', () => {
    const full = state({ workouts: [session('2026-09-09', [BENCH]), session('2026-09-10', [BENCH], sets(CHEST_GOAL))] })
    expect(weeklyNeed(full, ['chest'], at(2026, 9, 16)).chest).toBe(0)
  })
  it('a group still fatigued needs less than its sets alone say', () => {
    const st = state({ workouts: [session('2026-09-14', [BENCH], sets(4))] })
    const need = weeklyNeed(st, ['chest', 'quads'], NOW)
    expect(need.quads).toBe(1)
    expect(need.chest).toBeLessThan(1 - 4 / CHEST_GOAL)
  })
})

describe('group sets over a period (Stats)', () => {
  it('counts credit × completed work sets, and `keep` narrows them', () => {
    const w = session('2026-09-14', [BENCH], [row({ rir: 1 }), row({ rir: 4 }), row({ warmup: true, rir: 0 }), row({ done: false, rir: 0 })])
    expect(groupSetsOf([w])).toEqual({ chest: 2, shoulders: 0.8, triceps: 0.8 })
    expect(groupSetsOf([w], s => s.rir <= 2).chest).toBe(1)
  })
  it('averages a week over the period, cut to the first workout in it', () => {
    const NOW = at(2026, 9, 29)
    const ws = [session('2026-09-15', [BENCH], sets(10)), session('2026-09-22', [BENCH], sets(10))] // two weeks of 10
    expect(groupSetsPerWeek(ws, 90, NOW).chest).toBeCloseTo(10)  // not 20 over 13 weeks
    expect(groupSetsPerWeek(ws, 0, NOW).chest).toBeCloseTo(10)
    expect(groupSetsPerWeek(ws, 30, NOW + 14 * 864e5).chest).toBeCloseTo(20 / (28 / 7))
  })
  it('is never less than a week, and leaves out what falls outside the period', () => {
    const NOW = at(2026, 9, 29)
    expect(groupSetsPerWeek([session('2026-09-28', [BENCH], sets(4))], 30, NOW).chest).toBe(4)
    expect(groupSetsPerWeek([session('2026-06-01', [BENCH])], 30, NOW)).toEqual({})
    expect(groupSetsPerWeek([session('2026-10-01', [BENCH])], 30, NOW)).toEqual({})
  })
  it('splits each group under the muscle that earned its credit, adding up to the group', () => {
    // a row: the upper back; a deadlift: the lower back at a quarter; shrugs: the traps at a quarter
    const ws = [session('2026-09-14', ['1323', DEADLIFT, SHRUG], sets(4))]
    const split = groupSplitOf(ws)
    expect(split.back).toEqual({ 'upper-back': 4, 'lower-back': 1, trapezius: 1 })
    expect(groupSetsOf(ws).back).toBe(6)
    const total = g => Object.values(split[g]).reduce((a, b) => a + b, 0)
    for (const g of Object.keys(split)) expect(groupSetsOf(ws)[g]).toBeCloseTo(total(g))
  })
  it('cardio is no hard set for a muscle: a treadmill run counts toward no group or part', () => {
    const run = session('2026-09-14', ['2197'], sets(3))
    expect(groupSplitOf([run])).toEqual({})
    expect(groupSetsOf([run])).toEqual({})
  })
  it('a set counts once for a group even when it works several of its muscles', () => {
    // a squat works quads, glutes and adductors: glutes & hips gets 1, under the glutes
    expect(groupSplitOf([session('2026-09-14', [SQUAT], sets(2))]).glutes).toEqual({ gluteal: 2 })
  })
  it('averages the split over the period as the totals are', () => {
    const NOW = at(2026, 9, 29)
    const ws = [session('2026-09-15', [DEADLIFT], sets(8)), session('2026-09-22', [DEADLIFT], sets(8))]
    expect(groupSplitPerWeek(ws, 90, NOW).back['lower-back']).toBeCloseTo(2)
    expect(groupSetsPerWeek(ws, 90, NOW).back).toBeCloseTo(2)
  })
  it('counts a logged custom exercise by the muscles saved with it', () => {
    const w = { id: 'c', d: '2026-09-14', entries: [{ id: 'custom-1', exercise: { primaries: ['biceps'], secondaries: [] }, sets: sets(3) }] }
    expect(groupSetsOf([w])).toEqual({ biceps: 3 })
  })
})

describe('group sets the weekly plan programs (Stats)', () => {
  const routine = (id, ex) => ({ id, name: id, ex })
  it('counts each weekday routine as often as it runs, as plannedSets counts a routine', () => {
    const push = routine('push', [{ id: BENCH, sets: 3 }]), pull = routine('pull', [{ id: '1323', sets: 4 }, { id: DEADLIFT, sets: 2 }])
    const plan = groupSetsOfWeeklyPlan(state({ routines: [push, pull], week: { 1: ['push'], 3: 'pull', 5: 'push' } }))
    const once = plannedSets(push.ex), pulls = plannedSets(pull.ex)
    expect(Object.keys(plan).sort()).toEqual([...new Set([...Object.keys(once), ...Object.keys(pulls)])].sort())
    for (const g of Object.keys(plan)) expect(plan[g]).toBeCloseTo(2 * (once[g] || 0) + (pulls[g] || 0))
    expect(plan.back).toBeCloseTo(4 + 0.5)  // the row's upper back, the deadlift's lower back at a quarter
  })
  it('reads a custom exercise from the profile, and nothing from a missing routine', () => {
    const S = state({ customEx: [{ id: 'mine', n: 'Mine', primaries: ['calves'], secondaries: [], custom: true }],
      routines: [routine('r', [{ id: 'mine', sets: 5 }])], week: { 2: ['r', 'gone'] } })
    expect(groupSetsOfWeeklyPlan(S)).toEqual({ calves: 5 })
  })
})

describe('variety', () => {
  const chestPick = st => generateWorkout(st, 'full', { now: NOW }).find(p => groupOfExercise(EXIDX[p.id]) === 'chest')
  it('after incline and decline, the position done longest ago comes back', () => {
    const st = state({ workouts: [session('2026-08-25', [BENCH]), session('2026-09-01', ['0047', '0301'])] })
    expect(variantOf(EXIDX[chestPick(st).id]).position).toBe('plain')
  })
  it('the equipment profile still decides what is possible', () => {
    const st = state({
      workouts: [session('2026-09-01', [DB_BENCH])],
      equipFilterOn: true, equipProfiles: [{ id: 'p', name: 'Home', equipment: ['dumbbell', 'bench'], accV: 1 }], activeEquipId: 'p',
    })
    for (const p of generateWorkout(st, 'full', { now: NOW })) expect(['dumbbell', 'bodyweight']).toContain(variantOf(EXIDX[p.id]).tool)
  })
  it('a second exercise for the same group in one session is on another tool', () => {
    const back = generateWorkout(state(), 'pull', { now: NOW }).filter(p => groupOfExercise(EXIDX[p.id]) === 'back' && p.muscle === 'upper-back')
    expect(back.length).toBeGreaterThan(1)
    expect(new Set(back.map(p => variantOf(EXIDX[p.id]).tool)).size).toBe(back.length)
  })
  it('an upright row or a cuban press is a delt lift, not a pull from overhead; a clean high pull a hinge', () => {
    expect(['0120', '0299', '0437'].map(patternOf)).toEqual(['isolation', 'isolation', 'isolation'])
    expect(patternOf('5705')).toBe('hinge')
  })
})

describe('the parts of a muscle', () => {
  const FRONT = '0310', SIDE = '0334', REAR = '0378'
  const ROLES = { [FRONT]: { target: ['front-delt'] }, [SIDE]: { target: ['side-delt'] }, [REAR]: { target: ['rear-delt'] } }
  const rolesOf = id => ROLES[id] || null
  const raises = [{ id: FRONT, rank: 0 }, { id: SIDE, rank: 1 }, { id: REAR, rank: 2 }]
  const opts = { groups: ['shoulders'], need: { shoulders: 1 }, rolesOf }

  it('history keeps when each target muscle was last done, under its group', () => {
    const h = variantHistory(state({ workouts: [session('2026-09-01', [SIDE]), session('2026-09-08', [SIDE, FRONT])] }), rolesOf)
    expect(h.shoulders.part).toEqual({ 'side-delt': '2026-09-08', 'front-delt': '2026-09-08' })
  })
  it('Add exercise puts another part first after one already in the session', () => {
    const order = rankForGaps(raises, { ...opts, have: [{ id: FRONT, sets: [] }] })
    expect(order[0]).not.toBe(FRONT)
    expect(order.indexOf(FRONT)).toBe(2)
  })

  describe('with the catalogue roles', () => {
    beforeAll(loadMuscleRoles)
    const targets = p => muscleRolesOf(p.id)?.target || []
    // Picked first; a pull-up may still run first, its helpers counting for more groups.
    it('after pulldowns, a pull day leads with them and picks the mid back next', () => {
      const st = state({ workouts: [session('2026-09-10', ['2330'])] })
      const [lead, ...rest] = generateWorkout(st, 'pull', { now: NOW }).sort((a, b) => a.at - b.at)
      expect(lead.id).toBe('2330')
      expect(targets(rest.find(p => p.muscle === 'upper-back'))).toContain('middle-trap')
    })
    it('a pull day pairs lat work with a row', () => {
      const back = generateWorkout(state(), 'pull', { now: NOW }).filter(p => groupOfExercise(EXIDX[p.id]) === 'back' && p.muscle === 'upper-back')
      expect(back.some(p => targets(p).includes('middle-trap'))).toBe(true)
      expect(back.some(p => targets(p).join() === 'lats')).toBe(true)
    })
  })
})

describe('weeklyLack', () => {
  beforeAll(loadMuscleRoles)
  // Counted in, the delts the presses and rows had already given their week still lacked a lift
  // each: 21 shoulder sets of 15.
  it('what is left of the goal; a part short of its minimum adds nothing', () => {
    const st = state({ workouts: [session('2026-10-19', [OHP], sets(12))], goals: { byGroup: { shoulders: 12 } } })
    const now = at(2026, 10, 22)
    expect(partsShort(st, ['shoulders'], now).shoulders.map(p => p.name)).toContain('Side delts')
    expect(weeklyLack(st, ['shoulders'], now)).toEqual({ shoulders: 0 })
  })
})

describe('partSets', () => {
  it('counts a set aimed at a part in full, one that only helps it at HELPED_PART', () => {
    expect(partSets({ targeted: 3, helped: 4 })).toBeCloseTo(3 + 4 * HELPED_PART)
    expect(partSets({ helped: 6 })).toBeLessThan(6)
    expect(partSets()).toBe(0)
  })
  it('the side delts a press helped count 0.2 a set: 3 sets of presses are 0.6 of their minimum', () => {
    const st = state({ workouts: [session('2026-10-19', [OHP, BENCH])] })
    const side = partsShort(st, ['shoulders'], at(2026, 10, 22)).shoulders.find(p => p.name === 'Side delts')
    expect(side.helped).toBeCloseTo(1.2)
    expect(side.sets).toBeCloseTo(0.6)
  })
})

describe('slotMuscleOf', () => {
  beforeAll(loadMuscleRoles)
  it('the main muscle by the roles when they aim elsewhere: a handstand push-up is a shoulder lift', () => {
    expect(EXIDX['0471'].n).toMatch(/handstand/)
    expect(slotMuscleOf(EXIDX['0471'])).toBe('deltoids')
    expect(slotMuscleOf(EXIDX['0471'], () => null)).toBe('triceps')
  })
  it('the catalogue’s own when the roles agree: a bench press is a chest lift', () => {
    expect(slotMuscleOf(EXIDX[BENCH])).toBe('chest')
    expect(slotMuscleOf(EXIDX[BENCH], () => null)).toBe('chest')
  })
})

describe('roundSplit', () => {
  it('rounds the parts to whole sets that add up to the rounded total', () => {
    expect(roundSplit({ 'upper-back': 10, 'lower-back': 1, trapezius: 0.47 })).toEqual({ 'upper-back': 10, 'lower-back': 1, trapezius: 0 })
    expect(roundSplit({ a: 3.4, b: 3.4, c: 3.4 })).toEqual({ a: 4, b: 3, c: 3 })
    expect(roundSplit({ a: 2.6, b: 0.3 })).toEqual({ a: 3, b: 0 })
    expect(roundSplit({})).toEqual({})
  })
})

describe('counting from the muscle roles', () => {
  beforeAll(loadMuscleRoles)
  const LATERAL = '0334'
  it('an exercise with roles counts its target 1, its helpers 0.4 and its stabilizers not at all', () => {
    const r = muscleRolesOf(SQUAT)
    expect(r.target.length).toBeGreaterThan(0)
    const w = entryWeights({ id: SQUAT })
    expect(w).toMatchObject({ quadriceps: 1, gluteal: 0.5 })   // glutes share the target: half
    expect(w.abs).toBeUndefined()   // a squat's abs hold the trunk steady
  })
  it('counts the glutes half where they share the target with the quads or hamstrings, whole where they have it alone', () => {
    expect(roleWeights({ target: ['glute-max', 'hamstrings'] })).toEqual({ gluteal: 0.5, hamstring: 1 })
    expect(roleWeights({ target: ['glute-max'], synergists: ['hamstrings'] })).toEqual({ gluteal: 1, hamstring: 0.4 })
    expect(roleWeights({ target: ['glute-max', 'erector-spinae'] }).gluteal).toBe(1)
    expect(roleWeights({ target: ['quads', 'glute-max'], synergists: ['glute-med'] }).gluteal).toBe(0.5)
  })
  it('a press helps the side delts, it does not count as a lateral raise', () => {
    const split = groupSplitOf([session('2026-09-14', [OHP, LATERAL])])
    expect(split.shoulders.deltoids).toBe(6)
    expect(entryWeights({ id: LATERAL }).deltoids).toBe(1)
  })
  it('falls back to the catalogue muscles without roles', () => {
    expect(entryWeights({ id: SQUAT }, () => null)).toEqual(musclesOf(EXIDX[SQUAT]))
  })
})
