import { CATALOGUE } from './exercises.js'

// Our own tags for walking the catalogue in a few steps (Add exercise's "Something else"):
// what kit an exercise needs, which movement it is, the bench angle of a press or a fly, and
// whether it is one of the long tail — a form-check clip, a numbered copy, an odd variant — that
// a short list leaves for last. Read off the catalogue's equipment value and the exercise name
// by the rules below, written for this app; nothing here is stored on the rows.
// Pieces of equipment, folded into what a gym-goer would call them. English labels are i18n keys.
export const KITS = [
  { id: 'barbell', n: 'Barbell', eq: ['barbell', 'olympic barbell', 'ez barbell', 'trap bar', 'landmine'] },
  { id: 'dumbbell', n: 'Dumbbell', eq: ['dumbbell'] },
  { id: 'kettlebell', n: 'Kettlebell', eq: ['kettlebell'] },
  { id: 'cable', n: 'Cable', eq: ['cable', 'rope'] },
  { id: 'machine', n: 'Machine', eq: ['leverage machine', 'smith machine', 'sled machine', 'assisted'] },
  { id: 'body', n: 'Body weight', eq: ['body weight', 'weighted', 'suspension trainer'] },
  { id: 'band', n: 'Band', eq: ['band', 'resistance band'] },
  { id: 'other', n: 'Other' },
]
const KIT_OF = Object.fromEntries(KITS.flatMap(k => (k.eq || []).map(e => [e, k.id])))
export const kitOf = ex => KIT_OF[ex.eq] || 'other'

// First match wins, so the narrower movement comes before the one it would also match: a leg
// press is not a press, an upright row is not a row, a reverse fly is a rear-delt move.
export const MOVES = [
  ['mobility', 'Mobility & warm-up', /foam|\broll\b|roll ball|roller|tiger tail|\bpose\b|asana|stretch|mobiliz|warm.?up|nerve|salutation|circl|figure (8|eight)|swirl|meditation|breathing/],
  ['neck', 'Neck', /\bneck\b|cervical|head harness/],
  ['skill', 'Handstand & lever', /front lever|back lever|planche|handstand|headstand|dragon flag|\bflag\b|maltese|skin the cat|wall walk/],
  ['calf', 'Calf raise', /\bcalf|\bcalves|heel raise|heel drop|\bdonkey raise/],
  ['ankle', 'Ankle & foot', /toe raise|tibialis|dorsi|ankle|\bfoot\b|\bfeet\b|toes|heel walk|toe walk|eversion|inversion|plantar/],
  ['legpress', 'Leg press', /leg press|\bsled press|hack press/],
  ['legext', 'Leg extension', /leg extension|knee extension|sissy/],
  ['legcurl', 'Leg curl', /leg curl|hamstring curl|nordic|glute.ham raise|\bghr\b|ball curl|slider curl|knee flexion/],
  ['thrust', 'Hip thrust & bridge', /hip thrust|\bthrusts?\b|bridge|hip lift|lifting \(on hip\)|lift \(on hip\)|hip raise|pelvic|glute squeeze|frog pump|glute march/],
  ['kickback', 'Kickback', /kick ?back|donkey kick|glute kick|hip extension|reverse hyper|rear kick/],
  ['abduct', 'Hip abduction', /abduct|clam|fire hydrant|hip out|side.lying leg (raise|lift)|(lateral|band|monster|side|duck) walk/],
  ['adduct', 'Hip adduction', /adduct|copenhagen/],
  ['hinge', 'Deadlift & hinge', /deadlift|\brdl\b|good ?morning|hinge|\bswing\b|pull.through|rack pull/],
  ['lunge', 'Lunge & step-up', /lunge|split squat|bulgarian|step.?up|\bstep\b|stair|curtsy|skater/],
  ['squat', 'Squat', /squat|thruster|sit.to.stand|sit \(wall\)|wall sit|chair stand/],
  ['jump', 'Jump', /jump|\bhop\b|hops|hopping|bound|plyo|box drop/],
  ['legraise', 'Leg & knee raise', /leg raise|knee raise|leg lift|knee tuck|knee up|flutter|scissor|hanging (knee|leg|pike)|leg pull.in|knee.?ins?\b|pull.ins?\b|marches|knee drive|high knee/],
  ['strike', 'Kicks & punches', /\bkicks?\b|kickboxing|punch|jab|uppercut|boxing|\bhook\b/],
  ['throw', 'Throw & slam', /throw|slam|\bpass\b|toss|smash/],
  ['carry', 'Carry & sled', /carry|farmer|yoke|sled (push|pull|drag)|power sled|truck pull|strongman|wheelbarrow|walking/],
  ['pullup', 'Pull-up & chin-up', /pull.?up|chin.?up|chin\b|muscle.?up|rope climb|ropes climb|monkey bars/],
  ['pulldown', 'Pulldown', /pull.?down/],
  ['facepull', 'Face pull', /face pull/],
  ['upright', 'Upright row', /upright row|high pull(?!ey)/],
  ['rear', 'Rear delt', /rear (delt|lateral|fly|raise)|reverse fly|reverse flye|reverse pec|deltoid rear/],
  ['rotation', 'Rotator cuff', /(external|internal) rotation|rotator|cuban/],
  ['ytw', 'Pull-apart & Y-T-W', /pull.?apart|prone (y|t|w|a)\b|\bys\b|scapular? (retraction|protraction|wall slide|slide)|\b[ytw][ -]raise|snow angel/],
  ['row', 'Row', /\brows?\b|rowing/],
  ['shrug', 'Shrug', /shrug/],
  ['backext', 'Back extension', /hyperextension|back extension|reverse extension|superman|\bbird.?dog|swimmer|swimming|cobra/],
  ['pullover', 'Pullover', /pullover|pull.over/],
  ['pushup', 'Push-up', /push.?up|press.?up|\bpushup|chaturanga/],
  ['dip', 'Dip', /\bdips?\b/],
  ['crossover', 'Crossover', /crossover|cross.over/],
  ['fly', 'Fly', /\bfly|\bflye|pec de(c|ck)|butterfly|iron cross/],
  ['lateral', 'Lateral raise', /lateral raise|side raise|lateral.*raise|lateral bent/],
  ['front', 'Front raise', /front raise|front.*raise|plate raise|full can|empty can/],
  ['pushdown', 'Pushdown', /push.?down|pressdown/],
  ['skull', 'Triceps extension', /skull|triceps? extension|overhead extension|french press|kick.?back|jm press|tate press|(dumbbell|cable|kettlebell|band|barbell|lever).*\bextension\b/],
  ['wrist', 'Wrist curl & rotation', /wrist|reverse curl|finger curl|pronation|supination|torsion|\brotate\b/],
  ['curl', 'Curl', /\bcurl/],
  ['grip', 'Grip', /gripper|hand grip|grip (squeeze|trainer|strength)|hand squeeze|finger|crimp|handboard|pinch|plate hold|dead hang|\bhang\b|towel hold/],
  ['crunch', 'Crunch & sit-up', /crunch|sit.?up|v.?up|v sit|jack.?knife|toe touch|toes to|tuck.?up|roll.?up|curl.?up|air bike|bicycle|cycl|heel touch|elbow.to.knee|ab tuck|hundred|boat/],
  ['plank', 'Plank & hold', /plank|hollow|\bhold\b|l.sit|dead ?bug|stir the pot|bear crawl|body saw|shoulder tap|isometric|static/],
  ['twist', 'Twist & side bend', /twist|russian|rotation|wood.?chop|chop\b|pallof|windmill|side bend|side bent|oblique|landmine 180|rainbow|wiper/],
  ['rollout', 'Rollout', /roll.?out|roller.?out|ab wheel|wheel roll|walkout|walk.?out|inchworm/],
  ['climber', 'Mountain climber', /mountain climber|climber/],
  ['press', 'Press', /press|bench|arnold|\bjerk\b/],
  ['raise', 'Raise', /raise/],
  ['clean', 'Clean & snatch', /clean|snatch/],
]
const MOVE = Object.fromEntries(MOVES.map(([id, n]) => [id, n]))
export const moveName = id => MOVE[id] || 'Other'
// The catalogue's English name: the rules are written for it, whatever the app's language.
const nameOf = ex => (ex.n || '').toLowerCase()
// Mobility, yoga, pilates and rehab work is filed by its category before its name says otherwise.
const LOOSEN = new Set(['mobility', 'yoga', 'pilates', 'rehab'])
export function moveOf(ex) {
  if (LOOSEN.has(ex.cat)) return 'mobility'
  const n = nameOf(ex)
  for (const [id, , re] of MOVES) if (re.test(n)) return id
  return 'other'
}

// The angle of the bench: only a chest press, fly or push-up has one worth asking about (an
// incline shoulder press is a rarity, not a choice).
export const ANGLES = [{ id: 'flat', n: 'Flat' }, { id: 'incline', n: 'Incline' }, { id: 'decline', n: 'Decline' }]
const ANGLED = new Set(['press', 'fly', 'pushup', 'crossover'])
export function angleOf(ex) {
  if (ex.tg !== 'pectorals' || !ANGLED.has(moveOf(ex))) return null
  const n = nameOf(ex)
  return /incline/.test(n) ? 'incline' : /decline/.test(n) ? 'decline' : 'flat'
}

// The long tail: a filmed form check or second camera angle, a numbered copy ("v. 2"), a
// demonstration by one body type, and gym oddities like boards and chains.
const TAIL = /form check|\bpov\b|\bv\. ?\d|version \d|\((male|female)\)|\bboards?\b|chains|\bfrom (the )?side\b|\bvariation \d/
export const isTail = ex => TAIL.test(nameOf(ex))

// How unusual a name is: its words that fewer than RARE names in the catalogue share. A named
// variant ("Svend press", "Larsen press") has one; a plain lift ("dumbbell bench press") none.
const RARE = 8
let wordCount = null
const wordsOf = ex => nameOf(ex).match(/[a-z]+/g) || []
export function rareWords(ex) {
  if (!wordCount) {
    wordCount = new Map()
    for (const e of CATALOGUE) for (const w of new Set(wordsOf(e))) wordCount.set(w, (wordCount.get(w) || 0) + 1)
  }
  return wordsOf(ex).filter(w => (wordCount.get(w) || 0) < RARE).length
}


// The steps, as facets: what each exercise answers (`of`, null when the question does not apply
// to it) and the English name of each answer. Callers add the ones of their own, like the area.
const KIT_NAME = Object.fromEntries(KITS.map(k => [k.id, k.n]))
const ANGLE_NAME = Object.fromEntries(ANGLES.map(a => [a.id, a.n]))
export const KIT_FACET = { id: 'kit', of: kitOf, name: id => KIT_NAME[id] || 'Other' }
export const MOVE_FACET = { id: 'move', of: moveOf, name: moveName, fold: true, last: ['mobility'] }
export const ANGLE_FACET = { id: 'angle', of: angleOf, name: id => ANGLE_NAME[id], order: ANGLES.map(a => a.id) }

// A list this short is the answer: no more questions.
export const FEW = 8
// A movement fewer exercises than this do is folded into Other, so a step stays a few tiles.
const MIN_OPTION = 3

/**
 * One question of a facet over `list`: its answers, each with the raw values it stands for and
 * how many exercises give it (`done`: how many of those you have logged, by `logged`), most
 * first, Other last. Empty when the facet does not apply to every exercise.
 */
export function optionsOf(facet, list, logged = null) {
  const by = new Map()
  for (const ex of list) {
    const v = facet.of(ex)
    if (v == null) return []
    if (!by.has(v)) by.set(v, [])
    by.get(v).push(ex)
  }
  let opts = [...by].map(([id, xs]) => ({ id, values: [id], count: xs.length, done: logged ? xs.filter(ex => logged.has(ex.id)).length : 0 }))
  if (facet.fold) {
    const small = opts.filter(o => o.count < MIN_OPTION || o.id === 'other')
    if (small.length) {
      opts = opts.filter(o => !small.includes(o))
      opts.push({ id: 'other', values: small.flatMap(o => o.values), count: small.reduce((n, o) => n + o.count, 0), done: small.reduce((n, o) => n + o.done, 0) })
    }
  }
  const rank = o => (o.id === 'other' ? 2 : facet.last?.includes(o.id) ? 1 : 0)
  const at = o => (facet.order ? facet.order.indexOf(o.id) : 0)
  return opts.sort((a, b) => rank(a) - rank(b) || at(a) - at(b) || b.count - a.count)
}

/**
 * Narrows `list` by the answers given so far (`picks`: facet id -> the raw values chosen, or '*'
 * for any) and asks the next question worth asking: the first facet not yet answered that splits
 * what is left two ways or more. No question (`step` null) once the list is FEW or shorter, or
 * nothing splits it any more. `list` keeps its order.
 */
export function narrow(list, facets, picks = {}, logged = null) {
  let xs = list
  for (const f of facets) {
    const p = picks[f.id]
    if (Array.isArray(p)) xs = xs.filter(ex => p.includes(f.of(ex)))
  }
  if (xs.length <= FEW) return { list: xs, step: null }
  for (const f of facets) {
    if (picks[f.id]) continue
    const options = optionsOf(f, xs, logged)
    if (options.length >= 2) return { list: xs, step: { facet: f.id, options } }
  }
  return { list: xs, step: null }
}
