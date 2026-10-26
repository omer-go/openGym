// Per-muscle roles from the catalogue's `muscleRoles` (catalogue/README.md): which single muscle
// does the work, which help, which hold the joints still. Seeded for part of the catalogue only,
// so every caller keeps a fallback for an exercise with none. The data is loaded on first use,
// not with the app: most sessions never open an exercise's detail.

import { loadOf } from './muscles.js'

let roles = null, pending = null

export function loadMuscleRoles() {
  if (roles) return Promise.resolve(roles)
  return pending ||= import('./exercise-roles.json').then(m => (roles = m.default || m))
}

export const muscleRolesOf = id => (roles && roles[id]) || null
/** Whether the roles are in: what was worked out from them before must be worked out again. */
export const rolesLoaded = () => !!roles

// English names, also the i18n keys.
export const ROLE_MUSCLE_NAME = {
  'front-delt': 'Front delt', 'side-delt': 'Side delt', 'rear-delt': 'Rear delt',
  supraspinatus: 'Supraspinatus', infraspinatus: 'Infraspinatus', 'teres-minor': 'Teres minor',
  subscapularis: 'Subscapularis', 'teres-major': 'Teres major',
  'upper-trap': 'Upper traps', 'middle-trap': 'Middle traps', 'lower-trap': 'Lower traps',
  rhomboids: 'Rhomboids', 'levator-scapulae': 'Levator scapulae', 'serratus-anterior': 'Serratus',
  'pec-minor': 'Pec minor',
  'pec-major-clavicular': 'Upper chest', 'pec-major-sternal': 'Mid and lower chest', lats: 'Lats',
  coracobrachialis: 'Coracobrachialis',
  biceps: 'Biceps', brachialis: 'Brachialis', brachioradialis: 'Brachioradialis', triceps: 'Triceps',
  'triceps-long-head': 'Triceps (long head)', 'wrist-flexors': 'Wrist flexors',
  'wrist-extensors': 'Wrist extensors',
  'rectus-abdominis': 'Abs', obliques: 'Obliques', 'transverse-abdominis': 'Deep abs',
  'erector-spinae': 'Spinal erectors', 'quadratus-lumborum': 'Quadratus lumborum',
  'glute-max': 'Glutes', 'glute-med': 'Side glutes', 'hip-flexors': 'Hip flexors',
  adductors: 'Adductors', 'adductor-magnus': 'Adductor magnus', hamstrings: 'Hamstrings',
  quads: 'Quads', calves: 'Calves', 'tibialis-anterior': 'Shins',
  sternocleidomastoid: 'Front of neck', 'neck-extensors': 'Back of neck',
}

// The rows the detail sheet shows. `steady` folds the three stabilizer roles into one line: the
// difference between them matters to the catalogue, not to someone choosing a lift.
export function roleRows(r) {
  if (!r || !r.target?.length) return null
  const steady = [...(r.dynamicStabilizers || []), ...(r.stabilizers || []), ...(r.antagonistStabilizers || [])]
  return {
    main: [
      { key: 'target', label: 'Works', muscles: r.target },
      ...(r.synergists?.length ? [{ key: 'synergists', label: 'Helps', muscles: r.synergists }] : []),
    ],
    steady: steady.length ? { key: 'steady', label: 'Holds steady', muscles: steady } : null,
  }
}

// The chips on a workout card: the target muscles, then the first few helpers (the catalogue
// lists them strongest first). Names are English, for t().
export function roleChips(r, helpers = 3) {
  if (!r || !r.target?.length) return null
  const name = m => ROLE_MUSCLE_NAME[m] || m
  return { targets: r.target.map(name), helpers: (r.synergists || []).slice(0, helpers).map(name) }
}

// The parts of each body-map region (lib/muscles.js MUSCLES) a breakdown splits it into. A row
// can gather several role muscles: the four rotator-cuff muscles read as one. Regions with a
// single part (quads, calves…) have no breakdown.
export const REGION_PARTS = {
  deltoids: [['Front delt', ['front-delt']], ['Side delt', ['side-delt']], ['Rear delt', ['rear-delt']],
    ['Rotator cuff', ['supraspinatus', 'infraspinatus', 'teres-minor', 'subscapularis']]],
  trapezius: [['Upper traps', ['upper-trap']], ['Middle traps', ['middle-trap']], ['Lower traps', ['lower-trap']]],
  'upper-back': [['Lats', ['lats']], ['Rhomboids', ['rhomboids']], ['Teres major', ['teres-major']]],
  chest: [['Upper chest', ['pec-major-clavicular']], ['Mid and lower chest', ['pec-major-sternal']], ['Pec minor', ['pec-minor']]],
  biceps: [['Biceps', ['biceps']], ['Brachialis', ['brachialis']]],
  triceps: [['Triceps (long head)', ['triceps-long-head']], ['Triceps', ['triceps']]],
  forearm: [['Brachioradialis', ['brachioradialis']], ['Wrist flexors', ['wrist-flexors']], ['Wrist extensors', ['wrist-extensors']]],
  abs: [['Abs', ['rectus-abdominis']], ['Deep abs', ['transverse-abdominis']]],
  'lower-back': [['Spinal erectors', ['erector-spinae']], ['Quadratus lumborum', ['quadratus-lumborum']]],
  gluteal: [['Glutes', ['glute-max']], ['Side glutes', ['glute-med']]],
  adductors: [['Adductors', ['adductors']], ['Adductor magnus', ['adductor-magnus']]],
}

// How much a set counts for a muscle in each role: the target fully, a helper as a secondary
// muscle counts on the body map (lib/muscles.js SECONDARY), a stabilizer not at all.
export const ROLE_WEIGHT = { target: 1, synergists: 0.4 }
// The glutes drive a squat, a lunge or a deadlift beside the quads or the hamstrings, and the
// catalogue lists them as a target of each; counted in full, every leg day would fill the glutes
// twice over. As a co-target they count half a set; a hip thrust or a kickback, aimed at them
// alone, still a whole one.
export const SHARED_GLUTES = 0.5

// The body-map region (lib/muscles.js MUSCLES) each role muscle belongs to. The neck muscles and
// the coracobrachialis have none: no muscle group counts them.
const REGION_OF = {
  'front-delt': 'deltoids', 'side-delt': 'deltoids', 'rear-delt': 'deltoids', supraspinatus: 'deltoids',
  infraspinatus: 'deltoids', 'teres-minor': 'deltoids', subscapularis: 'deltoids',
  'upper-trap': 'trapezius', 'middle-trap': 'trapezius', 'lower-trap': 'trapezius', 'levator-scapulae': 'trapezius',
  lats: 'upper-back', rhomboids: 'upper-back', 'teres-major': 'upper-back',
  'pec-major-sternal': 'chest', 'pec-major-clavicular': 'chest', 'pec-minor': 'chest',
  biceps: 'biceps', brachialis: 'biceps', triceps: 'triceps', 'triceps-long-head': 'triceps',
  brachioradialis: 'forearm', 'wrist-flexors': 'forearm', 'wrist-extensors': 'forearm',
  'rectus-abdominis': 'abs', 'transverse-abdominis': 'abs', obliques: 'obliques', 'serratus-anterior': 'serratus',
  'erector-spinae': 'lower-back', 'quadratus-lumborum': 'lower-back',
  'glute-max': 'gluteal', 'glute-med': 'gluteal', adductors: 'adductors', 'adductor-magnus': 'adductors',
  'hip-flexors': 'hip-flexors', quads: 'quadriceps', hamstrings: 'hamstring', calves: 'calves',
  'tibialis-anterior': 'tibialis',
}

/**
 * Region -> weight from an exercise's roles (`r`): 1 where it targets a muscle of the region,
 * 0.4 where one only helps (ROLE_WEIGHT), nothing where the region only holds steady, and the
 * glutes half when they share the target with the quads or hamstrings (SHARED_GLUTES). Null
 * without roles, so the caller falls back to the coarse muscles (lib/muscles.js musclesOf).
 */
export function roleWeights(r) {
  if (!r || !r.target?.length) return null
  const out = {}
  const shared = r.target.includes('glute-max') && r.target.some(m => m === 'quads' || m === 'hamstrings')
  for (const role in ROLE_WEIGHT) for (const m of r[role] || []) {
    const region = REGION_OF[m]
    const w = role === 'target' && m === 'glute-max' && shared ? SHARED_GLUTES : ROLE_WEIGHT[role]
    if (region) out[region] = Math.max(out[region] || 0, w)
  }
  return Object.keys(out).length ? out : null
}

/**
 * One body-map region's sets split into its parts, counted from the exercises that have roles.
 * `items` are [{ id, ex, sets }] (muscles.js doneSetItems). `total` is the region's sets as the
 * body map counts them and `covered` the share of those from exercises with roles, so the screen
 * can say how much of the region the split speaks for. Null when the region has no parts or no
 * exercise with roles reaches it.
 */
export function regionBreakdown(items, region, rolesOf = muscleRolesOf) {
  const parts = REGION_PARTS[region]
  if (!parts) return null
  const partOf = {}
  for (const [name, muscles] of parts) for (const m of muscles) partOf[m] = name
  const sets = Object.fromEntries(parts.map(([name]) => [name, 0]))
  const withRoles = []
  for (const item of items || []) {
    const r = item?.sets && rolesOf(item.id)
    if (!r) continue
    withRoles.push(item)
    for (const role in ROLE_WEIGHT) for (const m of r[role] || []) {
      if (partOf[m]) sets[partOf[m]] += item.sets * ROLE_WEIGHT[role]
    }
  }
  const round = n => Math.round((n || 0) * 10) / 10
  const rows = parts.map(([name]) => ({ name, sets: round(sets[name]) }))
  if (!rows.some(r => r.sets > 0)) return null
  return { rows, covered: round(loadOf(withRoles)[region]), total: round(loadOf(items || [])[region]) }
}

// The parts a focus may name: the ones a lifter trains on purpose. The rotator cuff, pec minor
// and teres major only ever help, so a low count there says nothing; the traps work hardest
// holding a deadlift or a carry, which a stabilizer's zero weight leaves out.
export const GAP_PARTS = new Set(['Front delt', 'Side delt', 'Rear delt', 'Upper chest', 'Mid and lower chest', 'Lats', 'Rhomboids'])

/**
 * The part of a region the recent work trained least, as { name, sets, muscles, parts }, or null.
 * `items` as regionBreakdown takes them (the caller picks the window). Parts are compared by the
 * sets that targeted them; the sets they only helped in break a tie, so the side delts a press
 * helps never stand in for a lateral raise. Parts still tied after both are all named (`parts`,
 * each { name, muscles }; `name` and `sets` are the first's, `muscles` all of theirs). Only speaks
 * when the region was really trained (`min` sets) and the exercises with roles account for at
 * least half of it, and says nothing when every part is level.
 */
export function partFocus(items, region, { rolesOf = muscleRolesOf, min = 4 } = {}) {
  const b = regionBreakdown(items, region, rolesOf)
  if (!b || b.total < min || b.covered < b.total / 2) return null
  const only = role => id => { const r = rolesOf(id); return r && { [role]: r[role] || [] } }
  const count = role => Object.fromEntries((regionBreakdown(items, region, only(role))?.rows || []).map(r => [r.name, r.sets]))
  const target = count('target'), helps = count('synergists')
  const rows = REGION_PARTS[region].filter(([name]) => GAP_PARTS.has(name))
    .map(([name, muscles]) => ({ name, muscles, t: target[name] || 0, h: helps[name] || 0 }))
  if (rows.length < 2) return null
  const below = (a, c) => a.t - c.t || a.h - c.h
  const low = rows.reduce((a, r) => (below(r, a) < 0 ? r : a))
  const parts = rows.filter(r => !below(r, low))
  if (parts.length === rows.length) return null
  return { name: low.name, sets: Math.round(low.t), muscles: parts.flatMap(r => r.muscles), parts: parts.map(({ name, muscles }) => ({ name, muscles })) }
}

/** The parts of `region` an exercise targets, as partFocus names them ([{ name, muscles }]). */
export function targetParts(id, region, rolesOf = muscleRolesOf) {
  const target = rolesOf(id)?.target || []
  return (REGION_PARTS[region] || []).filter(([name, muscles]) => GAP_PARTS.has(name) && muscles.some(m => target.includes(m)))
    .map(([name, muscles]) => ({ name, muscles }))
}
