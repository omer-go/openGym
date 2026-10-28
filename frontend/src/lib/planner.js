// The program builder: a week of days from a template, a training goal, a level, the equipment
// on hand, the days a week, the weekly goal and the session length. Pure; the program page
// (components/Program.jsx) shows it and lib/program.js runs what it builds.
//
// Slot first. Each day gets its backbone of compound slots (pass 1, `skeleton`): a lead lift in
// the template's rotation, then the lower, push and pull patterns its type trains, picked so the
// week's squats, hinges, presses and pulls come out even. A day too long for the session drops
// sets, then a slot. Then accessories close what each muscle group still lacks of its weekly
// goal (pass 2, `fill`): the group furthest behind per day left that trains it goes first, and
// arms and shoulders need part of their goal from lifts aimed at them, since presses and rows
// barely reach the side delts or the triceps' long head. A group left a set or so short gets it
// on a lift it already has (pass 3, `topUp`), what goes past the goal comes off (pass 4, `trim`),
// and last the days are evened out (pass 5, `balance`): an accessory or a set
// moves from a long day to a short one while no group falls below its goal.
//
// Sets and reps come from the goal (SCHEMES), how close to failure from the goal and the level.
// A setting that leaves a group short of its goal for a reason the settings can fix (the time,
// the accessories a day, the equipment) is not allowed: `blocker` says why, and `fixFor` finds
// the fewest days × minutes that make it work.
//
// Sets are counted and goals set the way the rest of the app does (coverage.js, goals.js), so a
// week built to reach the goal fills the bars the program page and Stats show: a squat counts in
// full for quads and glutes and 0.4 a set for the hamstrings, calves and abs that help.

import { entryWeights, groupCredit } from './coverage.js'
import { goalRef, weeklyTargetOf } from './goals.js'
import { rolesLoaded } from './muscle-roles.js'
import { SCHEMES } from './engine.js'

export { SCHEMES }
export const PLAN_GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'quads', 'hamstrings', 'glutes', 'calves']
const SMALL = ['calves', 'forearms', 'abs']
// Share of a group's goal that must come from lifts aimed at it.
export const DIRECT_MIN = { chest: 0, back: 0, shoulders: .4, biceps: .5, triceps: .5, forearms: 0, abs: 0, quads: 0, hamstrings: 0, glutes: 0, calves: 0 }
const PATTERN_GROUPS = { squat: ['quads'], hinge: ['hamstrings'], hpress: ['chest'], vpress: ['shoulders'], hpull: ['back'], vpull: ['back'] }

// Rep schemes by goal and slot live in engine.js (SCHEMES), shared with the one-tap workouts.
// Training age: how close to failure, and how many accessories a day.
export const LEVELS = {
  beginner: { n: 'Beginner', rir: +1, maxAcc: 3 },
  intermediate: { n: 'Intermediate', rir: 0, maxAcc: 5 },
  advanced: { n: 'Advanced', rir: -1, maxAcc: 6 },
}
export const EQUIPMENT = { gym: { n: 'Full gym', has: ['gym', 'db', 'bw'] }, db: { n: 'Dumbbells', has: ['db', 'bw'] }, bw: { n: 'Bodyweight', has: ['bw'] } }

// Day types: the groups a day may train, and the patterns its lead goes through in turn. An upper
// day leads with a pull every other time, so three upper days a week aren't three heavy presses.
export const DAY_TYPES = {
  full: { groups: PLAN_GROUPS },
  upper: { groups: ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs'], leads: ['hpress', 'hpull', 'vpress', 'vpull'] },
  lower: { groups: ['quads', 'hamstrings', 'glutes', 'calves', 'abs'], leads: ['squat', 'hinge'] },
  push: { groups: ['chest', 'shoulders', 'triceps', 'abs'], leads: ['hpress', 'vpress'] },
  pull: { groups: ['back', 'biceps', 'forearms', 'abs'], leads: ['vpull', 'hpull'] },
  legs: { groups: ['quads', 'hamstrings', 'glutes', 'calves', 'abs'], leads: ['squat', 'hinge'] },
}
export const PLAN_TEMPLATES = {
  full: { n: 'Full body', sub: 'Every day trains every group', cycle: ['full'] },
  ul: { n: 'Upper / lower', sub: 'Upper and lower body on alternate days', cycle: ['upper', 'lower'] },
  ppl: { n: 'Push / pull / legs', sub: 'Pushing, pulling and legs, in turn', cycle: ['push', 'pull', 'legs'] },
}
const LEAD_MIN = 3 // the fewest sets a lead comes down to, for time or for the goal
const FULL_LEADS = n => (n === 2 ? ['squat', 'hinge'] : ['squat', 'hpress', 'hinge', 'vpull', 'vpress', 'hpull'].slice(0, n))

export const PLAN_DAYS = [2, 3, 4, 5, 6]
export const PLAN_MINUTES = [30, 45, 60, 75, 90]
export const PLAN_BASES = [6, 8, 10, 15, 20]
export const PLAN_DEFAULTS = { template: 'full', goal: 'growth', level: 'intermediate', equipment: 'gym', days: 3, minutes: 60, base: 'auto', seed: 1 }

const ADV = { maxDirect: 2, sessionCap: 10, needMin: 1, secPerRep: 3, warmupMin: 5 }

// The lifts: app exercise id, pattern, kind, the groups it is aimed at, the least equipment it
// needs (bw ⊂ db ⊂ gym), and whether it can lead a day, only lead one, is a hold, or goes a side
// at a time. What else a lift trains comes from the catalogue, as the app counts it (creditOf).
const X = (id, pat, kind, p, need, f = {}) => ({ id, pat, kind, p, need, lead: false, ...f })
export const PLAN_LIB = [
  X('0043', 'squat', 'compound', ['quads'], 'gym', { lead: true }), // back squat
  X('0042', 'squat', 'compound', ['quads'], 'gym', { lead: true }), // front squat
  X('0739', 'squat', 'compound', ['quads'], 'gym'), // leg press
  X('5516', 'squat', 'compound', ['quads'], 'gym'), // hack squat
  X('1760', 'squat', 'compound', ['quads'], 'db', { lead: true }), // goblet squat
  X('2290', 'squat', 'compound', ['quads'], 'db', { perSide: true, lead: true }), // bulgarian split squat
  X('3743', 'squat', 'compound', ['quads'], 'bw', { perSide: true, lead: true }), // bulgarian split squat, bodyweight
  X('0431', 'squat', 'compound', ['quads'], 'db', { perSide: true }), // step-up
  X('0032', 'hinge', 'compound', ['hamstrings'], 'gym', { lead: true, leadOnly: true }), // deadlift
  X('0085', 'hinge', 'compound', ['hamstrings'], 'gym', { lead: true }), // romanian deadlift
  X('0044', 'hinge', 'compound', ['hamstrings'], 'gym'), // good morning
  X('1459', 'hinge', 'compound', ['hamstrings'], 'db', { lead: true }), // dumbbell romanian deadlift
  X('4971', 'hinge', 'compound', ['hamstrings'], 'bw', { perSide: true }), // single-leg rdl
  X('7746', 'hinge', 'compound', ['hamstrings'], 'bw', { lead: true }), // nordic curl
  X('0025', 'hpress', 'compound', ['chest'], 'gym', { lead: true }), // bench press
  X('0314', 'hpress', 'compound', ['chest'], 'db', { lead: true }), // incline dumbbell press
  X('0289', 'hpress', 'compound', ['chest'], 'db', { lead: true }), // dumbbell bench press
  X('0251', 'hpress', 'compound', ['chest'], 'bw'), // dip
  X('0662', 'hpress', 'compound', ['chest'], 'bw', { lead: true }), // push-up
  X('1162', 'vpress', 'compound', ['shoulders'], 'gym', { lead: true }), // overhead press
  X('0405', 'vpress', 'compound', ['shoulders'], 'db', { lead: true }), // seated dumbbell press
  X('2137', 'vpress', 'compound', ['shoulders'], 'db'), // arnold press
  X('2921', 'vpress', 'compound', ['shoulders'], 'bw', { lead: true }), // pike push-up
  X('0652', 'vpull', 'compound', ['back'], 'bw', { lead: true }), // pull-up
  X('2330', 'vpull', 'compound', ['back'], 'gym'), // lat pulldown
  X('1047', 'vpull', 'compound', ['back'], 'gym'), // close-grip pulldown
  X('0027', 'hpull', 'compound', ['back'], 'gym', { lead: true }), // barbell row
  X('9698', 'hpull', 'compound', ['back'], 'db', { lead: true }), // chest-supported row
  X('2393', 'hpull', 'compound', ['back'], 'db', { perSide: true }), // one-arm dumbbell row
  X('0861', 'hpull', 'compound', ['back'], 'gym'), // seated cable row
  X('0499', 'hpull', 'compound', ['back'], 'bw', { lead: true }), // inverted row
  X('0188', 'iso', 'iso', ['chest'], 'gym'), // cable fly
  X('1030', 'iso', 'iso', ['chest'], 'gym'), // pec deck
  X('0308', 'iso', 'iso', ['chest'], 'db'), // dumbbell fly
  X('0279', 'iso', 'iso', ['chest'], 'bw'), // decline push-up
  X('0238', 'iso', 'iso', ['back'], 'gym'), // straight-arm pulldown
  X('0375', 'iso', 'iso', ['back'], 'db'), // dumbbell pullover
  X('0334', 'iso', 'iso', ['shoulders'], 'db'), // lateral raise
  X('0178', 'iso', 'iso', ['shoulders'], 'gym'), // cable lateral raise
  X('5527', 'iso', 'iso', ['shoulders'], 'gym'), // rear-delt fly
  X('0294', 'iso', 'iso', ['biceps'], 'db'), // dumbbell curl
  X('0313', 'iso', 'iso', ['biceps'], 'db'), // hammer curl
  X('0318', 'iso', 'iso', ['biceps'], 'db'), // incline curl
  X('1326', 'iso', 'iso', ['biceps'], 'bw'), // chin-up
  X('0200', 'iso', 'iso', ['triceps'], 'gym'), // rope pushdown
  X('2188', 'iso', 'iso', ['triceps'], 'db'), // overhead triceps extension
  X('0061', 'iso', 'iso', ['triceps'], 'gym'), // skull crusher
  X('0283', 'iso', 'iso', ['triceps'], 'bw'), // diamond push-up
  X('0585', 'iso', 'iso', ['quads'], 'gym'), // leg extension
  X('1489', 'iso', 'iso', ['quads'], 'bw'), // sissy squat
  X('0586', 'iso', 'iso', ['hamstrings'], 'gym'), // lying leg curl
  X('0599', 'iso', 'iso', ['hamstrings'], 'gym'), // seated leg curl
  X('3395', 'iso', 'iso', ['hamstrings'], 'bw'), // sliding leg curl
  X('4742', 'iso', 'iso', ['glutes'], 'db'), // hip thrust
  X('2471', 'iso', 'iso', ['glutes'], 'bw'), // glute bridge
  X('7589', 'iso', 'iso', ['glutes'], 'gym', { perSide: true }), // cable kickback
  X('0605', 'iso', 'iso', ['calves'], 'gym'), // standing calf raise
  X('0594', 'iso', 'iso', ['calves'], 'gym'), // seated calf raise
  X('4761', 'iso', 'iso', ['calves'], 'bw', { perSide: true }), // single-leg calf raise
  X('0175', 'iso', 'iso', ['abs'], 'gym'), // cable crunch
  X('9819', 'iso', 'iso', ['abs'], 'bw'), // hanging knee raise
  X('0276', 'iso', 'iso', ['abs'], 'bw', { perSide: true }), // dead bug
  X('0364', 'iso', 'iso', ['forearms'], 'db', { perSide: true }), // wrist curl
  X('2133', 'iso', 'iso', ['forearms'], 'db', { timed: true }), // farmer's walk
  X('1357', 'iso', 'iso', ['forearms'], 'bw', { timed: true, perSide: true }), // one-hand hang
]
const BY_ID = Object.fromEntries(PLAN_LIB.map(e => [e.id, e]))
export const planLift = id => BY_ID[id] || null

// Seeded, so a program's week is the same each time it is built from the same settings.
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
// The app's weekly goal for each group (goals.js): the kind of goal's default scaled by the base,
// or a group's own number.
const goalsFor = (type, base, byGroup) =>
  Object.fromEntries(PLAN_GROUPS.map(g => [g, weeklyTargetOf({ goals: { type, weeklySets: base, byGroup } }, g)]))
const SHORT = 0.85 // under 85% of the goal counts as short

/** The settings with every default filled in. `base` 'auto' is the goal's own. */
export function configOf(o = {}) {
  const goal = SCHEMES[o.goal] ? o.goal : PLAN_DEFAULTS.goal
  const level = LEVELS[o.level] ? o.level : PLAN_DEFAULTS.level
  const sc = SCHEMES[goal]
  return {
    template: PLAN_TEMPLATES[o.template] ? o.template : PLAN_DEFAULTS.template, goal, level,
    equipment: EQUIPMENT[o.equipment] ? o.equipment : PLAN_DEFAULTS.equipment,
    days: o.days || PLAN_DEFAULTS.days, minutes: o.minutes || PLAN_DEFAULTS.minutes,
    base: o.base > 0 ? o.base : goalRef(goal), seed: o.seed ?? 1,
    ...ADV, leadSets: sc.leadSets, slotSets: sc.slotSets, slotMin: Math.min(sc.slotMin, sc.slotSets),
    accMin: sc.accMin, accMax: Math.max(sc.accMin, sc.accMax), maxAcc: LEVELS[level].maxAcc, rirShift: LEVELS[level].rir, scheme: sc,
  }
}

/** Reps, effort and rest for a lift in a slot: `{ lo, hi, rir, rest, secs }`, `secs` a set with its rest. */
export function prescribe(cfg, ex, slot, group) {
  const key = slot === 'lead' ? 'lead' : slot === 'accessory' ? (SMALL.includes(group) ? 'small' : 'acc') : 'main'
  const s = cfg.scheme[key]
  const rir = Math.max(0, s.rir + (key === 'lead' || key === 'main' ? Math.max(0, cfg.rirShift) : cfg.rirShift))
  const secs = ((s.lo + s.hi) / 2) * cfg.secPerRep * (ex.perSide ? 2 : 1) + s.rest
  return { lo: s.lo, hi: s.hi, rir, rest: s.rest, secs }
}

// Group id -> what a set of the lift counts for, the way the app counts a logged set
// (coverage.js plannedSets): its muscle roles once they are loaded, else the catalogue's muscles.
let credits = new Map(), creditsWithRoles = false
export const creditOf = ex => {
  if (creditsWithRoles !== rolesLoaded()) { credits = new Map(); creditsWithRoles = rolesLoaded() }
  if (!credits.has(ex.id)) credits.set(ex.id, groupCredit(entryWeights({ id: ex.id })))
  return credits.get(ex.id)
}
const add = (cfg, into, ex, sets) => {
  for (const [g, v] of Object.entries(creditOf(ex))) into[g] = (into[g] || 0) + v * sets
  return into
}
const minutesOf = (cfg, items) => cfg.warmupMin + items.reduce((m, it) => m + it.sets * it.rx.secs, 0) / 60

// A lift not used yet this week, else any.
function variant(cands, used, rand) {
  if (!cands.length) return null
  const fresh = cands.filter(e => !used.has(e.id))
  const pool = fresh.length ? fresh : cands
  return pool[Math.floor(rand() * pool.length)]
}

/** The day types of the week, in order. */
export const scheduleOf = cfg => {
  const cyc = PLAN_TEMPLATES[cfg.template].cycle
  return Array.from({ length: cfg.days }, (_, k) => cyc[k % cyc.length])
}

// Pass 1: one day's backbone.
function skeleton({ cfg, k, type, goals, has, week, rand, avail, sched, leads }) {
  const items = []
  const usedPat = pat => (week.patterns[pat] || 0) + items.filter(i => i.ex.pat === pat).length
  const now = g => { const c = {}; for (const i of items) add(cfg, c, i.ex, i.sets); return has(g) + (c[g] || 0) }
  const ratio = g => now(g) / goals[g]
  const pickOf = (pat, lead) => {
    const all = avail.filter(e => e.pat === pat && !items.some(i => i.ex.id === e.id))
    let pool = lead ? (all.some(e => e.lead) ? all.filter(e => e.lead) : all) : all.filter(e => !e.leadOnly)
    // Backbone lifts carry load: skip bodyweight versions when weights are on hand.
    const loaded = pool.filter(e => e.need !== 'bw')
    if (cfg.equipment !== 'bw' && loaded.length) pool = loaded
    return variant(pool, week.used, rand)
  }
  const take = (pat, slot, lead = false) => {
    let sets = cfg.leadSets
    if (!lead) {
      // Paced over the week: what the group still needs once the leads still to come are counted,
      // shared by the days left that train it. Nothing when it is within a set of its goal.
      const g0 = PATTERN_GROUPS[pat][0]
      const coming = leads.reduce((n, p, j) => n + (j > k && PATTERN_GROUPS[p].includes(g0) ? cfg.leadSets : 0), 0)
      const need = goals[g0] - now(g0) - coming
      if (need < 1) return
      const left = sched.filter((t, j) => j >= k && DAY_TYPES[t].groups.includes(g0)).length
      sets = Math.min(cfg.slotSets, Math.max(cfg.slotMin, Math.ceil(need / left)))
    }
    const ex = pickOf(pat, lead)
    if (!ex) return
    items.push({ ex, sets, slot, rx: prescribe(cfg, ex, slot, ex.p[0]) })
    week.used.add(ex.id)
  }
  const other = { squat: 'hinge', hinge: 'squat', hpress: 'vpress', vpress: 'hpress', vpull: 'hpull', hpull: 'vpull' }
  if (type === 'full') {
    const lead = leads[k]
    take(lead, 'lead', true)
    take(lead === 'squat' || lead === 'hinge' ? other[lead] : ratio('quads') <= ratio('hamstrings') ? 'squat' : 'hinge', 'lower')
    take(lead === 'hpress' || lead === 'vpress' ? other[lead] : ratio('chest') <= ratio('shoulders') ? 'hpress' : 'vpress', 'push')
    take(lead === 'vpull' || lead === 'hpull' ? other[lead]
      : usedPat('vpull') < usedPat('hpull') ? 'vpull' : usedPat('hpull') < usedPat('vpull') ? 'hpull' : k % 2 ? 'hpull' : 'vpull', 'pull')
  } else {
    const lead = leads[k]
    take(lead, 'lead', true)
    const slotOf = { squat: 'lower', hinge: 'lower', hpress: 'push', vpress: 'push', vpull: 'pull', hpull: 'pull' }
    take(other[lead], slotOf[other[lead]])
    // An upper day trains the other half too: both pulls after a press, both presses after a pull.
    if (type === 'upper') {
      const press = lead === 'hpress' || lead === 'vpress'
      const [a, b] = press ? ['vpull', 'hpull'] : ['hpress', 'vpress']
      const first = usedPat(a) <= usedPat(b) ? a : b
      take(first, slotOf[first])
      take(other[first], slotOf[first])
    }
  }
  // Too long for the session: trim slots to the goal's fewest sets, then the lead to LEAD_MIN, then
  // drop the slot nearest its goal.
  let trimmed = false
  for (;;) {
    if (minutesOf(cfg, items) <= cfg.minutes) break
    const slot = items.filter(i => i.slot !== 'lead' && i.sets > cfg.slotMin).sort((a, b) => b.rx.secs - a.rx.secs)[0]
    const lead = items.find(i => i.slot === 'lead' && i.sets > LEAD_MIN)
    trimmed = true
    if (slot || lead) { (slot || lead).sets--; continue }
    const rest = items.filter(i => i.slot !== 'lead')
    if (!rest.length) break
    const drop = rest.sort((a, b) => ratio(b.ex.p[0]) - ratio(a.ex.p[0]))[0]
    items.splice(items.indexOf(drop), 1)
  }
  for (const it of items) week.patterns[it.ex.pat] = (week.patterns[it.ex.pat] || 0) + 1
  return { type, items, trimmed }
}

// Pass 2: accessories for one day.
function fill({ cfg, day, goals, has, hasDirect, daysLeftFor, week, rand, avail }) {
  const items = day.items, allowed = DAY_TYPES[day.type].groups
  const today = () => { const c = {}; for (const i of items) add(cfg, c, i.ex, i.sets); return c }
  day.limit = null
  day.capped = {}
  const noTime = {}
  for (;;) {
    if (items.filter(i => i.slot === 'accessory').length >= cfg.maxAcc) { day.limit = 'accessories'; break }
    const t = today()
    const scored = allowed.map(g => {
      const left = daysLeftFor(g)
      const dTarget = Math.ceil(DIRECT_MIN[g] * goals[g]), dGap = dTarget - hasDirect(g)
      const forDirect = dGap > goals[g] - has(g)
      const gap = Math.max(goals[g] - has(g), dGap)
      const direct = items.filter(i => i.ex.p.includes(g)).length
      const cands = avail.filter(e => e.kind === 'iso' && e.p.includes(g) && !items.some(i => i.ex.id === e.id))
      const blocked = noTime[g] ? 'time' : items.some(i => i.slot === 'accessory' && i.ex.p.includes(g)) ? 'has'
        : direct >= cfg.maxDirect || (t[g] || 0) >= cfg.sessionCap ? 'caps'
        : !cands.length ? 'equipment' : ''
      return { g, gap, need: left ? gap / left : 0, left, blocked, cands, slack: (forDirect ? dTarget : goals[g]) * (1 - SHORT) }
    }).sort((a, b) => b.need - a.need)
    // The last day that trains a group tops it up if it would otherwise end short.
    const ok = s => (s.need >= cfg.needMin && s.gap >= cfg.accMin) || (s.left === 1 && s.gap > s.slack)
    const pick = scored.find(s => ok(s) && !s.blocked)
    if (!pick) {
      for (const w of scored.filter(ok)) day.capped[w.g] = w.blocked
      break
    }
    const sets = Math.max(cfg.accMin, Math.min(cfg.accMax, Math.round(pick.need), Math.ceil(pick.gap)))
    // Among the lifts for this group, prefer one that also feeds another group still short (hammer
    // curls feed forearms) and not one already at its goal (diamond push-ups feed the chest).
    const helps = e => Object.entries(creditOf(e)).filter(([g, c]) => !e.p.includes(g) && c >= 0.25)
      .reduce((n, [g]) => n + (goals[g] - has(g) > 0 ? 1 : -1), 0)
    const best = Math.max(...pick.cands.map(helps))
    const ex = variant(pick.cands.filter(e => helps(e) === best), week.used, rand)
    const it = { ex, sets, slot: 'accessory', rx: prescribe(cfg, ex, 'accessory', pick.g) }
    // Too long for what is left of the session: skip this group today and try another.
    if (minutesOf(cfg, [...items, it]) > cfg.minutes) { day.limit = 'time'; noTime[pick.g] = true; continue }
    items.push(it)
    week.used.add(ex.id)
    for (const [g, v] of Object.entries(creditOf(ex))) week.acc[g] = (week.acc[g] || 0) + v * sets
    for (const g of ex.p) week.accDirect[g] = (week.accDirect[g] || 0) + sets
  }
}

// Pass 3: close what fill left just short. Fill stops when a group is a set or so from its goal,
// too little for an accessory of its own; here one set at a time goes on the lift that counts most
// for that group, on a day with the minutes for it and below the day's cap for the group. With no
// such lift, the day with the most time to spare gets an accessory at its fewest sets.
function topUp({ cfg, out, goals, week, rand, avail }) {
  const most = it => (it.slot === 'accessory' ? cfg.accMax : it.slot === 'lead' ? cfg.leadSets : cfg.slotSets)
  const stuck = new Set()
  for (let guard = 0; guard < 100; guard++) {
    const t = {}
    for (const d of out) for (const i of d.items) add(cfg, t, i.ex, i.sets)
    const g = PLAN_GROUPS.filter(g => !stuck.has(g) && (t[g] || 0) < goals[g] - 1e-9).sort((a, b) => (t[a] || 0) / goals[a] - (t[b] || 0) / goals[b])[0]
    if (!g) break
    let best = null
    for (const d of out) {
      const day = {}
      for (const i of d.items) add(cfg, day, i.ex, i.sets)
      for (const it of d.items) {
        const c = creditOf(it.ex)[g] || 0
        if (c < 0.4 || it.sets >= most(it) || (day[g] || 0) + c > cfg.sessionCap) continue
        if (minutesOf(cfg, d.items.map(i => (i === it ? { ...i, sets: i.sets + 1 } : i))) > cfg.minutes) continue
        if (!best || c > best.c) best = { it, c }
      }
    }
    if (best) { best.it.sets++; continue }
    const days = out.filter(d => DAY_TYPES[d.type].groups.includes(g) && d.items.filter(i => i.slot === 'accessory').length < cfg.maxAcc)
      .sort((a, b) => minutesOf(cfg, a.items) - minutesOf(cfg, b.items))
    const added = days.some(d => {
      const cands = avail.filter(e => e.kind === 'iso' && e.p.includes(g) && !d.items.some(i => i.ex.id === e.id))
      if (!cands.length) return false
      const ex = variant(cands, week.used, rand)
      const it = { ex, sets: cfg.accMin, slot: 'accessory', rx: prescribe(cfg, ex, 'accessory', g) }
      if (minutesOf(cfg, [...d.items, it]) > cfg.minutes) return false
      d.items.push(it)
      week.used.add(ex.id)
      return true
    })
    if (!added) stuck.add(g)
  }
}

// Pass 4: take off what goes past the goal. A set comes off a lift (an accessory goes, at its
// fewest) while every group it counts for stays at its goal, the lift that spills most first:
// pulldowns and presses feed the chest and shoulders a little, the slots don't see it coming. The
// lead comes last, and never below 3 sets: it stays the day's heavy lift, just shorter when the
// week already has enough of it.
function trim(cfg, out, goals) {
  const least = it => (it.slot === 'accessory' ? cfg.accMin : it.slot === 'lead' ? Math.min(cfg.leadSets, LEAD_MIN) : cfg.slotMin)
  const late = it => (it.slot === 'lead' ? 1 : 0)
  for (let guard = 0; guard < 200; guard++) {
    const t = {}, dr = {}
    for (const d of out) for (const i of d.items) { add(cfg, t, i.ex, i.sets); for (const g of i.ex.p) dr[g] = (dr[g] || 0) + i.sets }
    let best = null
    for (const d of out) for (const it of d.items) {
      const n = it.sets > least(it) ? 1 : it.slot === 'accessory' ? it.sets : 0
      if (!n) continue
      const c = Object.entries(creditOf(it.ex))
      const keeps = c.every(([g, v]) => (t[g] || 0) - v * n >= goals[g] - 1e-9)
        && it.ex.p.every(g => dr[g] - n >= Math.ceil(DIRECT_MIN[g] * goals[g]))
      const gain = c.reduce((a, [, v]) => a + v, 0)
      if (keeps && (!best || late(it) < late(best.it) || (late(it) === late(best.it) && gain > best.gain))) best = { d, it, n, gain }
    }
    if (!best) break
    if (best.n === best.it.sets) best.d.items.splice(best.d.items.indexOf(best.it), 1)
    else best.it.sets -= best.n
  }
}

// Pass 5: even out session lengths. Moves a whole accessory, or one set between lifts for the same
// muscle, from a long day to a short one, as long as no group falls below its goal.
function balance(cfg, out, goals) {
  const mins = d => minutesOf(cfg, d.items)
  const totals = () => { const t = {}; for (const d of out) for (const i of d.items) add(cfg, t, i.ex, i.sets); return t }
  const direct = () => { const t = {}; for (const d of out) for (const i of d.items) for (const g of i.ex.p) t[g] = (t[g] || 0) + i.sets; return t }
  const spread = () => { const m = out.map(mins), avg = m.reduce((a, b) => a + b, 0) / m.length; return m.reduce((a, x) => a + (x - avg) ** 2, 0) }
  const setsOn = (d, g) => { const c = {}; for (const i of d.items) add(cfg, c, i.ex, i.sets); return c[g] || 0 }
  const range = it => (it.slot === 'accessory' ? [cfg.accMin, cfg.accMax] : it.slot === 'lead' ? [cfg.leadSets, cfg.leadSets] : [cfg.slotMin, cfg.slotSets])
  // A move may not push a group that was at goal below it, or below its share from its own lifts.
  const safe = (t0, d0) => {
    const t = totals(), dr = direct()
    return PLAN_GROUPS.every(g => ((t[g] || 0) >= goals[g] || (t[g] || 0) >= (t0[g] || 0) - 1e-9)
      && ((dr[g] || 0) >= Math.ceil(DIRECT_MIN[g] * goals[g]) || (dr[g] || 0) >= (d0[g] || 0)))
  }
  for (let guard = 0; guard < 60; guard++) {
    const before = spread(), t0 = totals(), d0 = direct()
    let best = null
    const tryMove = (apply, undo) => {
      apply()
      const ok = out.every(d => mins(d) <= cfg.minutes) && safe(t0, d0)
        && out.every(d => d.items.every(i => PLAN_GROUPS.every(g => setsOn(d, g) <= cfg.sessionCap || !i.ex.p.includes(g))))
      const v = spread()
      undo()
      if (ok && v < before - 1e-6 && (!best || v < best.v)) best = { v, apply }
    }
    for (const a of out) for (const b of out) {
      if (a === b || mins(a) <= mins(b)) continue
      const allowed = DAY_TYPES[b.type].groups
      for (const it of a.items) {
        // A whole accessory: b must train the group, have no accessory for it and not already do this lift.
        if (it.slot === 'accessory' && it.ex.p.every(g => allowed.includes(g))
          && !b.items.some(i => i.ex.id === it.ex.id || (i.slot === 'accessory' && i.ex.p.some(g => it.ex.p.includes(g))))
          && b.items.filter(i => i.slot === 'accessory').length < cfg.maxAcc && b.items.filter(i => i.ex.p.includes(it.ex.p[0])).length < cfg.maxDirect) {
          const ix = a.items.indexOf(it)
          tryMove(() => { a.items.splice(ix, 1); b.items.push(it) }, () => { b.items.pop(); a.items.splice(ix, 0, it) })
        }
        // One set to a lift in the same role for the same muscle.
        if (it.sets <= range(it)[0]) continue
        for (const jt of b.items) {
          if (jt.slot === 'lead' || it.slot === 'lead' || (jt.slot === 'accessory') !== (it.slot === 'accessory') || jt.ex.p[0] !== it.ex.p[0] || jt.sets >= range(jt)[1]) continue
          tryMove(() => { it.sets--; jt.sets++ }, () => { it.sets++; jt.sets-- })
        }
      }
    }
    if (!best) break
    best.apply()
  }
}

/**
 * The week a set of settings builds: `{ cfg, goals, days, total, short, feasible }`. Each day is
 * `{ type, items: [{ ex, sets, slot, rx }], groups, minutes, sets }`. `exclude`: exercise ids
 * never to pick (the ones skipped in the app), as long as the pattern has another. A group
 * `short` of its goal names its cause: a setting (time, accessories, equipment, caps, template)
 * or the planner's own rounding ('planner'); `feasible` when no setting is to blame.
 */
export function plan(o = {}) {
  const cfg = configOf(o)
  const goals = goalsFor(cfg.goal, cfg.base, o.byGroup), rand = rng(cfg.seed)
  const exclude = new Set(o.exclude || [])
  const has = EQUIPMENT[cfg.equipment].has
  const fits = PLAN_LIB.filter(e => has.includes(e.need))
  // A skipped lift stays out unless its pattern (or group, for an isolation lift) has nothing else.
  const avail = fits.filter(e => !exclude.has(e.id) || !fits.some(x => !exclude.has(x.id) && (e.kind === 'iso' ? x.kind === 'iso' && x.p[0] === e.p[0] : x.pat === e.pat)))
  const sched = scheduleOf(cfg)
  const week = { used: new Set(), patterns: {}, acc: {}, accDirect: {} }
  const out = [], skel = {}, skelDirect = {}, occ = {}
  // Each day's lead pattern: the full-body rotation, or the day type's leads in turn.
  const leads = sched.map((t, k) => {
    if (t === 'full') return FULL_LEADS(cfg.days)[k]
    occ[t] = (occ[t] || 0) + 1
    return DAY_TYPES[t].leads[(occ[t] - 1) % DAY_TYPES[t].leads.length]
  })
  sched.forEach((t, k) => {
    const d = skeleton({ cfg, k, type: t, goals, has: g => skel[g] || 0, week, rand, avail, sched, leads })
    for (const i of d.items) { add(cfg, skel, i.ex, i.sets); for (const g of i.ex.p) skelDirect[g] = (skelDirect[g] || 0) + i.sets }
    out.push({ k, ...d })
  })
  for (const d of out) {
    fill({
      cfg, day: d, goals, week, rand, avail,
      has: g => (skel[g] || 0) + (week.acc[g] || 0),
      hasDirect: g => (skelDirect[g] || 0) + (week.accDirect[g] || 0),
      daysLeftFor: g => out.filter(x => x.k >= d.k && DAY_TYPES[x.type].groups.includes(g)).length,
    })
  }
  topUp({ cfg, out, goals, week, rand, avail })
  trim(cfg, out, goals)
  if (o.balance !== false) balance(cfg, out, goals)
  const order = { lead: 0, lower: 1, push: 2, pull: 3, accessory: 4 }
  for (const d of out) {
    d.groups = {}
    for (const i of d.items) add(cfg, d.groups, i.ex, i.sets)
    d.minutes = Math.round(minutesOf(cfg, d.items))
    d.sets = d.items.reduce((s, i) => s + i.sets, 0)
    d.items.sort((a, b) => order[a.slot] - order[b.slot])
  }
  const total = {}, direct = {}
  for (const d of out) {
    for (const [g, v] of Object.entries(d.groups)) total[g] = (total[g] || 0) + v
    for (const i of d.items) for (const g of i.ex.p) direct[g] = (direct[g] || 0) + i.sets
  }
  const short = PLAN_GROUPS.filter(g => (total[g] || 0) < goals[g] * SHORT || (direct[g] || 0) < Math.ceil(DIRECT_MIN[g] * goals[g]) * SHORT).map(g => {
    const on = out.filter(d => DAY_TYPES[d.type].groups.includes(g))
    // A setting is to blame only if every day that trains the group was stopped by one.
    const why = d => (d.trimmed || d.limit === 'time' ? 'time' : d.limit === 'accessories' ? 'accessories'
      : d.capped[g] === 'equipment' ? 'equipment' : d.capped[g] ? 'caps' : null)
    const reasons = on.map(why)
    const cause = !on.length ? 'template' : reasons.includes(null) ? 'planner'
      : ['time', 'accessories', 'equipment', 'caps'].find(c => reasons.includes(c))
    return { g, total: Math.round((total[g] || 0) * 10) / 10, goal: goals[g], cause }
  })
  return { cfg, goals, days: out, total, short, feasible: short.every(x => x.cause === 'planner') }
}

/** Why the settings `o` can't reach the goal: `[{ g, cause }]` of the groups to blame, empty when they can. */
export function blocker(o) {
  return plan({ ...o, balance: false }).short.filter(x => x.cause !== 'planner')
}

/**
 * The fewest days × minutes at or above `o`'s own that reach the goal with the rest of `o` as it
 * is: `{ days, minutes }`, or null when none does. `fixed` ('days' | 'minutes') keeps that one.
 * Only ever adds training time; it never takes any away to make room.
 */
export function fixFor(o, fixed, from = o) {
  const c = configOf(from)
  const tries = []
  for (const days of fixed === 'days' ? [o.days] : PLAN_DAYS.filter(d => d >= c.days))
    for (const minutes of fixed === 'minutes' ? [o.minutes] : PLAN_MINUTES.filter(m => m >= c.minutes)) tries.push({ days, minutes })
  tries.sort((a, b) => a.days * a.minutes - b.days * b.minutes || Math.abs(a.days - c.days) - Math.abs(b.days - c.days))
  return tries.find(t => !blocker({ ...o, ...t }).length) || null
}
