import { beforeAll, describe, expect, it } from 'vitest'
import { WEEKLY_TARGET, groupCredit, groupSetsOf, groupSetsPerWeek, weeklyDone, weeklyNeed, variantHistory, pickForCoverage, rankForGaps } from './coverage.js'
import { generateWorkout, partGaps } from './generate.js'
import { EXIDX } from './exercises.js'
import { musclesOf } from './muscles.js'
import { variantOf } from './variant.js'
import { groupOfExercise } from './muscle-colors.js'
import { loadMuscleRoles, muscleRolesOf } from './muscle-roles.js'

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
    it('after pulldowns, a pull day opens on the mid back', () => {
      const st = state({ workouts: [session('2026-09-10', ['2330'])] })
      const [first] = generateWorkout(st, 'pull', { now: NOW })
      expect(targets(first)).toContain('middle-trap')
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
      expect(partGaps(st, ['shoulders'], now)).toEqual({ shoulders: ['rear-delt'] }) // presses help the side delt
      const shoulders = generateWorkout(st, 'full', { now, groups: ['shoulders'], count: 1 })
      expect(muscleRolesOf(shoulders[0].id).target).toContain('rear-delt')
    })
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
