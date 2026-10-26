// Programs: a week of one-tap days (generate.js) in an order, for a number of weeks. Nothing is
// fixed to a weekday, nor to a calendar week: a program week lasts until its days are done, so a
// day that doesn't fit before Sunday carries into the next one. A session counts for the first
// day of its kind still open (lib/workout-kind.js), so doing Pull before Push ticks Pull and
// leaves Push next. Where the days left fall is a forecast (programForecast), a rest day between
// two when the week has room.
//
// `S.program = { template, days: ['push', 'pull', …], startedAt: 'YYYY-MM-DD', weeks }`.
//
// Sizing. A program day is as long as the week's goal needs (goals.js): what a group still
// lacks this calendar week is shared out over the days forecast in it that train it, and the day
// takes as many exercises as reach its share. The picks are greedy (coverage.js pickForCoverage), so the first
// n of a long run are about what a run of n would pick.
import { ADD_GROUPS } from './add-exercise.js'
import { GEN_TYPES, MAX_GEN_COUNT, genCount, genGroupsOf, genScheme, generateWorkout } from './generate.js'
import { USEFUL, entryWeights, groupCredit, weeklyDone, weeklyLack, weeklyNeed } from './coverage.js'
import { weeklyTargetOf } from './goals.js'
import { isoOf, startOfWeek, weekStartOf } from './format.js'
import { workoutKind } from './workout-kind.js'

export const PROGRAM_TEMPLATES = [
  { id: 'full-3', n: 'Full body', sub: 'Three full-body days', days: ['full', 'full', 'full'] },
  { id: 'ppl-full-4', n: 'Push, pull, legs + full', sub: 'Four days, the fourth a full body', days: ['push', 'pull', 'legs', 'full'] },
  { id: 'ppl-3', n: 'Push, pull, legs', sub: 'Three days, each group once', days: ['push', 'pull', 'legs'] },
  { id: 'ppl-6', n: 'Push, pull, legs ×2', sub: 'Six days, each group twice', days: ['push', 'pull', 'legs', 'push', 'pull', 'legs'] },
]
export const PROGRAM_WEEKS = [4, 6, 8, 12]
export const DEFAULT_WEEKS = 8
export const MIN_DAY = 3   // exercises a sized day never goes under

const DAY = 864e5
export const templateOf = id => PROGRAM_TEMPLATES.find(p => p.id === id) || null

/** A new program from a template, starting on `today`. */
export function newProgram(template, { weeks = DEFAULT_WEEKS, today = isoOf(new Date()) } = {}) {
  const tpl = templateOf(template)
  if (!tpl) return null
  return { template: tpl.id, days: [...tpl.days], startedAt: today, weeks }
}

/** Is `p` a program this build can run? */
export const isProgram = p => !!p && Array.isArray(p.days) && p.days.length > 0
  && p.days.every(d => GEN_TYPES[d]) && typeof p.startedAt === 'string'

const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d) }
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / DAY)
const byTime = (a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : (a.start || 0) - (b.start || 0))

/**
 * The program's weeks so far: each a list of its days with the session that did it (or null),
 * and `cur`, the index of the first not done. A session counts for the first week with a day of
 * its kind still open, so a day you skip stays open and the week waits for it. Sessions before
 * the program started, ones of a kind no day has, and ones past its last week are left out.
 */
function programRounds(S, now = Date.now()) {
  const p = S.program
  const today = isoOf(new Date(now))
  const open = () => p.days.map(type => ({ type, w: null }))
  const rounds = []
  const sessions = (S.workouts || []).filter(w => typeof w?.d === 'string' && w.d >= p.startedAt && w.d <= today).sort(byTime)
  for (const w of sessions) {
    const kind = workoutKind(w)
    if (!p.days.includes(kind)) continue
    let slot = null
    for (const r of rounds) if ((slot = r.find(it => !it.w && it.type === kind))) break
    if (!slot) {
      if (p.weeks > 0 && rounds.length >= p.weeks) continue
      rounds.push(open())
      slot = rounds[rounds.length - 1].find(it => it.type === kind)
    }
    slot.w = w
  }
  let cur = rounds.findIndex(r => r.some(it => !it.w))
  if (cur < 0) cur = rounds.length
  return { rounds, cur, open }
}

/** The program's week `now` is in, 1 for its first: a week ends once all its days are done. */
export function weekOf(S, now = Date.now()) {
  if (!isProgram(S?.program)) return 0
  const { cur } = programRounds(S, now)
  return S.program.weeks > 0 ? Math.min(cur + 1, S.program.weeks) : cur + 1
}

/** Has the program run its weeks, every day of each done? */
export const programOver = (S, now = Date.now()) => isProgram(S?.program) && S.program.weeks > 0
  && programRounds(S, now).cur >= S.program.weeks

/**
 * This week of the program: each day with the session that did it (or null), in order, and the
 * index of the next to do (null once the program is over). The week lasts until its days are
 * done, however many calendar weeks that takes.
 */
export function programWeek(S, now = Date.now()) {
  const p = S?.program
  if (!isProgram(p)) return null
  const { rounds, cur, open } = programRounds(S, now)
  const last = p.weeks > 0 ? p.weeks - 1 : Infinity
  const at = Math.min(cur, last)
  const items = rounds[at] || open()
  const next = items.findIndex(it => !it.w)
  return { week: at + 1, weeks: p.weeks, items, done: items.filter(it => it.w).length, next: next < 0 ? null : next }
}

/**
 * The days a program has left, dated, in order: `[{ type, iso }]`. A forecast, not a booking: it
 * starts today, or a rest day after the last session, and leaves a rest day between two days
 * when its week has room for that (four days or fewer), else none. A new week starts as many
 * days after the last one started as keep it on a seven-day beat, and never without a rest day.
 * A program without a length is forecast twelve weeks ahead.
 */
export function programForecast(S, now = Date.now()) {
  const p = S?.program
  if (!isProgram(p)) return []
  const today = isoOf(new Date(now))
  const { rounds, cur, open } = programRounds(S, now)
  const n = p.days.length
  const gap = 2 * n - 1 <= 7 ? 2 : 1
  const between = Math.max(7, (n - 1) * gap + 2) - (n - 1) * gap
  const end = p.weeks > 0 ? p.weeks : cur + 12
  const done = rounds.flat().filter(it => it.w).map(it => it.w).sort(byTime)
  const lastDone = done[done.length - 1]?.d
  const out = []
  let d = null
  for (let r = cur; r < end; r++) {
    const round = rounds[r] || open()
    let first = true
    for (const it of round) {
      if (it.w) continue
      const step = first && !round.some(x => x.w) ? between : gap
      d = d ? addDays(d, step) : lastDone ? (daysBetween(lastDone, today) >= step ? today : addDays(lastDone, step)) : today
      out.push({ type: it.type, iso: d })
      first = false
    }
  }
  return out
}

/** The day type to train next: the program's next day, else the one whose groups need it most. */
export function suggestDay(S, now = Date.now()) {
  const pw = programWeek(S, now)
  if (pw) return pw.next == null ? null : pw.items[pw.next].type
  const ranked = Object.keys(GEN_TYPES).map(type => {
    const groups = genGroupsOf(type)
    const need = weeklyNeed(S, groups, now)
    return { type, score: groups.reduce((n, g) => n + (need[g] || 0), 0) / (groups.length || 1) }
  }).sort((a, b) => b.score - a.score)
  return ranked[0]?.score > 0 ? ranked[0].type : null
}

const CATCH_UP = 1.5   // a day takes at most this many times its even part of a group's goal

/**
 * Group id -> sets this `type` day should add: what each group still lacks this week (coverage.js
 * weeklyLack, its parts' minimums too), shared out
 * over the program days forecast for the rest of the week (this one included) that train it.
 * A day never takes more than half again its even part of the goal (the goal over the
 * program's days that train the group), and in the week the program started no more than its
 * even part: a program started late in the week, or a week whose last day falls past its end,
 * would otherwise pile the whole week onto one day.
 */
export function dayShare(S, type, now = Date.now()) {
  const groups = genGroupsOf(type)
  const lacks = weeklyLack(S, groups, now)
  const weekStart = isoOf(startOfWeek(isoOf(new Date(now)), weekStartOf(S)))
  const weekEnd = addDays(weekStart, 6)
  // A program started this week has missed nothing yet: no day of it catches up.
  const most = isProgram(S?.program) && S.program.startedAt > weekStart ? 1 : CATCH_UP
  const left = programForecast(S, now).filter(f => f.iso <= weekEnd).map(f => f.type)
  if (!left.includes(type)) left.push(type)
  const days = isProgram(S?.program) ? S.program.days : [type]
  const out = {}
  for (const g of groups) {
    const goal = weeklyTargetOf(S, g)
    const lack = lacks[g]
    const hits = left.filter(t => genGroupsOf(t).includes(g)).length || 1
    const even = goal / (days.filter(t => genGroupsOf(t).includes(g)).length || 1)
    if (lack > 0) out[g] = Math.min(lack / hits, even * most)
  }
  return out
}

/** A `type` day's dayShare when the program S runs has that day, else null (generateWorkout's `share`). */
export const programShare = (S, type, now = Date.now()) =>
  (isProgram(S?.program) && S.program.days.includes(type) ? dayShare(S, type, now) : null)

/**
 * How many exercises a `type` day takes to give its share (dayShare), from MIN_DAY to
 * MAX_GEN_COUNT; the generator's own count when nothing is lacking. `setup` is the one-tap
 * setup, for its sets per exercise. Every group is filled to its own share: the day ends with the
 * last exercise that still gives a group a set it lacks (USEFUL), not when the sum looks close.
 */
export function sizeDay(S, type, { now = Date.now(), groups, setup } = {}) {
  const share = dayShare(S, type, now)
  if (!Object.values(share).some(v => v > 0)) return Math.min(genCount(type), MAX_GEN_COUNT)
  // In the order they were picked, not the order they run in: a pull day runs every back lift
  // before its first curl, so counted that way the shrugs fill the back long before the biceps
  // get anything, and the day grows to eleven.
  const picks = generateWorkout(S, type, { count: MAX_GEN_COUNT, groups, now, share, byKind: setup?.byKind, sets: setup?.sets }).sort((a, b) => a.at - b.at)
  const got = {}
  let n = 0
  for (let i = 0; i < picks.length; i++) {
    const sets = genScheme(picks[i].id, setup).sets || 0
    let adds = 0
    for (const [g, c] of Object.entries(groupCredit(entryWeights(picks[i])))) {
      adds += Math.min(c * sets, Math.max(0, (share[g] || 0) - (got[g] || 0)))
      got[g] = (got[g] || 0) + c * sets
    }
    if (adds >= USEFUL) n = i + 1
  }
  return Math.min(picks.length, Math.max(MIN_DAY, n))
}

/** Group id -> sets done this week and the goal, for the groups a program's days train. */
export function weekProgress(S, groups, now = Date.now()) {
  const done = weeklyDone(S, now)
  return groups.map(g => ({ id: g, n: ADD_GROUPS.find(x => x.id === g)?.n || g, done: done[g] || 0, goal: weeklyTargetOf(S, g) }))
}

/**
 * The seven days of the week starting `weekStart` (ISO), each with the program days on it:
 * `[{ iso, items: [{ type, state, w }] }]`. A day done sits on the date it was done ('done'); the
 * ones left are where programForecast puts them, the next first ('next', then 'planned').
 * Null without a program.
 */
export function programLayout(S, weekStart, now = Date.now()) {
  const p = S?.program
  if (!isProgram(p)) return null
  const days = Array.from({ length: 7 }, (_, i) => ({ iso: addDays(weekStart, i), items: [] }))
  const on = iso => days.find(d => d.iso === iso)
  const { rounds } = programRounds(S, now)
  rounds.flat().filter(it => it.w).sort((a, b) => byTime(a.w, b.w))
    .forEach(it => on(it.w.d)?.items.push({ type: it.type, state: 'done', w: it.w }))
  programForecast(S, now).forEach((f, i) => on(f.iso)?.items.push({ type: f.type, state: i === 0 ? 'next' : 'planned', w: null }))
  return days
}
