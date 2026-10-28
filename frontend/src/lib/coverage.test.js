import { beforeAll, describe, expect, it } from 'vitest'
import { WEEKLY_TARGET, entryWeights, groupCredit, groupSetsOf, groupSetsPerWeek, groupSplitOf, groupSplitPerWeek, roundSplit, groupSetsOfWeeklyPlan, plannedSets, weeklyDone, weeklyNeed, variantHistory, pickForCoverage, rankForGaps, partsShort, spareParts, partSets, HELPED_PART, REPEAT, REPEAT_HINGE, EARLIER, slotMuscleOf, weeklyLack } from './coverage.js'
import { generateWorkout, partGaps } from './generate.js'
import { EXIDX, patternOf } from './exercises.js'
import { musclesOf } from './muscles.js'
import { variantOf } from './variant.js'
import { groupOfExercise } from './muscle-colors.js'
import { loadMuscleRoles, muscleRolesOf, roleWeights } from './muscle-roles.js'

const row = (patch = {}) => ({ w: 60, r: 8, done: true, ...patch })
const sets = n => Array.from({ length: n }, () => row())
const session = (d, ids, s = sets(3)) => ({ id: 'w' + d + ids.join(), d, name: 'x', entries: ids.map(id => ({ id, target: { reps: 8 }, sets: s })) })
const state = (over = {}) => ({ unit: 'kg', workouts: [], exWeights: {}, routines: [], ...over })
const at = (y, m, d) => new Date(y, m - 1, d, 12).getTime()
const NOW = at(2026, 9, 15)
const ALL = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'abs', 'quads', 'hamstrings', 'glutes', 'calves']
const credit = id => groupCredit(musclesOf(EXIDX[id]))
const groupsOf = picks => picks.map(p => groupOfExercise(EXIDX[p.id]))

// barbell bench press, dumbbell bench press, squat, deadlift, romanian deadlift, barbell shrug,
// dumbbell standing overhead press, cable lateral raise, pushdown
const BENCH = '0025', DB_BENCH = '0289', SQUAT = '0043', DEADLIFT = '0032', RDL = '0085', SHRUG = '0095'
const OHP = '0426', CABLE_RAISE = '0178', PUSHDOWN = '0241'

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
  it('a week of 10 effective sets leaves nothing, rested or not', () => {
    const tenSets = state({ workouts: [session('2026-09-09', [BENCH]), session('2026-09-10', [BENCH], sets(WEEKLY_TARGET))] })
    expect(weeklyNeed(tenSets, ['chest'], at(2026, 9, 16)).chest).toBe(0)
  })
  it('a group still fatigued needs less than its sets alone say', () => {
    const st = state({ workouts: [session('2026-09-14', [BENCH], sets(4))] })
    const need = weeklyNeed(st, ['chest', 'quads'], NOW)
    expect(need.quads).toBe(1)
    expect(need.chest).toBeLessThan(1 - 4 / WEEKLY_TARGET)
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

describe('pickForCoverage, a fresh week', () => {
  const fresh = generateWorkout(state(), 'full', { now: NOW })
  it('one exercise per group before any second, each on the group’s main muscle', () => {
    expect(fresh).toHaveLength(7)
    expect(new Set(groupsOf(fresh)).size).toBe(7)
    expect(groupsOf(fresh)).not.toContain('forearms')
  })
  it('the big compounds cover the groups it has no slot for', () => {
    const ids = fresh.map(p => p.id)
    expect(ids).toContain(SQUAT)
    const covered = {}
    for (const id of ids) for (const [g, c] of Object.entries(credit(id))) covered[g] = (covered[g] || 0) + c
    for (const g of ALL) expect(covered[g], g).toBeGreaterThan(0)
  })
  it('runs compounds first', () => {
    const helpers = p => Object.values(credit(p.id)).filter(c => c >= 0.4).length
    const compound = fresh.map(p => helpers(p) >= 3 && !['calves', 'forearms', 'abs'].includes(groupOfExercise(EXIDX[p.id])))
    expect(compound).toEqual(compound.slice().sort((a, b) => b - a))
  })
  it('then big groups before small ones: a wrist curl or a calf raise never runs before a bench', () => {
    // the curl and the calf raise credit three groups each, as the bench does; forearms are the most behind
    const cands = [{ id: '1412', rank: 0 }, { id: '1372', rank: 1 }, { id: '0757', rank: 2 }, { id: '0241', rank: 3 }]
    const groups = [...ALL, 'forearms']
    const picks = pickForCoverage(cands, { count: 4, groups, need: { ...Object.fromEntries(groups.map(g => [g, 0.5])), forearms: 1 } })
    // smith incline bench, pushdown, barbell calf raise, wrist curl
    expect(picks.map(p => p.id)).toEqual(['0757', '0241', '1372', '1412'])
  })
})

describe('pickForCoverage, after the week so far', () => {
  it('groups that had their week wait while others are open', () => {
    // a push day of 12 sets each, five days ago: rested but done for the week
    const st = state({ workouts: [session('2026-09-10', [BENCH, '0047', OHP, '1162', PUSHDOWN, '0814'], sets(6))] })
    const picks = generateWorkout(st, 'full', { now: NOW, count: 5 })
    expect(groupsOf(picks)).not.toContain('chest')
    expect(groupsOf(picks)).not.toContain('shoulders')
    expect(groupsOf(picks)).not.toContain('triceps')
  })
  it('the day after a bench session, chest waits for the rested groups', () => {
    const st = state({ workouts: [session('2026-09-14', [BENCH, DB_BENCH], sets(4))] })
    expect(groupsOf(generateWorkout(st, 'full', { now: NOW, count: 6 }))).not.toContain('chest')
  })
  it('the evening after a full body, every group gets one before any gets a second', () => {
    // Two full bodies, the second today: every group is tired, so every need is small, and only
    // back, biceps and hamstrings are just over the line. They took every slot (#program QA).
    const day = (d, m) => ({ id: d, d, name: 'x', entries: Object.entries(m).map(([id, n]) => ({ id, target: { reps: 10 }, sets: sets(n) })) })
    const st = state({ goals: { weeklySets: 15 }, workouts: [
      day('2026-09-11', { '0770': 3, '0811': 4, '0652': 3, [BENCH]: 4, [OHP]: 3, '0031': 4, '0274': 6, [PUSHDOWN]: 3 }),
      day('2026-09-15', { '0770': 3, '0585': 3, [DEADLIFT]: 3, '0027': 3, '0314': 3, '0091': 3, '0188': 3, '0061': 3, '0313': 3, '1385': 3 }),
    ] })
    // Seven groups can take one tonight; the eighth exercise is the first second, picked last.
    const picks = generateWorkout(st, 'full', { now: NOW + 9 * 36e5, count: 8 })
    const groups = groupsOf(picks)
    expect(new Set(groupsOf(picks.filter(p => p.at < 7))).size).toBe(7)
    expect(groups).toEqual(expect.arrayContaining(['quads', 'chest', 'shoulders', 'back', 'biceps', 'hamstrings']))
  })
  it('a group that has had its week waits until no other group can take one', () => {
    const cands = [SQUAT, BENCH, OHP, PUSHDOWN, '0031'].map((id, rank) => ({ id, rank }))
    const groups = ['chest', 'shoulders', 'triceps', 'biceps', 'quads']
    const picks = pickForCoverage(cands, { count: 4, groups, need: { chest: 0, shoulders: 0.05, triceps: 0.05, biceps: 0.5, quads: 0.3 } })
    expect(picks.map(p => p.id)).not.toContain(BENCH)
    expect(pickForCoverage(cands, { count: 5, groups, need: { chest: 0, shoulders: 0.05, triceps: 0.05, biceps: 0.5, quads: 0.3 } }).map(p => p.id)).toContain(BENCH)
  })
  // A program day's share (program.js dayShare): once every group has its exercise, the next one
  // goes to the group furthest short, not to whichever is next in line.
  it('past each group’s first, picks for the group furthest short of its share', () => {
    const ROW = '0027', PULLDOWN = '0198', CURL = '0031', HAMMER = '0313', CALF = '1372', DB_CALF = '0417'
    const cands = [ROW, PULLDOWN, CURL, HAMMER, CALF, DB_CALF].map((id, rank) => ({ id, rank }))
    const groups = ['back', 'biceps', 'calves']
    const need = { back: 0.5, biceps: 0.5, calves: 0.5 }
    const fourth = share => groupsOf(pickForCoverage(cands, { count: 4, groups, need, share }).filter(p => p.at === 3))[0]
    expect(fourth({ back: 9, biceps: 4, calves: 3 })).toBe('back')
    expect(fourth({ back: 3, biceps: 9, calves: 3 })).toBe('biceps')
  })
  it('still fills every slot when each group has had its week', () => {
    const st = state({ workouts: [session('2026-09-12', ['0652', BENCH, OHP, SQUAT, RDL, '0031', PUSHDOWN, '0175', '0605'], sets(12))] })
    expect(generateWorkout(st, 'full', { now: NOW })).toHaveLength(7)
  })
})

describe('variety', () => {
  const chestPick = st => generateWorkout(st, 'full', { now: NOW }).find(p => groupOfExercise(EXIDX[p.id]) === 'chest')
  it('after a flat barbell bench, chest moves to another position and another tool', () => {
    const v = variantOf(EXIDX[chestPick(state({ workouts: [session('2026-09-01', [BENCH])] })).id])
    expect(v.position).not.toBe('plain')
    expect(v.tool).not.toBe('barbell')
  })
  it('after a flat dumbbell bench, it moves to a barbell or the smith machine', () => {
    const v = variantOf(EXIDX[chestPick(state({ workouts: [session('2026-09-01', [DB_BENCH])] })).id])
    expect(v.position).not.toBe('plain')
    expect(v.tool).not.toBe('dumbbell')
  })
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
  it('presses rotate with presses: a raise never stands in for an overhead press', () => {
    // the dumbbell press was done last, so the cable raise is the staler tool; it is no press
    const history = variantHistory(state({ workouts: [session('2026-09-14', [OHP])] }))
    const [pick] = pickForCoverage([{ id: CABLE_RAISE, rank: 0 }, { id: OHP, rank: 1 }], { count: 1, groups: ['shoulders', 'triceps', 'chest'], need: { shoulders: 1, triceps: 1, chest: 1 }, history })
    expect(pick.id).toBe(OHP)
  })
  it('between equal variations, the exercise you know comes first', () => {
    const cands = [{ id: '0047', rank: 3 }, { id: '0314', rank: 1 }, { id: '0757', rank: 2 }]
    const [pick] = pickForCoverage(cands, { count: 1, groups: ['chest'], need: { chest: 1 } })
    expect(pick.id).toBe('0314')
  })
  it('a chest dip and a triceps dip are one dip: a session takes one of them', () => {
    // a push day: both dips first in line, a bench press and a pushdown behind them
    const cands = [{ id: '0251', rank: 0 }, { id: '0814', rank: 0 }, { id: '0025', rank: 1 }, { id: PUSHDOWN, rank: 1 }]
    const ids = pickForCoverage(cands, { count: 3, groups: ['chest', 'shoulders', 'triceps'], need: { chest: 1, shoulders: 1, triceps: 1 } }).map(p => p.id)
    expect(ids.filter(id => id === '0251' || id === '0814')).toHaveLength(1)
  })
})

describe('the parts of a muscle', () => {
  const FRONT = '0310', SIDE = '0334', REAR = '0378'
  const ROLES = { [FRONT]: { target: ['front-delt'] }, [SIDE]: { target: ['side-delt'] }, [REAR]: { target: ['rear-delt'] } }
  const rolesOf = id => ROLES[id] || null
  const raises = [{ id: FRONT, rank: 0 }, { id: SIDE, rank: 1 }, { id: REAR, rank: 2 }]
  const opts = { groups: ['shoulders'], need: { shoulders: 1 }, rolesOf }
  const pick = (workouts, cands = raises, o = {}) =>
    pickForCoverage(cands, { count: 1, ...opts, history: variantHistory(state({ workouts }), rolesOf), ...o })[0].id

  it('history keeps when each target muscle was last done, under its group', () => {
    const h = variantHistory(state({ workouts: [session('2026-09-01', [SIDE]), session('2026-09-08', [SIDE, FRONT])] }), rolesOf)
    expect(h.shoulders.part).toEqual({ 'side-delt': '2026-09-08', 'front-delt': '2026-09-08' })
  })
  it('the part done longest ago comes first, ahead of the exercise you know', () => {
    expect(pick([])).toBe(FRONT)
    expect(pick([session('2026-09-01', [REAR]), session('2026-09-08', [FRONT])])).toBe(SIDE)
    expect(pick([session('2026-09-01', [SIDE]), session('2026-09-08', [FRONT])])).toBe(REAR)
  })
  it('a second exercise for the group in one session is for another part', () => {
    const cands = [{ id: SIDE, rank: 0 }, { id: CABLE_RAISE, rank: 1 }, { id: REAR, rank: 2 }]
    const ids = o => pickForCoverage(cands, { count: 2, ...opts, ...o }).map(p => p.id).sort()
    expect(ids({ rolesOf: id => (id === CABLE_RAISE ? ROLES[SIDE] : rolesOf(id)) })).toEqual([SIDE, REAR].sort())
    // Without roles, only the tool rotates: two side raises.
    expect(ids({ rolesOf: () => null })).toEqual([SIDE, CABLE_RAISE].sort())
  })
  it('parts only decide when every exercise in the running has roles', () => {
    const someRoles = id => (id === FRONT ? null : ROLES[id] || null)
    const workouts = [session('2026-09-08', [SIDE])]
    // Without the front raise's roles the parts say nothing: the exercise you know comes first.
    expect(pick(workouts, raises, { rolesOf: someRoles, history: variantHistory(state({ workouts }), someRoles) })).toBe(FRONT)
    expect(pick(workouts, raises.slice(1))).toBe(REAR)
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

describe('anchor: one compound from the named groups', () => {
  const cands = [SQUAT, BENCH, OHP, PUSHDOWN].map((id, rank) => ({ id, rank }))
  const groups = ['chest', 'shoulders', 'triceps', 'quads', 'glutes', 'hamstrings']
  const need = { chest: 1, shoulders: 1, triceps: 1, quads: 0, glutes: 0, hamstrings: 0 }
  const ids = o => pickForCoverage(cands, { count: 3, groups, need, ...o }).map(p => p.id)

  it('legs that had their week wait, unless the session is anchored on them', () => {
    expect(ids()).not.toContain(SQUAT)
    const picks = ids({ anchor: ['quads', 'glutes', 'hamstrings'] })
    expect(picks).toContain(SQUAT)
    expect(picks[0]).toBe(SQUAT)   // and it runs first
    expect(picks).toContain(BENCH) // the slot it takes is the last one
  })
  it('changes nothing when a pick already meets it, or nothing can', () => {
    const fresh = { ...need, quads: 1 }
    expect(ids({ need: fresh, anchor: ['quads'] })).toEqual(ids({ need: fresh }))
    expect(ids({ anchor: ['calves'] })).toEqual(ids())
  })
  it('an isolation lift does not meet it', () => {
    const picks = pickForCoverage([{ id: '0586', rank: 0 }, ...cands], { count: 3, groups, need: { ...need, hamstrings: 1 }, anchor: ['quads', 'hamstrings'] })
    expect(picks.map(p => p.id)).toContain(SQUAT)
  })
  it('a full body keeps a lower-body compound after two leg-heavy sessions', () => {
    let st = state()
    for (const d of [5, 7]) {
      const ids = generateWorkout(st, 'full', { now: at(2026, 10, d) }).map(p => p.id)
      st = state({ workouts: [...st.workouts, session(`2026-10-0${d}`, ids)] })
    }
    const fri = generateWorkout(st, 'full', { now: at(2026, 10, 9) })
    expect(fri.some(p => ['quads', 'glutes', 'hamstrings'].includes(groupOfExercise(EXIDX[p.id]))
      && Object.values(credit(p.id)).filter(c => c >= 0.4).length >= 3)).toBe(true)
  })
})

describe('one movement once', () => {
  beforeAll(loadMuscleRoles)
  // dumbbell romanian deadlift (a glutes exercise), barbell stiff legged deadlift (a hamstrings
  // one), smith squat, dumbbell bulgarian split squat, lever lying leg curl, barbell hip thrust
  const DB_RDL = '1459', SLDL = '1543', SMITH_SQUAT = '0770', SPLIT = '2290', CURL = '0586', THRUST = '1409'
  const groups = ['quads', 'glutes', 'hamstrings']
  // a week where squats covered the quads but no hinge was done yet
  const need = { quads: 0.6, glutes: 0.32, hamstrings: 0.34 }
  const ids = (cands, count = 3) => pickForCoverage(cands.map((id, rank) => ({ id, rank })), { count, groups, need }).map(p => p.id)

  it('two hinges filed under different groups are still one movement', () => {
    expect(muscleRolesOf(DB_RDL).target).toEqual(muscleRolesOf(SLDL).target)
    const picks = ids([SMITH_SQUAT, DB_RDL, SLDL, CURL])
    expect(picks.filter(id => id === DB_RDL || id === SLDL)).toHaveLength(1)
    expect(picks).toContain(CURL)
  })
  it('nor two squats', () => {
    expect(ids([SMITH_SQUAT, SPLIT, DB_RDL, CURL]).filter(id => id === SMITH_SQUAT || id === SPLIT)).toHaveLength(1)
  })
  it('the same movement again only when nothing else is left', () => {
    expect(ids([DB_RDL, SLDL], 2)).toHaveLength(2)
  })
  it('one shrug: isolation lifts for the same part of a group are one movement', () => {
    // An 8-exercise pull day was four shrugs, a barbell, dumbbell, cable and lever one.
    const pull = generateWorkout(state(), 'pull', { count: 8, now: NOW }).map(p => EXIDX[p.id].n)
    expect(pull.filter(n => /shrug/i.test(n))).toHaveLength(1)
    expect(pull.filter(n => /row|pull-?up|pulldown/i.test(n)).length).toBeGreaterThanOrEqual(3)
  })
})

describe('balanced movements', () => {
  beforeAll(loadMuscleRoles)
  // pull-up, barbell bent over row; the push is picked first, the back being less behind
  const PULLUP = '0652', ROW = '0027'
  const ids = (push, cands) => pickForCoverage([push, ...cands].map((id, rank) => ({ id, rank })),
    { count: 2, groups: ['chest', 'shoulders', 'back'], need: { chest: 1, shoulders: 1, back: 0.6 } }).map(p => p.id)

  it('pulls the way the session pushes: a row after a bench press, a pull-up after an overhead press', () => {
    expect(ids(BENCH, [PULLUP, ROW])).toEqual(expect.arrayContaining([BENCH, ROW]))
    expect(ids(OHP, [ROW, PULLUP])).toEqual(expect.arrayContaining([OHP, PULLUP]))
  })
})

describe('calves, forearms and abs', () => {
  // barbell standing, seated and floor calf raises, lever and dumbbell standing calf raises
  const CALF = ['1372', '0088', '1370', '0605', '0417']
  const groups = ['quads', 'glutes', 'hamstrings', 'calves']
  const CURL = '0586' // lever lying leg curl
  const cands = [...CALF, SQUAT, RDL, CURL].map((id, rank) => ({ id, rank }))

  it('a calf raise credited to three groups is no compound', () => {
    expect(Object.values(credit('1372')).filter(c => c >= 0.4).length).toBeGreaterThanOrEqual(3)
    // so it rotates with the other calf raises: after the barbell ones, a machine or dumbbell one
    const history = variantHistory(state({ workouts: [session('2026-09-08', ['1372']), session('2026-09-12', ['0088'])] }))
    const [pick] = pickForCoverage(cands, { count: 1, groups, need: { calves: 1 }, history })
    expect(['0605', '0417']).toContain(pick.id)
  })
  it('take one exercise while the tired big groups wait, then the big groups come back', () => {
    // a legs day three days after the last: the thighs are under rested, only the calves are open
    const picks = pickForCoverage(cands, { count: 4, groups, need: { quads: 0.05, glutes: 0.05, hamstrings: 0.05, calves: 1 } })
    expect(picks.filter(p => p.group === 'calves')).toHaveLength(1)
    expect(picks.map(p => p.id)).toEqual(expect.arrayContaining([SQUAT, RDL, CURL]))
  })
  it('take more only when nothing else is left', () => {
    const picks = pickForCoverage(cands, { count: 5, groups, need: { quads: 0.05, glutes: 0.05, hamstrings: 0.05, calves: 1 } })
    expect(picks).toHaveLength(5)
    expect(picks.filter(p => p.group === 'calves')).toHaveLength(2)
    expect(picks.slice(0, 2).map(p => p.id).sort()).toEqual([SQUAT, RDL].sort())  // and the compounds run first
  })
})

describe('gaps: the part of a group the last two weeks left out', () => {
  const ROLES = { [OHP]: { target: ['front-delt'], synergists: ['side-delt'] }, [CABLE_RAISE]: { target: ['side-delt'] } }
  const rolesOf = id => ROLES[id] || null
  const cands = [{ id: OHP, rank: 0 }, { id: CABLE_RAISE, rank: 1 }]
  const opts = { groups: ['shoulders', 'triceps', 'chest'], need: { shoulders: 1, triceps: 1, chest: 1 }, rolesOf }

  it('an exercise for the missing part takes the group’s slot, isolation or not', () => {
    expect(pickForCoverage(cands, { count: 1, ...opts })[0].id).toBe(OHP)
    expect(pickForCoverage(cands, { count: 1, ...opts, gaps: { shoulders: ['side-delt'] } })[0].id).toBe(CABLE_RAISE)
  })
  it('one is enough: a second shoulder exercise goes back to the best gain', () => {
    const picks = pickForCoverage(cands, { count: 2, ...opts, groups: ['shoulders'], need: { shoulders: 1 }, gaps: { shoulders: ['side-delt'] } })
    expect(picks.map(p => p.id).sort()).toEqual([OHP, CABLE_RAISE].sort())
  })
  it('a gap in a group that is not picked adds nothing', () => {
    const picks = pickForCoverage([{ id: BENCH, rank: 0 }, ...cands], { count: 1, ...opts, need: { chest: 1, shoulders: 0, triceps: 0 }, gaps: { shoulders: ['side-delt'] } })
    expect(picks.map(p => p.id)).toEqual([BENCH])
  })

  describe('with the catalogue roles', () => {
    beforeAll(loadMuscleRoles)
    it('after two weeks of presses, the shoulder exercise is for the rear delts', () => {
      const days = ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12']
      const st = state({ workouts: days.map(d => session(d, [OHP, BENCH])) })
      const now = at(2026, 10, 14)
      // both short of their minimum this week, the rear delts most: presses help the side delts
      expect(partGaps(st, ['shoulders'], now)).toEqual({ shoulders: ['rear-delt', 'side-delt'] })
      const shoulders = generateWorkout(st, 'full', { now, groups: ['shoulders'], count: 1 })
      expect(muscleRolesOf(shoulders[0].id).target).toContain('rear-delt')
    })
    it('the side delts a press only helped are not trained: after presses and rear flies, a side-delt lift', () => {
      // 3 sets of presses and a bench press helped the side delts; 2 of rear flies targeted the rear
      const st = state({ workouts: [session('2026-10-19', [OHP, BENCH]), session('2026-10-20', ['0378'], sets(2))] })
      const now = at(2026, 10, 22)
      expect(partGaps(st, ['shoulders'], now)).toEqual({ shoulders: ['side-delt', 'rear-delt'] })
      const shoulders = generateWorkout(st, 'full', { now, groups: ['shoulders'], count: 1 })
      expect(muscleRolesOf(shoulders[0].id).target).toContain('side-delt')
    })
  })
})

describe('the spare slot: a part short of its minimum, not a second curl', () => {
  const CURL = '0031', HAMMER = '0313', ROW = '0027'
  const ROLES = { [CURL]: { target: ['biceps'] }, [HAMMER]: { target: ['brachialis'] }, [ROW]: { target: ['lats'] }, [SHRUG]: { target: ['upper-trap'] } }
  const rolesOf = id => ROLES[id] || null
  const opts = { count: 3, groups: ['biceps', 'back'], need: { biceps: 1, back: 1 }, share: { biceps: 6, back: 6 }, rolesOf }
  const ids = picks => picks.map(p => p.id).sort()
  const TRAPS = { group: 'back', name: 'Upper traps', muscles: ['upper-trap'] }

  it('without a part short, the leftover slot fills the share furthest short', () => {
    const cands = [CURL, ROW, HAMMER, SHRUG].map((id, rank) => ({ id, rank }))
    expect(ids(pickForCoverage(cands, opts))).toEqual([CURL, ROW, HAMMER].sort())
  })
  it('with the upper traps short, it goes to a shrug', () => {
    const cands = [CURL, ROW, HAMMER, SHRUG].map((id, rank) => ({ id, rank }))
    expect(ids(pickForCoverage(cands, { ...opts, spare: [TRAPS] }))).toEqual([CURL, ROW, SHRUG].sort())
  })
  it('one slot a day: the next goes back to the shares', () => {
    const cands = [CURL, ROW, HAMMER, SHRUG].map((id, rank) => ({ id, rank }))
    expect(ids(pickForCoverage(cands, { ...opts, count: 4, spare: [TRAPS] }))).toEqual([CURL, ROW, SHRUG, HAMMER].sort())
  })
  it('a part the day already targets is passed over for the next', () => {
    const cands = [CURL, ROW, HAMMER, SHRUG].map((id, rank) => ({ id, rank }))
    const lats = { group: 'back', name: 'Lats', muscles: ['lats'] }
    expect(ids(pickForCoverage(cands, { ...opts, spare: [lats, TRAPS] }))).toEqual([CURL, ROW, SHRUG].sort())
  })
  it('a group already at its share gets no spare slot: the row gave the back its 3 sets', () => {
    const cands = [CURL, ROW, HAMMER, SHRUG].map((id, rank) => ({ id, rank }))
    expect(ids(pickForCoverage(cands, { ...opts, share: { biceps: 6, back: 3 }, spare: [TRAPS] }))).toEqual([CURL, ROW, HAMMER].sort())
  })
  it('`spareOnly` lifts are for that slot alone', () => {
    const cands = [CURL, ROW, HAMMER].map((id, rank) => ({ id, rank }))
    const spareOnly = [{ id: SHRUG, rank: 100 }]
    expect(ids(pickForCoverage(cands, { ...opts, spare: [TRAPS], spareOnly }))).toEqual([CURL, ROW, SHRUG].sort())
    expect(ids(pickForCoverage(cands, { ...opts, count: 4, spareOnly }))).not.toContain(SHRUG)
  })

  describe('with the catalogue roles', () => {
    beforeAll(loadMuscleRoles)
    it('a new week starts with the parts the last two weeks gave least: not the front delts presses trained', () => {
      const st = state({ workouts: [session('2026-10-05', [OHP, BENCH]), session('2026-10-08', [OHP])] })
      const now = at(2026, 10, 15)
      const short = partsShort(st, ['shoulders'], now).shoulders
      expect(short.map(p => p.sets)).toEqual([0, 0, 0])
      expect(short[2].name).toBe('Front delts')
      expect(spareParts(st, ['shoulders'], now).at(-1).name).toBe('Front delts')
    })
    it('a program day takes a shrug for the upper traps no back exercise trained', () => {
      const days = ['2026-10-12', '2026-10-14']
      const st = state({ workouts: days.map(d => session(d, [ROW, CURL])) })
      const now = at(2026, 10, 16)
      expect(spareParts(st, ['back', 'biceps'], now)[0].name).toBe('Upper traps')
      const picks = generateWorkout(st, 'full', { now, groups: ['back', 'biceps'], count: 3, share: { back: 6, biceps: 6 } })
      expect(picks.map(p => muscleRolesOf(p.id)?.target || []).flat()).toContain('upper-trap')
    })
  })
})

describe('rotation: the last session’s lifts give way', () => {
  beforeAll(loadMuscleRoles)
  const LUNGE = '0054'
  const opts = { count: 1, groups: ['hamstrings', 'glutes', 'quads'], need: { hamstrings: 1, glutes: 1, quads: 1 } }
  const cands = [DEADLIFT, LUNGE].map((id, rank) => ({ id, rank }))
  it('a deadlift that covers more still gives way to a lunge the day after it', () => {
    expect(pickForCoverage(cands, opts)[0].id).toBe(DEADLIFT)
    expect(pickForCoverage(cands, { ...opts, recent: [DEADLIFT] })[0].id).toBe(LUNGE)
  })
  it('a hinge gives way more: two deadlift days in a row are hard on the back', () => {
    expect(REPEAT_HINGE).toBeLessThan(REPEAT)
    expect(REPEAT).toBeLessThan(EARLIER)
    expect(EARLIER).toBeLessThan(1)
  })
  // Three full-body days a week swung between two lifts for a group: the one the session before
  // last did came straight back (a power clean, a snatch pull, a power clean).
  it('the sessions before the last count too: a squat two days back gives way to a front squat', () => {
    const FRONT = '0042', q = { count: 1, groups: ['quads'], need: { quads: 1 } }
    const cands = [SQUAT, FRONT].map((id, rank) => ({ id, rank }))
    expect(pickForCoverage(cands, q)[0].id).toBe(SQUAT)
    expect(pickForCoverage(cands, { ...q, earlier: [SQUAT] })[0].id).toBe(FRONT)
  })
  it('a lift done lately loses a near tie: the dumbbell bench after the barbell one', () => {
    const ch = { count: 1, groups: ['chest'], need: { chest: 1 } }
    const cands = [BENCH, DB_BENCH].map((id, rank) => ({ id, rank }))
    expect(pickForCoverage(cands, ch)[0].id).toBe(BENCH)
    expect(pickForCoverage(cands, { ...ch, earlier: [BENCH] })[0].id).toBe(DB_BENCH)
  })
})

describe('a compound rotates among the ones you have logged', () => {
  beforeAll(loadMuscleRoles)
  // Never done is the stalest variation of all: a squat you only starred took the place of the
  // one you train every time it came round.
  it('the front squat you train, not the back squat you have never done', () => {
    const FRONT = '0042', q = { count: 1, groups: ['quads'], need: { quads: 1 } }
    const cands = [SQUAT, FRONT].map((id, rank) => ({ id, rank }))
    expect(pickForCoverage(cands, q)[0].id).toBe(SQUAT)
    expect(pickForCoverage(cands, { ...q, known: [FRONT] })[0].id).toBe(FRONT)
    expect(pickForCoverage(cands, { ...q, known: [SQUAT] })[0].id).toBe(SQUAT)
  })
})

describe('a glute lift waits for the day’s squat', () => {
  beforeAll(loadMuscleRoles)
  const HIP_THRUST = '1060', anchor = ['quads', 'hamstrings', 'glutes']
  const cands = [HIP_THRUST, SQUAT, BENCH].map((id, rank) => ({ id, rank }))
  const opts = { count: 3, groups: ['glutes', 'quads', 'chest'], need: { quads: 1, glutes: 1, chest: 1 }, anchor }
  // A hip thrust every day of a full-body week, on top of the squat that had already given the
  // glutes their sets.
  it('none once the squat has given the glutes their share', () => {
    const ids = pickForCoverage(cands, { ...opts, share: { quads: 3, glutes: 2, chest: 3 } }).map(p => p.id)
    expect(ids).toContain(SQUAT)
    expect(ids).not.toContain(HIP_THRUST)
  })
  it('one when the glutes are still short of it', () => {
    const ids = pickForCoverage(cands, { ...opts, share: { quads: 3, glutes: 9, chest: 3 } }).map(p => p.id)
    expect(ids.indexOf(SQUAT)).toBeLessThan(ids.indexOf(HIP_THRUST))
  })
})

describe('a leg isolation waits for the lower-body compound', () => {
  beforeAll(loadMuscleRoles)
  const HIP_THRUST = '1060', ABDUCTION = '1034'
  // The side glutes are the gap: picked first, the abduction left the anchor rule to add a hip
  // thrust in the chest's place.
  it('a hip abduction for a side-glute gap comes after the hip thrust, not in the chest’s place', () => {
    const cands = [HIP_THRUST, ABDUCTION, BENCH, SQUAT, RDL].map((id, rank) => ({ id, rank }))
    const picks = pickForCoverage(cands, { count: 2, groups: ['glutes', 'chest'], need: { glutes: 1, chest: 1 },
      anchor: ['quads', 'hamstrings', 'glutes'], gaps: { glutes: ['glute-med'] } })
    expect(picks.map(p => p.id)).toEqual([HIP_THRUST, BENCH])
  })
})

describe('weeklyLack', () => {
  beforeAll(loadMuscleRoles)
  // Counted in, the delts the presses and rows had already given their week still lacked a lift
  // each: 21 shoulder sets of 15.
  it('what is left of the goal; a part short of its minimum adds nothing', () => {
    const st = state({ workouts: [session('2026-10-19', [OHP], sets(12))] })
    const now = at(2026, 10, 22)
    expect(partsShort(st, ['shoulders'], now).shoulders.map(p => p.name)).toContain('Side delts')
    expect(weeklyLack(st, ['shoulders'], now)).toEqual({ shoulders: 0 })
  })
})

describe('filling a share', () => {
  beforeAll(loadMuscleRoles)
  // Shrugs credit the back a quarter a set: three of them are no back exercise, and a back short
  // of its share after a row gets nothing from them but a slot the biceps needed.
  // Two curls were one movement twice; the first now takes the sets the second would have.
  it('gives a lift its room before a second of the same movement: two more sets of the curl, no second curl', () => {
    const cands = ['0027', SHRUG, '0031', '0294'].map((id, rank) => ({ id, rank }))
    const picks = pickForCoverage(cands, { count: 3, groups: ['back', 'biceps'], need: { back: 1, biceps: 1 },
      share: { back: 8, biceps: 8 }, gaps: { back: ['upper-trap'] }, roomOf: () => 5 })
    expect(picks.map(p => p.id)).not.toContain('0294')
    expect(picks.find(p => p.id === '0031').extra).toBe(2)
    expect(picks.find(p => p.id === '0027').extra).toBe(2)
  })
  // A day of the program took a smith squat and a hack squat, a barbell row and a cable row: the
  // same movement on another tool, when the first could take more sets.
  it('never takes a second compound of the same movement: one squat, one row', () => {
    const squats = [SQUAT, '0770', '0743', '0586'].map((id, rank) => ({ id, rank }))
    const legs = pickForCoverage(squats, { count: 3, groups: ['quads', 'hamstrings'], need: { quads: 1, hamstrings: 1 },
      share: { quads: 10, hamstrings: 3 }, first: SQUAT })
    expect(legs.filter(p => patternOf(EXIDX[p.id]) === 'squat')).toHaveLength(1)
    const rows = ['0027', '0861', '0031'].map((id, rank) => ({ id, rank }))
    const back = pickForCoverage(rows, { count: 3, groups: ['back', 'biceps'], need: { back: 1, biceps: 1 }, share: { back: 10, biceps: 3 } })
    expect(back.filter(p => patternOf(EXIDX[p.id]) === 'pull-horizontal')).toHaveLength(1)
  })
  // Four days of nine took two ab lifts: filling the abs' share skipped their one-lift rule.
  it('a small group keeps to one lift on a day with a share: more sets of the crunch, no sit-up after it', () => {
    const cands = [BENCH, '0175', '0736', '0274', '3449'].map((id, rank) => ({ id, rank }))
    const picks = pickForCoverage(cands, { count: 5, groups: ['chest', 'abs'], need: { chest: 1, abs: 1 },
      share: { chest: 3, abs: 8 }, roomOf: () => 5 })
    expect(picks.filter(p => p.id !== BENCH)).toHaveLength(1)
    expect(picks.find(p => p.id !== BENCH).extra).toBe(2)
  })
  it('takes no room past what a lift has: the default keeps every lift to its sets', () => {
    const cands = ['0027', '0031'].map((id, rank) => ({ id, rank }))
    const picks = pickForCoverage(cands, { count: 2, groups: ['back', 'biceps'], need: { back: 1, biceps: 1 }, share: { back: 8, biceps: 8 } })
    expect(picks.every(p => p.extra === 0)).toBe(true)
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

describe('rotation order: part, helpers, tool, then position', () => {
  const SIDE = '0334', CABLE_FRONT = '0162', STANDING = '2234', SIDE_LYING = '2924', REAR_LYING = '4832', SEATED = '9933'
  const pick = (ids, workouts, rolesOf = () => null) => pickForCoverage(ids.map((id, rank) => ({ id, rank })),
    { count: 1, groups: ['shoulders'], need: { shoulders: 1 }, rolesOf, history: variantHistory(state({ workouts }), rolesOf) })[0].id

  it('helpers done longest ago win over the tool', () => {
    const ROLES = { [SIDE]: { target: ['side-delt'], synergists: ['supraspinatus'] },
      [CABLE_RAISE]: { target: ['side-delt'], synergists: ['upper-trap'] }, [CABLE_FRONT]: { target: ['front-delt'], synergists: ['supraspinatus'] } }
    const workouts = [session('2026-09-01', [SIDE]), session('2026-09-08', [CABLE_FRONT])]
    // by tool the dumbbell raise is staler; its helpers came back a week later on the cable
    expect(pick([SIDE, CABLE_RAISE], workouts, id => ROLES[id] || null)).toBe(CABLE_RAISE)
  })
  it('the tool comes before the position', () => {
    const workouts = [session('2026-09-01', [SIDE_LYING]), session('2026-09-08', [REAR_LYING])]
    expect(pick([STANDING, SIDE_LYING], workouts)).toBe(SIDE_LYING)
  })
  it('on the same tool, the position done longest ago comes back', () => {
    expect(pick([STANDING, SEATED], [session('2026-09-08', [STANDING])])).toBe(SEATED)
    expect(pick([STANDING, SEATED], [session('2026-09-08', [SEATED])])).toBe(STANDING)
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
