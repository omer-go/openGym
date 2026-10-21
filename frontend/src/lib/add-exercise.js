// The workout's Add exercise sheet: muscle groups first, then the exercises of the group you tap.
// Pure: reads state, never writes. The sheet itself is components/AddExerciseSheet.jsx.
//
// A group is a handful of the body map's own muscles (lib/muscles.js) — its "areas". The map has
// no heads or regions finer than a muscle, so Back is upper back + lower back + traps and Chest is
// the chest. Each area has a status: in this session ('td'), trained in the last 7 days ('wk'), or
// not (''). A muscle counts as trained the way generate.js trainingIndex counts it: a completed
// work set of an exercise that works it as a primary. Which groups are Suggested, and the order
// of a group's exercises, go by the week's coverage (lib/coverage.js), as the one-tap workouts do.
import { EXIDX, allExercises, isCardio } from './exercises.js'
import { exAvailable } from './equipment.js'
import { musclesOf, MUSCLE_NAME } from './muscles.js'
import { primaryMuscleOf } from './strength-exercises.js'
import { lastEntryFor } from './history.js'
import { trainingIndex, candidatesFor } from './generate.js'
import { todayISO, isoOf } from './format.js'
import { rankForGaps, sessionCredit } from './coverage.js'
import { exerciseNameFor } from './i18n-core.js'
import { ACTIVITY_GROUPS, activityGroup, isStretch } from './activities.js'
import { KIT_FACET, MOVE_FACET, ANGLE_FACET, isTail, rareWords, kitOf } from './exercise-facets.js'

// English names are i18n keys where shown. `low` puts a group under Lower body.
export const ADD_GROUPS = [
  { id: 'chest', n: 'Chest', m: ['chest'] },
  { id: 'back', n: 'Back', m: ['upper-back', 'lower-back', 'trapezius'] },
  { id: 'shoulders', n: 'Shoulders', m: ['deltoids'] },
  { id: 'biceps', n: 'Biceps', m: ['biceps'] },
  { id: 'triceps', n: 'Triceps', m: ['triceps'] },
  { id: 'forearms', n: 'Forearms', m: ['forearm'] },
  { id: 'abs', n: 'Abs', m: ['abs', 'obliques', 'serratus'] },
  { id: 'quads', n: 'Quads', m: ['quadriceps'], low: true },
  { id: 'hamstrings', n: 'Hamstrings', m: ['hamstring'], low: true },
  { id: 'glutes', n: 'Glutes & hips', m: ['gluteal', 'adductors', 'hip-flexors'], low: true },
  { id: 'calves', n: 'Calves', m: ['calves', 'tibialis'], low: true },
]
export const groupOfMuscle = slug => ADD_GROUPS.find(g => g.m.includes(slug)) || null

// The side of the body each muscle is pictured from, and where it sits there: the bounding box
// (x0, y0, x1, y1) of its outline in lib/body-paths.js, both sides of the body together. Measured
// once from the geometry with getBBox; the avatars crop the drawing to these.
export const MUSCLE_VIEW = {
  trapezius: 'back', deltoids: 'front', chest: 'front', 'upper-back': 'back', serratus: 'front',
  biceps: 'front', triceps: 'back', forearm: 'front', abs: 'front', obliques: 'front',
  'lower-back': 'back', gluteal: 'back', quadriceps: 'front', hamstring: 'back',
  adductors: 'front', 'hip-flexors': 'front', calves: 'back', tibialis: 'front',
}
const BOX = {
  male: { chest: [255, 317, 473, 435], abs: [306, 428, 422, 716], biceps: [182, 406, 546, 493], deltoids: [195, 303, 533, 397], obliques: [256, 417, 473, 658], quadriceps: [241, 667, 487, 948], adductors: [274, 647, 454, 899], forearm: [126, 498, 603, 687], tibialis: [260, 973, 468, 1202], serratus: [256, 444, 469, 503], 'hip-flexors': [297, 669, 430, 701], trapezius: [1003, 297, 1164, 473], 'upper-back': [956, 323, 1211, 585], triceps: [899, 382, 1268, 535], 'lower-back': [984, 487, 1183, 639], gluteal: [976, 619, 1191, 778], hamstring: [962, 741, 1205, 1006], calves: [970, 972, 1197, 1290] },
  female: { deltoids: [167, 285, 474, 371], chest: [215, 319, 426, 433], biceps: [155, 383, 486, 477], obliques: [223, 415, 418, 617], abs: [261, 440, 380, 679], forearm: [74, 483, 567, 650], adductors: [223, 609, 418, 876], quadriceps: [195, 622, 446, 969], tibialis: [237, 1056, 404, 1297], serratus: [216, 417, 434, 473], 'hip-flexors': [265, 647, 383, 676], trapezius: [1035, 280, 1250, 407], 'upper-back': [1028, 314, 1257, 541], 'lower-back': [1060, 507, 1225, 617], triceps: [976, 355, 1309, 492], gluteal: [1016, 600, 1270, 792], hamstring: [1016, 760, 1270, 1001], calves: [1050, 987, 1235, 1363] },
}

/**
 * What an avatar of `slugs` draws: the side to show (the first muscle's), the muscles lit on it
 * (the ones pictured from that side), and a square viewBox around them with some body for context.
 */
export function avatarOf(slugs, body = 'male') {
  const boxes = BOX[body] || BOX.male
  const view = MUSCLE_VIEW[slugs[0]] || 'front'
  const on = slugs.filter(s => MUSCLE_VIEW[s] === view)
  const b = on.map(s => boxes[s]).reduce((a, c) => [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[2]), Math.max(a[3], c[3])])
  const side = Math.max(b[2] - b[0], b[3] - b[1]) * 1.4 + 90
  const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2
  return { view, on, vb: [cx - side / 2, cy - side / 2, side, side].map(Math.round).join(' ') }
}

// Same bar as generate.js: a primary, not a muscle helping out.
const TRAINED_AT = 0.5

/**
 * Per muscle: `st` ('td' in the session, 'wk' trained in the last 7 days, '' not) and `last`, the
 * ISO day it was last trained (null when never). The session is the workout in progress, or the
 * entries `have` (a routine being edited, which has no week: then 'wk' is never set).
 */
export function muscleStatus(S, today = todayISO(), have = null) {
  const { muscles } = trainingIndex(S)
  const from = new Date(today + 'T12:00')
  from.setDate(from.getDate() - 6)
  const week = have ? '~' : isoOf(from)
  const now = new Set()
  for (const e of have || S?.active?.entries || []) {
    for (const [slug, w] of Object.entries(EXIDX[e.id] ? musclesOf(EXIDX[e.id]) : {})) if (w >= TRAINED_AT) now.add(slug)
  }
  const out = {}
  for (const g of ADD_GROUPS) for (const slug of g.m) {
    const last = muscles[slug] || null
    out[slug] = { st: now.has(slug) ? 'td' : last && last >= week ? 'wk' : '', last }
  }
  return out
}

// A group the week needs less than this of is not worth suggesting (coverage.js RESTED).
const WORTH = 0.1

/**
 * The groups worth doing next, best first, at most `n`: the most the week still needs (`need`,
 * coverage.js weeklyNeed), less what the session's exercises (`have`) already give it. A group
 * the session covers is never suggested.
 */
export function suggestedGroups(need, have = [], n = 2) {
  const covered = sessionCredit(have)
  return ADD_GROUPS.map(g => ({ id: g.id, score: (need[g.id] || 0) * Math.max(0, 1 - (covered[g.id] || 0)) }))
    .filter(x => x.score >= WORTH).sort((a, b) => b.score - a.score).slice(0, n).map(x => x.id)
}

// The usable exercises each muscle is the primary of, built once per custom-exercise list.
// Cardio and stretches have groups of their own (ACTIVITY_GROUPS), so they are not listed here.
let INDEX = null
function byPrimary(S) {
  const key = S?.customEx || null
  if (INDEX && INDEX.key === key) return INDEX.map
  const map = {}
  for (const ex of allExercises(S || {})) {
    if (isCardio(ex) || isStretch(ex)) continue
    const slug = primaryMuscleOf(ex)?.slug
    if (slug) (map[slug] || (map[slug] = [])).push(ex)
  }
  INDEX = { key, map }
  return map
}

/** The heaviest set of an exercise's last session: { w, r, d }, or null when never logged. */
export function lastTopSet(S, id) {
  const last = lastEntryFor(S, id)
  if (!last) return null
  const top = last.sets.reduce((a, s) => (!a || (Number(s.w) || 0) > (Number(a.w) || 0) ? s : a), null)
  return top ? { w: Number(top.w) || 0, r: top.r ?? null, d: last.d } : null
}

const STATUS_RANK = { '': 0, wk: 1, td: 2 }
const byName = (a, b) => exerciseNameFor(a).localeCompare(exerciseNameFor(b))
// Past what is ranked, the plain version before its variations: the long tail last (a form-check
// clip, a numbered copy), then a name of common words before a named variant ("Svend press"),
// then the shorter name — "dumbbell fly" before "dumbbell incline twisted fly".
const byCommon = (a, b) => isTail(a) - isTail(b) || rareWords(a) - rareWords(b) || (a.n || '').length - (b.n || '').length || byName(a, b)

/**
 * The exercises of a group, as the sheet lists them. `sort`:
 * - 'suggested': one section per area, areas not trained in the last 7 days first and the
 *   longest-rested of those first; within an area what you have logged and the staple lifts,
 *   ranked by what they add to the session for the week (`gaps`: { need, history }, see
 *   coverage.js rankForGaps; without it, generate.js's order), then the rest plain versions first.
 * - 'az': one section per area in the group's order, exercises by name.
 * - 'recent': one section of everything you have logged in the group, most recent first.
 * Exercises already in the session (`have`, else the workout in progress) are left out and
 * counted in `hidden`; so is what the active equipment profile rules out. `area` narrows to
 * one muscle.
 */
export function groupExercises(S, groupId, { sort = 'suggested', area = '', have = null, gaps = null, status = muscleStatus(S, todayISO(), have) } = {}) {
  if (activityGroup(groupId)) return activityExercises(S, groupId, { sort, area })
  const g = ADD_GROUPS.find(x => x.id === groupId)
  if (!g) return { sections: [], hidden: 0 }
  const map = byPrimary(S)
  const session = have || S?.active?.entries || []
  const inWorkout = new Set(session.map(e => e.id))
  const areas = g.m.filter(s => !area || s === area)
  let hidden = 0
  const usable = slug => (map[slug] || []).filter(ex => {
    if (!exAvailable(S, ex)) return false
    if (inWorkout.has(ex.id)) { hidden++; return false }
    return true
  })
  if (sort === 'recent') {
    const { exercises } = trainingIndex(S)
    const list = areas.flatMap(usable).filter(ex => exercises[ex.id])
      .sort((a, b) => (exercises[a.id].d < exercises[b.id].d ? 1 : exercises[a.id].d > exercises[b.id].d ? -1 : byName(a, b)))
    return { sections: list.length ? [{ m: null, list }] : [], hidden }
  }
  let sections = areas.map(m => {
    const list = usable(m)
    if (sort === 'az') list.sort(byName)
    else {
      let first = candidatesFor(S, m)
      if (gaps) first = rankForGaps(first.map((id, rank) => ({ id, rank })), { groups: ADD_GROUPS.map(x => x.id), have: session, ...gaps })
      const at = id => { const i = first.indexOf(id); return i < 0 ? Infinity : i }
      list.sort((a, b) => at(a.id) - at(b.id) || byCommon(a, b))
    }
    return { m, st: status[m]?.st || '', last: status[m]?.last || null, list }
  }).filter(x => x.list.length)
  if (sort === 'suggested') {
    // Array#sort is stable: equal areas keep the group's own order.
    sections = sections.sort((a, b) => STATUS_RANK[a.st] - STATUS_RANK[b.st] || (a.last || '').localeCompare(b.last || ''))
  }
  return { sections, hidden }
}

// How many of your own a group's shortlist shows, and how many new ones beside them.
export const YOURS = 6
const WORTH_ADDING = 2
const STARTERS = 5

/**
 * A group's first screen: the exercises you do there (`yours`: your most-logged, up to YOURS, in
 * the Suggested order), a couple worth adding that you have not done (`picks`: the ones `fills`
 * the week's gap first, then the ranking's best), and `all`, the whole group in Suggested order,
 * which "Something else" narrows step by step (`groupFacets`). With nothing logged in the group,
 * `picks` are a few starting points instead, one per kind of equipment as far as they go.
 * The long tail (exercise-facets.js isTail) is never picked.
 */
export function shortlist(S, groupId, { fills = () => false, ...opts } = {}) {
  const { sections, hidden } = groupExercises(S, groupId, { ...opts, sort: 'suggested' })
  const all = sections.flatMap(x => x.list)
  const { exercises } = trainingIndex(S)
  const logged = all.filter(ex => exercises[ex.id])
  const most = [...logged].sort((a, b) => exercises[b.id].n - exercises[a.id].n || (exercises[b.id].d < exercises[a.id].d ? -1 : exercises[b.id].d > exercises[a.id].d ? 1 : 0))
  const top = new Set(most.slice(0, YOURS).map(ex => ex.id))
  const yours = logged.filter(ex => top.has(ex.id))
  const fresh = all.filter(ex => !exercises[ex.id] && !isTail(ex))
  let picks
  if (yours.length) picks = [...fresh.filter(ex => fills(ex)), ...fresh.filter(ex => !fills(ex))].slice(0, WORTH_ADDING)
  else if (activityGroup(groupId)) picks = fresh.slice(0, STARTERS)
  else {
    // The best-ranked of each kind of equipment, in the order they rank (not for cardio or a
    // stretch, where the kit is beside the point).
    const seen = new Set()
    picks = fresh.filter(ex => !seen.has(kitOf(ex)) && seen.add(kitOf(ex))).slice(0, STARTERS)
    if (picks.length < STARTERS) picks = [...picks, ...fresh.filter(ex => !picks.includes(ex)).slice(0, STARTERS - picks.length)]
  }
  return { yours, picks, all, hidden }
}

/**
 * The questions "Something else" asks of a group, in order (exercise-facets.js narrow): which of
 * its areas when it has more than one (a part of the body, or Cardio's and Stretching's own
 * kinds), what equipment, which movement, which angle.
 */
export function groupFacets(groupId) {
  const act = activityGroup(groupId)
  const g = !act && ADD_GROUPS.find(x => x.id === groupId)
  const area = act
    ? { id: 'area', of: ex => act.of(ex) || null, name: id => act.areas.find(a => a.id === id)?.n || id, order: act.areas.map(a => a.id) }
    : g && g.m.length > 1 ? { id: 'area', of: ex => primaryMuscleOf(ex)?.slug || null, name: id => MUSCLE_NAME[id] || id, order: g.m } : null
  return [area, KIT_FACET, MOVE_FACET, ANGLE_FACET].filter(Boolean)
}

/**
 * When you last did anything in each activity group and area: { cardio: iso, 'cardio:running':
 * iso, … }, absent when never.
 */
export function activityLast(S) {
  const { exercises } = trainingIndex(S)
  const out = {}
  const later = (k, d) => { if (!out[k] || out[k] < d) out[k] = d }
  for (const [id, x] of Object.entries(exercises)) {
    const ex = EXIDX[id] || (S?.customEx || []).find(e => e.id === id)
    for (const g of ACTIVITY_GROUPS) {
      const a = ex && g.of(ex)
      if (a) { later(g.id, x.d); later(g.id + ':' + a, x.d) }
    }
  }
  return out
}

/**
 * groupExercises for Cardio and Stretching: the same sorts and sections, an area being one of the
 * group's own (Running, Legs & hips…) rather than a muscle. Suggested puts what you have done most
 * recently first (a runner wants the run), then the area's staples, then the rest by name.
 * A section's `last` is when you last did anything in its area.
 */
function activityExercises(S, groupId, { sort, area }) {
  const g = activityGroup(groupId)
  const inWorkout = new Set((S?.active?.entries || []).map(e => e.id))
  const { exercises } = trainingIndex(S)
  const last = activityLast(S)
  let hidden = 0
  const byArea = {}
  for (const ex of allExercises(S || {})) {
    const a = g.of(ex)
    if (!a || (area && a !== area) || !exAvailable(S, ex)) continue
    if (inWorkout.has(ex.id)) { hidden++; continue }
    (byArea[a] || (byArea[a] = [])).push(ex)
  }
  const recentFirst = (a, b) => (exercises[b.id].d > exercises[a.id].d ? 1 : exercises[b.id].d < exercises[a.id].d ? -1 : byName(a, b))
  if (sort === 'recent') {
    const list = Object.values(byArea).flat().filter(ex => exercises[ex.id]).sort(recentFirst)
    return { sections: list.length ? [{ m: null, list }] : [], hidden }
  }
  const sections = g.areas.filter(a => byArea[a.id]).map(a => {
    const list = byArea[a.id]
    if (sort === 'az') list.sort(byName)
    else {
      const staple = id => { const i = a.staples.indexOf(id); return i < 0 ? Infinity : i }
      list.sort((x, y) => (exercises[x.id] && exercises[y.id] ? recentFirst(x, y)
        : exercises[x.id] ? -1 : exercises[y.id] ? 1 : staple(x.id) - staple(y.id) || byName(x, y)))
    }
    return { m: a.id, act: true, last: last[groupId + ':' + a.id] || null, list }
  })
  return { sections, hidden }
}
