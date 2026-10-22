// Pure reads behind the combo card (components/ComboCard.jsx). A combo is a superset laid out
// as one card that shows a single round at a time: round r is every member's r-th work set
// (warm-ups sit outside the rounds), so the card never needs a structure of its own and
// everything already reading a superset's sets keeps working. A set is one row, or two for a
// timed hold logged per side (its L row and its R row, setSpanAt), and a round takes both.
import { isWarmupRow } from './workout-model.js'
import { setSpanAt } from './history.js'

/** The work sets of `entry` as [from, count] spans of `entry.sets`, in order: round r is the r-th. */
export function comboSpans(entry) {
  const rows = entry?.sets || []
  const out = []
  for (let i = 0; i < rows.length;) {
    const [from, count] = setSpanAt(rows, i)
    const span = from === i ? count : 1
    if (!isWarmupRow(rows[i])) out.push([i, span])
    i += span
  }
  return out
}

/** The [from, count] span of round `r` for `entry`, or null when it has fewer rounds than that. */
export const comboSpanAt = (entry, r) => comboSpans(entry)[r] || null

const spanDone = (entry, [from, count]) => entry.sets.slice(from, from + count).every(set => set?.done === true)

/**
 * Where the combo of `unit` (entry indices) stands:
 * - `rounds`  the most work sets any member has
 * - `done[r]` round r is finished: every member that has a set r has it done
 * - `round`   the first unfinished round, or the last one once everything is done
 * - `allDone` no unfinished round left
 */
export function comboRound(entries, unit) {
  const members = (unit || []).map(idx => entries?.[idx]).filter(Boolean)
  const spans = members.map(comboSpans)
  const rounds = spans.reduce((n, s) => Math.max(n, s.length), 0)
  const done = Array.from({ length: rounds }, (_, r) =>
    members.every((e, k) => !spans[k][r] || spanDone(e, spans[k][r])))
  const first = done.indexOf(false)
  return { rounds, done, round: first < 0 ? Math.max(0, rounds - 1) : first, allDone: rounds > 0 && first < 0 }
}

/**
 * The rows of a combo member built for `rounds` rounds: warm-ups dropped (a combo starts warm),
 * the last set copied forward when the plan has fewer, cut down when it has more.
 */
export function fitRounds(sets, rounds) {
  const n = Math.max(1, Math.round(Number(rounds) || 1))
  const spans = comboSpans({ sets }).map(([from, count]) => sets.slice(from, from + count))
  if (!spans.length) return []
  const out = spans.slice(0, n)
  while (out.length < n) out.push(out[out.length - 1].map(set => ({ ...set, done: false })))
  return out.flat().map(set => ({ ...set }))
}

/**
 * A combo's member as it is added — to a session (an entry: the meta rides on its `target`) or
 * to a routine (an exercise: on itself). Every member gets the combo's rounds as its sets and the
 * group's name, rest between rounds and combo flag (lib/superset-meta.js), under one group id.
 */
export function asComboMember(item, { sg, rounds, name = '', rest = 0, kind = '' }, { onTarget = false } = {}) {
  const n = Math.max(1, Math.round(Number(rounds) || 1))
  const meta = { sgCombo: true }
  if (kind === 'strength') meta.sgKind = 'strength'
  const clean = String(name || '').trim()
  if (clean) meta.sgName = clean
  if (Number(rest) > 0) meta.sgRest = Math.round(Number(rest))
  if (!onTarget) return { ...item, sets: n, sg, ...meta }
  return { ...item, sg, sets: fitRounds(item.sets, n), target: { ...(item.target || {}), sets: n, ...meta } }
}
