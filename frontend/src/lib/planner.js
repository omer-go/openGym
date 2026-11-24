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
// When the days or the minutes can't hold every goal, the groups further down PRIORITY give way
// (`giveWay`): their goals come down and the week is built again, until the chest, back and legs
// reach theirs. Their presses and rows give the shoulders, triceps and biceps some of what they
// need, while a curl gives the back nothing. A group that gave way gets whole accessories, not a
// set or two on every day: a calf raise one day, a wrist curl the next.
//
// Sets and reps come from the goal (SCHEMES), how close to failure from the goal and the level.
// A setting that leaves a group short of its goal for a reason the settings can fix (the time,
// the accessories a day, the equipment) is not allowed: `blocker` says why, and `fixFor` finds
// the fewest days × minutes that make it work.
//
// Sets are counted and goals set the way the rest of the app does (coverage.js, goals.js), so a
// week built to reach the goal fills the bars the program page and Stats show: a squat counts in
// full for quads and glutes and 0.4 a set for the hamstrings, calves and abs that help. A group's
// goal splits between its parts (goals.js PARTS), and the parts of tier 1 and 2 are filled like
// groups, the second tier after the first, so a week of presses is no shoulder week.

import { entryWeights, groupCredit, GROUP_PARTS, helpedPartOf, partRoleOf, loadsBack, liftKind, slotMuscleOf } from './coverage.js'
import { EXIDX, patternOf } from './exercises.js'
import { groupOfMuscle } from './add-exercise.js'
import { VOLUMES, PARTS, weeklyTargetOf, partTargetOf, partTierOf } from './goals.js'
import { rolesLoaded, muscleRolesOf, ROLE_WEIGHT } from './muscle-roles.js'
import { SCHEMES, rangedScheme } from './engine.js'
import { variantOf } from './variant.js'
import { popularPlace } from './popular.js'
import { moveOf as facetMove, kitOf } from './exercise-facets.js'

export { SCHEMES }
export const PLAN_GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'quads', 'hamstrings', 'glutes', 'calves']
const SMALL = ['calves', 'forearms', 'abs']
// Share of a group's goal that must come from lifts aimed at it. All of the calves': a squat or a
// leg curl steadies them, a calf raise grows them.
export const DIRECT_MIN = { chest: 0, back: 0, shoulders: .4, biceps: .5, triceps: .5, forearms: 0, abs: 0, quads: 0, hamstrings: 0, glutes: 0, calves: 1 }
// The parts (coverage.js GROUP_PARTS) whose weekly minimums the planner fills: those of tier 1
// and 2 (goals.js PARTS). A tier-3 part, the lower back or the glutes', is only counted.
// Read when first asked for: goals.js and coverage.js import this file's users in turn.
let planned = null
const plannedParts = () => (planned ||= Object.entries(GROUP_PARTS)
  .flatMap(([g, parts]) => parts.map(([name, muscles, move]) => ({ g, name, muscles, move })))
  .filter(p => partTierOf(p.g, p.name) <= 2))
// The muscles a lift filed under the chest, shoulders, back or glutes must aim at to train it
// (offTarget): the parts those groups had before the tiers, so the planner's lifts stay the same.
const AIMED_MUSCLES = {
  chest: ['pec-major-clavicular', 'pec-major-sternal'],
  shoulders: ['front-delt', 'side-delt', 'rear-delt'],
  back: ['lats', 'rhomboids', 'middle-trap', 'upper-trap'],
  glutes: ['glute-max', 'glute-med', 'adductors', 'adductor-magnus'],
}
// Which groups give way when the week can't hold every goal, the highest number first. A part
// (the side delts) goes with its group. The glutes go with the calves and forearms: the squats,
// lunges and hinges work them hard, what gives way is a hip thrust.
export const PRIORITY = { chest: 0, back: 0, quads: 0, hamstrings: 0, shoulders: 1, biceps: 1, triceps: 1, abs: 2, glutes: 3, calves: 3, forearms: 3 }
// The groups a full-body one-tap day gives a lift aimed at each, until the week has reached their
// goal (generate.js dailyGroups): the presses count toward the triceps, but a week of them with no
// pushdown is no triceps week. Not the glutes, calves or forearms, which the squats, hinges, rows
// and curls work anyway, and which a day fits when it has the time.
export const DAILY_GROUPS = ['chest', 'back', 'quads', 'hamstrings', 'shoulders', 'biceps', 'triceps', 'abs']
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
// `parts`: a part of a group the day doesn't train that it may still take a lift for: the rear
// delts pull, a face pull or a rear fly goes with the rows, and the push day's one shoulder lift
// is then the side delts'.
export const DAY_TYPES = {
  full: { groups: PLAN_GROUPS },
  upper: { groups: ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs'], leads: ['hpress', 'hpull', 'vpress', 'vpull'] },
  lower: { groups: ['quads', 'hamstrings', 'glutes', 'calves', 'abs'], leads: ['squat', 'hinge'] },
  push: { groups: ['chest', 'shoulders', 'triceps', 'abs'], leads: ['hpress', 'vpress'] },
  pull: { groups: ['back', 'biceps', 'forearms', 'abs'], parts: ['Rear delts'], leads: ['vpull', 'hpull'] },
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
export const PLAN_DEFAULTS = { template: 'full', goal: 'growth', level: 'intermediate', equipment: 'gym', days: 3, minutes: 60, seed: 1 }

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
  X('1459', 'hinge', 'compound', ['hamstrings'], 'db', { lead: true }), // dumbbell romanian deadlift
  X('4971', 'hinge', 'compound', ['hamstrings'], 'bw', { perSide: true }), // single-leg rdl
  X('0025', 'hpress', 'compound', ['chest'], 'gym', { lead: true }), // bench press
  X('0314', 'hpress', 'compound', ['chest'], 'db', { lead: true }), // incline dumbbell press
  X('0289', 'hpress', 'compound', ['chest'], 'db', { lead: true }), // dumbbell bench press
  X('0251', 'hpress', 'compound', ['chest'], 'bw'), // dip
  X('0662', 'hpress', 'compound', ['chest'], 'bw', { lead: true }), // push-up
  // The arms work hard in the diamond push-up and the chin-up, but the chest and lats more: presses
  // and pulls, not arm work, and a decline push-up is a press like any other.
  X('0283', 'hpress', 'compound', ['chest'], 'bw'), // diamond push-up
  X('0279', 'hpress', 'compound', ['chest'], 'bw'), // decline push-up
  X('1162', 'vpress', 'compound', ['shoulders'], 'gym', { lead: true }), // overhead press
  X('0405', 'vpress', 'compound', ['shoulders'], 'db', { lead: true }), // seated dumbbell press
  X('2137', 'vpress', 'compound', ['shoulders'], 'db'), // arnold press
  X('2921', 'vpress', 'compound', ['shoulders'], 'bw', { lead: true }), // pike push-up
  X('0652', 'vpull', 'compound', ['back'], 'bw', { lead: true }), // pull-up
  X('2330', 'vpull', 'compound', ['back'], 'gym'), // lat pulldown
  X('1047', 'vpull', 'compound', ['back'], 'gym'), // close-grip pulldown
  X('1326', 'vpull', 'compound', ['back'], 'bw'), // chin-up
  X('0027', 'hpull', 'compound', ['back'], 'gym', { lead: true }), // barbell row
  X('9698', 'hpull', 'compound', ['back'], 'db', { lead: true }), // chest-supported row
  X('2393', 'hpull', 'compound', ['back'], 'db', { perSide: true }), // one-arm dumbbell row
  X('0861', 'hpull', 'compound', ['back'], 'gym'), // seated cable row
  X('0499', 'hpull', 'compound', ['back'], 'bw', { lead: true }), // inverted row
  X('0188', 'iso', 'iso', ['chest'], 'gym'), // cable fly
  X('1030', 'iso', 'iso', ['chest'], 'gym'), // pec deck
  X('0308', 'iso', 'iso', ['chest'], 'db'), // dumbbell fly
  X('0171', 'iso', 'iso', ['chest'], 'gym'), // cable incline fly
  X('0319', 'iso', 'iso', ['chest'], 'db'), // incline dumbbell fly
  X('0238', 'iso', 'iso', ['back'], 'gym'), // straight-arm pulldown
  X('0375', 'iso', 'iso', ['back'], 'db'), // dumbbell pullover
  X('0334', 'iso', 'iso', ['shoulders'], 'db'), // lateral raise
  X('0178', 'iso', 'iso', ['shoulders'], 'gym'), // cable lateral raise
  X('5527', 'iso', 'iso', ['shoulders'], 'gym'), // rear-delt fly
  X('5656', 'iso', 'iso', ['shoulders'], 'gym'), // face pull
  X('2487', 'iso', 'iso', ['shoulders'], 'db'), // dumbbell rear-delt fly
  X('0294', 'iso', 'iso', ['biceps'], 'db'), // dumbbell curl
  X('0313', 'iso', 'iso', ['biceps'], 'db'), // hammer curl
  X('0318', 'iso', 'iso', ['biceps'], 'db'), // incline curl
  X('0200', 'iso', 'iso', ['triceps'], 'gym'), // rope pushdown
  X('2188', 'iso', 'iso', ['triceps'], 'db'), // overhead triceps extension
  X('0061', 'iso', 'iso', ['triceps'], 'gym'), // skull crusher
  X('0585', 'iso', 'iso', ['quads'], 'gym'), // leg extension
  X('1489', 'iso', 'iso', ['quads'], 'bw'), // sissy squat
  X('0586', 'iso', 'iso', ['hamstrings'], 'gym'), // lying leg curl
  X('0599', 'iso', 'iso', ['hamstrings'], 'gym'), // seated leg curl
  X('3395', 'iso', 'iso', ['hamstrings'], 'bw'), // sliding leg curl
  // A Nordic curl bends the knee, not the hips: a leg curl on your own weight, not a hinge. Filed
  // as one, it was the hinge a full-body day between two deadlifts took to spare the lower back,
  // and that day had no squat or hinge at all.
  X('7746', 'iso', 'iso', ['hamstrings'], 'bw'), // nordic curl
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

// A lift from your list (`o.pool`) the library above doesn't have, read off the catalogue: its
// movement (exercises.js patternOf), whether it is a compound (coverage.js liftKind) and the group
// it is aimed at (coverage.js slotMuscleOf). A compound fills a slot only when it is aimed at the
// slot's group: a close-grip bench press is triceps work, not the day's press. One on a machine
// or a cable doesn't lead a day; a deadlift or a rack pull only leads one.
const PATS = { squat: 'squat', lunge: 'squat', hinge: 'hinge', 'push-horizontal': 'hpress', 'push-vertical': 'vpress', 'pull-horizontal': 'hpull', 'pull-vertical': 'vpull' }
const NO_LEAD = /cable|machine|lever|band|sled|suspension|assisted|ball|roller/
let lifts = new Map(), liftsWithRoles = false
// A lift the catalogue files under a group with parts whose roles aim at none of them: a rotator
// cuff rotation under the deltoids. It trains the group no more than a carry trains the shoulders.
const offTarget = (id, g) => {
  const target = rolesLoaded() && AIMED_MUSCLES[g] && muscleRolesOf(id)?.target
  return !!target && !AIMED_MUSCLES[g].some(m => target.includes(m))
}
function liftOf(id) {
  if (BY_ID[id]) return BY_ID[id]
  if (liftsWithRoles !== rolesLoaded()) { lifts = new Map(); liftsWithRoles = rolesLoaded() }
  if (!lifts.has(id)) {
    const ex = EXIDX[id], g = ex && groupOfMuscle(slotMuscleOf(ex))?.id
    let lift = null
    if (g && PLAN_GROUPS.includes(g) && !offTarget(id, g) && patternOf(ex) !== 'carry') {
      const compound = liftKind(id) === 'compound'
      const pat = compound && PATS[patternOf(ex)]
      const slot = pat && (PATTERN_GROUPS[pat].includes(g) || (pat === 'hinge' && g === 'glutes' && loadsBack(id))) ? pat : 'iso'
      const need = ex.eq === 'body weight' ? 'bw' : ex.eq === 'dumbbell' ? 'db' : 'gym'
      lift = X(id, slot, compound ? 'compound' : 'iso', [g], need, {
        lead: slot !== 'iso' && !NO_LEAD.test(ex.eq || ''),
        leadOnly: slot === 'hinge' && loadsBack(id) && /deadlift|rack pull/.test(ex.n) && !/romanian|stiff|single/.test(ex.n),
        perSide: !!ex.uni,
        // A poor main lift where a better one is on your list (variant): a renegade row is mostly
        // a plank, a reverse curl mostly a forearm lift, and an assisted dip or pull-up is for a
        // beginner who can't yet move their own weight.
        weak: /renegade/.test(ex.n) || (g === 'biceps' && facetMove(ex) === 'wrist'),
        assisted: /assisted/.test(ex.n),
      })
    }
    lifts.set(id, lift)
  }
  return lifts.get(id)
}
export const planLift = id => liftOf(id)
// Whether a lift you log can be a one-tap day's main lift (generate.js leadFor): a free-weight
// compound, and also a Smith machine or a plate-loaded one, or a pulldown, the gym's usual pull
// from above. Not a cable or band press, and not a weak lift (renegade row, assisted dip).
export const canLead = id => {
  const l = liftOf(id), eq = EXIDX[id]?.eq || ''
  if (!l || l.pat === 'iso' || l.weak || l.assisted) return false
  return l.lead || /smith|leverage/.test(eq) || (l.pat === 'vpull' && eq === 'cable')
}

// The lifts a week is built from: your list (`pool`, exercise ids), with the library's for a
// movement, a group or a part your list has none for, so a list without a squat still squats.
function libraryOf(pool) {
  if (!pool) return PLAN_LIB
  const lib = [...new Set(pool)].map(liftOf).filter(Boolean)
  const ids = new Set(lib.map(e => e.id))
  const missing = [
    ...Object.keys(PATTERN_GROUPS).filter(pat => !lib.some(e => e.pat === pat)).map(pat => e => e.pat === pat),
    ...PLAN_GROUPS.filter(g => !lib.some(e => e.kind === 'iso' && e.p.includes(g))).map(g => e => e.kind === 'iso' && e.p.includes(g)),
    ...(rolesLoaded() ? plannedParts().map(p => p.name).filter(name => !lib.some(e => aimsAt(e, name))).map(name => e => aimsAt(e, name)) : []),
  ]
  for (const e of PLAN_LIB) if (!ids.has(e.id) && missing.some(f => f(e))) lib.push(e)
  return lib
}
// The groups whose accessories are lifts for that muscle alone: a curl, a pushdown, a raise. The
// other groups' may be a compound too, the press or row the week has no slot for.
const ISO_ONLY = ['biceps', 'triceps', 'shoulders']
const accessoryFor = (e, g) => !e.leadOnly && (e.kind === 'iso' || !ISO_ONLY.includes(g)) && (g !== 'shoulders' || deltLift(e))
// The shoulders' one lift a day is for one delt: the side, the rear or the front ones, the front
// a tier-1 part like the others since a press only helps them (goals.js PARTS). Aimed at that
// delt alone: an around-the-world or a Cuban press (front and side delts and the rotator cuff at
// once) took the lateral raise's turn, and an upright row, the traps' lift as much as the side
// delts', won it over the raise for the traps it also fed.
const DELTS = ['Side delts', 'Rear delts', 'Front delts']
// Before the muscle roles are in (muscle-roles.js) no lift says which delt it is for, and any will do.
const deltLift = e => {
  const aims = Object.keys(partCreditOf(e)).filter(n => aimsAt(e, n))
  return !aims.length || (aims.length === 1 && DELTS.includes(aims[0]))
}
// A second lift aimed at the shoulders, a press or a raise, whichever delt: the presses and rows
// already work them, and the published full-body programs give them one a session or none.
// And a second one for the abs: a day's abs are one slot, which its turn (abs-combo.js absTurn)
// makes a body-weight combo or a weighted lift. A crunch and a Russian twist left beside it made
// the combo day six abs exercises. And one for the calves: a seated raise beside a standing one
// is the soleus beside the gastrocnemius, but a long day with few groups ticked had three and
// more, and one calf raise a session is what the programs give them.
const ONE_A_DAY = ['shoulders', 'abs', 'calves']
// And one movement once: a barbell and a dumbbell pullover are one pullover on two tools.
const TOOLS = /\b(ez barbell|ez bar|trap bar|barbell|dumbbell|kettlebell|cable|lever|smith|band|weighted|sled)\b/g
// Standing is how most are done: a shrug and a standing shrug are one shrug. Seated isn't (a seated
// calf raise is the soleus').
const moveOf = e => EXIDX[e.id]?.n.replace(TOOLS, '').replace(/\bstanding\b/g, '').replace(/\s+/g, ' ').trim()
// And one pull from overhead: a chin-up after the pull-up is the same lift on another grip.
const ONE_MOVE = ['vpull']
// The most sets a full-body day's squat, hinge, press and pull take (skeleton `top`).
const FULL_MAIN = 4
const repeats = (items, e) => ONE_A_DAY.some(g => e.p.includes(g) && items.some(i => i.ex.p.includes(g)))
  || ONE_MOVE.includes(e.pat) && items.some(i => i.ex.pat === e.pat)
  || items.some(i => i.slot === 'accessory' && moveOf(i.ex) === moveOf(e))
// A hinge the lower back holds up (coverage.js loadsBack): a deadlift, a romanian, a good morning
// filed as the hamstrings' accessory.
const heavyHinge = e => (e.pat === 'hinge' || patternOf(EXIDX[e.id]) === 'hinge') && loadsBack(e.id)
// A lift on a day next to this one, the week going round: not again today unless nothing else
// will do. Prefers `cands` none of those days has.
const far = (cands, near) => { const out = cands.filter(e => !near.has(e.id)); return out.length ? out : cands }
// No third lift of one movement while another will do: after the pull-up and the pulldown a row or a
// pullover, not a chin-up. An incline press after the bench is still a press. And a group's second
// lift on another tool: a cable row after the machine one. Prefers those of `cands`.
// And the back's second pull the other way while one will do: a pulldown after the row, not a
// second row because the mid back was the part furthest behind.
const PULLS = ['hpull', 'vpull']
const toolOf = e => variantOf(EXIDX[e.id]).tool
const novel = (cands, items) => {
  const moves = cands.filter(e => e.kind !== 'compound' || items.filter(i => i.ex.pat === e.pat).length < 2)
  const pulled = PULLS.filter(p => items.some(i => i.ex.pat === p))
  const turn = pulled.length === 1 ? moves.filter(e => e.pat !== pulled[0]) : moves
  const pool = turn.length ? turn : moves.length ? moves : cands
  const tools = pool.filter(e => !items.some(i => i.ex.p[0] === e.p[0] && toolOf(i.ex) === toolOf(e)))
  return tools.length ? tools : pool
}

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
// The app's weekly goal for each group (goals.js): the kind of goal's default, or a group's own.
// A group's `focus` (goals.js focusOf) moves it: none of its own, or more.
const goalsFor = (type, byGroup, volume, focus) =>
  Object.fromEntries(PLAN_GROUPS.map(g => [g, weeklyTargetOf({ goals: { type, byGroup, volume, focus } }, g)]))
// The shares of their groups' goals of the parts the planner fills (goals.js partTargetOf,
// plannedParts), tier 1 before tier 2: `[{ g, name, goal, tier }]`.
export const partsFor = (type, byGroup, volume, focus) => plannedParts()
  .map(({ g, name }) => ({ g, name, tier: partTierOf(g, name), goal: partTargetOf({ goals: { type, byGroup, volume, focus } }, g, name) }))
  .filter(p => p.goal > 0).sort((a, b) => a.tier - b.tier)
const SHORT = 0.85 // under 85% of the goal counts as short

/** The settings with every default filled in. */
export function configOf(o = {}) {
  const goal = SCHEMES[o.goal] ? o.goal : PLAN_DEFAULTS.goal
  const level = LEVELS[o.level] ? o.level : PLAN_DEFAULTS.level
  // The rests you keep to (`o.rests`, engine.js restRangeOf): every slot's rest inside them.
  const rests = o.rests?.max >= o.rests?.min && o.rests.min > 0 ? { min: o.rests.min, max: o.rests.max } : null
  const sc = rangedScheme(goal, rests)
  return {
    template: PLAN_TEMPLATES[o.template] ? o.template : PLAN_DEFAULTS.template, goal, level,
    equipment: EQUIPMENT[o.equipment] ? o.equipment : PLAN_DEFAULTS.equipment,
    days: o.days || PLAN_DEFAULTS.days, minutes: o.minutes || PLAN_DEFAULTS.minutes,
    seed: o.seed ?? 1, shift: o.shift || 0, volume: VOLUMES.includes(o.volume) ? o.volume : 0,
    pace: o.pace > 0 ? o.pace : null, rests, warmups: Math.max(0, Math.round(o.warmups) || 0),
    keep: (o.keep || []).map(ids => new Set(ids)),
    known: new Set(o.known || []), last: o.last || null, log: o.log || null,
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

/**
 * A program's lift `item` with `id` in its place: the slot and sets stay, prescribed for itself
 * under the settings `plan`, as swapIn does. One the planner doesn't know keeps the slot's numbers.
 */
export function swappedItem(plan, item, id) {
  const ex = liftOf(id)
  if (!ex) return { ...item, id }
  const { lo, hi, rir, rest } = prescribe(configOf(plan), ex, item.slot, ex.p[0])
  return { ...item, id, lo, hi, rir, rest }
}

// Group id -> what a set of the lift counts for, the way the app counts a logged set
// (coverage.js plannedSets): its muscle roles once they are loaded, else the catalogue's muscles.
let credits = new Map(), creditsWithRoles = false
export const creditOf = ex => {
  if (creditsWithRoles !== rolesLoaded()) { credits = new Map(); creditsWithRoles = rolesLoaded() }
  if (!credits.has(ex.id)) credits.set(ex.id, groupCredit(entryWeights({ id: ex.id })))
  return credits.get(ex.id)
}
// Part name -> what a set of the lift gives toward the part's minimum, the way the app counts it
// (coverage.js partSplitOf, partSets): a set aimed at it in full, one that helps a fifth, or
// two-fifths for a tier-2 part, which the compounds see to.
let partCredits = new Map(), partsWithRoles = false
export const partCreditOf = ex => {
  if (partsWithRoles !== rolesLoaded()) { partCredits = new Map(); partsWithRoles = rolesLoaded() }
  if (!partCredits.has(ex.id)) {
    const r = muscleRolesOf(ex.id), c = {}
    if (r) for (const { g, name, muscles, move } of plannedParts()) {
      const role = partRoleOf(r, liftMove(ex), muscles, move)
      if (role === 'target') c[name] = 1
      else if (role) c[name] = ROLE_WEIGHT.synergists * helpedPartOf(g, name)
    }
    partCredits.set(ex.id, c)
  }
  return partCredits.get(ex.id)
}
const aimsAt = (ex, name) => (partCreditOf(ex)[name] || 0) >= 1
const addParts = (into, ex, sets) => {
  for (const [n, v] of Object.entries(partCreditOf(ex))) into[n] = (into[n] || 0) + v * sets
  return into
}
const add = (cfg, into, ex, sets) => {
  for (const [g, v] of Object.entries(creditOf(ex))) into[g] = (into[g] || 0) + v * sets
  return into
}
// `cfg.pace`, your own seconds a set (pace.js), times the sets when there is one; the slot's
// reps and rest otherwise.
// With rests you keep to (`cfg.rests`) a set takes its reps, its rest and MOVING seconds of
// getting to the next one: short rests leave the walking and loading a real part of the time,
// and however long your sets ran before you set them says nothing of how long they run now.
// A pace of your own that is quicker still stands.
const MOVING = 30
// A combo's members run back to back in one spot (abs-combo.js), so they move no further (`still`).
const secsAt = (own, { pace, rests }, still = false) => (rests ? Math.min(pace || Infinity, own + (still ? 0 : MOVING)) : pace || own)
const setSecs = (cfg, it) => secsAt(it.rx.secs, cfg)
// Each lift's warm-up sets (`cfg.warmups`, the one-tap setup's) are timed as sets of it: the app
// rests them as long as its work sets (supersetFlow.js warmupRestSecFor).
const minutesOf = (cfg, items) => cfg.warmupMin + items.reduce((m, it) => m + (it.sets + (cfg.warmups || 0)) * setSecs(cfg, it), 0) / 60
/** Minutes a day of `sets` work sets takes at `pace` seconds a set, its warm-up included. */
export const paceMinutes = (sets, pace) => Math.round(ADV.warmupMin + sets * pace / 60)
/**
 * Minutes the sets of `entries` (`[{ reps, rest, perSide, still }]`, one a set, warm-ups included) take,
 * timed as the planner times a day it builds: each set its reps and the rest after it, under
 * `{ pace, rests }`, plus the general warm-up before the first.
 */
export const setsMinutes = (sets, env) =>
  Math.round(ADV.warmupMin + sets.reduce((m, s) => m + secsAt((s.reps || 0) * ADV.secPerRep * (s.perSide ? 2 : 1) + (s.rest || 0), env, s.still), 0) / 60)

// The most popular lift not used yet this week, else the most popular of any; ties (lifts off
// the popular list among them) by the seed. `cfg.shift` takes the one that many places further
// down: Shuffle gives each slot its next lift. A program rebuilt from new settings (`cfg.keep`,
// each day's lift ids as they were) takes a lift day `k` had before any other, so what still
// fits stays and keeps its progress, and the same settings build the same week. A one-tap day
// (`cfg.known`, the lifts you logged lately, generate.js knownLifts) takes one you know next, so
// it moves on from last time; a lift you have never done only where none of them fits. Or, with
// `cfg.last`, the lifts of a slot take turns instead.
function variant(cfg, cands, used, rand, k, items = []) {
  if (!cands.length) return null
  const weak = e => e.weak || (e.assisted && cfg.level !== 'beginner')
  if (cands.some(e => !weak(e))) cands = cands.filter(e => !weak(e))
  const fresh = cands.filter(e => !used.has(e.id))
  const pool = fresh.length ? fresh : cands
  const kept = id => (cfg.keep[k]?.has(id) ? 0 : 1)
  const known = id => (cfg.known.has(id) ? 0 : 1)
  // Taking turns (`cfg.last`, lift id -> the ISO day it was last done): the movement done longest
  // ago first (a rear-delt fly after last time's face pull), then the lift done longest ago, one
  // never done before any, so every lift of a slot on your list comes round.
  const turns = cfg.last ? turnsOf(cfg) : null
  const moveDay = e => (turns ? turns.moves[liftMove(e)] || '' : '')
  const last = id => (cfg.last ? cfg.last[id] || '' : '')
  const ranked = pool.map(e => ({ e, kept: kept(e.id), known: cfg.last ? 0 : known(e.id), move: moveDay(e), last: last(e.id), at: popularPlace(e.id), tie: rand() }))
    .sort((a, b) => a.kept - b.kept || a.known - b.known || cmp(a.move, b.move) || cmp(a.last, b.last) || a.at - b.at || a.tie - b.tie)
  return (turns ? kitTurn(ranked, turns, items, rand) : ranked)[cfg.shift % ranked.length].e
}
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
// The movement and the kit of a lift, as Add exercise names them (exercise-facets.js): the
// movement says a hammer curl from a curl and a seated calf raise from a standing one.
const liftMove = e => (EXIDX[e.id] ? facetMove(EXIDX[e.id]) : 'other')
const liftKit = e => (EXIDX[e.id] ? kitOf(EXIDX[e.id]) : 'other')
// What taking turns reads off your history, once a build: the day each movement was last done
// and the kit it was done with then.
function turnsOf(cfg) {
  if (cfg.turns) return cfg.turns
  const moves = {}, kits = {}
  for (const [id, d] of Object.entries(cfg.last)) {
    if (!d || !EXIDX[id]) continue
    const m = facetMove(EXIDX[id])
    if (!moves[m] || d > moves[m]) { moves[m] = d; kits[m] = kitOf(EXIDX[id]) }
  }
  return (cfg.turns = { moves, kits })
}
// The kit takes turns too, at random: of the lifts of the movement that won, one on a kit other
// than the one it had last time, and not one that already has half the day's lifts (two of the
// first three, three of six). Only a kit that is there to take: one barbell lift on your list is
// still the barbell's every time. The rest of `ranked` keeps its order behind them.
function kitTurn(ranked, turns, items, rand) {
  const head = ranked.filter(r => r.kept === ranked[0].kept && r.move === ranked[0].move && liftMove(r.e) === liftMove(ranked[0].e))
  const kits = [...new Set(head.map(r => liftKit(r.e)))]
  if (kits.length < 2) return ranked
  const had = kitCount(items), cap = Math.max(2, Math.ceil((items.length + 1) / 2))
  const roomy = kits.filter(kit => (had[kit] || 0) < cap)
  const fresh = (roomy.length ? roomy : kits).filter(kit => kit !== turns.kits[liftMove(ranked[0].e)])
  const from = fresh.length ? fresh : roomy.length ? roomy : kits
  const kit = from[Math.floor(rand() * from.length)]
  const first = head.filter(r => liftKit(r.e) === kit)
  return [...first, ...ranked.filter(r => !first.includes(r))]
}
const kitCount = items => items.reduce((n, i) => ({ ...n, [liftKit(i.ex)]: (n[liftKit(i.ex)] || 0) + 1 }), {})
// Taking turns within a group (`cfg.last`): some groups' lifts fall into families that take turns
// from one workout to the next, whatever the week's parts ask. The chest's upper and its mid and
// lower half. The abs' flexion (a crunch, a leg raise), rotation (a twist, a woodchop) and bracing
// (a plank, a rollout). The shoulders' side delts, rear delts and front delts (an overhead press
// or a front raise), each as often as its share of the shoulders asks (dueFamily). The back's
// lats (a pulldown, a pull-up) and mid back (a row, which works the lats as well).
const ABS_FAMILY = { crunch: 'flexion', legraise: 'flexion', climber: 'flexion', twist: 'rotation', plank: 'bracing', rollout: 'bracing' }
export const familyOf = (g, e) => (g === 'shoulders' ? (liftMove(e) === 'ohp' || aimsAt(e, 'Front delts') ? 'ohp' : aimsAt(e, 'Rear delts') ? 'rear' : aimsAt(e, 'Side delts') ? 'side' : null)
  : g === 'chest' ? (aimsAt(e, 'Upper chest') ? 'upper' : aimsAt(e, 'Mid and lower chest') ? 'mid' : null)
  : g === 'back' ? (aimsAt(e, 'Mid back') ? 'mid' : aimsAt(e, 'Lats') ? 'lats' : null)
  : g === 'abs' ? ABS_FAMILY[liftMove(e)] || null : null)
// The day each family of group `g` was last done, from `last` (lift id -> ISO day).
export function familyDays(last, g) {
  const days = {}
  for (const [id, d] of Object.entries(last || {})) {
    const f = d && EXIDX[id] && familyOf(g, { id })
    if (f && (!days[f] || d > days[f])) days[f] = d
  }
  return days
}
// The families of group `g` each of your last workouts trained, oldest first, from `sessions`
// (each the ids of a workout's lifts, oldest workout first): the workouts that trained none left
// out, and only the last twelve, which is all a turn looks at.
export function familyLog(sessions, g) {
  return (sessions || []).map(ids => [...new Set(ids.filter(id => EXIDX[id]).map(id => familyOf(g, { id })).filter(Boolean))])
    .filter(f => f.length).slice(-LOG_SPAN)
}
const LOG_SPAN = 12
// The groups whose families come round as often as their parts' shares ask: the shoulders' side
// delts four turns in ten, the rear and the front three each; the back's lats and mid back in turn.
const SHARED = { shoulders: { side: 'Side delts', rear: 'Rear delts', ohp: 'Front delts' }, back: { lats: 'Lats', mid: 'Mid back' } }
// How much less each workout counts than the one after it: a family the last few workouts had
// counts for most, so one done three times running a month ago has no say.
const LOG_DECAY = 0.8
// The family whose turn it is, of those in `present` (any, when it is empty). For the shoulders
// and the back, the one furthest behind its share of your last workouts (`cfg.log`, familyLog,
// or else the order of `cfg.last`), the one done longest ago on a tie: side, rear, front, side,
// rear, front, side, rear, side, front, and round again, four sides to three of each other in
// any ten. For any other group the one done longest ago, one never done first.
function dueFamily(cfg, g, present) {
  const memo = (turnsOf(cfg).families ||= {})
  const days = (memo[g] ||= familyDays(cfg.last, g))
  const parts = SHARED[g]
  if (parts) {
    const fams = present.size ? [...present] : Object.keys(parts)
    const log = cfg.log?.[g] || Object.keys(days).sort((a, b) => cmp(days[a], days[b])).map(f => [f])
    let seen = 0
    const had = {}
    log.forEach((fs, k) => {
      const w = LOG_DECAY ** (log.length - 1 - k)
      seen += w
      for (const f of fs) had[f] = (had[f] || 0) + w
    })
    const total = Object.values(parts).reduce((t, p) => t + PARTS[g][p][1], 0)
    const owed = f => (PARTS[g][parts[f]]?.[1] || 0) / total * (seen + 1) - (had[f] || 0)
    return fams.sort((a, b) => owed(b) - owed(a) || cmp(days[a] || '', days[b] || ''))[0]
  }
  return [...present].sort((a, b) => cmp(days[a] || '', days[b] || ''))[0]
}
// The small muscles take turns in pairs, one lower and one upper: the calves and the traps one
// workout, the leg extension and the forearms the next. Each a group and the movements that
// count for it (a shrug for the traps, a leg extension for the quads' rectus femoris).
const SMALL_PAIRS = [
  [['calves', ['calf', 'seatedcalf']], ['back', ['shrug']]],
  [['quads', ['legext']], ['forearms', ['wrist', 'grip']]],
]
const pairDay = (turns, pair) => pair.flatMap(([, moves]) => moves).reduce((d, m) => (cmp(turns.moves[m] || '', d) > 0 ? turns.moves[m] : d), '')
const smallTurn = cfg => {
  const turns = turnsOf(cfg)
  return cmp(pairDay(turns, SMALL_PAIRS[1]), pairDay(turns, SMALL_PAIRS[0])) < 0 ? 1 : 0
}

/** The day types of the week, in order. */
export const scheduleOf = cfg => {
  const cyc = PLAN_TEMPLATES[cfg.template].cycle
  return Array.from({ length: cfg.days }, (_, k) => cyc[k % cyc.length])
}

// Pass 1: one day's backbone.
function skeleton({ cfg, k, type, goals, parts, has, hasPart, week, rand, avail, sched, leads, prev, near, lead: leadId, trains, mine }) {
  const items = []
  const usedPat = pat => (week.patterns[pat] || 0) + items.filter(i => i.ex.pat === pat).length
  const now = g => { const c = {}; for (const i of items) add(cfg, c, i.ex, i.sets); return has(g) + (c[g] || 0) }
  const ratio = g => now(g) / goals[g]
  // A part's ratio, for the slots that feed one part more than another; a part with no minimum
  // never asks for more.
  const partRatio = (name, g) => {
    if (!rolesLoaded()) return ratio(g)
    const goal = parts.find(p => p.name === name)?.goal
    if (!goal) return Infinity
    const c = {}
    for (const i of items) addParts(c, i.ex, i.sets)
    return (hasPart(name) + (c[name] || 0)) / goal
  }
  // The lower back gets a day between its heavy hinges: a hinge next to a day that has one (the
  // day before, or the next day's hinge lead) is one it doesn't hold up, or none.
  const spareBack = (prev?.items || []).some(i => heavyHinge(i.ex)) || leads[k + 1] === 'hinge' || leads[k - 1] === 'hinge'
  const pickOf = (pat, lead) => {
    // A one-tap day leads with the lift of its movement you know best (generate.js leadFor).
    // Only one that can lead (canLead): a cable press you log often still isn't the day's main lift.
    const own = lead && leadId && liftOf(leadId)
    if (own && own.pat === pat && canLead(own.id)) return own
    const all = avail.filter(e => e.pat === pat && !items.some(i => i.ex.id === e.id)
      && !(heavyHinge(e) && (items.some(i => heavyHinge(i.ex)) || (!lead && spareBack))))
    let pool = lead ? (all.some(e => e.lead) ? all.filter(e => e.lead) : all) : all.filter(e => !e.leadOnly)
    // Backbone lifts carry load: skip bodyweight versions when weights are on hand.
    // Not when every loaded one is the week's already and a bodyweight one isn't: a pull-up after
    // Monday's pulldown, not the same pulldown again because the list has just the one machine.
    const loaded = pool.filter(e => e.need !== 'bw')
    const spent = e => week.used.has(e.id) || near(k).has(e.id)
    const unspent = cfg.level === 'beginner' || loaded.some(e => !spent(e)) ? [] : pool.filter(e => e.need === 'bw' && !spent(e) && !e.weak && !e.assisted)
    if (cfg.equipment !== 'bw' && loaded.length) pool = unspent.length ? unspent : loaded
    pool = far(pool, near(k))
    // A group with parts takes the lift aimed at the part furthest behind its share, the bigger
    // share on a tie: a flat bench press, then an incline one.
    // With your history (`cfg.last`), the chest's half whose turn it is instead (dueFamily): an
    // incline press after last time's flat one.
    const g0 = PATTERN_GROUPS[pat][0]
    const fams = cfg.last && g0 === 'chest' && rolesLoaded() ? new Set(pool.map(e => familyOf(g0, e)).filter(Boolean)) : new Set()
    const due = fams.size ? dueFamily(cfg, g0, fams) : null
    if (due) pool = pool.filter(e => familyOf(g0, e) === due)
    else if (rolesLoaded()) {
      const lag = parts.filter(p => p.g === g0).sort((a, b) => partRatio(a.name, g0) - partRatio(b.name, g0) || b.goal - a.goal)
      for (const p of lag) {
        const aimed = pool.filter(e => aimsAt(e, p.name))
        if (aimed.length) { pool = aimed; break }
      }
    }
    return variant(cfg, pool, week.used, rand, k, items)
  }
  // A full-body day's other big lifts may take as many sets as its lead, up to FULL_MAIN (`top`),
  // when the week's share asks for them: capped at three, a day's only press was a 3-set lift
  // while the chest's goal wanted four or five a day. Taken by need, not by default: four sets
  // each whatever the goal gave the legs theirs early, and the last day of the week went without
  // its squat. The skeleton's trim below takes them back to the goal's fewest on a short day.
  const top = type === 'full' ? Math.max(cfg.slotSets, Math.min(FULL_MAIN, cfg.leadSets)) : cfg.slotSets
  const take = (pat, slot, lead = false, always = false) => {
    let sets = cfg.leadSets
    // An overhead press feeds the front delts and little else of the shoulders, and the chest
    // presses already feed them, so it comes only as a lead: a day's one shoulder lift (fill's
    // ONE_A_DAY) is otherwise a raise or a fly for the delt furthest behind.
    if (!lead && pat === 'vpress') return
    if (!trains(type, PATTERN_GROUPS[pat][0])) return
    if (!lead) {
      // Paced over the week: what the group still needs once the leads still to come are counted,
      // shared by the days left that train it. Nothing when it is within a set of its goal.
      const g0 = PATTERN_GROUPS[pat][0]
      const coming = leads.reduce((n, p, j) => n + (j > k && PATTERN_GROUPS[p].includes(g0) ? cfg.leadSets : 0), 0)
      const need = goals[g0] - now(g0) - coming
      if (need < 1 && !always) return
      const left = sched.filter((t, j) => j >= k && trains(t, g0)).length
      sets = Math.min(top, Math.max(cfg.slotMin, Math.ceil(need / left)))
    }
    const ex = pickOf(pat, lead)
    if (!ex) return
    items.push({ ex, sets, slot, rx: prescribe(cfg, ex, slot, ex.p[0]), ...(!lead && top > cfg.slotSets ? { top } : {}) })
    week.used.add(ex.id)
  }
  const other = { squat: 'hinge', hinge: 'squat', hpress: 'vpress', vpress: 'hpress', vpull: 'hpull', hpull: 'vpull' }
  if (type === 'full') {
    const lead = leads[k]
    take(lead, 'lead', true)
    const lower = lead === 'squat' || lead === 'hinge' ? other[lead] : ratio('quads') <= ratio('hamstrings') ? 'squat' : 'hinge'
    take(lower, 'lower')
    // A day that leads with neither still has a squat or a hinge, the fewest sets of a slot when
    // the week's legs have theirs already: with no hinge left that spares the lower back (a day
    // between two deadlifts), the squat instead. A fourth full-body day had neither, its squat
    // gone to the day before because the quads' goal was met.
    for (const pat of [lower, other[lower]]) if (!items.some(i => i.slot === 'lower') && lead !== 'squat' && lead !== 'hinge') take(pat, 'lower', false, true)
    // The push slot presses for the chest; a day that leads with a bench press has its press
    // already. The side and rear delts get lifts of their own (fill). A row feeds the mid back and
    // the lats, a pulldown the lats; with your history (`cfg.last`), the one whose turn it is
    // (dueFamily), a pulldown after last time's row.
    if (lead !== 'hpress') take('hpress', 'push')
    // Only a movement your list has a lift of: not the planner's own pulldown for a list of dumbbells.
    const pulls = ['hpull', 'vpull'].filter(p => avail.some(e => e.pat === p && (!mine || mine.has(e.id))))
    const pull = cfg.last && pulls.length > 1 ? (dueFamily(cfg, 'back', new Set()) === 'mid' ? 'hpull' : 'vpull')
      : pulls.length === 1 ? pulls[0] : partRatio('Mid back', 'back') <= partRatio('Lats', 'back') ? 'hpull' : 'vpull'
    take(lead === 'vpull' || lead === 'hpull' ? other[lead] : pull, 'pull')
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
function fill({ cfg, day, goals, parts, has, hasDirect, hasPart, daysLeftFor, daysLeftForPart, week, rand, avail, whole, near, trains, daily = [] }) {
  const items = day.items, allowed = PLAN_GROUPS.filter(g => trains(day.type, g))
  const nearby = near(day.k)
  // A heavy hinge as an accessory only on a day with none, next to days with none.
  const backFree = () => !items.some(i => heavyHinge(i.ex)) && ![...nearby].some(id => heavyHinge(liftOf(id) || { id }))
  const today = () => { const c = {}; for (const i of items) add(cfg, c, i.ex, i.sets); return c }
  // A full day with your history takes the small muscles of its pair (smallTurn) and not the other's.
  const pair = cfg.last && day.type === 'full' ? smallTurn(cfg) : -1
  const offPair = e => pair >= 0 && SMALL_PAIRS[1 - pair].some(([g, moves]) => moves.includes(liftMove(e)) || (g !== 'quads' && g !== 'back' && e.p.includes(g)))
  const fresh = e => !items.some(i => i.ex.id === e.id) && !repeats(items, e) && (!heavyHinge(e) || backFree()) && !offPair(e)
  // Among the lifts for group `g`, prefer one that also feeds another group still short (hammer
  // curls feed forearms) and not one already at its goal.
  const helps = e => Object.entries(creditOf(e)).filter(([o, c]) => !e.p.includes(o) && c >= 0.25)
    .reduce((n, [o]) => n + (goals[o] - has(o) > 0 ? 1 : -1), 0)
  // A group with parts takes the lift aimed at a part short of its share, one the week has no
  // lift for yet first, so the parts take turns, then the one furthest behind: a lateral raise
  // one day, a rear-delt fly the next, though the rows have given the rear delts some already.
  const hadLift = name => [...week.used].some(id => aimsAt({ id }, name))
  const behind = (g, e) => Math.max(0, ...parts.filter(p => p.g === g && aimsAt(e, p.name) && hasPart(p.name) < p.goal)
    .map(p => (hadLift(p.name) ? 0 : 1) + 1 - hasPart(p.name) / p.goal))
  // With neither delt further behind, the shoulders' lift goes to the one the week has had fewer
  // lifts for, the side delts on a tie: the presses and rows give both some, but nothing else
  // reaches the side delts, and a week of face pulls and reverse flies left them none.
  const liftsFor = name => [...week.used, ...items.map(i => i.ex.id)].filter(id => aimsAt({ id }, name)).length
  const turnOf = (g, list) => {
    if (g !== 'shoulders') return list
    const d = DELTS.reduce((a, b) => (liftsFor(b) < liftsFor(a) ? b : a))
    const mine = list.filter(e => aimsAt(e, d))
    return mine.length ? mine : list
  }
  // With your history (`cfg.last`), the family whose turn it is (dueFamily), when there is a lift
  // of it to take. And the hamstrings' lift on a day with no hinge is a leg curl, so each workout
  // trains them at the hip or at the knee.
  const hinged = () => items.some(i => i.ex.pat === 'hinge' || patternOf(EXIDX[i.ex.id]) === 'hinge')
  const inTurn = (g, list) => {
    if (!cfg.last) return list
    if (g === 'hamstrings') {
      const curls = hinged() ? [] : list.filter(e => liftMove(e) === 'legcurl')
      return curls.length ? curls : list
    }
    // Only lifts filed under the group: an around-the-world reaches the upper chest but is a shoulder lift.
    const own = list.filter(e => e.p.includes(g))
    const fams = new Set(own.map(e => familyOf(g, e)).filter(Boolean))
    if (!fams.size) return list
    // A workout is one half of the chest: its fly goes where its press went, so the next workout's
    // turn is plain.
    const had = g === 'chest' && items.find(i => i.ex.p.includes(g) && familyOf(g, i.ex))
    // The shoulders and the back take the family the day has no lift of yet, if it has a lift of
    // one already: a row after a pulldown, a raise for the side delts after an overhead press.
    const today = SHARED[g] ? new Set(items.filter(i => i.ex.p.includes(g)).map(i => familyOf(g, i.ex))) : new Set()
    const left = new Set([...fams].filter(f => !today.has(f)))
    const due = had ? familyOf(g, had.ex) : dueFamily(cfg, g, left.size ? left : fams)
    const mine = own.filter(e => familyOf(g, e) === due)
    return mine.length ? mine : own.length ? own : list
  }
  // The overhead press is a shoulder accessory when it is the press's turn.
  const pressTurn = () => cfg.last && dueFamily(cfg, 'shoulders', new Set()) === 'ohp'
  const forG = (e, g) => accessoryFor(e, g) || (g === 'shoulders' && !e.leadOnly && liftMove(e) === 'ohp' && pressTurn())
  // Not a lift a day next to this one has, before anything else: a pullover two days running
  // was the one that also helped the triceps both times.
  const choose = (g, list) => {
    const cands = inTurn(g, far(novel(list, items), nearby))
    const top = Math.max(...cands.map(e => behind(g, e)))
    const aimed = turnOf(g, cands.filter(e => behind(g, e) === top))
    const best = Math.max(...aimed.map(helps))
    return variant(cfg, aimed.filter(e => helps(e) === best), week.used, rand, day.k, items)
  }
  const push = it => {
    items.push(it)
    week.used.add(it.ex.id)
    for (const [g, v] of Object.entries(creditOf(it.ex))) week.acc[g] = (week.acc[g] || 0) + v * it.sets
    for (const g of it.ex.p) week.accDirect[g] = (week.accDirect[g] || 0) + it.sets
    addParts(week.accParts, it.ex, it.sets)
  }
  day.limit = null
  day.capped = {}
  const noTime = {}
  // First a lift aimed at each of the `daily` groups the day has none for, in the order given
  // (generate.js dailyGroups: the ones the last sessions went without first), whatever the day's
  // share of their goal: the presses gave the triceps their count and no pushdown. Room comes off
  // the other lifts' sets, down to their fewest; a group the minutes can't hold even then waits
  // for the next day, where it comes first.
  const fewest = i => (i.slot === 'lead' ? Math.min(i.sets, LEAD_MIN) : i.slot === 'accessory' ? Math.min(i.sets, cfg.accMin) : Math.min(i.sets, cfg.slotMin))
  // The chest's press is a lift aimed at it, but a day of presses alone never had a fly: while
  // the day's share wants more than the press gives, the chest takes its fly here too, in the
  // press's half (inTurn), on the kit the day has least of: the cables are the only kit some of
  // the lifts still to come have (a pushdown, a kneeling crunch).
  for (const g of daily) {
    const pressed = g === 'chest' && items.some(i => i.slot !== 'accessory' && i.ex.p.includes(g))
    if (!trains(day.type, g) || items.some(i => i.ex.p.includes(g) && (!pressed || i.slot === 'accessory'))) continue
    const gap = Math.max(goals[g] - has(g), Math.ceil(DIRECT_MIN[g] * goals[g]) - hasDirect(g))
    if (pressed && gap < cfg.accMin) continue
    let cands = avail.filter(e => forG(e, g) && e.p.includes(g) && fresh(e) && (!pressed || e.kind === 'iso'))
    if (pressed) {
      const had = kitCount(items), least = Math.min(...cands.map(e => had[liftKit(e)] || 0))
      cands = cands.filter(e => (had[liftKit(e)] || 0) === least)
    }
    if (!cands.length) continue
    const ex = choose(g, cands)
    // A group below the top two PRIORITY tiers starts at its fewest sets: the time it would take
    // up front goes to the chest, back and legs first, and topUp grows it later if the week has room.
    const sets = PRIORITY[g] >= 2 ? cfg.accMin : Math.max(cfg.accMin, Math.min(cfg.accMax, Math.ceil(gap)))
    const it = { ex, sets, slot: 'accessory', rx: prescribe(cfg, ex, 'accessory', g) }
    if (minutesOf(cfg, [...items.map(i => ({ ...i, sets: fewest(i) })), { ...it, sets: cfg.accMin }]) > cfg.minutes) { day.limit = 'time'; continue }
    for (;;) {
      if (minutesOf(cfg, [...items, it]) <= cfg.minutes) break
      if (it.sets > cfg.accMin) { it.sets--; continue }
      const cut = items.filter(i => i.sets > fewest(i)).sort((a, b) => (b.sets - fewest(b)) - (a.sets - fewest(a)) || b.rx.secs - a.rx.secs)[0]
      cut.sets--
    }
    push(it)
  }
  // Then the small muscles whose turn it is, each at its fewest sets, where the minutes and the
  // level's accessories allow (`turn`: trim keeps it, though the squats gave the calves their count).
  if (pair >= 0) {
    for (const [g, moves] of SMALL_PAIRS[pair]) {
      if (!trains(day.type, g) || items.filter(i => i.slot === 'accessory').length >= cfg.maxAcc) continue
      if (items.some(i => moves.includes(liftMove(i.ex)))) continue
      const cands = avail.filter(e => accessoryFor(e, g) && e.p.includes(g) && moves.includes(liftMove(e)) && fresh(e))
      if (!cands.length) continue
      const ex = variant(cfg, far(cands, nearby), week.used, rand, day.k, items)
      const it = { ex, sets: cfg.accMin, slot: 'accessory', turn: true, rx: prescribe(cfg, ex, 'accessory', g) }
      if (minutesOf(cfg, [...items, it]) > cfg.minutes) { day.limit = 'time'; continue }
      push(it)
    }
  }
  for (;;) {
    if (items.filter(i => i.slot === 'accessory').length >= cfg.maxAcc) { day.limit = 'accessories'; break }
    const t = today()
    const scored = allowed.map(g => {
      const left = daysLeftFor(g)
      const dTarget = Math.ceil(DIRECT_MIN[g] * goals[g]), dGap = dTarget - hasDirect(g)
      const forDirect = dGap > goals[g] - has(g)
      const gap = Math.max(goals[g] - has(g), dGap)
      const direct = items.filter(i => i.ex.p.includes(g)).length
      const cands = avail.filter(e => forG(e, g) && e.p.includes(g) && fresh(e))
      const blocked = noTime[g] ? 'time' : items.some(i => i.slot === 'accessory' && i.ex.p.includes(g)) ? 'has'
        : direct >= (ONE_A_DAY.includes(g) ? 1 : cfg.maxDirect) || (t[g] || 0) >= cfg.sessionCap ? 'caps'
        : !cands.length ? 'equipment' : ''
      return { g, done: goals[g] > 0 ? 1 - gap / goals[g] : 1, gap, need: left ? gap / left : 0, left, blocked, cands, slack: (forDirect ? dTarget : goals[g]) * (1 - SHORT) }
    })
    // A part short of its minimum asks for a lift aimed at it, even with its group at goal: the
    // presses fill the shoulders' count and leave the rear delts none.
    for (const p of parts.filter(p => trains(day.type, p.g, p.name))) {
      const left = daysLeftForPart(p), gap = p.goal - hasPart(p.name)
      // Filed under a group the day trains: a dumbbell around-the-world reaches the upper chest but
      // is a shoulder lift, and a day without the shoulders takes none.
      const cands = avail.filter(e => accessoryFor(e, p.g) && e.p.some(g => trains(day.type, g, p.name)) && aimsAt(e, p.name) && fresh(e))
      const blocked = noTime[p.name] ? 'time' : items.some(i => i.slot === 'accessory' && aimsAt(i.ex, p.name)) ? 'has'
        : (t[p.g] || 0) >= cfg.sessionCap || (ONE_A_DAY.includes(p.g) && items.some(i => i.ex.p.includes(p.g))) ? 'caps'
        : !cands.length ? 'equipment' : ''
      // The last day that trains it gives a tier-1 part with no lift aimed at it yet one, though
      // the rows have brought the rear delts near their share. A tier-2 part the compounds bring
      // near theirs, needs none. Nor does one that gave way (giveWay): a calf raise the week cut
      // to nothing doesn't come back for the gastrocnemius.
      const none = p.tier < 2 && gap > 0 && ![...week.used, ...items.map(i => i.ex.id)].some(id => aimsAt({ id }, p.name))
      scored.push({ g: p.g, part: p.name, tier: p.tier, done: p.goal > 0 ? 1 - gap / p.goal : 1, gap, need: left ? gap / left : 0, left, blocked, cands, slack: p.goal * (1 - SHORT), none })
    }
    // The most sets a day still owes goes first, and a tier-1 part with nothing aimed at it yet
    // asks twice as loud: the side delts' four sets owed lose to the biceps' ten, and a week of
    // two upper days spent its slots on curls and a third back lift and gave the side delts none.
    const behind = s => -s.need * (s.part && s.tier === 1 && s.done <= 0 ? 2 : 1)
    scored.sort((a, b) => behind(a) - behind(b) || b.need - a.need)
    // The last day that trains a group tops it up if it would otherwise end short. A tier-2 part
    // asks only when no group and no tier-1 part does, and so does a tier-1 part whose group has
    // its sets already: the hamstrings' deadlifts done, a leg curl waits for the quads' last ones.
    const ok = s => (s.need >= cfg.needMin && s.gap >= cfg.accMin) || (s.left === 1 && (s.gap > s.slack || s.none))
    const met = new Set(scored.filter(s => !s.part && s.gap <= 0).map(s => s.g))
    const late = s => s.tier >= 2 || (!!s.part && met.has(s.g))
    const pick = scored.find(s => ok(s) && !s.blocked && !late(s)) || scored.find(s => ok(s) && !s.blocked)
    if (!pick) {
      for (const w of scored.filter(s => ok(s) && !s.part)) day.capped[w.g] = w.blocked
      break
    }
    // Paced over the days left, or, for a group that gave way (giveWay), all it still needs at
    // once: one day gets the calf raise, the next the wrist curl, not both a set or two.
    const sets = Math.max(cfg.accMin, Math.min(cfg.accMax, whole.has(pick.g) ? Infinity : Math.round(pick.need), Math.ceil(pick.gap)))
    // A day takes one lift for the shoulders, so it goes to the delt furthest behind its minimum,
    // whichever asked: the side delts would take every day and leave the rear ones none.
    const ex = choose(pick.g, ONE_A_DAY.includes(pick.g) ? [...new Set(scored.filter(s => s.g === pick.g && !s.blocked).flatMap(s => s.cands))] : pick.cands)
    const it = { ex, sets, slot: 'accessory', rx: prescribe(cfg, ex, 'accessory', pick.g) }
    // Too long for what is left of the session: a top-tier group's lift first takes the sets a
    // full-body day's big lifts have past the goal's (skeleton `top`), the longest sets first: a
    // fourth set of rows and of deadlifts cost the chest its dips. Else skip this group today and
    // try another.
    const over = () => minutesOf(cfg, [...items, it]) > cfg.minutes
    if (over() && PRIORITY[pick.g] === 0) {
      const spare = items.filter(i => i.top && i.sets > cfg.slotSets).sort((a, b) => b.rx.secs - a.rx.secs)
      const was = spare.map(i => i.sets)
      for (const i of spare) { if (!over()) break; i.sets = cfg.slotSets }
      if (over()) spare.forEach((i, j) => { i.sets = was[j] })
    }
    if (over()) { day.limit = 'time'; noTime[pick.part || pick.g] = true; continue }
    push(it)
  }
}

// Pass 3: close what fill left just short. Fill stops when a group is a set or so from its goal,
// too little for an accessory of its own; here one set at a time goes on the lift that counts most
// for that group, on a day with the minutes for it and below the day's cap for the group. With no
// such lift, the day with the most time to spare gets an accessory at its fewest sets. A part
// short of its minimum the same way, on a lift aimed at it. `aimed`: only on lifts aimed at the
// group, so the time a group that gave way (giveWay) gets back doesn't go on a leg curl for the calves.
function topUp({ cfg, out, goals, parts, week, rand, avail, aimed, near, trains, whole = new Set(), keep = false }) {
  const most = it => (it.slot === 'accessory' ? cfg.accMax : it.slot === 'lead' ? cfg.leadSets : it.top || cfg.slotSets)
  const needs = [
    ...PLAN_GROUPS.map(g => ({ key: g, g, goal: goals[g], credit: e => creditOf(e)[g] || 0, least: 0.4, aimed: e => e.p.includes(g), on: t => trains(t, g) })),
    ...parts.map(p => ({ key: p.name, g: p.g, tier: p.tier, goal: p.goal, credit: e => partCreditOf(e)[p.name] || 0, least: 1, aimed: e => aimsAt(e, p.name), on: t => trains(t, p.g, p.name) })),
  ]
  // A tier-2 part (goals.js PARTS) after every group and tier-1 part.
  const late = n => +(n.tier >= 2)
  const stuck = new Set()
  for (let guard = 0; guard < 100; guard++) {
    const t = {}
    for (const n of needs) t[n.key] = out.reduce((a, d) => a + d.items.reduce((b, i) => b + n.credit(i.ex) * i.sets, 0), 0)
    const n = needs.filter(n => !stuck.has(n.key) && t[n.key] < n.goal - 1e-9).sort((a, b) => late(a) - late(b) || t[a.key] / a.goal - t[b.key] / b.goal)[0]
    if (!n) break
    const g = n.g
    let best = null
    for (const d of out) {
      const day = {}
      for (const i of d.items) add(cfg, day, i.ex, i.sets)
      for (const it of d.items) {
        const c = n.credit(it.ex)
        if (c < n.least || (aimed && !n.aimed(it.ex)) || it.sets >= most(it) || (day[g] || 0) + (creditOf(it.ex)[g] || 0) > cfg.sessionCap) continue
        let cut = null
        if (minutesOf(cfg, d.items.map(i => (i === it ? { ...i, sets: i.sets + 1 } : i))) > cfg.minutes) {
          // A day too full for the chest, back or legs takes the time from an accessory of a group
          // further down PRIORITY that has sets to spare, a set at a time down to its fewest: the
          // fourth lateral raise goes before the back's last row.
          if (keep || !(n.tier == null && PRIORITY[g] === 0)) continue
          cut = d.items.filter(v => v !== it && v.slot === 'accessory' && v.sets > cfg.accMin && !v.turn && v.ex.p.every(x => PRIORITY[x] > 0 && (t[x] ?? 0) - (creditOf(v.ex)[x] || 0) >= (goals[x] || 0) - 1e-9) && !(creditOf(v.ex)[g] > 0))
            .find(v => minutesOf(cfg, d.items.map(i => (i === it ? { ...i, sets: i.sets + 1 } : i === v ? { ...i, sets: i.sets - 1 } : i))) <= cfg.minutes)
          if (!cut) continue
        }
        if (!best || c > best.c || (c === best.c && best.cut && !cut)) best = { it, c, cut }
      }
    }
    if (best) { best.it.sets++; if (best.cut) best.cut.sets--; continue }
    // A full-body day whose skeleton left a slot empty (a squat the week no longer needed) has room
    // for that many accessories more.
    const room = d => cfg.maxAcc + (d.type === 'full' ? 3 - d.items.filter(i => i.slot !== 'lead' && i.slot !== 'accessory').length : 0)
    // A day without an accessory for the group first, and for a group that gave way only one: a
    // calf raise short a set or two, not a second one the same day.
    const had = d => +d.items.some(i => i.slot === 'accessory' && i.ex.p.includes(g))
    const days = out.filter(d => n.on(d.type) && d.items.filter(i => i.slot === 'accessory').length < room(d) && !(whole.has(g) && had(d)))
      .sort((a, b) => had(a) - had(b) || minutesOf(cfg, a.items) - minutesOf(cfg, b.items))
    const added = days.some(d => {
      // Never a third of one movement here, where it is a top-up: the mid back short a set or two
      // takes a set on the rows the day has, not a third row (novel lets one in when nothing else will do).
      const cands = avail.filter(e => accessoryFor(e, g) && !heavyHinge(e) && n.aimed(e) && !d.items.some(i => i.ex.id === e.id) && !repeats(d.items, e)
        && (e.kind !== 'compound' || d.items.filter(i => i.ex.pat === e.pat).length < 2))
      if (!cands.length) return false
      const ex = variant(cfg, far(novel(cands, d.items), near(d.k)), week.used, rand, d.k, d.items)
      // A group that gave way takes all it still needs in the one lift, on a day with the minutes
      // for it: one calf raise of four sets, not two of two on days too full to grow them.
      const sets = whole.has(g) ? Math.max(cfg.accMin, Math.min(cfg.accMax, Math.ceil((n.goal - t[n.key]) / (n.credit(ex) || 1)))) : cfg.accMin
      const it = { ex, sets, slot: 'accessory', rx: prescribe(cfg, ex, 'accessory', g) }
      if (minutesOf(cfg, [...d.items, it]) > cfg.minutes) return false
      d.items.push(it)
      week.used.add(ex.id)
      return true
    })
    if (!added) stuck.add(n.key)
  }
}

// Whether `it` is the day's only lift aimed at one of the `daily` groups (fill), which stays
// though the week has the group's sets without it.
const soleDaily = (items, it, daily) => it.ex.p.some(g => daily.includes(g) && items.filter(i => i.ex.p.includes(g)).length === 1)

// Pass 4: take off what goes past the goal. A set comes off a lift (an accessory goes, at its
// fewest, or whole for a group that gave way) while every group it counts for stays at its goal, the lift that spills most first:
// pulldowns and presses feed the chest and shoulders a little, the slots don't see it coming. The
// lead comes last, and never below 3 sets: it stays the day's heavy lift, just shorter when the
// week already has enough of it.
function trim(cfg, out, goals, parts, whole, daily = []) {
  const least = it => (it.slot === 'accessory' ? (it.ex.p.some(g => whole.has(g)) ? it.sets : cfg.accMin) : it.slot === 'lead' ? Math.min(cfg.leadSets, LEAD_MIN) : cfg.slotMin)
  const late = it => (it.slot === 'lead' ? 1 : 0)
  const partGoal = Object.fromEntries(parts.map(p => [p.name, p.goal]))
  for (let guard = 0; guard < 200; guard++) {
    const t = {}, dr = {}, pt = {}
    for (const d of out) for (const i of d.items) { add(cfg, t, i.ex, i.sets); addParts(pt, i.ex, i.sets); for (const g of i.ex.p) dr[g] = (dr[g] || 0) + i.sets }
    // A part's only lift aimed at it stays, however much the rows give the rear delts besides.
    const aimed = {}
    for (const d of out) for (const i of d.items) for (const [p, v] of Object.entries(partCreditOf(i.ex))) if (v >= 1) aimed[p] = (aimed[p] || 0) + 1
    let best = null
    for (const d of out) for (const it of d.items) {
      const n = it.sets > least(it) ? 1 : it.slot === 'accessory' ? it.sets : 0
      if (!n) continue
      if (n === it.sets && Object.entries(partCreditOf(it.ex)).some(([p, v]) => v >= 1 && partGoal[p] && aimed[p] === 1)) continue
      if (n === it.sets && soleDaily(d.items, it, daily)) continue
      if (n === it.sets && it.turn) continue
      const c = Object.entries(creditOf(it.ex))
      const keeps = c.every(([g, v]) => (t[g] || 0) - v * n >= goals[g] - 1e-9)
        && it.ex.p.every(g => dr[g] - n >= Math.ceil(DIRECT_MIN[g] * goals[g]))
        && Object.entries(partCreditOf(it.ex)).every(([p, v]) => !partGoal[p] || pt[p] - v * n >= partGoal[p] - 1e-9)
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
function balance(cfg, out, goals, parts, whole, near) {
  const mins = d => minutesOf(cfg, d.items)
  const totals = () => { const t = {}; for (const d of out) for (const i of d.items) add(cfg, t, i.ex, i.sets); return t }
  const partTotals = () => { const t = {}; for (const d of out) for (const i of d.items) addParts(t, i.ex, i.sets); return t }
  const direct = () => { const t = {}; for (const d of out) for (const i of d.items) for (const g of i.ex.p) t[g] = (t[g] || 0) + i.sets; return t }
  const spread = () => { const m = out.map(mins), avg = m.reduce((a, b) => a + b, 0) / m.length; return m.reduce((a, x) => a + (x - avg) ** 2, 0) }
  const setsOn = (d, g) => { const c = {}; for (const i of d.items) add(cfg, c, i.ex, i.sets); return c[g] || 0 }
  const range = it => (it.slot === 'accessory' ? [cfg.accMin, cfg.accMax] : it.slot === 'lead' ? [cfg.leadSets, cfg.leadSets] : [cfg.slotMin, it.top || cfg.slotSets])
  // A move may not push a group that was at goal below it, or below its share from its own lifts.
  const safe = (t0, d0, p0) => {
    const t = totals(), dr = direct(), pt = partTotals()
    return PLAN_GROUPS.every(g => ((t[g] || 0) >= goals[g] || (t[g] || 0) >= (t0[g] || 0) - 1e-9)
      && ((dr[g] || 0) >= Math.ceil(DIRECT_MIN[g] * goals[g]) || (dr[g] || 0) >= (d0[g] || 0)))
      && parts.every(p => (pt[p.name] || 0) >= p.goal - 1e-9 || (pt[p.name] || 0) >= (p0[p.name] || 0) - 1e-9)
  }
  for (let guard = 0; guard < 60; guard++) {
    const before = spread(), t0 = totals(), d0 = direct(), p0 = partTotals()
    let best = null
    const tryMove = (apply, undo) => {
      apply()
      const ok = out.every(d => mins(d) <= cfg.minutes) && safe(t0, d0, p0)
        && out.every(d => d.items.every(i => PLAN_GROUPS.every(g => setsOn(d, g) <= cfg.sessionCap || !i.ex.p.includes(g))))
      const v = spread()
      undo()
      if (ok && v < before - 1e-6 && (!best || v < best.v)) best = { v, apply }
    }
    for (const a of out) for (const b of out) {
      if (a === b || mins(a) <= mins(b)) continue
      for (const it of a.items) {
        // A whole accessory: b must train the group, have no accessory for it and not already do this lift.
        if (it.slot === 'accessory' && it.ex.p.every(g => DAY_TYPES[b.type].groups.includes(g))
          && !b.items.some(i => i.ex.id === it.ex.id || (i.slot === 'accessory' && i.ex.p.some(g => it.ex.p.includes(g)))) && !repeats(b.items, it.ex)
          && !near(b.k, it).has(it.ex.id) && !heavyHinge(it.ex)
          && b.items.filter(i => i.slot === 'accessory').length < cfg.maxAcc && b.items.filter(i => i.ex.p.includes(it.ex.p[0])).length < cfg.maxDirect) {
          const ix = a.items.indexOf(it)
          tryMove(() => { a.items.splice(ix, 1); b.items.push(it) }, () => { b.items.pop(); a.items.splice(ix, 0, it) })
        }
        // One set to a lift in the same role for the same muscle, not for a group that gave way.
        if (it.sets <= range(it)[0] || it.ex.p.some(g => whole.has(g))) continue
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
 * The week a set of settings builds: `{ cfg, goals, parts, days, total, short, feasible }`. Each day is
 * `{ type, items: [{ ex, sets, slot, rx }], groups, minutes, sets }`. `exclude`: exercise ids
 * never to pick (the ones skipped in the app), as long as the pattern has another. A group
 * `short` of its goal names its cause: a setting (time, accessories, equipment, caps, template)
 * or the planner's own rounding ('planner'); `feasible` when no setting is to blame. When the
 * settings can't hold every goal, the groups further down PRIORITY give way (`yields`). `swap`:
 * the lifts you chose over the planner's, a day at a time (swapIn).
 */
export function plan(o = {}) {
  const cfg = configOf(o)
  const goals = goalsFor(cfg.goal, o.byGroup, cfg.volume, o.focus)
  const parts = partsFor(cfg.goal, o.byGroup, cfg.volume, o.focus)
  const base = baseOf(cfg, o)
  if (base) {
    // Only the goals moved: the week the program has, its sets taken up or down to them.
    const out = swapIn(cfg, weekOf(cfg, goals, parts, { ...o, base }), o.swap)
    const { total, direct, partTotal } = totalsOf(out)
    let why
    const short = shortOf(goals, total, direct).map(x => ({ ...x, cause: (why ||= causesOf(weekOf(cfg, goals, parts, { ...o, base: null })))(x.g) }))
    const partsOut = parts.map(p => ({ ...p, total: Math.round((partTotal[p.name] || 0) * 10) / 10 }))
    return { cfg, goals, parts: partsOut, days: out, total, short, yields: {}, feasible: short.every(x => x.cause === 'planner') }
  }
  if (o.base) o = { ...o, base: null }
  const first = weekOf(cfg, goals, parts, o)
  const built = o.priority === false ? { out: first, yields: {} } : giveWay(cfg, goals, parts, o, first)
  const out = swapIn(cfg, built.out, o.swap), yields = built.yields
  const { total, direct, partTotal } = totalsOf(out)
  const why0 = causesOf(first)
  const short = shortOf(goals, total, direct).map(x => {
    // A group that gave way is short for what kept the first week from fitting: the accessories a
    // day when that, and not the time, stopped the days.
    const g = x.g
    const capped = !first.some(d => d.trimmed || d.limit === 'time') && first.some(d => d.limit === 'accessories')
    const cause = yields[g] != null && why0(g) === 'planner' ? (capped ? 'accessories' : 'time') : yields[g] != null ? why0(g) : causesOf(out)(g)
    return { ...x, cause }
  })
  const partsOut = parts.map(p => ({ ...p, total: Math.round((partTotal[p.name] || 0) * 10) / 10 }))
  return { cfg, goals, parts: partsOut, days: out, total, short, yields, feasible: short.every(x => x.cause === 'planner') }
}

// The groups short of their goal: under SHORT of it, or of the sets it needs from lifts aimed at it
// (DIRECT_MIN), `direct` and `directGoal` then saying how many it has of those.
function shortOf(goals, total, direct) {
  return PLAN_GROUPS.flatMap(g => {
    const dGoal = Math.ceil(DIRECT_MIN[g] * goals[g]), t = Math.round((total[g] || 0) * 10) / 10
    if ((total[g] || 0) < goals[g] * SHORT) return [{ g, total: t, goal: goals[g] }]
    if ((direct[g] || 0) < dGoal * SHORT) return [{ g, total: t, goal: goals[g], direct: direct[g] || 0, directGoal: dGoal }]
    return []
  })
}

// A running program to take the week from (`o.base`: its `template`, `plan` and `week`, and the
// `byGroup` it was built for) when only the goals differ from it: the volume, a group's own.
// Then `{ week, goals, parts }`, the goals it was built for; else null.
function baseOf(cfg, o) {
  const b = o.base
  if (!b?.week?.length || !b.plan) return null
  const was = configOf({ ...b.plan, template: b.template })
  const same = ['template', 'goal', 'level', 'equipment', 'days', 'minutes', 'seed', 'shift'].every(k => was[k] === cfg[k])
  if (!same || b.week.length !== cfg.days) return null
  return { week: b.week, goals: goalsFor(was.goal, b.byGroup, was.volume, b.focus), parts: partsFor(was.goal, b.byGroup, was.volume, b.focus) }
}

// What each group is short for in a week: a setting is to blame only if every day that trains the
// group was stopped by one.
const causesOf = out => g => {
  const on = out.filter(d => DAY_TYPES[d.type].groups.includes(g))
  const why = d => (d.trimmed || d.limit === 'time' ? 'time' : d.limit === 'accessories' ? 'accessories'
    : d.capped[g] === 'equipment' ? 'equipment' : d.capped[g] ? 'caps' : null)
  const reasons = on.map(why)
  return !on.length ? 'template' : reasons.includes(null) ? 'planner'
    : ['time', 'accessories', 'equipment', 'caps'].find(c => reasons.includes(c))
}

function totalsOf(out) {
  const total = {}, direct = {}, partTotal = {}
  for (const d of out) {
    for (const [g, v] of Object.entries(d.groups)) total[g] = (total[g] || 0) + v
    for (const i of d.items) { addParts(partTotal, i.ex, i.sets); for (const g of i.ex.p) direct[g] = (direct[g] || 0) + i.sets }
  }
  return { total, direct, partTotal }
}

// When the week can't reach every goal, the least important groups give way: their goals come
// down a quarter at a time, the lowest PRIORITY's first: the glutes, calves and forearms all the
// way to none, the abs, shoulders and arms to half (a group above them gives way, not away), and
// the week is built again until every group above them reaches its own, and what time is left
// goes back to them. A curl's minutes go to a row, which gives the biceps some of what the curl
// would have. The week whose more important groups come out least short wins, the one that took
// the least away on a tie: a set for the chest, back or legs is worth whatever it costs below.
// `yields` is the share of its goal each group that gave way was built for.
// `slack`: the sets a group may be short and still count as there; a day (planDay) allows one, so
// its calves don't go for the abs' last half set.
function giveWay(cfg, goals, parts, o, first, slack = 0, need = { goals, parts }) {
  // Sets short of the goal at each PRIORITY, whole sets, a part counted with its group. A part
  // within SHORT of its minimum counts as there: a day holds one lift for the shoulders, so the
  // delts can't always take their last set, and nothing else gives way for it. Short of `need`,
  // what the groups are owed, which a day raised to fill a longer session asks past.
  const tiers = Math.max(...Object.values(PRIORITY)) + 1
  const shortBy = out => {
    const { total, partTotal } = totalsOf(out), v = Array(tiers).fill(0)
    for (const g of PLAN_GROUPS) v[PRIORITY[g]] += Math.max(0, (need.goals[g] || 0) - (total[g] || 0) - slack)
    // A tier-2 part gives way before any group: it counts with the lowest.
    for (const p of need.parts) if ((partTotal[p.name] || 0) < p.goal * SHORT) v[p.tier >= 2 ? tiers - 1 : PRIORITY[p.g]] += p.goal - (partTotal[p.name] || 0)
    return v.map(Math.round)
  }
  const better = (a, b, t) => {
    const k = a.slice(0, t).findIndex((x, i) => x !== b[i])
    return k >= 0 && a[k] < b[k]
  }
  // A rebuild (`cfg.keep`) breaks a tie for the week that keeps more of the lifts the days had,
  // not the first found: the same settings build the same week.
  const kept = out => out.reduce((n, d, k) => n + d.items.filter(i => cfg.keep[k]?.has(i.ex.id)).length, 0)
  const tie = (a, b, t) => a.slice(0, t).every((x, i) => x === b[i])
  let best = { out: first, yields: {}, by: shortBy(first) }
  const top = best.by.findIndex(x => x > 0)
  if (top < 0) return best
  const scale = {}
  for (let t = tiers - 1; t > top; t--) {
    for (const f of t === tiers - 1 ? [0.75, 0.5, 0.25, 0] : [0.75, 0.5]) {
      for (const g of PLAN_GROUPS) if (PRIORITY[g] === t) scale[g] = f
      const out = weekOf(cfg, { ...goals, ...Object.fromEntries(Object.entries(scale).map(([g, f]) => [g, goals[g] * f])) },
        parts.map(p => (scale[p.g] != null ? { ...p, goal: p.goal * scale[p.g] } : p)), o, { goals, parts })
      const by = shortBy(out)
      if (better(by, best.by, t) || (cfg.keep.length && tie(by, best.by, t) && kept(out) > kept(best.out))) best = { out, yields: { ...scale }, by }
      if (by.slice(0, t).every(x => !x)) return best
    }
  }
  return best
}

// Passes 1 to 5 for one set of goals: the days, each with its groups, minutes and sets. `after`:
// the goals the week was cut down from, which take what time is left (passes 3 to 5 again).
// A one-tap day (planDay) is a week of one day with its own: `sched`, its day types; `leads`,
// their lead patterns; `lead`, the lift to lead with; `groups`, the groups it trains, whatever
// its type's; `near`, the lifts of the session before it and `used`, of the ones before that.
function weekOf(cfg, goals, parts, o, after) {
  const rand = rng(cfg.seed)
  // The groups that gave way (giveWay), built for less than their goal.
  const whole = new Set(after ? PLAN_GROUPS.filter(g => goals[g] < after.goals[g]) : [])
  const exclude = new Set(o.exclude || [])
  const has = EQUIPMENT[cfg.equipment].has
  const fits = libraryOf(o.pool).filter(e => has.includes(e.need))
  // A skipped lift stays out unless its pattern (or group, for an isolation lift) has nothing else.
  const avail = fits.filter(e => !exclude.has(e.id) || !fits.some(x => !exclude.has(x.id) && (e.pat === 'iso' ? x.pat === 'iso' && x.p[0] === e.p[0] : x.pat === e.pat)))
  const sched = o.sched || scheduleOf(cfg)
  const groups = o.groups && new Set(o.groups)
  // Whether a day of type `t` trains group `g`, or the part `name` of it.
  const trains = (t, g, name) => (groups ? groups.has(g) : DAY_TYPES[t].groups.includes(g)) || !!(name && DAY_TYPES[t].parts?.includes(name))
  const week = { used: new Set(o.used || []), patterns: {}, acc: {}, accDirect: {}, accParts: {} }
  // The groups each day keeps a lift aimed at (fill), a one-tap day's (generate.js dailyGroups).
  const daily = (o.daily || []).filter(g => PLAN_GROUPS.includes(g))
  const out = [], skel = {}, skelDirect = {}, skelParts = {}, occ = {}
  // The lifts of the days either side of day `k`, the week going round, but `skip`.
  const near = (k, skip) => {
    const ids = new Set(o.near || [])
    if (sched.length > 1) {
      for (const j of [k - 1, k + 1]) for (const i of out.find(d => d.k === (j + sched.length) % sched.length)?.items || []) if (i !== skip) ids.add(i.ex.id)
    }
    return ids
  }
  // Each day's lead pattern: the full-body rotation, or the day type's leads in turn.
  const leads = o.leads || sched.map((t, k) => {
    if (t === 'full') return FULL_LEADS(cfg.days)[k]
    occ[t] = (occ[t] || 0) + 1
    return DAY_TYPES[t].leads[(occ[t] - 1) % DAY_TYPES[t].leads.length]
  })
  if (o.base) {
    // Every lift the program has stays: a group whose goal went up gets sets on its lifts, and an
    // accessory when they are full (topUp); one whose goal came down gives sets back (trim), and
    // no other group loses any, even one past its goal.
    o.base.week.forEach((d, k) => out.push({
      k, type: d.type, limit: null, capped: {}, trimmed: false,
      items: d.items.map(i => ({ i, ex: liftOf(i.id) })).filter(x => x.ex).map(({ i, ex }) => {
        const slot = i.slot || 'accessory'
        week.used.add(ex.id)
        return { ex, sets: i.sets, slot, rx: prescribe(cfg, ex, slot, ex.p[0]) }
      }),
    }))
    const { total, partTotal } = totalsOf(finish(cfg, out))
    const keepAt = (goal, was, now) => (goal < was - 1e-9 ? goal : Math.max(goal, now || 0))
    // Only a goal that went up takes sets.
    const up = (goal, was) => (goal > was + 1e-9 ? goal : 0)
    // keep: a running program's lifts only grow, none gives its sets to another.
    topUp({
      cfg, out, week, rand, avail, near, trains, keep: true,
      goals: Object.fromEntries(PLAN_GROUPS.map(g => [g, up(goals[g], o.base.goals[g])])),
      parts: parts.map(p => ({ ...p, goal: up(p.goal, o.base.parts.find(x => x.name === p.name)?.goal ?? 0) })),
    })
    trim(cfg, out, Object.fromEntries(PLAN_GROUPS.map(g => [g, keepAt(goals[g], o.base.goals[g], total[g])])),
      parts.map(p => ({ ...p, goal: keepAt(p.goal, o.base.parts.find(x => x.name === p.name)?.goal ?? 0, partTotal[p.name]) })), new Set())
    return finish(cfg, out)
  }
  sched.forEach((t, k) => {
    const d = skeleton({ cfg, k, type: t, goals, parts, has: g => skel[g] || 0, hasPart: n => skelParts[n] || 0, week, rand, avail, sched, leads, prev: out[k - 1], near, lead: o.lead, trains, mine: o.pool ? new Set(o.pool) : null })
    for (const i of d.items) { add(cfg, skel, i.ex, i.sets); addParts(skelParts, i.ex, i.sets); for (const g of i.ex.p) skelDirect[g] = (skelDirect[g] || 0) + i.sets }
    out.push({ k, ...d })
  })
  for (const d of out) {
    fill({
      cfg, day: d, goals, parts, week, rand, avail, whole, near, trains, daily,
      has: g => (skel[g] || 0) + (week.acc[g] || 0),
      hasDirect: g => (skelDirect[g] || 0) + (week.accDirect[g] || 0),
      hasPart: n => (skelParts[n] || 0) + (week.accParts[n] || 0),
      daysLeftFor: g => out.filter(x => x.k >= d.k && trains(x.type, g)).length,
      // Not a later day already holding its one lift for the group: a push day with its press
      // takes no rear-delt fly, so the pull day before it is the rear delts' last.
      daysLeftForPart: p => out.filter(x => x.k >= d.k && trains(x.type, p.g, p.name)
        && (x === d || !ONE_A_DAY.includes(p.g) || !x.items.some(i => i.ex.p.includes(p.g)))).length,
    })
  }
  topUp({ cfg, out, goals, parts, week, rand, avail, near, trains, whole })
  trim(cfg, out, goals, parts, whole, daily)
  if (o.balance !== false) balance(cfg, out, goals, parts, whole, near)
  if (after) {
    // Twice: what the first trim takes off makes room for another accessory.
    for (let n = 0; n < 2; n++) {
      topUp({ cfg, out, goals: after.goals, parts: after.parts, week, rand, avail, aimed: true, near, trains, whole })
      trim(cfg, out, after.goals, after.parts, whole, daily)
    }
    if (o.balance !== false) balance(cfg, out, after.goals, after.parts, whole, near)
  }
  if (o.count != null) for (const d of out) fit({ cfg, day: d, count: o.count, goals, week, rand, avail, near, trains, daily })
  return finish(cfg, out)
}

// The lifts you swapped in (`swap`, a map a day of the lift the planner picked to the one you chose,
// equivalents.js): each takes the slot and sets of the one it replaces, prescribed for itself, and
// keeps `from`, the planner's pick, so it can be swapped again or back. A lift already in the day
// isn't taken twice.
function swapIn(cfg, out, swap) {
  if (!swap?.some(m => m && Object.keys(m).length)) return out
  return finish(cfg, out.map((d, k) => {
    const to = swap[k] || {}
    const items = d.items.map(i => {
      const ex = to[i.ex.id] && liftOf(to[i.ex.id])
      if (!ex || d.items.some(x => x.ex.id === ex.id)) return i
      return { ...i, ex, from: i.ex.id, rx: prescribe(cfg, ex, i.slot, ex.p[0]) }
    })
    return { ...d, items }
  }))
}

// Each day's groups, minutes and sets, its lifts in slot order.
function finish(cfg, out) {
  const order = { lead: 0, lower: 1, push: 2, pull: 3, accessory: 4 }
  for (const d of out) {
    d.groups = {}
    for (const i of d.items) add(cfg, d.groups, i.ex, i.sets)
    d.minutes = Math.round(minutesOf(cfg, d.items))
    d.sets = d.items.reduce((s, i) => s + i.sets, 0)
    d.items.sort((a, b) => order[a.slot] - order[b.slot])
  }
  return out
}

// A one-tap day of `count` lifts, the number the setup asks for: past it, the accessories of the
// group furthest past its goal come off first, then the slots; short of it, the group furthest
// from its goal takes an accessory at its fewest sets, the way topUp adds one.
function fit({ cfg, day, count, goals, week, rand, avail, near, trains, daily = [] }) {
  const items = day.items
  const today = () => { const c = {}; for (const i of items) add(cfg, c, i.ex, i.sets); return c }
  // A shorter day keeps a lift for each group before a second for any: of a push day's three, the
  // bench, a raise and a pushdown, not three for the chest.
  while (items.length > count) {
    const t = today(), past = g => (goals[g] ? (t[g] || 0) / goals[g] : Infinity)
    const twice = g => +(items.filter(i => i.ex.p[0] === g).length > 1)
    const rest = items.filter(i => i.slot !== 'lead'), acc = rest.filter(i => i.slot === 'accessory')
    if (!rest.length) { items.splice(count); break }
    // The lift a `daily` group has (fill) goes last, the group latest in `daily` first: that order
    // is the one the day owes them in, so what it leaves out leads the next one.
    const spare = acc.filter(i => !soleDaily(items, i, daily))
    const rank = i => Math.min(...i.ex.p.filter(g => daily.includes(g)).map(g => daily.indexOf(g)))
    const last = Math.max(...acc.map(rank))
    const from = spare.length ? spare : acc.length ? acc.filter(i => rank(i) === last) : rest
    const worse = (a, b) => twice(b.ex.p[0]) - twice(a.ex.p[0]) || past(b.ex.p[0]) - past(a.ex.p[0])
    items.splice(items.indexOf(from.reduce((a, b) => (worse(a, b) > 0 ? b : a))), 1)
  }
  const nearby = near(day.k), full = new Set()
  while (items.length < count) {
    // The groups with no accessory yet first: a leg day's sixth lift is a leg curl, not a second
    // calf raise.
    const t = today(), short = g => (t[g] || 0) / Math.max(goals[g], 1)
    const had = g => +items.some(i => i.slot === 'accessory' && i.ex.p.includes(g))
    const g = PLAN_GROUPS.filter(g => trains(day.type, g) && !full.has(g)).sort((a, b) => had(a) - had(b) || short(a) - short(b) || goals[b] - goals[a])[0]
    if (!g) break
    const cands = avail.filter(e => accessoryFor(e, g) && !heavyHinge(e) && e.p.includes(g) && !items.some(i => i.ex.id === e.id) && !repeats(items, e))
    if (!cands.length) { full.add(g); continue }
    const ex = variant(cfg, far(novel(cands, items), nearby), week.used, rand, day.k, items)
    items.push({ ex, sets: cfg.accMin, slot: 'accessory', rx: prescribe(cfg, ex, 'accessory', g) })
    week.used.add(ex.id)
  }
}

/**
 * One day of `type`, built the way a week's are, for a one-tap workout (generate.js): `goals`
 * (group -> sets) and `parts` (`[{ g, name, goal }]`) are what the day is to give, the week's
 * share of what is left; `pattern`, the lead's (PATTERN_GROUPS); `count`, how many lifts. The rest
 * of `o` as plan's and weekOf's; `moreAcc`, accessories past the level's; `daily`, the groups the
 * day gives a lift aimed at each before anything else, in that order, while the minutes hold
 * them (generate.js dailyGroups). `{ type, items, groups, minutes, sets }`.
 */
export function planDay(o = {}) {
  const cfg = configOf({ ...o, days: 1, minutes: o.minutes || 999 })
  // A day raised to fill a longer session (generate.js fillMinutes) has room for more accessories.
  if (o.moreAcc > 0) cfg.maxAcc += o.moreAcc
  const goals = Object.fromEntries(PLAN_GROUPS.map(g => [g, o.goals?.[g] || 0]))
  const pattern = o.pattern || (o.type === 'full' ? FULL_LEADS(1)[0] : DAY_TYPES[o.type].leads[0])
  const parts = o.parts || [], w = { ...o, sched: [o.type], leads: [pattern], balance: false }
  // A day that can't hold all it owes gives way as a week does (giveWay): the calves and the arms
  // before the back and the legs. A day raised to fill a longer session (`need`, the goals it was
  // raised from) gives way only for what the groups are owed: the calf raise the shorter day had
  // isn't dropped because the abs can't reach twice their goal.
  const first = weekOf(cfg, goals, parts, w)
  const need = o.need ? { goals: o.need.goals || {}, parts: o.need.parts || [] } : { goals, parts }
  return (o.priority === false ? first : giveWay(cfg, goals, parts, w, first, 1, need).out)[0]
}

/** Why the settings `o` can't reach the goal: `[{ g, cause }]` of the groups to blame, empty when they can. */
export function blocker(o) {
  return plan({ ...o, balance: false, priority: false }).short.filter(x => x.cause !== 'planner')
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
