// Programs: a week of one-tap days (generate.js) in an order, for a number of weeks. Nothing is
// fixed to a weekday, nor to a calendar week: a program week lasts until its days are done, so a
// day that doesn't fit before Sunday carries into the next one. A session counts for the first
// day of its kind still open (lib/workout-kind.js), so doing Pull before Push ticks Pull and
// leaves Push next. Where the days left fall is a forecast (programForecast), a rest day between
// two when the week has room.
//
// `S.program = { template, days: ['push', 'pull', …], startedAt: 'YYYY-MM-DD', weeks }`.
//
// A program built on the program page (lib/planner.js) also keeps its settings and the week it
// built: `plan: { goal, level, equipment, days, minutes, seed }` and `week`, a list of days
// `{ type, minutes, items: [{ id, sets, slot, lo, hi, rir, rest }] }` in order, `days` their types.
// Its days are the same lifts every week (planEntries builds one, with progression), and a
// session done as one of them keeps which (`programDay`, finish-workout.js).
//
// Sizing. A program day is as long as the week's goal needs (goals.js): what a group still
// lacks this calendar week is shared out over the days forecast in it that train it, and the day
// takes as many exercises as the planner (planner.js planDay) builds that share with.
import { ADD_GROUPS } from './add-exercise.js'
import { GEN_NAME, GEN_TYPES, MAX_GEN_COUNT, genCount, genDefaults, genGroupsOf, generateWorkout, generatedEntries, planPool } from './generate.js'
import { plannedSets, weeklyDone, weeklyLack, weeklyNeed } from './coverage.js'
import { sessionMinutes, weeklyTargetOf } from './goals.js'
import { isoOf, startOfWeek, weekStartOf } from './format.js'
import { workoutKind } from './workout-kind.js'
import { isWarmupRow } from './workout-model.js'
import { DAY_TYPES, plan as planWeek, planLift } from './planner.js'
import { defaultConfig, freestyleConfig, isPerSide, modeOf } from './history.js'
import { buildPlannedEntry } from './session-start.js'
import { EXIDX } from './exercises.js'
import { suggestable } from './skipped.js'

export const PROGRAM_TEMPLATES = [
  { id: 'full-3', n: 'Full body', sub: 'Three full-body days', days: ['full', 'full', 'full'] },
  { id: 'ppl-full-4', n: 'Push, pull, legs + full', sub: 'Four days, the fourth a full body', days: ['push', 'pull', 'legs', 'full'] },
  { id: 'ppl-3', n: 'Push, pull, legs', sub: 'Three days, each group once', days: ['push', 'pull', 'legs'] },
  { id: 'ppl-6', n: 'Push, pull, legs ×2', sub: 'Six days, each group twice', days: ['push', 'pull', 'legs', 'push', 'pull', 'legs'] },
]
export const PROGRAM_WEEKS = [4, 6, 8, 12]
export const DEFAULT_WEEKS = 8
export const MIN_DAY = 3   // exercises a sized day never goes under

// English names of a program's day types, used as i18n keys (t(DAY_NAME[type])).
export const DAY_NAME = { ...GEN_NAME, upper: 'Upper body', lower: 'Lower body' }

const DAY = 864e5
export const templateOf = id => PROGRAM_TEMPLATES.find(p => p.id === id) || null

/** A new program from a template, starting on `today`. */
export function newProgram(template, { weeks = DEFAULT_WEEKS, today = isoOf(new Date()) } = {}) {
  const tpl = templateOf(template)
  if (!tpl) return null
  return { template: tpl.id, days: [...tpl.days], startedAt: today, weeks }
}

/**
 * A program built from the program page's settings (lib/planner.js), starting on `today`.
 * `exclude`: exercise ids not to pick. Null when the settings build no days.
 */
export function newPlanProgram(opts, { weeks = DEFAULT_WEEKS, today = isoOf(new Date()), exclude, pool } = {}) {
  const p = planWeek({ ...opts, exclude, pool })
  if (!p.days.length) return null
  const c = p.cfg
  return {
    template: c.template,
    plan: { goal: c.goal, level: c.level, equipment: c.equipment, days: c.days, minutes: c.minutes, seed: c.seed },
    week: p.days.map(d => ({
      type: d.type, minutes: d.minutes,
      items: d.items.map(i => ({ id: i.ex.id, sets: i.sets, slot: i.slot, lo: i.rx.lo, hi: i.rx.hi, rir: i.rx.rir, rest: i.rx.rest })),
    })),
    days: p.days.map(d => d.type), startedAt: today, weeks,
  }
}

/** The exercise ids a plan should not pick for `S`: skipped, or the kit isn't there. */
export const planExclude = S => Object.values(EXIDX).filter(ex => !suggestable(S, ex)).map(ex => ex.id)

/** Is `p` a program built from the program page's settings, with its week of lifts? */
export const isPlanProgram = p => !!p?.plan && Array.isArray(p.week) && Array.isArray(p.days)
  && p.week.length === p.days.length && p.days.every(d => DAY_TYPES[d])

/** Is `p` a program this build can run? */
export const isProgram = p => !!p && Array.isArray(p.days) && p.days.length > 0 && typeof p.startedAt === 'string'
  && (isPlanProgram(p) || p.days.every(d => GEN_TYPES[d]))

/**
 * Session entries for a plan program's day: each lift at its sets, a rep range from its lo to
 * its hi (a per-side count being both sides'), double progression and its rest, built the way a
 * routine's are (session-start.js buildPlannedEntry), so the weight moves on from last time.
 */
export function planEntries(S, items) {
  return (items || []).filter(it => EXIDX[it.id]).map(it => {
    const id = it.id
    const base = freestyleConfig(S, { id, ...defaultConfig(id) })
    const cfg = { id, ...defaultConfig(id, modeOf({ ...base, id })), sets: it.sets }
    for (const k of ['bodyweight', 'side', 'sec']) if (base[k] !== undefined) cfg[k] = base[k]
    if (it.rest > 0) cfg.restSec = it.rest
    if (modeOf(cfg) === 'reps') {
      const per = isPerSide(cfg) ? 2 : 1
      Object.assign(cfg, { reps: it.hi * per, repsMin: it.lo * per, prog: 'double' })
    }
    return { id, ...buildPlannedEntry(S, cfg, null), gen: { g: planLift(id)?.p[0] || null } }
  })
}

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
  const open = () => p.days.map((type, k) => ({ type, k, w: null }))
  const rounds = []
  const sessions = (S.workouts || []).filter(w => typeof w?.d === 'string' && w.d >= p.startedAt && w.d <= today).sort(byTime)
  for (const w of sessions) {
    const kind = workoutKind(w)
    if (!p.days.includes(kind)) continue
    // A program day done as itself counts for that day; any other session of its kind, the first open.
    const day = Number.isInteger(w.programDay) && p.days[w.programDay] === kind ? w.programDay : null
    const fits = it => !it.w && it.type === kind && (day == null || it.k === day)
    let slot = null
    for (const r of rounds) if ((slot = r.find(fits))) break
    if (!slot) {
      if (p.weeks > 0 && rounds.length >= p.weeks) continue
      rounds.push(open())
      slot = rounds[rounds.length - 1].find(fits)
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
 * The days a program has left, dated, in order: `[{ type, k, iso, r }]`, `k` the day's place in the
 * week and `r` the week's index, 0 for the first. A forecast, not a booking: it
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
      out.push({ type: it.type, k: it.k, iso: d, r })
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
 * weeklyLack), shared out over the program days forecast for the rest of the week (this one
 * included) that train it. A day never takes more than half again its even part of the goal (the
 * goal over the program's days that train the group), and in the week the program started no more than its
 * even part: a program started late in the week, or a week whose last day falls past its end,
 * would otherwise pile the whole week onto one day.
 */
export function dayShare(S, type, now = Date.now()) {
  const groups = genGroupsOf(type)
  const lacks = weeklyLack(S, groups, now)
  const weekStart = isoOf(startOfWeek(isoOf(new Date(now)), weekStartOf(S)))
  // A program started this week has missed nothing yet: no day of it catches up.
  const most = isProgram(S?.program) && S.program.startedAt > weekStart ? 1 : CATCH_UP
  const left = daysLeft(S, type, now)
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

// The program days forecast for the rest of the calendar week, a `type` day among them.
function daysLeft(S, type, now) {
  const weekEnd = addDays(isoOf(startOfWeek(isoOf(new Date(now)), weekStartOf(S))), 6)
  const left = programForecast(S, now).filter(f => f.iso <= weekEnd).map(f => f.type)
  if (!left.includes(type)) left.push(type)
  return left
}

/** A `type` day's dayShare when the program S runs has that day, else null (generateWorkout's `share`). */
export const programShare = (S, type, now = Date.now()) =>
  (isProgram(S?.program) && !isPlanProgram(S.program) && S.program.days.includes(type) ? dayShare(S, type, now) : null)

/**
 * How many exercises a `type` day takes to give its share (dayShare), from MIN_DAY to
 * MAX_GEN_COUNT: as many as the planner builds it with (generate.js generateWorkout, planner.js
 * planDay); the generator's own count when nothing is lacking. `setup` is the one-tap setup.
 */
export function sizeDay(S, type, { now = Date.now(), groups, setup } = {}) {
  const share = dayShare(S, type, now)
  if (!Object.values(share).some(v => v > 0)) return Math.min(genCount(type), MAX_GEN_COUNT)
  const picks = generateWorkout(S, type, { count: null, groups, now, share, byKind: setup?.byKind, sets: setup?.sets })
  return Math.max(MIN_DAY, Math.min(MAX_GEN_COUNT, picks.length))
}

/** Group id -> sets done this week and the goal, for the groups a program's days train. */
export function weekProgress(S, groups, now = Date.now()) {
  const done = weeklyDone(S, now)
  return groups.map(g => ({ id: g, n: ADD_GROUPS.find(x => x.id === g)?.n || g, done: done[g] || 0, goal: weeklyTargetOf(S, g) }))
}

/**
 * The seven days of the week starting `weekStart` (ISO), each with the program days on it:
 * `[{ iso, items: [{ type, k, state, w }] }]`. A day done sits on the date it was done ('done'); the
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
    .forEach(it => on(it.w.d)?.items.push({ type: it.type, k: it.k, state: 'done', w: it.w }))
  programForecast(S, now).forEach((f, i) => on(f.iso)?.items.push({ type: f.type, k: f.k, state: i === 0 ? 'next' : 'planned', w: null }))
  return days
}

/**
 * The program's next `days` days, one after another, as the Start sheet would build each if the
 * ones before it were done as planned: `[{ type, iso, entries, sets, minutes, groups }]`, `groups`
 * being group id -> sets (coverage.js plannedSets). Each is built on the date the forecast gives it
 * (the first one now, as Home's estimate), then logged in full, so what it covers counts for the
 * days after it, and a new calendar week starts their shares over. A forecast, not a booking.
 */
export function planAhead(S, { days = 6, now = Date.now() } = {}) {
  if (!isProgram(S?.program)) return []
  const out = []
  let s = S, at = now
  for (let k = 0; k < days; k++) {
    const f = programForecast(s, at)[0]
    if (!f) break
    // Each day is built as it would be on its own day: a squat the day after one waits its turn.
    const t = Math.max(at, new Date(f.iso + 'T12:00:00').getTime())
    const entries = programDayEntries(s, f, t)
    const work = e => e.sets.filter(x => !isWarmupRow(x))
    const sets = entries.reduce((n, e) => n + work(e).length, 0)
    // A plan program's day knows its length, rests and all (planner.js).
    const minutes = isPlanProgram(s.program) ? s.program.week[f.k].minutes : sessionMinutes(sets)
    out.push({ type: f.type, k: f.k, iso: f.iso, entries, sets, minutes, groups: plannedSets(entries) })
    // Logged as done on its day, every work set, an hour long.
    const on = Math.max(t, new Date(f.iso + 'T12:00:00').getTime())
    const done = x => (x.sides ? { ...x, sides: { L: { ...x.sides.L, done: true }, R: { ...x.sides.R, done: true } } } : { ...x, done: true })
    const w = {
      id: 'ahead-' + k, d: f.iso, start: on, end: on + 36e5, name: f.type, genType: f.type, programDay: f.k, routineIds: [],
      entries: entries.map(e => ({ id: e.id, target: e.target, sets: work(e).map(done) })),
    }
    s = { ...s, workouts: [...(s.workouts || []), w] }
    at = on + 2 * 36e5
  }
  return out
}

/**
 * The session entries of program day `f` (`{ type, k }`) on `now`: a plan program's lifts for
 * that day (planEntries), else the one-tap day the Start sheet would build, sized to its share.
 */
export function programDayEntries(S, f, now = Date.now()) {
  if (isPlanProgram(S?.program)) return planEntries(S, S.program.week[f.k]?.items)
  const setup = { ...genDefaults(f.type), ...(S.genSetup?.[f.type] || {}) }
  const count = sizeDay(S, f.type, { now, groups: setup.groups, setup })
  const picks = generateWorkout(S, f.type, { ...setup, count, now, share: programShare(S, f.type, now) })
  return generatedEntries(S, picks, setup)
}

/**
 * The month calendar of a program: the weeks (rows of seven, from the profile's week start) that
 * cover `month` ('YYYY-MM'), each `{ start, week, done, planned, days: [{ iso, inMonth, items }] }`.
 * A day's items are programLayout's, with `r` the program week they belong to; a row's `week` is
 * the program week of its first item (1 for the first, 0 for a row without one), `done` and
 * `planned` how many of its items are done and still to do. Null without a program.
 */
export function programCalendar(S, month, now = Date.now()) {
  const p = S?.program
  if (!isProgram(p)) return null
  const ws = weekStartOf(S)
  const first = month + '-01'
  const last = isoOf(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0, 12))
  const items = programItems(S, now)
  const rows = []
  for (let start = isoOf(startOfWeek(first, ws)); start <= last; start = addDays(start, 7)) {
    const days = Array.from({ length: 7 }, (_, i) => {
      const iso = addDays(start, i)
      return { iso, inMonth: iso.slice(0, 7) === month, items: items.filter(it => it.iso === iso) }
    })
    const all = days.flatMap(d => d.items)
    rows.push({
      start, days, week: all.length ? Math.min(...all.map(it => it.r)) + 1 : 0,
      done: all.filter(it => it.state === 'done').length, planned: all.filter(it => it.state !== 'done').length,
    })
  }
  return rows
}

// Every program day, done and forecast: `[{ type, k, r, iso, state, w }]`, in date order.
function programItems(S, now) {
  const { rounds } = programRounds(S, now)
  const done = rounds.flatMap((round, r) => round.filter(it => it.w).map(it => ({ type: it.type, k: it.k, r, iso: it.w.d, state: 'done', w: it.w })))
    .sort((a, b) => byTime(a.w, b.w))
  const left = programForecast(S, now).map((f, i) => ({ ...f, state: i === 0 ? 'next' : 'planned', w: null }))
  return [...done, ...left]
}

/**
 * The months a program spans, 'YYYY-MM', from the one it started in to the one its last day
 * (done or forecast) falls in: `{ from, to }`. Null without a program.
 */
export function programMonths(S, now = Date.now()) {
  if (!isProgram(S?.program)) return null
  const items = programItems(S, now)
  const end = items.reduce((m, it) => (it.iso > m ? it.iso : m), S.program.startedAt)
  return { from: S.program.startedAt.slice(0, 7), to: end.slice(0, 7), end }
}

/**
 * What a finished (or running) program added up to: the sessions that counted for it, the
 * program weeks done, the work sets logged, the new bests (`prs`) and the `top` lifts that gained
 * the most, each `{ id, from, to }` – its heaviest work set the first time and the last time.
 */
export function programSummary(S, { now = Date.now(), top = 3 } = {}) {
  if (!isProgram(S?.program)) return null
  const p = S.program
  const { rounds, cur } = programRounds(S, now)
  const ws = rounds.flat().filter(it => it.w).map(it => it.w).sort(byTime)
  const heaviest = e => Math.max(0, ...(e.sets || []).filter(s => !isWarmupRow(s) && s.done).map(s => Number(s.w) || 0))
  const lifts = {}
  let sets = 0, prs = 0
  for (const w of ws) {
    prs += (w.prs || []).length
    for (const e of w.entries || []) {
      sets += (e.sets || []).filter(s => !isWarmupRow(s) && s.done).length
      const kg = heaviest(e)
      if (!kg) continue
      const l = lifts[e.id] || (lifts[e.id] = { id: e.id, from: kg, to: kg })
      l.to = kg
    }
  }
  const gains = Object.values(lifts).filter(l => l.to > l.from).sort((a, b) => (b.to - b.from) / b.from - (a.to - a.from) / a.from).slice(0, top)
  return {
    workouts: ws.length, total: p.days.length * (p.weeks > 0 ? p.weeks : rounds.length || 1),
    weeks: Math.min(cur, p.weeks > 0 ? p.weeks : cur), sets, prs, gains,
    from: p.startedAt, to: ws[ws.length - 1]?.d || p.startedAt,
  }
}
