import { describe, expect, it } from 'vitest'
import { ADD_GROUPS, MUSCLE_VIEW, avatarOf, groupOfMuscle, muscleStatus, suggestedGroups, groupExercises, lastTopSet, shortlist, groupFacets, closeness } from './add-exercise.js'
import { narrow, isTail, kitOf } from './exercise-facets.js'
import { MUSCLES } from './muscles.js'
import { STAPLES } from './generate.js'
import { EXIDX } from './exercises.js'
import { isPopular } from './popular.js'
import { primaryMuscleOf } from './strength-exercises.js'
import { weeklyNeed, variantHistory } from './coverage.js'
import { variantOf } from './variant.js'

const row = (patch = {}) => ({ w: 60, r: 8, done: true, ...patch })
const session = (d, ids, sets = [row()]) => ({ id: 'w' + d + ids.join(), d, name: 'x', entries: ids.map(id => ({ id, target: { reps: 8 }, sets })) })
const state = (over = {}) => ({ unit: 'kg', workouts: [], exWeights: {}, routines: [], ...over })

// bench press (chest), dumbbell bench (chest), lat pulldown (upper back), squat (quads)
const BENCH = '0025', DBBENCH = '0289', PULLDOWN = '2330', SQUAT = '0043'
const TODAY = '2026-10-16'
const NOW = new Date(2026, 9, 16, 12).getTime()
const ALL = ADD_GROUPS.map(g => g.id)

describe('groups', () => {
  it('every muscle the map draws belongs to exactly one group, and has a side and a box', () => {
    for (const slug of MUSCLES) {
      expect(ADD_GROUPS.filter(g => g.m.includes(slug)), slug).toHaveLength(1)
      expect(MUSCLE_VIEW[slug], slug).toBeTruthy()
      for (const body of ['male', 'female']) expect(avatarOf([slug], body).vb.split(' ').map(Number).every(Number.isFinite), slug).toBe(true)
    }
    expect(groupOfMuscle('trapezius').id).toBe('back')
  })
  it('an avatar lights only the muscles on the side it shows', () => {
    // glutes are pictured from behind, adductors and hip flexors from the front
    expect(avatarOf(['gluteal', 'adductors', 'hip-flexors'])).toMatchObject({ view: 'back', on: ['gluteal'] })
    const [, , w, h] = avatarOf(['chest']).vb.split(' ').map(Number)
    expect(w).toBe(h)
  })
})

describe('muscleStatus', () => {
  it('marks what is in the workout, what was trained in the last 7 days, and when each was last', () => {
    const st = muscleStatus(state({
      workouts: [session('2026-10-05', [PULLDOWN]), session('2026-10-13', [BENCH])],
      active: { entries: [{ id: SQUAT, sets: [] }] },
    }), TODAY)
    expect(st.quadriceps.st).toBe('td')
    expect(st.chest).toEqual({ st: 'wk', last: '2026-10-13' })
    expect(st['upper-back']).toEqual({ st: '', last: '2026-10-05' })
    expect(st.calves).toEqual({ st: '', last: null })
  })
  it('counts the last 7 days, not the calendar week', () => {
    const S = state({ workouts: [session('2026-10-10', [BENCH]), session('2026-10-09', [PULLDOWN])] })
    expect(muscleStatus(S, TODAY).chest.st).toBe('wk')
    expect(muscleStatus(S, TODAY)['upper-back'].st).toBe('')
  })
  it('for a routine, marks what the routine has and leaves the week out', () => {
    const S = state({ workouts: [session('2026-10-13', [BENCH])] })
    const st = muscleStatus(S, TODAY, [{ id: PULLDOWN, sets: 3 }])
    expect(st['upper-back'].st).toBe('td')
    expect(st.chest).toEqual({ st: '', last: '2026-10-13' })
  })
})

describe('suggestedGroups', () => {
  it('suggests what the week needs most, secondaries and sets counted', () => {
    const S = state({ workouts: [
      // fourteen sets of bench (the chest's week) help shoulders and triceps too; a single set of
      // pulldowns is not a week
      session('2026-10-12', [BENCH, SQUAT], Array.from({ length: 14 }, () => row())),
      session('2026-10-14', [PULLDOWN]),
    ] })
    const top = suggestedGroups(weeklyNeed(S, ALL, NOW), [], 20)
    expect(top).not.toContain('chest')
    expect(top).not.toContain('quads')
    expect(top).toContain('back')
    expect(top.indexOf('biceps')).toBeLessThan(top.indexOf('shoulders'))
    expect(suggestedGroups(weeklyNeed(S, ALL, NOW))).toHaveLength(2)
  })
  it('leaves out a group the session already covers', () => {
    const need = weeklyNeed(state(), ALL, NOW)
    expect(suggestedGroups(need, [], 20)).toContain('chest')
    expect(suggestedGroups(need, [{ id: BENCH, sets: [] }], 20)).not.toContain('chest')
  })
})

describe('groupExercises', () => {
  it('lists an area’s logged exercises first, then its staples', () => {
    const S = state({ workouts: [session('2026-10-01', [DBBENCH]), session('2026-10-13', [BENCH])] })
    const { sections } = groupExercises(S, 'chest', { status: muscleStatus(S, TODAY) })
    expect(sections).toHaveLength(1)
    const ids = sections[0].list.map(e => e.id)
    expect(ids.slice(0, 2)).toEqual([DBBENCH, BENCH])
    expect(ids.slice(2, 4)).toEqual(STAPLES.chest.filter(id => id !== BENCH && id !== DBBENCH).slice(0, 2))
    expect(sections[0].list.every(e => primaryMuscleOf(e)?.slug === 'chest')).toBe(true)
  })
  it('puts areas not trained in the last 7 days before the ones that were', () => {
    const S = state({ workouts: [session('2026-10-13', [PULLDOWN])] })
    const { sections } = groupExercises(S, 'back', { status: muscleStatus(S, TODAY) })
    expect(sections.map(s => s.m)).toEqual(['lower-back', 'trapezius', 'upper-back'])
    const az = groupExercises(S, 'back', { sort: 'az', status: muscleStatus(S, TODAY) })
    expect(az.sections.map(s => s.m)).toEqual(['upper-back', 'lower-back', 'trapezius'])
  })
  it('leaves out and counts what is already in the workout', () => {
    const S = state({ active: { entries: [{ id: BENCH, sets: [] }] } })
    const { sections, hidden } = groupExercises(S, 'chest')
    expect(hidden).toBe(1)
    expect(sections[0].list.map(e => e.id)).not.toContain(BENCH)
  })
  it('Recent is what you logged in the group, newest first; an area narrows it', () => {
    const S = state({ workouts: [session('2026-10-01', [DBBENCH]), session('2026-10-13', [BENCH]), session('2026-10-14', [SQUAT])] })
    const { sections } = groupExercises(S, 'chest', { sort: 'recent' })
    expect(sections[0].list.map(e => e.id)).toEqual([BENCH, DBBENCH])
    expect(groupExercises(S, 'back', { sort: 'recent' }).sections).toEqual([])
    expect(groupExercises(S, 'back', { area: 'trapezius' }).sections.map(s => s.m)).toEqual(['trapezius'])
  })
  it('respects the active equipment profile', () => {
    const S = state({ equipFilterOn: true, equipProfiles: [{ id: 'p', name: 'Home', equipment: ['dumbbell', 'bench'], accV: 1 }], activeEquipId: 'p' })
    const ids = groupExercises(S, 'chest').sections[0].list.map(e => e.id)
    expect(ids).not.toContain(BENCH)
    expect(ids).toContain(DBBENCH)
  })
})

describe('groupExercises, ranked by the session’s gaps', () => {
  const gapsOf = S => ({ need: weeklyNeed(S, ALL, NOW), history: variantHistory(S) })
  it('after a flat barbell bench, a fresh variation comes first', () => {
    const S = state({ workouts: [session('2026-10-01', [BENCH])] })
    const [first] = groupExercises(S, 'chest', { gaps: gapsOf(S), status: muscleStatus(S, TODAY) }).sections[0].list
    expect(variantOf(first)).not.toMatchObject({ position: 'plain' })
    expect(variantOf(first).tool).not.toBe('barbell')
  })
  it('with the shoulders done today, a press that needs them waits behind one that does not', () => {
    const S = state({ workouts: [session('2026-10-01', [BENCH])] })
    const have = [{ id: '0426', sets: [] }, { id: '0241', sets: [] }]  // overhead press, pushdown
    const plain = groupExercises(S, 'chest', { have, status: muscleStatus(S, TODAY, have) }).sections[0].list.map(e => e.id)
    const ranked = groupExercises(S, 'chest', { have, gaps: gapsOf(S), status: muscleStatus(S, TODAY, have) }).sections[0].list.map(e => e.id)
    expect(new Set(ranked)).toEqual(new Set(plain))
    expect(ranked).not.toEqual(plain)
  })
  it('a routine’s exercises are left out the way a workout’s are', () => {
    const { hidden, sections } = groupExercises(state(), 'chest', { have: [{ id: BENCH, sets: 3 }] })
    expect(hidden).toBe(1)
    expect(sections[0].list.map(e => e.id)).not.toContain(BENCH)
  })
})

describe('lastTopSet', () => {
  it('is the heaviest work set of the last session', () => {
    const S = state({ workouts: [session('2026-10-13', [BENCH], [row({ w: 40, r: 10, warmup: true }), row({ w: 80, r: 5 }), row({ w: 75, r: 8 })])] })
    expect(lastTopSet(S, BENCH)).toEqual({ w: 80, r: 5, d: '2026-10-13' })
    expect(lastTopSet(S, SQUAT)).toBeNull()
    expect(EXIDX[BENCH]).toBeTruthy()
  })
})

describe('shortlist', () => {
  it('without history, offers a few starters of different kit and no long tail', () => {
    const { yours, picks, all } = shortlist(state(), 'chest')
    expect(yours).toEqual([])
    expect(picks.length).toBe(5)
    expect(new Set(picks.slice(0, 3).map(kitOf)).size).toBe(3)
    expect(picks.some(isTail)).toBe(false)
    expect(all.length).toBeGreaterThan(50)
  })
  it('with history, puts what you do first and two you have not done after it', () => {
    const S = state({ workouts: [session('2026-10-10', [BENCH, DBBENCH]), session('2026-10-12', [BENCH])] })
    const { yours, picks } = shortlist(S, 'chest')
    expect(yours.map(x => x.id).sort()).toEqual([BENCH, DBBENCH].sort())
    expect(picks).toHaveLength(2)
    expect(picks.some(x => x.id === BENCH || x.id === DBBENCH)).toBe(false)
  })
  it('puts what fills a gap ahead among the picks', () => {
    const S = state({ workouts: [session('2026-10-10', [BENCH])] })
    const plain = shortlist(S, 'chest').picks
    const want = shortlist(S, 'chest').all.filter(x => x.id !== BENCH && !isTail(x)).at(-1)
    const { picks } = shortlist(S, 'chest', { fills: x => x.id === want.id })
    expect(picks[0].id).toBe(want.id)
    expect(plain[0].id).not.toBe(want.id)
  })
  it('puts your own that work the part to favour first', () => {
    const S = state({ workouts: [session('2026-10-10', [BENCH, DBBENCH]), session('2026-10-12', [BENCH])] })
    const first = shortlist(S, 'chest').yours.map(x => x.id)
    expect(first).toHaveLength(2)
    expect(shortlist(S, 'chest', { fills: x => x.id === first[1] }).yours.map(x => x.id)).toEqual([first[1], first[0]])
  })
  it('in a swap, lists only your own that work the part', () => {
    const S = state({ workouts: [session('2026-10-10', [BENCH, DBBENCH]), session('2026-10-12', [BENCH])] })
    const first = shortlist(S, 'chest').yours.map(x => x.id)
    expect(shortlist(S, 'chest', { fills: x => x.id === first[1], same: true }).yours.map(x => x.id)).toEqual([first[1]])
    // None of them do: it starts afresh, one per kind of equipment
    const none = shortlist(S, 'chest', { fills: () => false, same: true })
    expect(none.yours).toEqual([])
    expect(new Set(none.picks.map(x => x.eq)).size).toBe(none.picks.length)
    expect(none.picks.length).toBeGreaterThan(2)
  })
  it('in a swap, puts the same movement first among those that work as much of the part', () => {
    // barbell bent over row, cable seated row, cable lat pulldown, chin-up
    const ROW = '0027', CABLE_ROW = '0861', PULLDOWN = '2330', CHIN = '1326'
    expect(closeness(ROW, EXIDX[CABLE_ROW], 1)).toBeGreaterThan(closeness(ROW, EXIDX[PULLDOWN], 1))
    expect(closeness(PULLDOWN, EXIDX[CHIN], 1)).toBeGreaterThan(closeness(PULLDOWN, EXIDX[CABLE_ROW], 1))
    // the parts still count first: a pulldown working two of them beats a row working one
    expect(closeness(ROW, EXIDX[PULLDOWN], 2)).toBeGreaterThan(closeness(ROW, EXIDX[CABLE_ROW], 1))
    // keeping to the part, the same movement working none of it is no closer than anything else
    expect(closeness(ROW, EXIDX[CABLE_ROW], 0, true)).toBe(0)
    expect(closeness(null, EXIDX[CABLE_ROW], 1)).toBe(1)
  })
  it('starts with nothing logged on the ones that work the part to favour', () => {
    // A swap away from a lateral raise when your shoulder exercises are all in the workout already.
    const { all, picks } = shortlist(state(), 'shoulders')
    const want = all.find(x => !picks.includes(x) && /lateral raise/i.test(x.name || x.n)).id
    const got = shortlist(state(), 'shoulders', { fills: x => x.id === want }).picks
    expect(got[0].id).toBe(want)
    expect(got).toHaveLength(picks.length)
  })
  it('puts the ones that work more of the parts first', () => {
    const [one, two] = shortlist(state(), 'back').picks.slice(-2).map(x => x.id)
    const got = shortlist(state(), 'back', { fills: x => (x.id === two ? 2 : x.id === one ? 1 : 0) }).picks
    expect(got.slice(0, 2).map(x => x.id)).toEqual([two, one])
  })
  it('leaves out what is already in the session', () => {
    const { all, hidden } = shortlist(state(), 'chest', { have: [{ id: BENCH }] })
    expect(all.some(x => x.id === BENCH)).toBe(false)
    expect(hidden).toBe(1)
  })
})

describe('group questions', () => {
  it('asks the part only of a group with more than one', () => {
    expect(groupFacets('chest').map(f => f.id)).toEqual(['kit', 'move', 'angle'])
    expect(groupFacets('back')[0].id).toBe('area')
    expect(groupFacets('cardio')[0].id).toBe('area')
  })
  it("every group's questions end on a short list, whatever you answer", () => {
    // Taking the biggest answer each time is the longest way down; it must still get somewhere.
    for (const id of [...ALL, 'cardio', 'stretching']) {
      const { all } = shortlist(state(), id)
      const facets = groupFacets(id)
      let picks = {}, r = narrow(all, facets, picks), n = 0
      while (r.step && n++ < 5) {
        picks = { ...picks, [r.step.facet]: [...r.step.options].sort((a, b) => b.count - a.count)[0].values }
        r = narrow(all, facets, picks)
      }
      expect(r.step, id).toBe(null)
      expect(r.list.length, id).toBeGreaterThan(0)
    }
  })
})

describe('the popular list in Add exercise', () => {
  it('starts a group you have never trained on popular lifts only, where it has enough', () => {
    for (const g of ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'forearms']) {
      const { picks } = shortlist({}, g)
      expect(picks.every(ex => isPopular(ex.id)), g).toBe(true)
    }
  })
  it('lists the rest of the popular list right after the suggested lifts', () => {
    const { all } = shortlist({}, 'chest')
    const firstOff = all.findIndex(ex => !isPopular(ex.id))
    expect(all.slice(firstOff).some(ex => isPopular(ex.id))).toBe(false)
  })
})
