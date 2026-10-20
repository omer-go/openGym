// Muscle-role templates for the catalogue's "muscleRoles" field, one per movement pattern, plus
// the modifiers a name implies (posture, one arm, grip, range). Written for openGym from general
// exercise anatomy, then checked by hand against reference tables; nothing here is copied.
//
//   rolesFor(exercise) → { roles, patterns, combined } | { review: why }
//
// target                 the muscle the exercise is for, doing most of the work
// synergists             help move the weight
// dynamicStabilizers     cross both joints, lengthen at one end while shortening at the other
// stabilizers            hold a joint or the trunk still without moving it
// antagonistStabilizers  hold the trunk against the pull of the stabilizers on the other side
import { ROLE_MUSCLES, ROLES } from '../validate.mjs'

const L = s => s.split(',').map(x => x.trim()).filter(Boolean)
const P = (t, s = '', d = '', st = '', a = '') => ({ target: L(t), synergists: L(s), dynamicStabilizers: L(d), stabilizers: L(st), antagonistStabilizers: L(a) })

const SCAP = 'middle-trap, lower-trap, serratus-anterior'
const LEGS = 'glute-max, quads, adductor-magnus, calves'
const TRUNK = 'erector-spinae, rectus-abdominis, obliques'

// trunk: what a standing body adds on top ('heavy', 'light'), or 'none' when the template already
// says everything (lying rotations, olympic lifts, bodyweight holds).
export const PATTERNS = {
  'overhead-press': { ...P('front-delt', `side-delt, supraspinatus, triceps, pec-major-clavicular, coracobrachialis, ${SCAP}`, 'triceps-long-head, biceps', 'upper-trap, levator-scapulae'), trunk: 'heavy' },
  'angled-press': { ...P('front-delt', 'pec-major-clavicular, side-delt, triceps, serratus-anterior', '', 'upper-trap, middle-trap, lower-trap'), trunk: 'heavy' },
  'push-press': { ...P('front-delt', `side-delt, supraspinatus, triceps, pec-major-clavicular, ${SCAP}, ${LEGS}`, 'triceps-long-head', `upper-trap, levator-scapulae, ${TRUNK}`), trunk: 'none' },
  'thruster': { ...P('quads, glute-max, front-delt', `adductor-magnus, calves, side-delt, supraspinatus, triceps, pec-major-clavicular, ${SCAP}`, 'hamstrings, triceps-long-head', `upper-trap, ${TRUNK}`), trunk: 'none' },
  'clean': { ...P('glute-max, quads, adductor-magnus', 'hamstrings, calves, upper-trap, side-delt, supraspinatus, middle-trap, infraspinatus, teres-minor, brachialis, brachioradialis', '', `levator-scapulae, ${TRUNK}, wrist-flexors`), trunk: 'none' },
  'snatch': { ...P('glute-max, quads, adductor-magnus', `hamstrings, calves, upper-trap, side-delt, front-delt, supraspinatus, infraspinatus, teres-minor, triceps, ${SCAP}, brachialis, brachioradialis`, '', `levator-scapulae, ${TRUNK}, wrist-flexors`), trunk: 'none' },
  // With a kettlebell or a dumbbell the bell swings up from a hip hinge, not a squat.
  'bell-clean': { ...P('glute-max, hamstrings', 'adductor-magnus, quads, upper-trap, side-delt, supraspinatus, middle-trap, infraspinatus, teres-minor, brachialis, brachioradialis', '', `levator-scapulae, ${TRUNK}, wrist-flexors`), trunk: 'none' },
  'bell-snatch': { ...P('glute-max, hamstrings', `adductor-magnus, quads, upper-trap, side-delt, front-delt, supraspinatus, infraspinatus, teres-minor, triceps, ${SCAP}`, '', `levator-scapulae, ${TRUNK}, wrist-flexors`), trunk: 'none' },
  // A muscle clean or snatch keeps the legs nearly straight in the catch: the arms and traps lift it.
  'muscle-clean': { ...P('upper-trap, side-delt', `supraspinatus, infraspinatus, teres-minor, middle-trap, brachialis, brachioradialis, biceps, glute-max, hamstrings, quads, calves`, '', `levator-scapulae, ${TRUNK}, wrist-flexors`), trunk: 'none' },
  'muscle-snatch': { ...P('upper-trap, side-delt', `front-delt, supraspinatus, infraspinatus, teres-minor, triceps, ${SCAP}, brachialis, brachioradialis, glute-max, hamstrings, quads, calves`, '', `levator-scapulae, ${TRUNK}, wrist-flexors`), trunk: 'none' },
  'high-pull': { ...P('upper-trap, side-delt', `supraspinatus, infraspinatus, teres-minor, ${SCAP}, brachialis, brachioradialis, biceps, glute-max, hamstrings, quads, adductor-magnus, calves`, '', `levator-scapulae, ${TRUNK}, wrist-flexors`), trunk: 'none' },
  'front-raise': { ...P('front-delt', `pec-major-clavicular, side-delt, coracobrachialis, ${SCAP}`, '', 'upper-trap, levator-scapulae, wrist-extensors'), trunk: 'light' },
  'lateral-raise': { ...P('side-delt', `front-delt, supraspinatus, ${SCAP}`, '', 'upper-trap, levator-scapulae, wrist-extensors'), trunk: 'light' },
  'upright-row': { ...P('side-delt', `front-delt, supraspinatus, infraspinatus, teres-minor, brachialis, brachioradialis, biceps, ${SCAP}`, '', 'upper-trap, levator-scapulae, wrist-flexors'), trunk: 'light' },
  'rear-raise': { ...P('rear-delt', 'infraspinatus, teres-minor, side-delt, middle-trap, lower-trap, rhomboids', '', 'triceps, wrist-extensors'), trunk: 'light', leans: true },
  't-raise': { ...P('rear-delt, middle-trap', 'rhomboids, infraspinatus, teres-minor, side-delt, lower-trap', '', 'triceps, wrist-extensors'), trunk: 'light', leans: true },
  'rear-delt-row': { ...P('rear-delt', 'infraspinatus, teres-minor, side-delt, middle-trap, lower-trap, rhomboids, brachialis, brachioradialis', 'biceps', 'wrist-flexors'), trunk: 'light', leans: true },
  'face-pull': { ...P('rear-delt', 'infraspinatus, teres-minor, middle-trap, lower-trap, rhomboids, brachialis, brachioradialis', 'biceps', 'wrist-flexors'), trunk: 'light' },
  'scaption': { ...P('supraspinatus', `side-delt, front-delt, coracobrachialis, ${SCAP}`, '', 'upper-trap, wrist-extensors'), trunk: 'light' },
  'y-raise': { ...P('side-delt, lower-trap', 'front-delt, supraspinatus, middle-trap, serratus-anterior, infraspinatus, teres-minor', '', 'upper-trap, wrist-extensors'), trunk: 'light' },
  'w-raise': { ...P('lower-trap, infraspinatus', 'teres-minor, rear-delt, middle-trap, rhomboids', '', 'wrist-extensors'), trunk: 'light', leans: true },
  'external-rotation': { ...P('infraspinatus', 'teres-minor, rear-delt', '', 'rhomboids, lower-trap, wrist-extensors'), trunk: 'none' },
  'internal-rotation': { ...P('subscapularis', 'pec-major-sternal, lats, teres-major, front-delt', '', 'wrist-flexors'), trunk: 'none' },
  'adduction': { ...P('lats', 'teres-major, pec-major-sternal, triceps-long-head, rhomboids', '', 'lower-trap'), trunk: 'none' },
  'shrug': { ...P('upper-trap', 'levator-scapulae, middle-trap', '', 'wrist-flexors'), trunk: 'shrug' },
  'power-shrug': { ...P('upper-trap', `levator-scapulae, middle-trap, ${LEGS}, hamstrings`, '', `wrist-flexors, ${TRUNK}`), trunk: 'none' },
  'overhead-shrug': { ...P('upper-trap', 'serratus-anterior, lower-trap, levator-scapulae', '', `front-delt, side-delt, supraspinatus, triceps, ${TRUNK}`), trunk: 'none' },
  'retraction': { ...P('middle-trap, rhomboids', 'lower-trap', '', 'wrist-flexors'), trunk: 'none' },
  'scap-hang': { ...P('lower-trap', 'lats, pec-minor, middle-trap, rhomboids', '', 'wrist-flexors'), trunk: 'none' },
  'scap-dip': { ...P('lower-trap, pec-minor', 'lats, pec-major-sternal', '', 'triceps, wrist-flexors, rectus-abdominis'), trunk: 'none' },
  'carry': { ...P('upper-trap', 'levator-scapulae, middle-trap, wrist-flexors', '', 'erector-spinae, quadratus-lumborum, obliques, rectus-abdominis, glute-med'), trunk: 'none' },
  'overhead-carry': { ...P('front-delt, side-delt', `triceps, supraspinatus, upper-trap, lower-trap, serratus-anterior`, '', 'infraspinatus, teres-minor, erector-spinae, quadratus-lumborum, obliques, rectus-abdominis, glute-med, wrist-flexors'), trunk: 'none' },
  'pike-press': { ...P('front-delt', `triceps, side-delt, pec-major-clavicular, supraspinatus, coracobrachialis, ${SCAP}`, 'triceps-long-head, biceps', 'upper-trap, levator-scapulae, rectus-abdominis, obliques, hip-flexors, quads, wrist-flexors'), trunk: 'none' },
  'handstand-hold': { ...P('front-delt', `side-delt, triceps, supraspinatus, upper-trap, ${SCAP}`, '', 'rectus-abdominis, obliques, erector-spinae, glute-max, wrist-flexors'), trunk: 'none' },
  'planche-hold': { ...P('front-delt', 'pec-major-clavicular, serratus-anterior, biceps, pec-minor', '', 'triceps, lower-trap, rectus-abdominis, obliques, glute-max, wrist-flexors'), trunk: 'none' },
  'planche-press': { ...P('front-delt', 'pec-major-clavicular, pec-major-sternal, triceps, serratus-anterior', 'biceps', 'lower-trap, rectus-abdominis, obliques, glute-max, wrist-flexors'), trunk: 'none' },
  'row': { ...P('middle-trap, rhomboids, lats', 'rear-delt, teres-major, infraspinatus, teres-minor, lower-trap, brachialis, brachioradialis', 'biceps', 'wrist-flexors'), trunk: 'light', leans: true },
  'straight-arm-pulldown': { ...P('lats', 'teres-major, triceps-long-head, rear-delt, pec-major-sternal, lower-trap, rhomboids', '', 'rectus-abdominis, obliques, wrist-flexors'), trunk: 'none' },
  // Circling a weight around the head or the body: every part of the shoulder takes a turn.
  'circle': { ...P('front-delt, side-delt', `rear-delt, infraspinatus, teres-minor, subscapularis, upper-trap, lower-trap, serratus-anterior, triceps`, '', 'rectus-abdominis, obliques, erector-spinae, wrist-flexors'), trunk: 'none' },
  // The same arc lying on a bench, from the hips to overhead and back: closer to a fly and a pullover.
  'lying-circle': { ...P('front-delt, pec-major-clavicular', 'pec-major-sternal, side-delt, lats, serratus-anterior, coracobrachialis', 'triceps-long-head', 'wrist-flexors'), trunk: 'none' },
  'yoke': { ...P('quads, glute-max', 'adductor-magnus, hamstrings, calves', '', 'upper-trap, erector-spinae, rectus-abdominis, obliques, quadratus-lumborum, glute-med, wrist-flexors'), trunk: 'none' },
  'curl': { ...P('biceps', 'brachialis, brachioradialis', '', 'wrist-flexors'), trunk: 'light' },
}

// Names no template describes: written by hand in the exercise file (the seeder never touches an
// entry that has roles), or left for the body part they belong to.
const REVIEW = [
  [/tate press/, 'a triceps exercise, for the arms'],
  [/barbell skier|elbow planche|split fly|maltese|rollball|slingshot|shoulder tap|turkish get up|backhand raise|prayer push/, 'written by hand'],
]

const BELL = /kettlebell|dumbbell/
const clean = e => BELL.test(e.equipment) ? 'bell-clean' : 'clean'

// First match wins, so the specific names come before the general ones. A list of patterns is a
// combination (a clean and then a press): each muscle keeps its strongest role across them.
// A rule may also add roles a template lacks ({ p, add }), for an odd stance or an extra part.
const RULES = [
  [/twisted clean and press/, e => ({ p: [clean(e), 'overhead-press'], add: { synergists: 'obliques' } })],
  [/clean and jerk/, e => [clean(e), 'push-press']],
  [/clean (and )?press|log lift/, e => [clean(e), 'overhead-press']],
  [/muscle snatch/, 'muscle-snatch'],
  [/devils press/, { p: 'bell-snatch', add: { synergists: 'pec-major-clavicular, pec-major-sternal, hip-flexors' } }],
  [/snatch(?! grip)/, e => BELL.test(e.equipment) ? 'bell-snatch' : 'snatch'],
  [/high pull/, e => /cable|band/.test(e.equipment) ? 'upright-row' : 'high-pull'],
  [/muscle clean|smith hang clean/, 'muscle-clean'],
  [/cross clean/, e => ({ p: clean(e), add: { synergists: 'obliques' } })],
  [/clean|pirate supper legs/, e => clean(e)],
  [/landmine kneeling thruster|landmine.*press|angled press/, 'angled-press'],
  [/thruster/, 'thruster'],
  [/push press|jerk|power overhead press/, 'push-press'],
  [/biceps curl to arnold/, ['curl', 'overhead-press']],
  [/cuban/, ['upright-row', 'external-rotation', 'overhead-press']],
  [/shoulders complex/, ['lateral-raise', 'front-raise', 'overhead-press']],
  [/external rotation press/, ['external-rotation', 'overhead-press']],
  [/face pull/, 'face-pull'],
  [/external (shoulder )?rotation/, 'external-rotation'],
  [/internal (shoulder )?rotation/, 'internal-rotation'],
  [/power shrug/, 'power-shrug'],
  [/overhead shrug/, 'overhead-shrug'],
  [/horizontal shrug/, 'retraction'],
  // Hanging under a bar and drawing the shoulder blades down and back, the body held straight.
  [/inverted shrug/, { p: 'retraction', add: { synergists: 'lats, pec-minor', stabilizers: 'rectus-abdominis, obliques, glute-max, erector-spinae, wrist-flexors' } }],
  [/scapula dips|shrug \(on parallel bars\)/, 'scap-dip'],
  [/scapular pull-up|hanging scapular shrug/, 'scap-hang'],
  [/trap raise/, 'y-raise'],
  [/reverse shrug/, { p: 'shrug', add: { synergists: 'rhomboids' } }],
  [/shrug|scapula raise/, 'shrug'],
  [/farmers carry/, 'carry'],
  [/overhead carry/, 'overhead-carry'],
  [/yoke|sandbag carry/, 'yoke'],
  [/planche negative/, ['handstand-hold', 'planche-hold']],
  [/headstand/, { p: 'handstand-hold', add: { stabilizers: 'neck-extensors, hip-flexors' } }],
  [/handstand hold|handstand walk|split handstand|wall walks/, 'handstand-hold'],
  [/planche press/, 'planche-press'],
  [/planche/, 'planche-hold'],
  [/pike|handstand (shoulder press|push up)/, 'pike-press'],
  [/full can|scaption|empty can/, 'scaption'],
  [/face down lying shoulder press/, { p: 'y-raise', add: { synergists: 'triceps' } }],
  [/\by[- ]raise|\by lateral raise|\by elevation/, 'y-raise'],
  [/\bw raise/, 'w-raise'],
  // \b: "front raise" ends in "t raise".
  [/\bt[- ]raise/, 't-raise'],
  [/middle row/, 'row'],
  [/skier/, 'straight-arm-pulldown'],
  [/around (the )?world|halo/, e => /incline|flat|lying/.test(e.name) ? 'lying-circle' : 'circle'],
  [/rear delt row|single delt row|rear delt horizontal row|armpit row/, 'rear-delt-row'],
  [/lunge with rear fly/, { p: 'rear-raise', add: { target: 'quads, glute-max', stabilizers: 'adductor-magnus, hamstrings, glute-med, calves' } }],
  [/reverse fly|revers fly|rear (delt )?fly|rear (delt|lateral) raise|deltoid rear|pull ?apart|bent over (one arm )?lateral raise|reverse delt fly|round arm|powell raise|rear delt swing|back to side to front|lateral shoulder extension/, 'rear-raise'],
  [/upright row/, 'upright-row'],
  [/lateral to front|front and lateral|iron cross|[46] ways/, ['lateral-raise', 'front-raise']],
  [/iceland cross/, { p: 'lateral-raise', add: { stabilizers: 'wrist-flexors' } }],
  [/archer/, { p: 'lateral-raise', add: { stabilizers: 'quads, glute-max, glute-med, adductors, obliques, quadratus-lumborum' } }],
  [/crucifix|lateral raise|lu raise|side lying one hand raise|^dumbbell raise$|standing alternate raise/, 'lateral-raise'],
  [/kneeling step with swing/, 'front-raise'],
  [/front (shoulder )?raise|forward raise|front hold|cross raise|shoulder flexion|driver|front twist raise/, 'front-raise'],
  [/shoulder adduction/, 'adduction'],
  [/side bend press/, { p: 'overhead-press', add: { synergists: 'obliques, quadratus-lumborum' } }],
  // From the bottom of a squat: the legs hold it, the press is unchanged.
  [/sots press|press under/, { p: 'overhead-press', add: { stabilizers: 'quads, glute-max, adductor-magnus' } }],
  [/press|seated alternate shoulder$|^dumbbell incline raise$/, 'overhead-press'],
]

const RANK = Object.fromEntries(ROLES.map((r, i) => [r, i]))

// A muscle → role map, so a muscle can only ever hold one role.
class Roles {
  constructor() { this.m = new Map() }
  add(role, muscles) {   // keeps the stronger role when the muscle already has one
    for (const x of L(muscles)) if (!this.m.has(x) || RANK[role] < RANK[this.m.get(x)]) this.m.set(x, role)
    return this
  }
  set(role, muscles) { for (const x of L(muscles)) this.m.set(x, role); return this }
  drop(muscles) { for (const x of L(muscles)) this.m.delete(x); return this }
  has(x, role) { return role ? this.m.get(x) === role : this.m.has(x) }
  toJSON() {
    const out = {}
    for (const r of ROLES) {
      const xs = [...this.m].filter(([, v]) => v === r).map(([k]) => k)
        .sort((a, b) => ROLE_MUSCLES.indexOf(a) - ROLE_MUSCLES.indexOf(b))
      if (xs.length) out[r] = xs
    }
    return out
  }
}

const FREE = /dumbbell|barbell|kettlebell|weighted|body weight|weight plate|ez barbell|trap bar|sandbag|olympic/
function posture(name, e, pat) {
  if (/z press/.test(name)) return 'floor'
  if (/stability ball|exercise ball/.test(name)) return 'ball'
  if (/lying|prone|supine|chest support|with support|bench supported|support head|face down|side lying|incline|decline|on floor/.test(name)) return 'supported'
  if (e.equipment === 'leverage machine' || (e.equipment === 'smith machine' && /seated/.test(name))) return 'supported'
  if (e.equipment === 'suspension trainer' && !/press|push up/.test(name)) return 'suspension'
  const bent = /bent over|bent-over/.test(name)
  if (/seated|sitting|on a chair/.test(name)) return bent || (pat.leans && FREE.test(e.equipment)) ? 'seated-bent' : 'seated'
  if (bent) return 'bent'
  if (/kneeling/.test(name)) return 'kneeling'
  // A rear raise or row with free weights and no posture named is the bent-over one; with a
  // cable or band it is done upright.
  if (pat.leans && FREE.test(e.equipment) && !/standing/.test(name)) return 'bent'
  return 'standing'
}

const STANCE = {
  heavy: { standing: 'erector-spinae, rectus-abdominis, obliques, glute-max', kneeling: 'erector-spinae, rectus-abdominis, obliques, glute-max' },
  light: { standing: 'erector-spinae', kneeling: 'erector-spinae, glute-max, obliques' },
  shrug: { standing: 'erector-spinae', kneeling: 'erector-spinae, glute-max' },
}

export function rolesFor(e) {
  const name = e.name
  const skip = REVIEW.find(([r]) => r.test(name))
  if (skip) return { review: skip[1] }
  const rule = RULES.find(([r]) => r.test(name))
  if (!rule) return { review: 'no template matches the name' }
  let got = typeof rule[1] === 'function' ? rule[1](e) : rule[1]
  if (typeof got === 'string' || Array.isArray(got)) got = { p: got }
  const pats = [].concat(got.p)
  const r = new Roles()
  for (const p of pats) for (const role of ROLES) r.add(role, PATTERNS[p][role].join(','))
  for (const [role, xs] of Object.entries(got.add || {})) r.add(role, xs)
  const trunk = pats.map(p => PATTERNS[p].trunk).includes('heavy') ? 'heavy' : PATTERNS[pats[0]].trunk
  const pos = posture(name, e, PATTERNS[pats[0]])
  const main = pats[pats.length - 1]

  if (trunk !== 'none') {
    if (STANCE[trunk][pos]) r.add('stabilizers', STANCE[trunk][pos])
    if (pos === 'bent') r.add('stabilizers', 'erector-spinae, hamstrings, glute-max, adductor-magnus').add('antagonistStabilizers', 'rectus-abdominis, obliques')
    if (pos === 'seated-bent') r.add('stabilizers', 'erector-spinae')
    if (pos === 'floor') r.add('stabilizers', 'erector-spinae, rectus-abdominis, obliques, hip-flexors')
    if (pos === 'ball') r.add('stabilizers', 'erector-spinae, rectus-abdominis, obliques')
    if (pos === 'suspension') r.add('stabilizers', 'rectus-abdominis, obliques, glute-max, erector-spinae')
    if (/one arm|single arm|unilateral|single delt/.test(name)) {
      if (['standing', 'kneeling', 'bent', 'suspension'].includes(pos)) r.add('stabilizers', 'obliques, quadratus-lumborum')
      else if (pos !== 'supported') r.add('stabilizers', 'obliques')
    }
  }
  if (/bottoms up|hanging band/.test(name)) r.add('stabilizers', 'infraspinatus, teres-minor, subscapularis, supraspinatus, wrist-flexors')
  if (/arnold/.test(name)) r.drop('biceps').add('synergists', /curl/.test(name) ? 'biceps' : '')
  // Lying on a bench the raise swings toward the back; a machine's pads keep it in the side plane.
  if (main === 'lateral-raise' && ((pos === 'supported' && e.equipment !== 'leverage machine') || /side lying/.test(name)) && r.has('front-delt', 'synergists'))
    r.drop('front-delt').add('synergists', 'rear-delt')
  if (/front-raise|lateral-raise/.test(main) && /lu raise|above head|over head|high front raise/.test(name)) r.set('synergists', 'upper-trap')
  if (main === 'front-raise' && /underhand|supinated/.test(name)) r.add('synergists', 'biceps')
  if (/twisting/.test(name)) r.add('synergists', 'obliques')
  if (/wrist straps|gripless/.test(name)) r.drop('wrist-flexors, wrist-extensors')
  if (/rotation/.test(main) && /90|upright/.test(name)) r.add('stabilizers', 'side-delt, supraspinatus')
  if (/sumo/.test(name)) r.add('synergists', 'adductors')
  // Half kneeling, a clean comes off the hips alone: the legs below them have nothing to do.
  if (pos === 'kneeling' && pats.some(p => /clean/.test(p))) r.drop('quads, hamstrings, adductor-magnus, calves').set('synergists', 'glute-max')
  if (/overhead|swing/.test(name) && main === 'front-raise') r.set('synergists', 'upper-trap')
  if (/6 ways/.test(name)) r.set('synergists', 'upper-trap').add('synergists', 'rear-delt')
  return { roles: r.toJSON(), patterns: pats, posture: pos, combined: pats.length > 1 || !!got.add?.target }
}

// The catalogue "target" word each single muscle belongs to, to flag a template that disagrees
// with the exercise's own target.
export const TARGET_OF = {
  'front-delt': 'delts', 'side-delt': 'delts', 'rear-delt': 'delts', supraspinatus: 'delts', infraspinatus: 'delts', 'teres-minor': 'delts', subscapularis: 'delts',
  'upper-trap': 'traps', 'middle-trap': 'traps, upper back', 'lower-trap': 'traps, upper back', rhomboids: 'upper back', lats: 'lats', 'pec-minor': 'pectorals',
  biceps: 'biceps', triceps: 'triceps', 'glute-max': 'glutes', quads: 'quads', 'adductor-magnus': 'adductors',
}
