import { beforeAll, describe, expect, it } from 'vitest'
import { GEN_TYPES, STAPLES, trainingIndex, candidatesFor, isSkill, isOlympic, lastSessionIds, recentSessionIds, generateWorkout, generatedEntries, genDefaults, genCount, genScheme, GEN_SCHEME, withSessionRest, sessionConfig, leadFor, genGroupsOf } from './generate.js'
import { liftKind } from './coverage.js'
import { EXIDX, patternOf } from './exercises.js'
import { isWarmupRow } from './workout-model.js'
import { groupOfExercise } from './muscle-colors.js'
import { loadMuscleRoles, muscleRolesOf } from './muscle-roles.js'

const row = (patch = {}) => ({ w: 60, r: 8, done: true, ...patch })
const session = (d, ids, sets = [row()]) => ({ id: 'w' + d + ids.join(), d, name: 'x', entries: ids.map(id => ({ id, target: { reps: 8 }, sets })) })
const state = (over = {}) => ({ unit: 'kg', workouts: [], exWeights: {}, routines: [], ...over })
const sets = n => Array.from({ length: n }, () => row())
const NOW = new Date(2026, 8, 15, 12).getTime()

// bench press (chest), lat pulldown (upper back), standing overhead press (shoulders), squat
// (quads), barbell curl (biceps), pushdown (triceps), lying leg curl (hamstrings)
const BENCH = '0025', PULLDOWN = '2330', OHP = '0426', SQUAT = '0043', CURL = '0031', PUSHDOWN = '0241', LEGCURL = '0586'

describe('staples', () => {
  it('every staple is a catalogue exercise', () => {
    for (const [slug, ids] of Object.entries(STAPLES)) {
      for (const id of ids) expect(EXIDX[id], `${slug} ${id}`).toBeTruthy()
    }
  })
  it('every muscle a day type names has staples', () => {
    const slugs = new Set(Object.values(GEN_TYPES).flat().flatMap(([spec]) => spec.split('|')))
    for (const slug of slugs) expect(STAPLES[slug]?.length, slug).toBeGreaterThan(1)
  })
  it('a hamstring staple works the hamstrings: a good morning is a second hinge, not a leg curl', async () => {
    await loadMuscleRoles()
    for (const id of STAPLES.hamstring) expect(muscleRolesOf(id)?.target, id).not.toContain('erector-spinae')
  })
  it('the quads have more than one isolation lift to rotate through', () => {
    expect(STAPLES.quadriceps.filter(id => liftKind(id) === 'isolation').length).toBeGreaterThan(1)
  })
})

describe('trainingIndex', () => {
  it('keeps the latest day each muscle and exercise was trained', () => {
    const { muscles, exercises } = trainingIndex(state({ workouts: [session('2026-09-01', [BENCH]), session('2026-09-10', [BENCH, SQUAT])] }))
    expect(muscles.chest).toBe('2026-09-10')
    expect(muscles.quadriceps).toBe('2026-09-10')
    expect(exercises[BENCH]).toEqual({ d: '2026-09-10', n: 2 })
  })
  it('ignores warm-ups, unticked sets, and muscles only working in support', () => {
    const { muscles } = trainingIndex(state({ workouts: [
      session('2026-09-01', [SQUAT], [row({ done: false })]),
      session('2026-09-02', [CURL], [row({ warmup: true })]),
      session('2026-09-03', [BENCH]),
    ] }))
    expect(muscles.quadriceps).toBeUndefined()
    expect(muscles.biceps).toBeUndefined()
    // bench works the front delts as a helper; that does not count as a shoulder session
    expect(muscles.deltoids).toBeUndefined()
  })
})

describe('candidatesFor', () => {
  it('offers exercises you have logged first, longest ago first, then the staples', () => {
    const st = state({ workouts: [session('2026-09-01', ['0289']), session('2026-09-10', [BENCH])] })
    const list = candidatesFor(st, 'chest')
    expect(list.slice(0, 2)).toEqual(['0289', BENCH])
    expect(list.slice(2)).toEqual(STAPLES.chest.filter(id => id !== BENCH && id !== '0289'))
  })
  it('offers what you starred after what you logged and before the staples', () => {
    const FLY = '0308'   // a chest staple, starred: it moves up, once
    const st = state({ workouts: [session('2026-09-10', [BENCH])], favEx: ['1269', FLY, CURL] })   // 1269: a cable crossover
    const list = candidatesFor(st, 'chest')
    expect(list.slice(0, 3)).toEqual([BENCH, '1269', FLY])
    expect(list.filter(id => id === FLY)).toHaveLength(1)
    // a starred curl is no chest lift
    expect(list).not.toContain(CURL)
  })
  it('leaves out what the active equipment profile cannot do', () => {
    const st = state({ equipFilterOn: true, equipProfiles: [{ id: 'p', name: 'Home', equipment: ['dumbbell', 'bench'], accV: 1 }], activeEquipId: 'p' })
    const list = candidatesFor(st, 'chest')
    expect(list).not.toContain(BENCH)
    expect(list).toContain('0289')
  })
  describe('with muscle roles', () => {
    beforeAll(loadMuscleRoles)
    // The catalogue files a handstand push-up under the triceps; it is aimed at the front delts.
    it('offers a lift for the slot of the muscle it is aimed at: a handstand push-up is a shoulder lift', () => {
      const HSPU = '0471'
      const st = state({ favEx: [HSPU] })
      expect(candidatesFor(st, 'deltoids')).toContain(HSPU)
      expect(candidatesFor(st, 'triceps')).not.toContain(HSPU)
    })
  })
  it('tells a skill from a lift', () => {
    expect(isSkill(EXIDX['0471'])).toBe(true)   // handstand push-up
    expect(isSkill(EXIDX['0426'])).toBe(false)  // dumbbell standing overhead press
  })
})

describe('olympic lifts', () => {
  const POWER_CLEAN = '0648', SNATCH_PULL = '0776'
  // Starred, they led nearly every full-body day: they train so many groups at once that they
  // outscored the squat and deadlift you actually do.
  it('a starred one is not offered until you have logged it', () => {
    const fav = state({ favEx: [POWER_CLEAN, SNATCH_PULL] })
    const all = st => ['quadriceps', 'hamstring', 'gluteal', 'upper-back', 'trapezius'].flatMap(m => candidatesFor(st, m))
    expect(all(fav)).not.toContain(POWER_CLEAN)
    expect(all(fav)).not.toContain(SNATCH_PULL)
    const done = state({ favEx: [POWER_CLEAN], workouts: [session('2026-09-10', [POWER_CLEAN])] })
    expect(all(done)).toContain(POWER_CLEAN)
  })
  it('tells a clean from a clean-grip front squat', () => {
    expect(isOlympic(EXIDX[POWER_CLEAN])).toBe(true)
    expect(isOlympic(EXIDX[SNATCH_PULL])).toBe(true)
    expect(isOlympic(EXIDX['0029'])).toBe(false)  // barbell clean-grip front squat
    expect(isOlympic(EXIDX['4862'])).toBe(false)  // barbell standing snatch grip shrug
  })
})

describe('recentSessionIds', () => {
  const NOW = new Date(2026, 8, 16, 12).getTime()
  it('the last few strength sessions before now, latest first', () => {
    const st = state({ workouts: [session('2026-09-10', ['0025']), session('2026-09-14', ['0043']), session('2026-09-12', ['0652']),
      session('2026-09-08', ['0085']), session('2026-09-20', ['0032'])] })
    expect(recentSessionIds(st, NOW)).toEqual([['0043'], ['0652'], ['0025']])
    expect(recentSessionIds(st, NOW, 1)).toEqual([['0043']])
  })
})

describe('lastSessionIds', () => {
  const NOW = new Date(2026, 8, 16, 12).getTime()
  it('the lifts of the last strength session before now', () => {
    const st = state({ workouts: [session('2026-09-10', ['0025']), session('2026-09-14', ['0043', '0085']), session('2026-09-12', ['0652'])] })
    expect(lastSessionIds(st, NOW)).toEqual(['0043', '0085'])
  })
  it('not one planned for later, nor an empty one; none at all is no lifts', () => {
    const st = state({ workouts: [session('2026-09-14', ['0043']), session('2026-09-20', ['0025']), { id: 'e', d: '2026-09-15', entries: [] }] })
    expect(lastSessionIds(st, NOW)).toEqual(['0043'])
    expect(lastSessionIds(state(), NOW)).toEqual([])
  })
})

describe('generateWorkout', () => {
  it('builds every day type with the slot counts it promises', () => {
    for (const [type, slots] of Object.entries(GEN_TYPES)) {
      const picks = generateWorkout(state(), type)
      expect(picks, type).toHaveLength(slots.reduce((n, [, c]) => n + c, 0))
      expect(new Set(picks.map(p => p.id)).size, type).toBe(picks.length)
    }
  })
  it('a muscle trained this week waits for the ones that were not', () => {
    const st = state({ workouts: [session('2026-09-14', [BENCH], sets(5))] })
    const picks = generateWorkout(st, 'push', { count: 2, now: NOW })
    expect(picks.map(p => p.muscle)).not.toContain('chest')
    expect(picks.every(p => p.last === null)).toBe(true)
  })
  it('a pick carries its muscle and when that muscle was last trained', () => {
    const st = state({ workouts: [session('2026-09-01', [BENCH])] })
    const chest = generateWorkout(st, 'push', { now: NOW }).find(p => p.muscle === 'chest')
    expect(chest.last).toBe('2026-09-01')
  })
  it('a shift picks different exercises', () => {
    const a = generateWorkout(state(), 'legs').map(p => p.id)
    const b = generateWorkout(state(), 'legs', { shift: 1 }).map(p => p.id)
    expect(b).not.toEqual(a)
    expect(new Set(b).size).toBe(b.length)
  })
  it('a program day leads with the squat you know and rotates the rest as any one-tap day does', () => {
    // a smith squat, a barbell row and an incline dumbbell press last week; a fresh week now
    const st = state({ workouts: [session('2026-09-03', ['0770', '0027', '0314'], sets(3))] })
    const off = generateWorkout(st, 'full', { now: NOW })
    const on = generateWorkout({ ...st, program: { days: ['full', 'full', 'full'], startedAt: '2026-09-01', weeks: 8 } }, 'full', { now: NOW })
    expect(on.map(p => p.id)).toEqual(off.map(p => p.id))
    expect(on[0]).toMatchObject({ id: '0770', slot: 'lead' })
    expect(on.map(p => p.id)).not.toContain('0027')
  })
  it('the day leads with its turn’s movement, the lift of it you logged most', () => {
    const smith = '0770', back = '0032'
    const st = state({ workouts: [session('2026-08-20', [smith, BENCH], sets(3)), session('2026-08-24', [smith, back], sets(3)), session('2026-08-27', [SQUAT], sets(3))],
      program: { days: ['full', 'full', 'full'], startedAt: '2026-09-14', weeks: 8 } })
    expect(leadFor(st, 'full', genGroupsOf('full'), NOW)).toEqual({ id: smith, pattern: 'squat' })
    // the second full-body session of the week leads with a bench press, the third with a deadlift
    const one = { ...session('2026-09-14', [OHP], sets(1)), genType: 'full' }
    expect(leadFor({ ...st, workouts: [...st.workouts, one] }, 'full', genGroupsOf('full'), NOW + 2 * 864e5)).toEqual({ id: BENCH, pattern: 'push-horizontal' })
    const two = { ...session('2026-09-16', [OHP], sets(1)), genType: 'full' }
    expect(leadFor({ ...st, workouts: [...st.workouts, one, two] }, 'full', genGroupsOf('full'), NOW + 4 * 864e5)).toEqual({ id: back, pattern: 'hinge' })
  })
  it('a lift logged during the block does not take the lead from the one before it', () => {
    const smith = '0770'
    const st = state({ workouts: [session('2026-08-20', [smith], sets(3)), ...['2026-09-02', '2026-09-03', '2026-09-04'].map(d => session(d, [SQUAT], sets(3)))] })
    const p = { days: ['full', 'full', 'full'], startedAt: '2026-08-30', weeks: 8 }
    expect(leadFor({ ...st, program: p }, 'full', genGroupsOf('full'), NOW).id).toBe(smith)
  })
  it('with nothing logged before the block, the lift you log in it leads', () => {
    const smith = '0770'
    // the barbell squat is the staler, so it comes first among the candidates
    const st = state({ workouts: [session('2026-09-02', [SQUAT], sets(3)), session('2026-09-03', [smith], sets(3)), session('2026-09-05', [smith], sets(3))], program: { days: ['full', 'full', 'full'], startedAt: '2026-09-01', weeks: 8 } })
    expect(leadFor(st, 'full', genGroupsOf('full'), NOW)).toEqual({ id: smith, pattern: 'squat' })
  })
  it('a squat or deadlift day takes no other hinge', () => {
    const picks = generateWorkout(state(), 'full', { count: 10, now: NOW })
    expect(picks[0].slot).toBe('lead')
    expect(picks.filter(p => patternOf(p.id) === 'hinge' && liftKind(p.id) === 'compound').length).toBeLessThanOrEqual(patternOf(picks[0].id) === 'hinge' ? 1 : 0)
  })
  it('an unknown type builds nothing', () => {
    expect(generateWorkout(state(), 'arms')).toEqual([])
  })
})

describe('generatedEntries', () => {
  it('starts from last time, every row unchecked, with the reason attached', () => {
    const st = state({ workouts: [session('2026-09-01', [PULLDOWN], [row({ w: 55, r: 10 }), row({ w: 55, r: 9 })])] })
    const [entry] = generatedEntries(st, [{ id: PULLDOWN, muscle: 'upper-back', last: '2026-09-01' }])
    const work = entry.sets.filter(s => !isWarmupRow(s))
    expect(work.map(s => [s.w, s.r])).toEqual([[55, 10], [55, 9]])
    expect(work.every(s => !s.done)).toBe(true)
    expect(entry.gen).toEqual({ m: 'upper-back', d: '2026-09-01' })
    expect(entry.plan).toBeNull()
  })
  it('a never-logged exercise opens at the default three sets', () => {
    const [entry] = generatedEntries(state(), [{ id: SQUAT, muscle: 'quadriceps', last: null }])
    expect(entry.sets.filter(s => !isWarmupRow(s))).toHaveLength(3)
  })
})

describe('workout setup', () => {
  it('opens on the type’s own count and groups', () => {
    expect(genDefaults('push')).toMatchObject({ count: 6, groups: ['chest', 'shoulders', 'triceps'], byKind: true })
    expect(genDefaults('full').groups).not.toContain('forearms')
    expect(genDefaults('full').count).toBe(genCount('full'))
  })
  it('the defaults build exactly the session without a setup', () => {
    for (const type of Object.keys(GEN_TYPES)) {
      const { count, groups } = genDefaults(type)
      expect(generateWorkout(state(), type, { count, groups })).toEqual(generateWorkout(state(), type))
    }
  })
  it('a shorter session keeps one exercise per muscle before any second', () => {
    const picks = generateWorkout(state(), 'push', { count: 3 })
    expect(picks.map(p => p.muscle).sort()).toEqual(['chest', 'deltoids', 'triceps'])
  })
  it('a longer session goes round the muscles again', () => {
    const picks = generateWorkout(state(), 'push', { count: 9 })
    expect(picks).toHaveLength(9)
    expect(new Set(picks.map(p => p.id)).size).toBe(9)
    expect(picks.filter(p => p.muscle === 'chest')).toHaveLength(3)
  })
  it('unticked groups are left out and ticked ones the type lacks are added', () => {
    const picks = generateWorkout(state(), 'full', { count: 7, groups: ['chest', 'back', 'forearms'] })
    const groups = new Set(picks.map(p => groupOfExercise(EXIDX[p.id])))
    expect([...groups].sort()).toEqual(['back', 'chest', 'forearms'])
    expect(picks).toHaveLength(7)
  })
  it('no groups ticked means no lifts', () => {
    expect(generateWorkout(state(), 'full', { groups: [] })).toEqual([])
  })
  it('adds a run and two stretches after the lifts', () => {
    const picks = generateWorkout(state(), 'legs', { cardio: true, stretch: true })
    expect(picks.slice(-3).map(p => p.kind)).toEqual(['cardio', 'stretch', 'stretch'])
    expect(EXIDX[picks.at(-3).id].cat).toBe('cardio')
    expect(picks.slice(-2).every(p => EXIDX[p.id].cat === 'stretching')).toBe(true)
    // the leg day's stretches are for the legs
    expect(picks.slice(-2).every(p => /legs/.test(EXIDX[p.id].bp))).toBe(true)
  })
  it('the run is the one you logged last', () => {
    const st = state({ workouts: [session('2026-09-01', ['2197'], [{ min: 20, speed: 9, done: true }])] })
    expect(generateWorkout(st, 'push', { cardio: true }).at(-1).id).toBe('2197')
  })
})

describe('sets and reps by the lift’s slot', () => {
  it('knows a compound from an isolation lift and a small group', () => {
    expect([BENCH, SQUAT, OHP].map(liftKind)).toEqual(['compound', 'compound', 'compound'])
    expect([CURL, PUSHDOWN, LEGCURL].map(liftKind)).toEqual(['isolation', 'isolation', 'isolation'])
    expect(liftKind('0605')).toBe('small')  // a calf raise
    expect(liftKind('no-such-id')).toBe('isolation')
  })
  it('the lead takes the fewest reps, the small groups the most', () => {
    const { lead, main, acc, small } = GEN_SCHEME
    expect(lead.hi).toBeLessThanOrEqual(main.lo)
    expect(main.hi).toBeLessThan(acc.hi)
    expect(acc.hi).toBeLessThan(small.hi)
    expect(lead.sets).toBeGreaterThan(main.sets)
    expect(small.sets).toBeLessThan(acc.sets)
    // a range that builds muscle when the sets are hard
    for (const k of [lead, main, acc, small]) expect(k.lo >= 6 && k.hi <= 20 && k.lo < k.hi && k.sets >= 2 && k.sets <= 4).toBe(true)
  })
  it('the default setup builds each lift on its slot, the first big lift leading', () => {
    const picks = [{ id: SQUAT, muscle: 'quadriceps', last: null, slot: 'lead' }, { id: BENCH, muscle: 'chest', last: null, slot: 'main' },
      { id: CURL, muscle: 'biceps', last: null, slot: 'acc' }, { id: '0605', muscle: 'calves', last: null, slot: 'small' }]
    const entries = generatedEntries(state(), picks, genDefaults('full'))
    expect(entries.map(e => [e.target.sets, e.target.repsMin, e.target.reps, e.target.restSec])).toEqual([[4, 6, 8, 180], [3, 8, 12, 120], [3, 10, 15, 90], [2, 12, 20, 60]])
    expect(entries.every(e => e.target.prog === 'double')).toBe(true)
  })
  it('a pick without a slot goes by its kind, never leading', () => {
    expect(genScheme(SQUAT, { sets: 3, reps: 10 })).toEqual(GEN_SCHEME.main)
    expect(genScheme(CURL, {})).toEqual(GEN_SCHEME.acc)
    expect(genScheme('0605', {})).toEqual(GEN_SCHEME.small)
    expect(genScheme(SQUAT, {}, 'lead')).toEqual(GEN_SCHEME.lead)
  })
  it('turned off, every lift takes the setup’s own sets and reps', () => {
    expect(genScheme(SQUAT, { byKind: false, sets: 5, reps: 5 }, 'lead')).toEqual({ sets: 5, lo: 5, hi: 5, rest: 0 })
  })
  it('a setup’s own rest wins over the slot’s', () => {
    const [e] = generatedEntries(state(), [{ id: SQUAT, muscle: 'quadriceps', last: null, slot: 'lead' }], { ...genDefaults('full'), restSec: 20 })
    expect(e.target.restSec).toBe(20)
  })
  it('a session leads with its first big lift, once', () => {
    const picks = generateWorkout(state(), 'full', { count: 7 })
    const slots = picks.map(p => p.slot)
    expect(slots.filter(s => s === 'lead')).toHaveLength(1)
    expect(slots.indexOf('lead')).toBe(slots.findIndex((s, i) => liftKind(picks[i].id) === 'compound'))
  })
})

describe('generatedEntries with a setup', () => {
  const setup = { ...genDefaults('push'), byKind: false, sets: 4, reps: 8, restSec: 120, warmupSets: 1 }
  it('every lift takes the setup’s sets, reps, rest and warm-ups', () => {
    const [e] = generatedEntries(state(), [{ id: BENCH, muscle: 'chest', last: null }], setup)
    expect(e.target).toMatchObject({ sets: 4, reps: 8, restSec: 120, warmupSets: 1, mode: 'reps' })
    const work = e.sets.filter(s => !isWarmupRow(s))
    expect(work).toHaveLength(4)
    expect(work.every(s => s.r === 8)).toBe(true)
    expect(e.sets.filter(isWarmupRow)).toHaveLength(1)
  })
  it('opens at last time’s weight, on the setup’s reps', () => {
    const st = state({ workouts: [session('2026-09-01', [BENCH], [row({ w: 70, r: 5 })])] })
    const pick = [{ id: BENCH, muscle: 'chest', last: '2026-09-01' }]
    expect(generatedEntries(st, pick, setup)[0].sets.filter(s => !isWarmupRow(s)).map(s => [s.w, s.r])).toEqual([[70, 8], [70, 8], [70, 8], [70, 8]])
  })
  it('a hold keeps its seconds and takes the sets', () => {
    // a front plank: the catalogue files it as a hold, so it is timed (history.js defaultConfig)
    const [e] = generatedEntries(state(), [{ id: '0463', muscle: 'abs', last: null }], setup)
    expect(e.target.mode).toBe('time')
    expect(e.target.sec).toBe(45)
    expect(e.target.reps).toBeUndefined()
    expect(e.sets.filter(s => !isWarmupRow(s))).toHaveLength(4)
  })
  it('cardio and stretches are built the freestyle way', () => {
    const [run, str] = generatedEntries(state(), [{ id: '0685', kind: 'cardio' }, { id: '1511', kind: 'stretch' }], setup)
    expect(run.sets).toHaveLength(1)
    expect(run.gen).toEqual({ k: 'cardio' })
    expect(str.target).toMatchObject({ mode: 'time', sets: 2 })
  })
})

describe('an exercise added to a running session', () => {
  const cfg = { id: '0025', sets: 3, reps: 10, restSec: 90 }
  it('takes the rest a one-tap workout was set up with', () => {
    expect(withSessionRest(cfg, { gen: { type: 'push', setup: { restSec: 20 } } }).restSec).toBe(20)
  })
  it('keeps its own when the workout set none, or is no one-tap workout', () => {
    expect(withSessionRest(cfg, { gen: { type: 'push', setup: { restSec: 0 } } })).toBe(cfg)
    expect(withSessionRest(cfg, { gen: { type: 'push' } })).toBe(cfg)
    expect(withSessionRest(cfg, { entries: [] })).toBe(cfg)
    expect(withSessionRest(null, { gen: { setup: { restSec: 20 } } })).toBeNull()
  })
})

describe('a lift added to or swapped into a one-tap workout', () => {
  const setup = { ...genDefaults('push'), byKind: false, sets: 4, reps: 6, restSec: 75, warmupSets: 2, lastToFailure: true }
  const active = { gen: { type: 'push', setup }, entries: [] }
  it('is set up the way the workout set up its own lifts', () => {
    expect(sessionConfig(state(), CURL, active)).toMatchObject({ mode: 'reps', sets: 4, reps: 6, restSec: 75, warmupSets: 2, lastToFailure: true })
  })
  it('goes by the kind of lift when the setup does', () => {
    const cfg = sessionConfig(state(), CURL, { gen: { type: 'push', setup: { ...setup, byKind: true } } })
    expect(cfg).toMatchObject({ ...GEN_SCHEME.isolation, warmupSets: 2 })
  })
  it('counts a one-legged lift\'s reps on each leg', () => {
    // dumbbell single leg split squat: 6 a leg is 12 in all
    expect(sessionConfig(state(), '0410', active)).toMatchObject({ side: true, reps: 12 })
  })
  it('leaves cardio, stretches and any other session alone', () => {
    expect(sessionConfig(state(), '0685', active)).toBeNull()
    expect(sessionConfig(state(), '1511', active)).toBeNull()
    expect(sessionConfig(state(), CURL, { gen: { type: 'push' } })).toBeNull()
    expect(sessionConfig(state(), CURL, { entries: [] })).toBeNull()
  })
})
