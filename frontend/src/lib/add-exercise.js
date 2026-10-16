// The workout's Add exercise sheet: muscle groups first, then the exercises of the group you tap.
// Pure: reads state, never writes. The sheet itself is components/AddExerciseSheet.jsx.
//
// A group is a handful of the body map's own muscles (lib/muscles.js) — its "areas". The map has
// no heads or regions finer than a muscle, so Back is upper back + lower back + traps and Chest is
// the chest. Each area has a status for the week: in this workout ('td'), trained since the week
// began ('wk'), or not yet (''). A muscle counts as trained the way the one-tap workouts count it
// (generate.js trainingIndex): a completed work set of an exercise that works it as a primary.
import { EXIDX, allExercises, isCardio } from './exercises.js'
import { exAvailable } from './equipment.js'
import { musclesOf } from './muscles.js'
import { primaryMuscleOf } from './strength-exercises.js'
import { lastEntryFor } from './history.js'
import { trainingIndex, candidatesFor } from './generate.js'
import { todayISO, weekKey, weekStartOf } from './format.js'
import { exerciseNameFor } from './i18n-core.js'

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
 * Per muscle: `st` ('td' in this workout, 'wk' trained this week, '' not yet) and `last`, the
 * ISO day it was last trained (null when never).
 */
export function muscleStatus(S, today = todayISO()) {
  const { muscles } = trainingIndex(S)
  const week = weekKey(today, weekStartOf(S))
  const now = new Set()
  for (const e of S?.active?.entries || []) {
    for (const [slug, w] of Object.entries(EXIDX[e.id] ? musclesOf(EXIDX[e.id]) : {})) if (w >= TRAINED_AT) now.add(slug)
  }
  const out = {}
  for (const g of ADD_GROUPS) for (const slug of g.m) {
    const last = muscles[slug] || null
    out[slug] = { st: now.has(slug) ? 'td' : last && last >= week ? 'wk' : '', last }
  }
  return out
}

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)

/**
 * The groups worth doing next, best first, at most `n`: the larger the share of a group's areas
 * not trained this week the better, then the longer since any of it was. A group with every area
 * covered is never suggested.
 */
export function suggestedGroups(status, today = todayISO(), n = 2) {
  return ADD_GROUPS.map(g => {
    const open = g.m.filter(s => !status[s]?.st).length
    const lasts = g.m.map(s => status[s]?.last).filter(Boolean).sort()
    const since = g.m.some(s => status[s]?.st === 'td') ? 0 : lasts.length ? Math.min(14, daysBetween(lasts[lasts.length - 1], today)) : 14
    return { id: g.id, open, score: open / g.m.length * 10 + since / 14 }
  }).filter(x => x.open).sort((a, b) => b.score - a.score).slice(0, n).map(x => x.id)
}

// The usable exercises each muscle is the primary of, built once per custom-exercise list.
let INDEX = null
function byPrimary(S) {
  const key = S?.customEx || null
  if (INDEX && INDEX.key === key) return INDEX.map
  const map = {}
  for (const ex of allExercises(S || {})) {
    if (isCardio(ex)) continue
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

/**
 * The exercises of a group, as the sheet lists them. `sort`:
 * - 'suggested': one section per area, areas not trained this week first and the longest-rested
 *   of those first; within an area what you have logged (longest ago first, so it rotates), then
 *   the staple lifts, then the rest by name — generate.js's order, so it matches one-tap workouts.
 * - 'az': one section per area in the group's order, exercises by name.
 * - 'recent': one section of everything you have logged in the group, most recent first.
 * Exercises already in the workout are left out and counted in `hidden`; so is what the active
 * equipment profile rules out. `area` narrows to one muscle.
 */
export function groupExercises(S, groupId, { sort = 'suggested', area = '', status = muscleStatus(S) } = {}) {
  const g = ADD_GROUPS.find(x => x.id === groupId)
  if (!g) return { sections: [], hidden: 0 }
  const map = byPrimary(S)
  const inWorkout = new Set((S?.active?.entries || []).map(e => e.id))
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
      const first = candidatesFor(S, m)
      const at = id => { const i = first.indexOf(id); return i < 0 ? Infinity : i }
      list.sort((a, b) => at(a.id) - at(b.id) || byName(a, b))
    }
    return { m, st: status[m]?.st || '', last: status[m]?.last || null, list }
  }).filter(x => x.list.length)
  if (sort === 'suggested') {
    // Array#sort is stable: equal areas keep the group's own order.
    sections = sections.sort((a, b) => STATUS_RANK[a.st] - STATUS_RANK[b.st] || (a.last || '').localeCompare(b.last || ''))
  }
  return { sections, hidden }
}
