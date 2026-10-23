// Combos kept for reuse (S.savedCombos): what the combo builder (sheets.jsx ComboBuilder) starts
// from instead of an empty list — its name, exercises in order, rounds, rest and kind, never the
// numbers of a round, which every use takes afresh from each exercise's own.
import { SG_NAME_MAX } from './superset-meta.js'
import { KIND_CONDITIONING, KIND_STRENGTH } from './conditioning.js'
import { uid } from './format.js'

export const SAVED_COMBOS_MAX = 30

/** `c` as a saved combo, or null when it is not one (fewer than two exercises). */
export function cleanCombo(c) {
  if (!c || typeof c !== 'object') return null
  const ids = [...new Set((Array.isArray(c.ids) ? c.ids : []).filter(id => typeof id === 'string' && id))]
  if (ids.length < 2) return null
  const rounds = Math.max(1, Math.min(20, Math.round(Number(c.rounds)) || 3))
  const rest = Math.max(0, Math.round(Number(c.rest)) || 0)
  return {
    id: typeof c.id === 'string' && c.id ? c.id : uid(),
    name: String(c.name || '').trim().slice(0, SG_NAME_MAX),
    ids, rounds, rest,
    kind: c.kind === KIND_STRENGTH ? KIND_STRENGTH : KIND_CONDITIONING,
  }
}

/** The saved combos `list` holds, cleaned, newest first as stored. */
export const savedCombosOf = list => (Array.isArray(list) ? list : []).map(cleanCombo).filter(Boolean)

/** `list` with `combo` saved: in place of the one with its id, otherwise first; at most SAVED_COMBOS_MAX. */
export function saveCombo(list, combo) {
  const c = cleanCombo(combo)
  if (!c) return savedCombosOf(list)
  const rest = savedCombosOf(list).filter(x => x.id !== c.id)
  const at = savedCombosOf(list).findIndex(x => x.id === c.id)
  const out = at < 0 ? [c, ...rest] : [...rest.slice(0, at), c, ...rest.slice(at)]
  return out.slice(0, SAVED_COMBOS_MAX)
}

/** `list` without the combo `id`. */
export const removeCombo = (list, id) => savedCombosOf(list).filter(c => c.id !== id)
