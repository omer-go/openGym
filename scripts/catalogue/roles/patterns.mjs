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

  // Chest. A flat press or fly is for the lower, sternal part of the chest; an incline one, or a
  // fly that rises from low to high, for the upper, clavicular part. Pinned shoulder blades
  // (rhomboids, middle traps) hold the press steady on a bench.
  'bench-press': { ...P('pec-major-sternal', 'pec-major-clavicular, front-delt, triceps, coracobrachialis', 'biceps', 'rhomboids, middle-trap, wrist-flexors'), trunk: 'press' },
  'incline-press': { ...P('pec-major-clavicular', 'front-delt, triceps, pec-major-sternal, coracobrachialis', 'biceps', 'rhomboids, middle-trap, wrist-flexors'), trunk: 'press' },
  'decline-press': { ...P('pec-major-sternal', 'triceps, pec-major-clavicular, front-delt, lats', 'biceps', 'rhomboids, middle-trap, wrist-flexors'), trunk: 'press' },
  'close-press': { ...P('triceps', 'pec-major-sternal, pec-major-clavicular, front-delt', 'biceps', 'rhomboids, middle-trap, wrist-flexors'), trunk: 'press' },
  // Hands squeezed together while pressing: the chest works to hold them, not only to push.
  'squeeze-press': { ...P('pec-major-sternal', 'pec-major-clavicular, front-delt, triceps', '', 'wrist-flexors'), trunk: 'press' },
  'fly': { ...P('pec-major-sternal', 'pec-major-clavicular, front-delt, coracobrachialis', 'biceps', 'triceps, wrist-flexors'), trunk: 'press' },
  'upper-fly': { ...P('pec-major-clavicular', 'front-delt, coracobrachialis, pec-major-sternal', 'biceps', 'triceps, wrist-flexors'), trunk: 'press' },
  'lower-fly': { ...P('pec-major-sternal', 'pec-minor, lats, coracobrachialis', 'biceps', 'triceps, wrist-flexors'), trunk: 'press' },
  // Elbows bent, no weight: the chest squeezes against the hands or the other arm.
  'squeeze': { ...P('pec-major-sternal', 'pec-major-clavicular, front-delt', '', ''), trunk: 'none' },
  'push-up': { ...P('pec-major-sternal', 'pec-major-clavicular, front-delt, triceps, serratus-anterior, coracobrachialis', 'biceps', 'rectus-abdominis, obliques, transverse-abdominis, quads, glute-max, wrist-flexors', 'erector-spinae'), trunk: 'none' },
  'feet-up-push-up': { ...P('pec-major-clavicular', 'front-delt, pec-major-sternal, triceps, serratus-anterior, coracobrachialis', 'biceps', 'rectus-abdominis, obliques, transverse-abdominis, quads, glute-max, wrist-flexors', 'erector-spinae'), trunk: 'none' },
  'close-push-up': { ...P('triceps', 'pec-major-sternal, pec-major-clavicular, front-delt, serratus-anterior', '', 'rectus-abdominis, obliques, transverse-abdominis, quads, glute-max, wrist-flexors', 'erector-spinae'), trunk: 'none' },
  // A push-up from the knees: the thighs rest, the trunk still holds the line.
  'knee-push-up': { ...P('pec-major-sternal', 'pec-major-clavicular, front-delt, triceps, serratus-anterior, coracobrachialis', '', 'rectus-abdominis, obliques, glute-max, wrist-flexors', 'erector-spinae'), trunk: 'none' },
  // Protraction only, the elbows straight: the shoulder blades spread around the ribs and back.
  'scap-push-up': { ...P('serratus-anterior', 'pec-minor', '', 'triceps, front-delt, rectus-abdominis, obliques, wrist-flexors'), trunk: 'none' },
  'serratus-raise': { ...P('serratus-anterior', 'pec-minor', '', 'triceps, front-delt, wrist-flexors'), trunk: 'none' },
  'wall-slide': { ...P('serratus-anterior', 'lower-trap, upper-trap', '', 'front-delt, triceps, rectus-abdominis'), trunk: 'none' },
  'dip': { ...P('pec-major-sternal', 'triceps, front-delt, pec-major-clavicular, pec-minor, lats, rhomboids', '', 'lower-trap, rectus-abdominis, wrist-flexors'), trunk: 'none' },
  'chest-pass': { ...P('pec-major-sternal', 'triceps, front-delt, pec-major-clavicular, serratus-anterior', '', 'rectus-abdominis, obliques, wrist-flexors'), trunk: 'press' },
  'pullover-chest': { ...P('pec-major-sternal', 'lats, teres-major, triceps-long-head, pec-minor, serratus-anterior', '', 'rectus-abdominis, wrist-flexors'), trunk: 'none' },

  // Back. A row is for the upper back and the lats together; a wide or high one leans to the
  // upper back and rear delts, an underhand or elbows-in one to the lats.
  'wide-row': { ...P('middle-trap, rhomboids, rear-delt', 'lats, teres-major, infraspinatus, teres-minor, lower-trap, brachialis, brachioradialis', 'biceps', 'wrist-flexors'), trunk: 'row', leans: true },
  'lat-row': { ...P('lats', 'teres-major, middle-trap, rhomboids, rear-delt, lower-trap, brachialis, brachioradialis', 'biceps', 'wrist-flexors'), trunk: 'row', leans: true },
  'pulldown': { ...P('lats', 'teres-major, rear-delt, rhomboids, middle-trap, lower-trap, pec-minor, brachialis, brachioradialis, biceps', 'triceps-long-head', 'wrist-flexors'), trunk: 'row' },
  // Hanging from a bar, the trunk and hips keep the body from swinging.
  'pull-up': { ...P('lats', 'teres-major, rear-delt, rhomboids, middle-trap, lower-trap, pec-minor, brachialis, brachioradialis, biceps', 'triceps-long-head', 'rectus-abdominis, obliques, wrist-flexors'), trunk: 'none' },
  'muscle-up': { ...P('lats', 'teres-major, pec-major-sternal, triceps, front-delt, rhomboids, middle-trap, lower-trap, pec-minor, brachialis, brachioradialis, biceps', '', 'rectus-abdominis, obliques, hip-flexors, wrist-flexors'), trunk: 'none' },
  'pullover': { ...P('lats', 'teres-major, pec-major-sternal, triceps-long-head, pec-minor, serratus-anterior', '', 'rectus-abdominis, wrist-flexors'), trunk: 'none' },
  // Straight-bodied from a bar: the straight arms pull the body level.
  'front-lever': { ...P('lats', 'teres-major, rear-delt, triceps-long-head, pec-major-sternal, lower-trap, rhomboids', '', 'rectus-abdominis, obliques, transverse-abdominis, hip-flexors, glute-max, quads, wrist-flexors'), trunk: 'none' },
  // Hanging on a rope, one hand over the other: the grip holds on while the back pulls.
  'climb': { ...P('lats', 'teres-major, biceps, brachialis, brachioradialis, wrist-flexors, rear-delt, rhomboids, middle-trap, lower-trap', '', 'rectus-abdominis, obliques, hip-flexors'), trunk: 'none' },
  'back-extension': { ...P('erector-spinae', 'glute-max, hamstrings, adductor-magnus', '', 'quadratus-lumborum'), trunk: 'none' },
  // Lying face down and lifting the chest, the arms, the legs or all of them off the floor.
  'superman': { ...P('erector-spinae', 'glute-max, hamstrings, quadratus-lumborum', '', 'middle-trap, lower-trap, rear-delt'), trunk: 'none' },
  // Lying face down on a bench or ball, the legs rising behind.
  'reverse-hyper': { ...P('glute-max, erector-spinae', 'hamstrings, adductor-magnus, quadratus-lumborum', '', 'wrist-flexors'), trunk: 'none' },
  'good-morning': { ...P('erector-spinae', 'glute-max, hamstrings, adductor-magnus, quadratus-lumborum', '', 'rectus-abdominis, obliques'), trunk: 'none' },
  'hinge': { ...P('hamstrings, glute-max', 'adductor-magnus, erector-spinae', '', 'quadratus-lumborum, rectus-abdominis, obliques, wrist-flexors'), trunk: 'none' },

  // Legs. A squat, lunge or press is for the quads and glutes together; a knee bent under load
  // (hack squat, leg extension) leans to the quads, a hip driven through (bridge, kickback) to
  // the glutes. The hamstrings and calves cross two joints and steady the knee in a squat.
  'squat': { ...P('quads, glute-max', 'adductor-magnus, calves', 'hamstrings', 'erector-spinae, rectus-abdominis, obliques, glute-med'), trunk: 'none' },
  'lunge': { ...P('quads, glute-max', 'adductor-magnus, glute-med, calves', 'hamstrings', 'adductors, erector-spinae, obliques, quadratus-lumborum'), trunk: 'none' },
  'leg-press': { ...P('quads, glute-max', 'adductor-magnus', 'hamstrings', 'calves'), trunk: 'none' },
  'hack-squat': { ...P('quads', 'glute-max, adductor-magnus', 'hamstrings', 'calves, erector-spinae'), trunk: 'none' },
  'leg-extension': { ...P('quads'), trunk: 'none' },
  // Knees forward, hips straight: the thighs take the whole lean back.
  'sissy-squat': { ...P('quads', '', '', 'glute-max, rectus-abdominis, calves'), trunk: 'none' },
  'wall-sit': { ...P('quads', 'glute-max, adductor-magnus', '', 'calves, rectus-abdominis'), trunk: 'none' },
  'jump': { ...P('quads, glute-max', 'calves, adductor-magnus, hamstrings', '', 'rectus-abdominis, obliques, erector-spinae'), trunk: 'none' },
  // Pushing a sled or a wall, leaning in: the legs drive, the arms and trunk only hold.
  'sled-push': { ...P('quads, glute-max', 'calves, hamstrings, adductor-magnus', '', 'triceps, front-delt, rectus-abdominis, obliques, erector-spinae'), trunk: 'none' },
  'leg-curl': { ...P('hamstrings', 'calves'), trunk: 'none' },
  // Curling the body up or lowering it from the knees: the hips are held straight throughout.
  'nordic': { ...P('hamstrings', 'calves', '', 'glute-max, erector-spinae, rectus-abdominis'), trunk: 'none' },
  'deadlift': { ...P('glute-max, hamstrings', 'quads, adductor-magnus, erector-spinae', '', 'upper-trap, middle-trap, lats, rectus-abdominis, obliques, wrist-flexors'), trunk: 'none' },
  'hip-thrust': { ...P('glute-max', 'hamstrings, adductor-magnus', '', 'quads, rectus-abdominis, obliques, glute-med'), trunk: 'none' },
  'glute-kickback': { ...P('glute-max', 'hamstrings', '', 'glute-med, erector-spinae, rectus-abdominis, obliques'), trunk: 'none' },
  // A back extension rounded at the hips rather than the spine, as the glute versions are done.
  'glute-hyper': { ...P('glute-max', 'hamstrings, erector-spinae, adductor-magnus'), trunk: 'none' },
  'swing': { ...P('glute-max, hamstrings', 'adductor-magnus, erector-spinae, quads', '', 'front-delt, rectus-abdominis, obliques, wrist-flexors'), trunk: 'none' },
  'abduction': { ...P('glute-med', 'glute-max', '', 'obliques, quadratus-lumborum'), trunk: 'none' },
  // Stepping sideways against a band, knees bent: the standing leg holds a quarter squat.
  'side-walk': { ...P('glute-med', 'glute-max', '', 'quads, calves, obliques'), trunk: 'none' },
  'leg-adduction': { ...P('adductors', 'adductor-magnus', '', 'obliques'), trunk: 'none' },
  'hip-flexion': { ...P('hip-flexors', 'quads', '', 'rectus-abdominis, obliques'), trunk: 'none' },
  'calf-raise': { ...P('calves'), trunk: 'light' },
  // On a machine or a leg press the body is held, nothing else balances.
  'calf-press': { ...P('calves'), trunk: 'none' },
  // Springing off the balls of the feet: the knees and hips stay nearly straight.
  'hop': { ...P('calves', 'quads, glute-max', '', 'tibialis-anterior, rectus-abdominis, glute-med'), trunk: 'none' },
  'tibialis-raise': { ...P('tibialis-anterior'), trunk: 'none' },

  // Arms. A curl with the palms up is for the biceps; with the thumbs up (hammer) for the
  // brachialis and brachioradialis, which take over further still with the palms down (reverse).
  // Arms braced on a pad or a thigh, nothing else holds the body.
  'preacher-curl': { ...P('biceps', 'brachialis, brachioradialis', '', 'wrist-flexors'), trunk: 'none' },
  'hammer-curl': { ...P('brachialis, brachioradialis', 'biceps', '', 'wrist-flexors, wrist-extensors'), trunk: 'light' },
  'reverse-curl': { ...P('brachioradialis, brachialis', 'biceps, wrist-extensors', '', 'wrist-flexors'), trunk: 'light' },
  // With the arm overhead the long head is stretched and does most of the work; lying, it shares
  // it; with the elbow at the side (pushdown, kickback) the other heads lead.
  'overhead-extension': { ...P('triceps-long-head', 'triceps', '', 'wrist-flexors'), trunk: 'light' },
  'lying-extension': { ...P('triceps-long-head, triceps', '', '', 'wrist-flexors'), trunk: 'none' },
  'pushdown': { ...P('triceps', 'triceps-long-head', '', 'wrist-flexors'), trunk: 'light' },
  'kickback': { ...P('triceps', 'triceps-long-head, rear-delt', '', 'wrist-flexors'), trunk: 'light', leans: true },
  // Hands behind on a bench or a chair: the shoulders reach back, the chest barely helps.
  'bench-dip': { ...P('triceps', 'front-delt, pec-major-sternal', '', 'wrist-flexors'), trunk: 'none' },
  // Upright on bars, the body straight down: the triceps lead, the chest less than in a lean.
  'triceps-dip': { ...P('triceps', 'pec-major-sternal, front-delt, pec-minor', '', 'lower-trap, rectus-abdominis, wrist-flexors'), trunk: 'none' },
  // A body held in a plank, the elbows bending to lower it: a triceps extension with the floor.
  'body-up': { ...P('triceps', 'triceps-long-head', '', 'rectus-abdominis, obliques, transverse-abdominis, quads, glute-max, wrist-flexors', 'erector-spinae'), trunk: 'none' },
  'wrist-curl': { ...P('wrist-flexors'), trunk: 'none' },
  'reverse-wrist-curl': { ...P('wrist-extensors'), trunk: 'none' },
  // Thumb up, the hand tilted up and down: flexors and extensors on the thumb side together.
  'wrist-tilt': { ...P('wrist-flexors, wrist-extensors'), trunk: 'none' },
  'forearm-rotation': { ...P('brachioradialis', 'biceps', '', 'wrist-flexors, wrist-extensors'), trunk: 'none' },
  'wrist-roller': { ...P('wrist-flexors, wrist-extensors', 'brachioradialis', '', 'front-delt, side-delt'), trunk: 'none' },
  'grip': { ...P('wrist-flexors', '', '', 'brachioradialis, wrist-extensors'), trunk: 'none' },
  'hang': { ...P('wrist-flexors', '', '', 'brachioradialis, wrist-extensors, lats, lower-trap, rectus-abdominis'), trunk: 'none' },

  // Core. Curling the ribs toward the hips is for the six-pack (rectus abdominis); the hips
  // toward the ribs, or the legs lifted, brings in the hip flexors. Turning or bending sideways is
  // for the obliques; holding the trunk still against a pull (planks, pallof presses) for the
  // obliques and the deep corset under them (transverse abdominis).
  'crunch': { ...P('rectus-abdominis', 'obliques'), trunk: 'none' },
  'twist-crunch': { ...P('rectus-abdominis, obliques', 'hip-flexors'), trunk: 'none' },
  'side-crunch': { ...P('obliques', 'rectus-abdominis, quadratus-lumborum'), trunk: 'none' },
  'sit-up': { ...P('rectus-abdominis', 'hip-flexors, obliques'), trunk: 'none' },
  'reverse-crunch': { ...P('rectus-abdominis', 'obliques, hip-flexors', '', 'transverse-abdominis'), trunk: 'none' },
  'leg-raise': { ...P('rectus-abdominis, hip-flexors', 'obliques', '', 'transverse-abdominis, quads'), trunk: 'none' },
  // Legs kept low and moving: the hip flexors move them, the abs keep the low back down.
  'flutter': { ...P('hip-flexors, rectus-abdominis', '', '', 'obliques, transverse-abdominis, quads'), trunk: 'none' },
  'v-up': { ...P('rectus-abdominis', 'hip-flexors, obliques', '', 'quads'), trunk: 'none' },
  'hanging-raise': { ...P('rectus-abdominis', 'hip-flexors, obliques', '', 'transverse-abdominis, lats, lower-trap, wrist-flexors'), trunk: 'none' },
  // From a plank, the knees or hips drawn in under the body.
  'jackknife': { ...P('rectus-abdominis', 'hip-flexors, obliques', '', 'transverse-abdominis, front-delt, triceps, serratus-anterior, quads, wrist-flexors'), trunk: 'none' },
  'mountain-climber': { ...P('rectus-abdominis', 'hip-flexors, obliques', '', 'transverse-abdominis, front-delt, triceps, serratus-anterior, glute-max, quads, wrist-flexors'), trunk: 'none' },
  'plank': { ...P('rectus-abdominis, transverse-abdominis', 'obliques', '', 'front-delt, serratus-anterior, glute-max, quads', 'erector-spinae'), trunk: 'none' },
  'side-plank': { ...P('obliques', 'quadratus-lumborum, transverse-abdominis', '', 'rectus-abdominis, erector-spinae, glute-med, side-delt, serratus-anterior'), trunk: 'none' },
  // Face up, the body held straight off the floor: the back of the body holds it.
  'reverse-plank': { ...P('glute-max, erector-spinae', 'hamstrings', '', 'rear-delt, triceps, rectus-abdominis'), trunk: 'none' },
  'hollow': { ...P('rectus-abdominis', 'transverse-abdominis, hip-flexors', '', 'obliques, quads'), trunk: 'none' },
  'dead-bug': { ...P('transverse-abdominis, rectus-abdominis', 'obliques, hip-flexors'), trunk: 'none' },
  'bird-dog': { ...P('erector-spinae', 'glute-max', '', 'transverse-abdominis, obliques, quadratus-lumborum, glute-med, rear-delt, middle-trap'), trunk: 'none' },
  'rollout': { ...P('rectus-abdominis', 'lats, transverse-abdominis, obliques', '', 'triceps, front-delt, serratus-anterior, hip-flexors, wrist-flexors'), trunk: 'none' },
  'dragon-flag': { ...P('rectus-abdominis', 'obliques, transverse-abdominis, hip-flexors', '', 'lats, triceps-long-head, glute-max, wrist-flexors'), trunk: 'none' },
  'l-sit': { ...P('rectus-abdominis, hip-flexors', 'quads', '', 'triceps, front-delt, lower-trap, wrist-flexors'), trunk: 'none' },
  // Sitting or lying, the trunk or the legs turning side to side.
  'twist': { ...P('obliques', 'rectus-abdominis, transverse-abdominis', '', 'hip-flexors'), trunk: 'none' },
  'wiper': { ...P('obliques', 'rectus-abdominis, hip-flexors', '', 'transverse-abdominis, lats'), trunk: 'none' },
  // Standing or kneeling, turning against a cable, a band or a weight: the hips and arms pass it on.
  'chop': { ...P('obliques', 'rectus-abdominis, transverse-abdominis, front-delt, glute-max', '', 'erector-spinae, quads, wrist-flexors'), trunk: 'none' },
  'pallof': { ...P('obliques, transverse-abdominis', 'rectus-abdominis', '', 'pec-major-sternal, front-delt, triceps, glute-max, glute-med'), trunk: 'none' },
  'side-bend': { ...P('obliques', 'quadratus-lumborum', '', 'erector-spinae, rectus-abdominis'), trunk: 'none' },
  'windmill': { ...P('obliques', 'quadratus-lumborum, glute-max, hamstrings', '', 'side-delt, supraspinatus, infraspinatus, teres-minor, triceps, serratus-anterior, erector-spinae, glute-med'), trunk: 'none' },
  'suitcase-carry': { ...P('obliques, quadratus-lumborum', '', '', 'upper-trap, wrist-flexors, erector-spinae, transverse-abdominis, glute-med'), trunk: 'none' },
  'vacuum': { ...P('transverse-abdominis'), trunk: 'none' },
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

// Chest and back, tried before the shoulder rules above for those body parts: there "press" is a
// bench press, not an overhead one. { review } leaves the name for a person.
const PLANK = 'rectus-abdominis, obliques, glute-max, hamstrings'
const PUSH_PLANK = 'rectus-abdominis, obliques, transverse-abdominis, quads, glute-max'
// Which row: wide or high leans to the upper back, underhand or elbows-in to the lats.
const rowKind = name => /narrow pronated/.test(name) ? 'row' : /lats? focused|kroc|underhand|reverse[- ]grip|reverse t-bar|supinat|supine grip|kayak/.test(name) ? 'lat-row'
  : /wide|high row|upper row|seal row|pronated grip (seated )?row|overhand/.test(name) ? 'wide-row' : 'row'
const ODD = { review: 'no template fits the movement' }

const CHEST_RULES = [
  [/plate push|push up pull|push and pull|overhead hit|lateral hit|overhead throw|forward slide press|chest pullback/, ODD],
  [/internal rotation/, 'internal-rotation'],
  [/scapula push|scapular push|push-up plus|push up plus/, 'scap-push-up'],
  [/shoulder raise/, 'serratus-raise'],
  [/planche push|pseudo planche/, 'planche-press'],
  [/pike push/, 'pike-press'],
  [/front raise and pullover/, ['front-raise', 'pullover-chest']],
  [/push up front raise/, ['push-up', 'front-raise']],
  [/pullover/, 'pullover-chest'],
  [/push up and triceps dip/, ['push-up', 'dip']],
  [/\bdips?\b/, 'dip'],
  [/diamond|close grip push|close-grip push/, 'close-push-up'],
  [/svend|squeeze (bench )?press|hex press|inner chest press/, 'squeeze-press'],
  [/chest squeeze|prayer|pec dec on a chair|elbow chest fly on a chair|isometric chest/, 'squeeze'],
  [/chest pass|chest push|horizontal smash|press catch|punch/, 'chest-pass'],
  [/kneeling push up row/, ['knee-push-up', 'row']],
  [/(kneeling|knee)\b.*push|push.*(on knees|kneeling)|kneeling.*press up/, 'knee-push-up'],
  [/decline.*push|push.*decline|elevated push up|raise single leg push/, 'feet-up-push-up'],
  [/push up to side plank/, { p: 'push-up', add: { stabilizers: 'quadratus-lumborum, glute-med' } }],
  [/push[- ]?ups?\b|press up|push with chair|isometric wipers|shoulder tap/, 'push-up'],
  [/high to low|lateral bent-over/, 'lower-fly'],
  [/cross raise|low (chest )?fly|low to high|upper chest|incline.*fly|incline.*flye|breeding/, 'upper-fly'],
  [/high (to low )?fly|high to low|decline.*fly|crossover|cross-over/, 'lower-fly'],
  [/fly|flye|pec deck/, 'fly'],
  [/california press|close grip/, 'close-press'],
  [/decline/, 'decline-press'],
  [/incline|reverse[- ]grip|reverse bench|supinated/, 'incline-press'],
  [/larsen/, { p: 'bench-press', add: { stabilizers: 'rectus-abdominis, obliques' } }],
  [/bridge (bench|chest) press/, { p: 'bench-press', add: { stabilizers: 'glute-max, hamstrings' } }],
  [/press/, 'bench-press'],
]

const BACK_RULES = [
  [/alternating arm ups|seated behind back raise|t spine press|london bridge|power push aways|elbow lift|one arm against wall|self assisted inverted pullover|sled|back lever|elevator|static position|cable twisting pull|slam|overhead throw|staff pose|child to cobra|scapula elevation|standing archer|roll around the world|back extension and flexion/, ODD],
  [/rear delt row|rear delt horizontal row/, 'rear-delt-row'],
  [/prone press swan/, { p: 'superman', add: { synergists: 'lower-trap, middle-trap' } }],
  [/back extension scapular adduction/, ['back-extension', 'retraction']],
  [/serratus.*slide|wall slide/, 'wall-slide'],
  [/scapula(r)? push/, 'scap-push-up'],
  [/scapular pull ?up/, 'scap-hang'],
  [/side plank with rear fly/, { p: 'rear-raise', add: { stabilizers: 'obliques, quadratus-lumborum, glute-med' } }],
  [/scapular retraction|scapular adduction|back squeeze|elbow squeeze|scapula(r)? row|pulse row|prone a$/, 'retraction'],
  [/prone w to t/, ['w-raise', 't-raise']],
  [/prone (w to )?ys?\b|y raise|y-raise/, 'y-raise'],
  [/prone w|floor w|\bw raise/, 'w-raise'],
  [/prone t|floor t raise|\bt raise/, 't-raise'],
  [/muscle[- ]up/, 'muscle-up'],
  [/front lever/, 'front-lever'],
  [/l-pull-up/, { p: 'pull-up', add: { stabilizers: 'hip-flexors, quads' } }],
  [/rope climb|ropes climb|arm over arm|rope pull up/, 'climb'],
  [/power pull/, 'lat-row'],
  [/pull[- ]?ups?\b|chin[- ]?ups?\b|\bchin\b/, 'pull-up'],
  [/straight arm|pushdown|stepback pulldown/, 'straight-arm-pulldown'],
  [/pull ?down/, 'pulldown'],
  [/pullover to press/, ['pullover', 'close-press']],
  [/pullover/, 'pullover'],
  [/superman row/, ['superman', 'row']],
  [/renegade/, { p: 'row', add: { stabilizers: `${PUSH_PLANK}, pec-major-sternal, triceps` } }],
  [/rdl and bent over row|deadlift bent over row/, ['hinge', 'row']],
  [/squat row/, { p: 'row', add: { synergists: 'quads, glute-max' } }],
  [/inverted|row (in doorway|under table|between)|towel row|bed sheet|suspended row|suspender .*row|ring (elevated |high )?row|lying floor row|bodyweight (standing |squatting )?.*row|row with towel|parallel bars bent knee/,
    e => ({ p: rowKind(e.name), add: { stabilizers: PLANK } })],
  [/\brows?\b/, e => rowKind(e.name)],
  [/good morning/, 'good-morning'],
  [/straight leg deadlift/, 'hinge'],
  [/reverse extension|prone leg raise/, 'reverse-hyper'],
  [/lying back extension with press/, { p: 'superman', add: { synergists: 'lower-trap, middle-trap' } }],
  [/lying back extension|lying hyperextension|floor hyperextension|superman|swimmer|cobra|opposite arm and leg|snow angel/, 'superman'],
  [/hyperextension|back extension|lower back curl/, 'back-extension'],
]
// Arms and legs. SHARED hands the name to the shoulder rules above (a clean, a carry); the last
// rule leaves whatever is left for a person, so "press" never turns into an overhead press here.
const SHARED = { shared: true }
const REST = [/./, { review: 'no template matches the name' }]
const curlKind = name => /hammer|neutral|rope|cross body/.test(name) ? 'hammer-curl' : /revers/.test(name) ? 'reverse-curl'
  : /preacher|concentration|spider|chest support|arm blaster/.test(name) ? 'preacher-curl' : 'curl'
const ONE_LEG = 'glute-med, adductors, calves, obliques, quadratus-lumborum'

const ARM_RULES = [
  [/clean|snatch|farmers carry|thruster/, SHARED],
  [/cable rear drive|wall pulse|reverse push up|stalder|hands torsion|tiger tail/, ODD],
  [/handstand push|handstand (shoulder )?press/, 'pike-press'],
  [/^handstand$/, 'handstand-hold'],
  [/climbing monkey bars/, 'climb'],
  [/curl press extension/, ['curl', 'overhead-press', 'overhead-extension']],
  [/curl (to|and) (shoulder )?press|curl to arnold/, e => [curlKind(e.name), 'overhead-press']],
  [/curl with overhead extension/, ['curl', 'overhead-extension']],
  [/lunge|step up/, e => ['lunge', /extension/.test(e.name) ? 'overhead-extension' : curlKind(e.name)]],
  [/curl squat|squatting curl|squat hold/, e => ({ p: curlKind(e.name), add: { stabilizers: 'quads, glute-max, adductor-magnus' } })],
  // Finger and grip work, then the wrist, before the curls: "neutral wrist curl" is a wrist tilt.
  [/fingers? extension|thumb extension|isometric wrist extension/, 'reverse-wrist-curl'],
  [/wrist rol/, 'wrist-roller'],
  [/neutral wrist curl/, 'wrist-tilt'],
  // Behind the back the bar rolls into the fingers and the palms curl up: still the flexors.
  [/(revers|reverse) wrist|wrist reverse|palms down wrist/, 'reverse-wrist-curl'],
  [/wrist curl|back wrist/, 'wrist-curl'],
  [/arm wrestler/, { p: 'curl', add: { synergists: 'wrist-flexors, brachioradialis' } }],
  [/finger curl|hand squeeze|pinch|gripper|fingers press|hand spring/, 'grip'],
  [/handboard|one handed hang/, 'hang'],
  [/zottman/, ['curl', 'reverse-curl']],
  [/inverted chin curl|curl under table|suspen(der|sion).*curl|ring .*curl|biceps clutch/, e => ({ p: curlKind(e.name), add: { stabilizers: PLANK } })],
  [/curls?\b|21s|biceps hold|bicep swing|bent arm iso hold/, e => curlKind(e.name)],
  [/pronation|supination|rotate|rotation/, 'forearm-rotation'],
  [/pull-ups?|\bchin[- ]?ups?\b/, 'pull-up'],
  [/pull ?down/, 'pulldown'],
  [/close grip to skull press/, ['close-press', 'lying-extension']],
  [/tate press|elbow press|face press/, 'lying-extension'],
  [/twisting bench press/, { p: 'close-press', add: { synergists: 'obliques' } }],
  [/jm (bench )?press|close[- ]?grip.*press|close press|pin presses|neutral grip bench press|palms in .*press|hammer press|reverse[- ]grip.*press|reverse close-grip|squeeze bench press|floor press/, 'close-press'],
  [/body-up|lower arms|from plank|triceps press|impossible dips|elbow dips|side push-up|suspen(der|sion) triceps extension|bodyweight .*triceps extension|half triceps extension/, 'body-up'],
  [/push[- ]?up/, 'close-push-up'],
  [/(bench|chair|floor|ball|reverse) dip|dips? (on|between|floor|back)|dip.*(bench|chair|floor|ball)|three bench/, 'bench-dip'],
  [/\bdips?\b/, 'triceps-dip'],
  [/kickback|kick back|bent over .*extension/, 'kickback'],
  [/pushdown|pressdown|push down|high cross|horizontal triceps extension|side triceps|concentration extension/, 'pushdown'],
  [/lying|skull|incline|decline|supine|on floor|across face|on bench|behind head/, 'lying-extension'],
  [/extension|french press/, 'overhead-extension'],
  [/chest throw/, 'chest-pass'],
  REST,
]

const LEG_RULES = [
  [/kneeling hold to stand|kneel(ing)? to stand/, 'lunge'],
  [/farmers walk|carry/, 'carry'],
  [/clean|snatch|thruster|yoke/, SHARED],
  // Calves and shins.
  [/eversion|inversion|foot external rotation|towel foot|balance board|dot drill/, ODD],
  [/toe (side )?walk/, 'calf-raise'],
  [/tibialis|toe raise|dorsi ?flexion|heel walk/, 'tibialis-raise'],
  [/(leg press|sled|hack|lever|bench press machine|smith seated).*calf|calf press/, 'calf-press'],
  [/seated.*calf|calf.*seated/, 'calf-press'],
  [/calf jump|pogo|toe jump|hop\b|hops\b|hopping|lateral speed step|jump down/, e => e.bodyPart === 'lower legs' ? 'hop' : 'jump'],
  [/squat.*calf raise|calf raise.*squat/, ['squat', 'calf-raise']],
  [/calf|calves|plantar flexion/, 'calf-raise'],
  // Two movements in one name.
  [/curl to press|curl and press/, ['squat', 'curl', 'overhead-press']],
  [/pallof/, e => ({ p: /side step/.test(e.name) ? 'side-walk' : 'squat', add: { stabilizers: 'obliques, transverse-abdominis' } })],
  [/(lunge|squat|step up).*(curl|press|raise|\brow)|(curl|press|raise|\brow).*(lunge|squat|step up)/, e => {
    const legs = /lunge|step up|split/.test(e.name) ? 'lunge' : 'squat'
    const arms = /curl/.test(e.name) ? curlKind(e.name) : /upright row/.test(e.name) ? 'upright-row' : /\brow/.test(e.name) ? 'row'
      : /front raise/.test(e.name) ? 'front-raise' : /lateral raise/.test(e.name) ? 'lateral-raise' : /calf raise/.test(e.name) ? 'calf-raise'
      : /press/.test(e.name) && !/leg press/.test(e.name) ? 'overhead-press' : null
    return arms ? [legs, arms] : legs
  }],
  [/(deadlift|\brdl).*\brow/, e => [/stiff|\brdl|romanian/.test(e.name) ? 'hinge' : 'deadlift', 'row']],
  // The hamstrings.
  [/glute[- ]ham raise|nordic|inverse leg curl|assisted prone hamstring|kneeling single hamstring/, 'nordic'],
  [/bridge curl|leg curl.*(ball|towel|floor)|sliding leg curl|(ball|suspension|ring|towel).*leg curl|hamstring runner|platform slide|heel slide|straight hip.*curl/, { p: 'leg-curl', add: { stabilizers: 'glute-max, erector-spinae' } }],
  [/leg curl to reverse hyper/, ['leg-curl', 'reverse-hyper']],
  [/leg curl|legs curl|hamstring curl|femoral|knee flexion|batwing/, 'leg-curl'],
  [/good morning/, 'good-morning'],
  [/single leg (rdl|deadlift|romanian)|one leg(ged)? (stiff leg )?deadlift|single (stiff|leg).*deadlift|single leg landmine rdl|one leg stiff|deadlift pass/, { p: 'hinge', add: { stabilizers: ONE_LEG } }],
  [/romanian|\brdl|stiff|straight leg(s)? deadlift|pull through|hinge/, 'hinge'],
  [/deadlift|rack pull|mid thighs pull/, 'deadlift'],
  [/swing/, 'swing'],
  // The glutes, and the side and inside of the hip.
  [/copenhagen|side plank hip adduction/, { p: 'leg-adduction', add: { stabilizers: 'quadratus-lumborum, glute-med, rectus-abdominis' } }],
  [/adduction|adductor|reduction triangle|side lying feet raise|scissors cross/, 'leg-adduction'],
  [/side walk|lateral walk|band walk|monster walk|resistance band walk|side step|shuttle/, 'side-walk'],
  [/side plank (leg raise|clamshell)|side bridge hip abduction/, { p: 'abduction', add: { stabilizers: 'quadratus-lumborum, rectus-abdominis' } }],
  [/side kick squat/, ['squat', 'abduction']],
  [/side leg kick|abduction|abductor|clam|fire hydrant|side leg raise|side lying leg raise|side kick|knee kick|lying hip leg raise|lying leg raise|lift(ing)? \(on hip\)|side lying scissors|incline side leg raise/, 'abduction'],
  [/hamstring bridge/, { p: 'hip-thrust', add: { target: 'hamstrings' } }],
  [/glute march|single leg thrust/, { p: 'hip-thrust', add: { stabilizers: ONE_LEG } }],
  [/hip thrust|glute bridge|hip bridge|frog pump|\bbridge|hip lift|pelvic lift/, 'hip-thrust'],
  [/front leg kick/, 'hip-flexion'],
  [/leg half circle/, ['glute-kickback', 'abduction']],
  [/kickback|kick back|donkey kick|hip extension|glute kick|rear leg raise|leg kick|rear kick|back kick|side leg to kick|glute press|frog kick|reverse leg extension/, 'glute-kickback'],
  [/reverse hyper/, 'reverse-hyper'],
  [/hyperextension|back extension/, 'glute-hyper'],
  [/knee raise|hip flexion|marching|knee drive|hip flexor|straight leg raise/, 'hip-flexion'],
  [/single leg (raise|lift)|leg lift/, e => e.target === 'glutes' ? 'glute-kickback' : 'hip-flexion'],
  // The quads.
  [/sissy|reverse nordic/, 'sissy-squat'],
  [/leg extension|knee extension/, 'leg-extension'],
  [/wall sit|wall squat hold|sit \(wall\)/, 'wall-sit'],
  [/hack|pendulum|belt squat/, 'hack-squat'],
  [/leg press|sled.*press/, 'leg-press'],
  [/sled|prowler/, 'sled-push'],
  [/split jump|jump lunge|lunge jump|skater/, { p: 'jump', add: { stabilizers: ONE_LEG } }],
  [/jump|bound|burpee|plyo|box drop/, 'jump'],
  [/cossack|side lunge|lateral lunge/, { p: 'lunge', add: { synergists: 'adductors' } }],
  [/pistol|single leg squat|one leg squat/, { p: 'lunge', add: { stabilizers: 'hip-flexors' } }],
  [/lunge|split squat|bulgarian|step[- ]?up|curtsey|curtsy|split stance squat|patrick step|poliquin step|peterson step|step over box|get up/, 'lunge'],
  [/squat|deep knee bend|stand up|duck walk/, 'squat'],
  REST,
]
// The waist. Combinations and odd stances first, then holds, then the moving exercises; a
// crunch with a twist in its name is a twisting crunch, a sit-up with one a sit-up for the obliques.
const HANG = 'lats, lower-trap, wrist-flexors'
const WAIST_RULES = [
  [/^flag$|maltese|slingshot|figure 8|bent press|side kick through|snow angel|stick assisted|potty squat|bend alternating toe touch|abdominal 4 points|toe tap leg lift|under knee tap|crab twist|twist turn lift|uppercut|one arm slam|smith hip raise|half kneeling push pull|legs side pull in|pendulum|side jump twist|side hip|side lean|sideways lifts|bridge \((on knees|straight arm)\)|jack split|reverse flutter kick/, ODD],
  [/suitcase carry/, 'suitcase-carry'],
  [/gorilla chin/, ['pull-up', 'hanging-raise']],
  [/planche/, 'planche-hold'],
  [/front lever/, 'front-lever'],
  [/elbow push up/, 'body-up'],
  [/rotate push up/, { p: 'knee-push-up', add: { synergists: 'obliques' } }],
  [/push[- ]up to side plank/, ['push-up', 'side-plank']],
  [/star push up/, 'push-up'],
  [/push up with knee drive/, ['push-up', 'mountain-climber']],
  [/renegade|plank alternating row|bear plank alternating row/, ['plank', 'row']],
  [/side plank row/, ['side-plank', 'row']],
  [/front plank with kicked leg/, ['plank', 'glute-kickback']],
  [/side plank glute raise/, ['side-plank', 'abduction']],
  [/lateral raise plank|plank lateral raise/, ['plank', 'lateral-raise']],
  [/bird dog plank/, ['plank', 'bird-dog']],
  [/bird dog/, 'bird-dog'],
  [/front to side plank/, ['plank', 'side-plank']],
  [/pallof press with glute bridge/, { p: 'pallof', add: { stabilizers: 'hamstrings' } }],
  [/adductor pallof/, { p: 'pallof', add: { stabilizers: 'adductors' } }],
  [/pallof|anti rotation|push pull/, 'pallof'],
  [/hyperextension twist|twisting hyperextension/, { p: 'back-extension', add: { synergists: 'obliques' } }],
  [/twist superman/, { p: 'superman', add: { synergists: 'obliques' } }],
  [/superman/, 'superman'],
  [/lunge with twist/, ['lunge', 'chop']],
  [/squat twist|wood ?chop squat/, ['squat', 'chop']],
  [/front raise twist/, ['chop', 'front-raise']],
  [/windmill/, e => /hanging/.test(e.name) ? { p: 'hanging-raise', add: { target: 'obliques' } } : 'windmill'],
  // Holds and planks.
  [/reverse plank|supine plank|chinese plank/, 'reverse-plank'],
  [/leg bench side bridge/, { p: 'side-plank', add: { stabilizers: 'adductors' } }],
  [/side plank leg lift|side plank (bent leg lift|with raised leg)/, { p: 'side-plank', add: { synergists: 'glute-med' } }],
  [/side plank|side bridge|star plank|side floor tap|side plank twist/, 'side-plank'],
  [/body saw|rollout|rollerout|fallout|inchworm|walkout/, e => /oblique/.test(e.name) ? { p: 'rollout', add: { target: 'obliques' } } : 'rollout'],
  [/mountain climber|spider plank|leg lift to chest|plank knee tap/, 'mountain-climber'],
  [/plank pike|jack ?knife on ball|pull-in|butt-ups|suspension (jackknife|trainer pike)|suspension jackknife pike|suspen(sion|der|ded).*(crunch|jackknife)|roller reverse crunch/,
    e => /twist/.test(e.name) ? { p: 'jackknife', add: { target: 'obliques' } } : 'jackknife'],
  [/plank with arm|plank arm|plank with leg|arm leg raise|arm raise|single arm pulldown/, { p: 'plank', add: { stabilizers: 'glute-med, side-delt' } }],
  [/plank|shoulder tap|wall press heel/, e => /wall press/.test(e.name) ? 'dead-bug' : 'plank'],
  [/dragon flag/, 'dragon-flag'],
  [/hanging hollow/, { p: 'hollow', add: { stabilizers: HANG } }],
  [/hanging l sit/, { p: 'l-sit', add: { stabilizers: HANG } }],
  [/\bl[- ]sit|v-sit on floor/, 'l-sit'],
  [/hollow|dish hold|6 inch hold|crunch hold|raise and hold|v up hold|lean back on a chair/, 'hollow'],
  [/vacuum|draw in|breathing/, 'vacuum'],
  [/dead ?bug/, e => /pullover/.test(e.name) ? { p: 'dead-bug', add: { synergists: 'lats' } } : 'dead-bug'],
  [/lying straight leg marches|lying toe tap/, 'dead-bug'],
  // Hanging or on a captain's chair.
  [/hanging oblique|hanging .*twisting|hanging knee circle|twisted leg raise/, { p: 'hanging-raise', add: { target: 'obliques' } }],
  [/hanging|captain|stall bar|parallel bars|arm slingers|assisted hanging/, 'hanging-raise'],
  // Turning.
  [/sit[- ]?up and russian twist|russian twist sit up|russian twist close grip/, ['sit-up', 'twist']],
  [/military press russian twist/, { p: 'twist', add: { stabilizers: 'front-delt, triceps' } }],
  [/twisting crunch|leg raise crunch/, e => /twisting/.test(e.name) ? 'twist-crunch' : /side/.test(e.name) ? 'side-crunch' : 'v-up'],
  [/wipers?\b|lying twist|leg raise to side|leg hip side raise|bent knee lying twist|prone twist|lever twist|lying woodchop/, 'wiper'],
  [/chop|lift and chop|thor lift|standing lift|judo flip|sledge hammer|spell caster|rotational throw|landmine|side swing|torso twist|torso rotation|trunk rotation|standing twist|band twist|cable twist|up down twist|down up|twist \((down|up)|band down to up|suspen.*twist|kneeling twist/, 'chop'],
  [/twist sit|twisting sit|cross twisting sit|straight arm twisting sit|elbow to knee sit/, { p: 'sit-up', add: { target: 'obliques' } }],
  [/russian twist|seated twist|seated cross arm twist|oblique twist|glute ham twist|cross punch|twist on floor/, 'twist'],
  // Bending sideways.
  [/side bend|side bent|side reach/, 'side-bend'],
  [/oblique v up|side crunch|side sit up|side stretch crunch|heel touch|oblique crunch|leg raise oblique|side to side leg raise/, 'side-crunch'],
  // Curling up, the legs or both.
  [/bicycle|air bike|air cycles|twisting crunch|twist crunch|cross body|opposite crunch|opposite knee|elbow[- ]to[- ]knee|knee to elbow|knees to elbows|standing air bike|cross standing crunch|tuck twisting/, 'twist-crunch'],
  [/flutter|scissor|criss cross|leg cross|figure eight|reverse air cycling|alternate leg raise|alternating (straight )?leg raise|seated leg raise|sitting floor leg raise|sitted alternate|leg raise on floor/, e => /military|press/.test(e.name) ? { p: 'flutter', add: { stabilizers: 'front-delt, triceps' } } : 'flutter'],
  [/v[- ]?up|v crunch|jack ?knife|tuck|frog (crunch|sit)|crunchy frog|cocoons|starfish|sprinter|roll overs|8 leg|in out|leg extension crunch|total abdominal|toe tap$|leg raise crunch|alternate crunch|toes? to bar/, 'v-up'],
  [/reverse crunch|hip raise|hip lift|knee raise|bent legs? raise|bent knee raise|leg pull in|bottoms-up|pulse up|ab swing|ab coaster|hip crunch|leg and hip raise|leg-hip raise|leg hip raise/, 'reverse-crunch'],
  [/leg raise/, 'leg-raise'],
  [/press sit[- ]?up|sit[- ]?up press|shoulder press sit/, { p: 'sit-up', add: { synergists: 'front-delt, triceps' } }],
  [/sit[- ]?up|sit up|otis/, 'sit-up'],
  [/crunch|curl-up|ab press|toe touch|roll up/, e => /leg (raise|lift)|leg up/.test(e.name) ? { p: 'crunch', add: { synergists: 'hip-flexors' } } : 'crunch'],
  REST,
]
const BODY_RULES = { chest: CHEST_RULES, back: BACK_RULES, 'upper arms': ARM_RULES, 'lower arms': ARM_RULES, 'upper legs': LEG_RULES, 'lower legs': LEG_RULES, waist: WAIST_RULES }

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
  if (/lying|prone|supine|chest support|with support|bench supported|support head|face down|side lying|incline|decline|on floor|\bbench\b|floor (press|fly|chest)|on rack|pec deck|(press|row|fly).*\bmachine\b/.test(name)) return 'supported'
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
  // Pressing or flying standing, the trunk braces against the push.
  press: { standing: 'rectus-abdominis, obliques, erector-spinae, glute-max', kneeling: 'rectus-abdominis, obliques, erector-spinae, glute-max' },
  // A row or pulldown sitting upright still needs the back held straight.
  row: { standing: 'erector-spinae, glute-max', kneeling: 'erector-spinae, glute-max, obliques', seated: 'erector-spinae' },
}

export function rolesFor(e) {
  const name = e.name
  const own = (BODY_RULES[e.bodyPart] || []).find(([r]) => r.test(name))
  const rule = own && !own[1].shared ? own : (() => {
    const skip = REVIEW.find(([r]) => r.test(name))
    return skip ? [null, { review: skip[1] }] : RULES.find(([r]) => r.test(name))
  })()
  if (!rule) return { review: 'no template matches the name' }
  let got = typeof rule[1] === 'function' ? rule[1](e) : rule[1]
  if (got.review) return { review: got.review }
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
  if (/twisting|twist row|with twist|with rotation|rotational push|kneeling rotational|twist push/.test(name)) r.add('synergists', 'obliques')
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
  biceps: 'biceps', triceps: 'triceps', 'glute-max': 'glutes', quads: 'quads', 'adductor-magnus': 'adductors, hamstrings',
  'pec-major-sternal': 'pectorals', 'pec-major-clavicular': 'pectorals', 'serratus-anterior': 'serratus anterior',
  'erector-spinae': 'spine', 'teres-major': 'lats',
  hamstrings: 'hamstrings', 'glute-med': 'abductors, glutes', adductors: 'adductors', calves: 'calves', 'tibialis-anterior': 'calves',
  brachialis: 'biceps', brachioradialis: 'forearms, biceps', 'triceps-long-head': 'triceps', 'wrist-flexors': 'forearms', 'wrist-extensors': 'forearms',
  'hip-flexors': 'abs, quads', 'rectus-abdominis': 'abs', obliques: 'abs', 'transverse-abdominis': 'abs', 'quadratus-lumborum': 'spine',
}
