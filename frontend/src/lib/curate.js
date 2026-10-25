// Choose your exercises (views/Curate.jsx): go through the catalogue one small pile at a time and
// keep or drop each lift. Pure: reads state, and the two writers below change a state draft.
//
// Your gym comes first: it is the active equipment profile (lib/equipment.js), and what it rules
// out never shows up here again. A pile is one muscle group (Add exercise's ADD_GROUPS) with one
// kind of kit (exercise-facets.js KITS), as Add exercise's "What are you using?" asks. A pile
// deals the lifts on your list first: the popular lifts (lib/popular.js), most popular first, and
// your own. The rest of the catalogue only when asked for, plainly named ones first.
//
// Your list is what one-tap and program days pick from: the popular lifts you have not dropped,
// and whatever you have kept. Keeping a lift stars it (lib/favourites.js), which adds it to the
// list or puts it ahead there; dropping it is "Not suggested" (lib/skipped.js). An exercise that
// is either counts as reviewed.
import { allExercises, isCardio, isCustomEx } from './exercises.js'
import { isStretch } from './activities.js'
import { primaryMuscleOf } from './strength-exercises.js'
import { ADD_GROUPS } from './add-exercise.js'
import { ALL_EQUIPMENT, ACC_V, accessoriesOf, activeProfile, eqAvailable, newProfile, profileEquipment } from './equipment.js'
import { KITS, kitOf, isTail, isDemo, rareWords } from './exercise-facets.js'
import { POPULAR_IDS } from './popular.js'
import { favIds } from './favourites.js'
import { skipIds } from './skipped.js'

// The switches of Your gym: the kit a gym-goer names, each standing for the catalogue's
// equipment values (and the bench and bar, which exercises need without naming them). English
// names are i18n keys. Equipment none of these names gets a switch of its own, under `more`.
export const GYM_KIT = [
  { id: 'barbell', n: 'Barbell', eq: ['barbell', 'olympic barbell', 'ez barbell', 'trap bar'] },
  { id: 'dumbbell', n: 'Dumbbell', eq: ['dumbbell'] },
  { id: 'cable', n: 'Cable', eq: ['cable', 'rope'] },
  { id: 'machine', n: 'Machine', eq: ['leverage machine', 'sled machine', 'assisted'] },
  { id: 'smith', n: 'Smith machine', eq: ['smith machine'] },
  { id: 'bench', n: 'Bench', eq: ['bench'] },
  { id: 'bar', n: 'Pull-up bar', eq: ['pull-up bar'] },
  { id: 'kettlebell', n: 'Kettlebell', eq: ['kettlebell'] },
  { id: 'band', n: 'Band', eq: ['band', 'resistance band'] },
]
const NAMED = new Set(GYM_KIT.flatMap(k => k.eq))
const ALWAYS = 'body weight'

// Strength work only: cardio and stretches are not chosen this way, nor a form check or a camera
// angle, which film a lift that is in the catalogue under its own name.
const strength = ex => !isCardio(ex) && !isStretch(ex) && !isDemo(ex)

/** What the gym has: the active profile's equipment, or everything when no profile is on. */
export const gymOf = S => (activeProfile(S) ? profileEquipment(activeProfile(S)) : ALL_EQUIPMENT)

/**
 * The switches, each with `count`: the strength exercises that need it (the catalogue's own and
 * yours). The named kit first, then the rest of the equipment that has exercises (`more`), most
 * first. Body weight has none: it is always there.
 */
export function gymRows(S) {
  const list = allExercises(S || {}).filter(strength)
  const count = eqs => list.filter(ex => eqs.includes(ex.eq) || accessoriesOf(ex).some(a => eqs.includes(a))).length
  const named = GYM_KIT.map(k => ({ ...k, count: count(k.eq) }))
  const more = ALL_EQUIPMENT.filter(e => !NAMED.has(e) && e !== ALWAYS)
    .map(e => ({ id: e, n: e, eq: [e], more: true, count: count([e]) }))
    .filter(r => r.count > 0).sort((a, b) => b.count - a.count)
  return [...named, ...more]
}

/** Whether a switch is on in `have` (an equipment list): all it stands for is there. */
export const rowOn = (have, row) => row.eq.every(e => have.includes(e))

/** `have` with a switch flipped. */
export function flipRow(have, row) {
  const on = rowOn(have, row)
  const rest = have.filter(e => !row.eq.includes(e))
  return on ? rest : [...rest, ...row.eq]
}

/** How many strength exercises fit `have`, of how many. */
export function gymFit(S, have) {
  const list = allExercises(S || {}).filter(strength)
  return { fit: list.filter(ex => eqAvailable(have, ex)).length, total: list.length }
}

/**
 * Saves Your gym in a state draft: into the active profile (or the one picked in Settings, or
 * the first), else a new one named `name`; then switches the equipment filter on, so the rest
 * of the app leaves out the same exercises. Returns the profile.
 */
export function saveGym(s, have, name) {
  s.equipProfiles = s.equipProfiles || []
  let p = s.equipProfiles.find(x => x.id === s.activeEquipId) || s.equipProfiles[0]
  if (!p) { p = newProfile(name); s.equipProfiles.push(p) }
  p.equipment = [...have]
  p.accV = ACC_V
  s.activeEquipId = p.id
  s.equipFilterOn = true
  return p
}

// The popular lifts, most popular first: a pile deals them before anything else.
const LIST_RANK = new Map(POPULAR_IDS.map((id, i) => [id, i]))
const nameOf = ex => (ex.n || '').toLowerCase()
// Words in a name that mark a variation of a lift, not the lift: a band added to it, a hold of
// it, a ball under it.
const VARIANT = /\bbanded\b|\bwith band\b|\bhold\b|\bon (a |an )?(stability|exercise|swiss) ball\b|\bversion\b/

/** On the list a pile deals first: a popular lift, or your own. */
export const onList = ex => LIST_RANK.has(ex.id) || isCustomEx(ex)

// A plain name: a few common words, nothing in brackets, not the long tail and not a variation
// of something else. Off the list, these are dealt first.
const isPlain = ex => {
  const n = nameOf(ex)
  return !isTail(ex) && !/[()]/.test(n) && !VARIANT.test(n) && n.split(/\s+/).length <= 5 && rareWords(ex) === 0
}

// The order a pile deals in: the list by rank, your own, then plain names before the rest, then
// the shorter name.
const rank = ex => (LIST_RANK.has(ex.id) ? LIST_RANK.get(ex.id) : Infinity)
const byDeal = (a, b) => rank(a) - rank(b) || onList(b) - onList(a) || isPlain(b) - isPlain(a) || rareWords(a) - rareWords(b) ||
  nameOf(a).length - nameOf(b).length || (nameOf(a) < nameOf(b) ? -1 : nameOf(a) > nameOf(b) ? 1 : 0)

/** The strength exercises of a muscle group that fit `have`, in the order a pile deals them. */
export function groupPool(S, groupId, have = gymOf(S)) {
  const g = ADD_GROUPS.find(x => x.id === groupId)
  if (!g) return []
  return allExercises(S || {})
    .filter(ex => strength(ex) && g.m.includes(primaryMuscleOf(ex)?.slug) && eqAvailable(have, ex))
    .sort(byDeal)
}

/** The ids you have kept or dropped. */
export const reviewedIds = S => new Set([...favIds(S), ...skipIds(S)])

/** Whether `ex` is on your list: a popular lift you have not dropped, or one you have kept. */
export const inList = (S, ex) => favIds(S).includes(ex.id) || (onList(ex) && !skipIds(S).includes(ex.id))

/**
 * How far along a list is: `total`, `common` (on the list a pile deals first), how many are
 * `reviewed`, `kept`, `listed` (inList), and how many are still to go of the common ones (`left`)
 * and of the rest (`rare`).
 */
export function progressOf(S, list) {
  const fav = new Set(favIds(S)), skip = new Set(skipIds(S)), done = reviewedIds(S)
  let common = 0, reviewed = 0, kept = 0, listed = 0, left = 0, rare = 0
  for (const ex of list) {
    const c = onList(ex)
    if (c) common++
    if (fav.has(ex.id)) kept++
    if (fav.has(ex.id) || (c && !skip.has(ex.id))) listed++
    if (done.has(ex.id)) reviewed++
    else if (c) left++
    else rare++
  }
  return { total: list.length, common, reviewed, kept, listed, left, rare }
}

/**
 * A group's piles: one per kind of kit that has exercises in `pool`, in KITS order (Other
 * last), each with its progressOf.
 */
export function pilesOf(S, pool) {
  return KITS.map(k => ({ id: k.id, n: k.n, list: pool.filter(ex => kitOf(ex) === k.id) }))
    .filter(p => p.list.length)
    .map(p => ({ ...p, ...progressOf(S, p.list) }))
}

/**
 * What a pile deals now: what you have not reviewed nor `passed` (skipped this time round), the
 * ones on the list only unless `all`.
 */
export function deckOf(S, list, { all = false, passed = [] } = {}) {
  const done = reviewedIds(S), skip = new Set(passed)
  return list.filter(ex => !done.has(ex.id) && !skip.has(ex.id) && (all || onList(ex)))
}

/**
 * Records a card in a state draft: 'keep' stars it, 'drop' leaves it out of suggestions, and
 * either clears the other. `null` forgets the choice (Undo).
 */
export function decide(s, id, verdict) {
  const fav = favIds(s).filter(x => x !== id), skip = skipIds(s).filter(x => x !== id)
  s.favEx = verdict === 'keep' ? [...fav, id] : fav
  s.skipEx = verdict === 'drop' ? [...skip, id] : skip
}
