// A random abs combo (ComboBuilder, sheets.jsx): a few abs exercises picked for you, done in one
// spot. A combo runs back to back, so it never walks between machines: it is floor work plus at
// most one thing — an item kept next to you (a dumbbell, a plate, an ab wheel…) or a station you
// stay at (the pull-up bar, a decline bench, the cable stack, one machine). Within that, one of
// each way the core works before any repeats — legs up to the trunk, the trunk up to the legs, a
// twist, a brace — ordered by where your body is, so you hang first, get down once and finish on
// a plank.
import { EXIDX, isCardio } from './exercises.js'
import { primaryMuscleOf } from './strength-exercises.js'
import { suggestable } from './skipped.js'
import { trainingIndex } from './generate.js'

export const ABS_STYLES = ['lower', 'crunch', 'twist', 'brace']

// Gym staples by what they are done with, offered after the ones you have logged.
export const ABS_STAPLES = {
  floor: ['0872', '1163', '0622', '3622', '0507', '0274', '0736', '0871', '0687', '6211', '0635', '0715', '6705', '0463', '0276', '1246', '4384', '9002', '3699'],
  bar: ['0472', '9819', '3891', '3890', '1761', '0475', '6547', '11877'],
  chair: ['5107', '2963'],
  bench: ['0277', '0282', '2523', '6548', '1845', '3438'],
  cable: ['0175', '0873', '0243', '8193', '1202', '0226', '0222', '7584', '6760', '4193'],
  machine: ['1452', '1453'],
  dumbbell: ['3449', '0407', '4748', '3336', '8873', '10873', '5497', '4747'],
  kettlebell: ['4393', '0554', '4047', '7229', '8025'],
  plate: ['0832', '0846', '2135', '4127', '10710', '0855', '5023'],
  'medicine ball': ['1247', '3422', '4124', '5031', '2564'],
  wheel: ['0857', '0796'],
  band: ['1005', '0979', '4080', '4081', '3841', '4573'],
  ball: ['2296', '0271', '0503', '1706', '0686', '4056', '2815'],
}

// The spots a combo can be asked for (the builder's chips), each a set of gear it may choose from.
export const ABS_SPOTS = ['any', 'floor', 'item', 'bar', 'bench', 'cable', 'machine']
const STATIONS = { bar: ['bar', 'chair'], bench: ['bench', 'ghd'], cable: ['cable'], machine: ['machine'] }

export const ABS_COMBO_COUNT = 4
export const ABS_COMBO_MAX = 8

const TWIST = /twist|oblique|side|chop|windmill|bicycle|pallof|wiper|rotation|cross body|elbow.to.knee|heel touch/
const BRACE = /plank|hold|hollow|dead ?bug|bird dog|roll ?out|rollerout|body saw|l.sit|shoulder tap|carry|fallout/
const LOWER = /leg raise|knee raise|reverse crunch|toes to bar|knees to elbow|scissor|flutter|v.?up|jack ?knife|tuck up|leg lift|hip raise|pike|dragon flag/
const CRUNCH = /crunch|sit.?up|curl.?up/

/** Which of ABS_STYLES abs exercise `ex` is, by its name; null when it is none of them. */
export function absStyleOf(ex) {
  const n = String(ex?.n || '').toLowerCase()
  if (TWIST.test(n)) return 'twist'
  if (BRACE.test(n) || ex?.cat === 'isometric') return 'brace'
  if (LOWER.test(n)) return 'lower'
  if (CRUNCH.test(n)) return 'crunch'
  return null
}

// Equipment you stay at, by the catalogue's equipment; then by name, since the catalogue calls
// hanging from a bar or sitting up on a decline bench "body weight".
const STATION_EQ = { cable: 'cable', 'leverage machine': 'machine', 'smith machine': 'machine', 'suspension trainer': 'suspension', rope: 'rope' }
const STATION_NAME = [
  ['bar', /hanging|toes to bar|knees to elbow|stall bar|front lever/],
  ['chair', /captain|parallel bars|vertical leg raise/],
  ['ghd', /glute ham|ghd/],
  ['bench', /decline|incline|roman|bench|on a chair|chair assisted/],
]
// Equipment you carry to your spot. "Weighted" is the catalogue's word for holding a plate.
const ITEM_EQ = {
  dumbbell: 'dumbbell', kettlebell: 'kettlebell', 'weight plate': 'plate', weighted: 'plate', 'medicine ball': 'medicine ball',
  'wheel roller': 'wheel', roller: 'roller', band: 'band', 'resistance band': 'band', 'stability ball': 'ball',
  'bosu ball': 'bosu', barbell: 'barbell', 'ez barbell': 'barbell', sandbag: 'sandbag',
}

/** What abs exercise `ex` is done with: 'floor', an item you carry (ABS_ITEMS) or a station you stay at. */
export function absGearOf(ex) {
  if (STATION_EQ[ex?.eq]) return STATION_EQ[ex.eq]
  const n = String(ex?.n || '').toLowerCase()
  for (const [gear, re] of STATION_NAME) if (re.test(n)) return gear
  return ITEM_EQ[ex?.eq] || 'floor'
}
export const ABS_ITEMS = [...new Set(Object.values(ITEM_EQ))]
const isItem = gear => ABS_ITEMS.includes(gear)

// Where the body is, in the order a combo runs after its station: off the bar first, then on
// your feet, knees, a bench, sitting, on your back, on your side, and the plank last. The first match decides, so
// the words that say it outright come before the ones that only suggest it.
const POSITIONS = ['hang', 'stand', 'kneel', 'bench', 'seat', 'back', 'side', 'front']
const POSITION_NAME = [
  ['hang', /hanging|toes to bar|knees to elbow|captain|parallel bars|vertical leg raise|stall bar|front lever/],
  ['side', /side plank|side bridge/],
  ['stand', /standing/],
  ['kneel', /kneeling/],
  ['back', /lying|supine/],
  ['bench', /decline|incline|roman|bench|glute ham/],
  ['seat', /seated|sitting|on a chair/],
  ['front', /plank|bird dog|shoulder tap|body saw|pass through/],
  ['kneel', /roll ?out|rollerout/],
  ['stand', /chop|pallof|side bend|windmill|carry|squat|lunge|swing|throw/],
  ['seat', /russian twist|l.sit/],
  ['back', /dead ?bug|hollow|v.?up|crunch|sit.?up|leg raise|bicycle|scissor|flutter|wiper|jack ?knife|hip raise/],
]

/** Where the body is during abs exercise `ex`, one of POSITIONS. */
export function absPositionOf(ex) {
  const n = String(ex?.n || '').toLowerCase()
  for (const [pos, re] of POSITION_NAME) if (re.test(n)) return pos
  if (ex?.eq === 'cable') return 'stand'
  return absStyleOf(ex) === 'brace' ? 'front' : 'back'
}

const isAbs = ex => !!ex && !isCardio(ex) && ex.cat !== 'stretching' && primaryMuscleOf(ex)?.slug === 'abs'

/** Every abs exercise a combo may use: { id, style, gear, known }, the ones you have logged first, then the staples. */
export function absCandidates(S, index = trainingIndex(S)) {
  const out = [], seen = new Set()
  const add = (id, known) => {
    const ex = EXIDX[id], style = !seen.has(id) && isAbs(ex) && suggestable(S, ex) && absStyleOf(ex)
    if (!style) return
    seen.add(id)
    out.push({ id, style, gear: absGearOf(ex), known })
  }
  for (const id of Object.keys(index.exercises)) add(id, true)
  for (const id of Object.values(ABS_STAPLES).flat()) add(id, false)
  return out
}

/** The gear spot `spot` may settle on, given the exercises at hand. */
function gearsFor(spot, cands) {
  const have = [...new Set(cands.map(c => c.gear))]
  if (spot === 'floor') return have.filter(g => g === 'floor')
  if (spot === 'item') return have.filter(isItem)
  if (STATIONS[spot]) return have.filter(g => STATIONS[spot].includes(g))
  return have
}

/** The spots (ABS_SPOTS) that have exercises at hand: the builder offers only these. */
export function absSpotsOpen(S, cands = absCandidates(S)) {
  return ABS_SPOTS.filter(spot => gearsFor(spot, cands).length)
}

const pickFrom = (list, random) => list[Math.min(list.length - 1, Math.floor(random() * list.length))]
const shuffled = (list, random) => {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
// One of `list`, each weighted by `weight`.
function pickWeighted(list, weight, random) {
  const ws = list.map(weight), total = ws.reduce((a, b) => a + b, 0)
  let r = random() * total
  for (let i = 0; i < list.length; i++) if ((r -= ws[i]) < 0) return list[i]
  return list[list.length - 1]
}

/** The styles of a combo of `count`: every style once a lap, a short last lap's at random, each lap in ABS_STYLES order. */
export function absStylesFor(count, random = Math.random) {
  const out = []
  while (out.length < count) {
    const lap = Math.min(ABS_STYLES.length, count - out.length)
    const chosen = new Set(shuffled(ABS_STYLES, random).slice(0, lap))
    out.push(...ABS_STYLES.filter(s => chosen.has(s)))
  }
  return out
}

/** `ids` in the order a combo runs them: the station's first, then by where the body is, then by style. */
export function absOrder(ids) {
  const rank = id => {
    const ex = EXIDX[id], gear = absGearOf(ex)
    const atStation = gear !== 'floor' && !isItem(gear)
    return (atStation ? 0 : 100) + POSITIONS.indexOf(absPositionOf(ex)) * 10 + Math.max(0, ABS_STYLES.indexOf(absStyleOf(ex)))
  }
  return ids.map((id, i) => [id, rank(id), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(x => x[0])
}

// One of `list`, a logged one half the time when there are any: mostly what you know, something new in it.
const choose = (list, random) => {
  const known = list.filter(c => c.known)
  return (known.length && random() < 0.5 ? pickFrom(known, random) : pickFrom(list, random)).id
}

/**
 * A random abs combo of `count` (2..ABS_COMBO_MAX) different exercises at `spot` (ABS_SPOTS):
 * { ids, gear }, `gear` being what it settled on besides the floor ('floor' for none). About half
 * the exercises use that gear, a machine just one; the floor gives the rest. 'any' and the spots
 * with a choice of gear lean to the gear you have logged most. `avoid` (the combo being
 * shuffled) is passed over while anything else is left. { ids: [], gear: null } when nothing fits.
 */
export function randomAbsCombo(S, { count = ABS_COMBO_COUNT, spot = 'any', avoid = [], random = Math.random } = {}) {
  const n = Math.max(2, Math.min(ABS_COMBO_MAX, Math.round(count) || ABS_COMBO_COUNT))
  const cands = absCandidates(S)
  const gears = gearsFor(spot, cands)
  if (!gears.length) return { ids: [], gear: null }
  const gear = pickWeighted(gears, g => 1 + 2 * cands.filter(c => c.gear === g && c.known).length, random)
  const kit = cands.filter(c => c.gear === gear)
  const floor = gear === 'floor' ? [] : cands.filter(c => c.gear === 'floor')
  const allowed = [...kit, ...floor]

  const picked = []
  const open = list => {
    const left = list.filter(c => !picked.includes(c.id))
    const fresh = left.filter(c => !avoid.includes(c.id))
    return fresh.length ? fresh : left
  }
  const styles = absStylesFor(n, random)
  let kitLeft = gear === 'floor' ? n : gear === 'machine' ? 1 : Math.ceil(n / 2)
  // The slots are filled in a random order so the gear lands on different styles each time.
  const slots = new Array(n)
  for (const i of shuffled(styles.map((_, i) => i), random)) {
    const style = styles[i], ofStyle = list => open(list.filter(c => c.style === style))
    const useKit = kitLeft > 0 && ofStyle(kit).length > 0
    // Short of floor work, more of the gear will do, but never a second machine.
    const room = kitLeft > 0 || gear !== 'machine' ? allowed : floor
    const list = [useKit ? ofStyle(kit) : ofStyle(floor), ofStyle(room), open(room)].find(l => l.length)
    if (!list) continue
    const id = choose(list, random)
    if (kit.some(c => c.id === id)) kitLeft--
    picked.push(id)
    slots[i] = id
  }
  let ids = slots.filter(Boolean)
  // Gear asked for and none of its styles came up: it takes a floor slot of its own.
  if (gear !== 'floor' && !ids.some(id => kit.some(c => c.id === id))) {
    const spare = open(kit)
    if (spare.length && ids.length) ids[Math.floor(random() * ids.length)] = choose(spare, random)
  }
  ids = [...new Set(ids)]
  return { ids: absOrder(ids), gear }
}

/**
 * `ids` with the exercise at `at` swapped for another the combo can take: the same style with the
 * same gear if any is left, then the same style with any gear the combo already uses (the floor
 * always), then anything it uses. `ids` unchanged when there is nothing else.
 */
export function swapAbsExercise(S, ids, at, { random = Math.random } = {}) {
  const ex = EXIDX[ids[at]]
  if (!ex) return ids
  const style = absStyleOf(ex), gear = absGearOf(ex)
  const using = new Set(['floor', ...ids.map(id => absGearOf(EXIDX[id]))])
  // A machine gives a combo one exercise; another would be a second machine.
  const fits = absCandidates(S).filter(c => !ids.includes(c.id) && using.has(c.gear) && c.gear !== 'machine')
  const list = [
    fits.filter(c => c.style === style && c.gear === gear),
    fits.filter(c => c.style === style),
    fits,
  ].find(l => l.length)
  if (!list) return ids
  const out = [...ids]
  out[at] = choose(list, random)
  return out
}

/**
 * `ids` grown or cut to `count` one exercise at a time, at the bottom: + adds to the end, − takes
 * the last off, and the rest stay where they are, so + then − gives back the combo you had. `gear`
 * is the combo's (randomAbsCombo): an added exercise keeps it at about half, a machine just one,
 * the floor the others, and brings a style the combo has least of. Stops short of `count` when
 * nothing more fits.
 */
export function resizeAbsCombo(S, ids, gear, count, { random = Math.random } = {}) {
  const n = Math.max(2, Math.min(ABS_COMBO_MAX, Math.round(count) || ABS_COMBO_COUNT))
  const kitOf = len => gear === 'floor' ? 0 : gear === 'machine' ? 1 : Math.ceil(len / 2)
  const gearOf = id => absGearOf(EXIDX[id])
  const styleOf = id => absStyleOf(EXIDX[id])
  const out = ids.slice(0, n)
  const cands = absCandidates(S)
  while (out.length < n) {
    const kitHave = out.filter(id => gear !== 'floor' && gearOf(id) === gear).length
    const wantKit = kitHave < kitOf(out.length + 1)
    const fits = cands.filter(c => !out.includes(c.id))
    const kit = fits.filter(c => gear !== 'floor' && c.gear === gear)
    const floor = fits.filter(c => c.gear === 'floor')
    // Short of floor work, more of the gear will do, but never a second machine.
    const pools = [wantKit ? kit : floor, wantKit ? floor : gear === 'machine' ? [] : kit].filter(l => l.length)
    if (!pools.length) break
    const least = style => out.filter(id => styleOf(id) === style).length
    const byStyle = [...ABS_STYLES].sort((a, b) => least(a) - least(b))
    let id = null
    for (const pool of pools) {
      const list = byStyle.map(s => pool.filter(c => c.style === s)).find(l => l.length)
      if (list) { id = choose(list, random); break }
    }
    if (!id) break
    out.push(id)
  }
  return out
}
