// What a swap picker opens on (#473): the exercises that train the same target muscle as the one
// being replaced, the ones on the same equipment first. A machine that is taken is usually
// swapped for another way to hit the same muscle, often on the same kind of kit.
//
// `tg` is the catalogue's one-word target (a custom exercise keeps the primary picked first, see
// CustomExForm), so "same muscle" means the same primary, not merely the same body part.
//
// Where the catalogue has muscle roles for both (muscle-roles.js), they sharpen that: "delts"
// is a press, a lateral raise and a reverse fly alike, but their target muscles are the front,
// side and rear delt. The ones on the same target muscles come first, then those sharing one,
// then the rest; among exercises on the same kit, the ones with the same helper muscles (the
// same movement, as a rule) lead. Until the roles are loaded, or for an exercise without any,
// the order is the one above.
import { muscleRolesOf } from './muscle-roles.js'

/** The target muscle a swap away from `ex` should start on, or '' when it has none. */
export const swapMuscleOf = ex => (ex && typeof ex.tg === 'string' ? ex.tg : '')

const overlap = (a = [], b = []) => {
  const inB = new Set(b), shared = a.filter(m => inB.has(m)).length
  return { shared, union: a.length + b.length - shared }
}

// A head of a muscle and the muscle itself, or two heads of one: not the same muscles, but not
// two different ones either. An incline curl (the long head) is still a curl's equivalent, and a
// seated calf raise (the soleus) a standing one's (the gastrocnemius).
const WHOLE = {
  'biceps-long-head': 'biceps', 'biceps-short-head': 'biceps', 'triceps-long-head': 'triceps',
  gastrocnemius: 'calves', soleus: 'calves',
}
const wholeOf = list => (list || []).map(m => WHOLE[m] || m)

/**
 * How alike `a` and `b` are by their muscle roles: `target` 2 when they target the same muscles,
 * 1 when they share one (or a head of one, WHOLE), 0 when they share none or either has no roles; `helpers` the share of
 * their helper muscles (synergists) they have in common, 0 to 1.
 */
export function roleLikeness(a, b, rolesOf = muscleRolesOf) {
  const ra = a && rolesOf(a.id), rb = b && rolesOf(b.id)
  if (!ra?.target?.length || !rb?.target?.length) return { target: 0, helpers: 0 }
  const t = overlap(ra.target, rb.target), h = overlap(ra.synergists, rb.synergists)
  return {
    target: t.shared === 0 ? (overlap(wholeOf(ra.target), wholeOf(rb.target)).shared ? 1 : 0) : t.shared === t.union ? 2 : 1,
    helpers: h.union ? h.shared / h.union : 0,
  }
}

/**
 * The exercises in `list` sharing `ex`'s target muscle, `ex` itself left out: by muscle roles
 * first (same target muscles, then a shared one), then those on its equipment, then by shared
 * helper muscles. Otherwise the list's own order is kept (Array#sort is stable), so favourites
 * floated to the top earlier stay on top within each tier.
 */
export function sameMuscleFirst(list, ex, rolesOf = muscleRolesOf) {
  const tg = swapMuscleOf(ex)
  if (!tg) return []
  const eq = ex.eq || ''
  const like = new Map()
  const of = e => like.get(e) || like.set(e, roleLikeness(ex, e, rolesOf)).get(e)
  return list
    .filter(e => e && e.tg === tg && e.id !== ex.id)
    .sort((a, b) => (of(b).target - of(a).target)
      || (Number(!!eq && b.eq === eq) - Number(!!eq && a.eq === eq))
      || (of(b).helpers - of(a).helpers))
}
