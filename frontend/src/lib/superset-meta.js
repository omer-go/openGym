// A superset's own name and its rest between rounds (#292). Carried on every member of the group
// (`sgName`, `sgRest` on a routine exercise, so on an entry's `target` once a session starts):
// a reorder, a member taken out or the routine copied into a session keeps them without a second
// structure to keep in step. The first member that has a value speaks for the group.
// `sgCombo` marks a group laid out as a combo: one card, a photo per exercise and one round on
// screen at a time (components/ComboCard.jsx). It changes the layout only; the flow, the rest
// and everything read back from the sets are a superset's.
// `sgKind: 'strength'` rides with it on a combo counted as strength work; without it a combo is
// conditioning, kept out of progression, records and hard sets (lib/conditioning.js).
export const SG_NAME_MAX = 40

const fieldsOf = (item, onTarget) => (onTarget ? item?.target : item) || {}

/** { name, rest, combo, kind } of the group of `unit` (indices into `list`); `onTarget` for session entries. */
export function supersetMeta(list, unit, { onTarget = false } = {}) {
  let name = '', rest = 0, combo = false, strength = false
  for (const idx of unit || []) {
    const f = fieldsOf(list?.[idx], onTarget)
    if (!name && typeof f.sgName === 'string' && f.sgName.trim()) name = f.sgName.trim().slice(0, SG_NAME_MAX)
    if (!rest && Number(f.sgRest) > 0) rest = Math.round(Number(f.sgRest))
    if (f.sgCombo === true) combo = true
    if (f.sgKind === 'strength') strength = true
  }
  const isCombo = combo && (unit || []).length > 1
  return { name, rest, combo: isCombo, kind: isCombo && strength ? 'strength' : isCombo ? 'conditioning' : '' }
}

/** Writes name, rest, combo and its kind onto every member of group `sg` in a routine's `ex`; empty clears. */
export function setSupersetMeta(ex, sg, { name = '', rest = 0, combo = false, kind = '' } = {}) {
  const clean = String(name || '').trim().slice(0, SG_NAME_MAX)
  const sec = Number(rest) > 0 ? Math.round(Number(rest)) : 0
  for (const e of ex || []) {
    if (!e || !sg || e.sg !== sg) continue
    if (clean) e.sgName = clean; else delete e.sgName
    if (sec) e.sgRest = sec; else delete e.sgRest
    if (combo) e.sgCombo = true; else delete e.sgCombo
    if (combo && kind === 'strength') e.sgKind = 'strength'; else delete e.sgKind
  }
  return ex
}

/** A member that joined or left a group: it takes the group's meta, or drops what it carried. */
export function syncSupersetMeta(ex) {
  const groups = new Map()
  for (const e of ex || []) {
    if (!e?.sg) { if (e) { delete e.sgName; delete e.sgRest; delete e.sgCombo; delete e.sgKind }; continue }
    const g = groups.get(e.sg) || { name: '', rest: 0, combo: false, kind: '' }
    if (!g.name && e.sgName) g.name = e.sgName
    if (!g.rest && Number(e.sgRest) > 0) g.rest = Number(e.sgRest)
    if (e.sgCombo === true) g.combo = true
    if (e.sgKind === 'strength') g.kind = 'strength'
    groups.set(e.sg, g)
  }
  for (const [sg, g] of groups) setSupersetMeta(ex, sg, g)
  return ex
}

/**
 * The session-entry side of syncSupersetMeta: a member that joined a combo (paired onto it, or
 * saved before pairing carried the flag) takes the group's combo flag, kind, name and rest on its
 * `target`, so it counts as the rest of the combo does (lib/conditioning.js). Only adds what a
 * member lacks; a group without a combo member is left as it is. Changes `entries` in place and
 * says whether it changed any.
 */
export function syncComboEntries(entries) {
  const groups = new Map()
  for (const e of entries || []) {
    const f = e?.sg && e.target
    if (!f || f.sgCombo !== true) continue
    const g = groups.get(e.sg) || {}
    if (f.sgKind === 'strength') g.sgKind = 'strength'
    if (!g.sgName && typeof f.sgName === 'string' && f.sgName.trim()) g.sgName = f.sgName
    if (!g.sgRest && Number(f.sgRest) > 0) g.sgRest = f.sgRest
    groups.set(e.sg, g)
  }
  let changed = false
  for (const e of entries || []) {
    const g = e?.sg && groups.get(e.sg)
    if (!g || e.target?.sgCombo === true) continue
    e.target = { ...(e.target || {}), sgCombo: true, ...g }
    changed = true
  }
  return changed
}

/** syncComboEntries over a state's saved workouts and its active one; true when any changed. */
export function syncComboState(s) {
  let changed = false
  for (const w of s?.workouts || []) if (Array.isArray(w?.entries) && syncComboEntries(w.entries)) changed = true
  if (Array.isArray(s?.active?.entries) && syncComboEntries(s.active.entries)) changed = true
  return changed
}
