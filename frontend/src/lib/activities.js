// Cardio and stretching: the two kinds of work that are timed by a stopwatch rather than counted
// in reps or held against a countdown. You start it, do the run or the stretch, and stop it when
// you are done; what it measured is the set.
//
// They also have their own groups in the workout's Add exercise sheet (lib/add-exercise.js),
// beside the muscle groups, since neither is "a chest exercise": a run trains the heart, and a
// stretch is filed under the muscle it lengthens but is not what you want under Chest.
// Each group splits into areas the way a muscle group splits into muscles.
import { EXIDX, isCardio } from './exercises.js'
import { modeOf } from './history.js'

export const isStretch = idOrEx => (typeof idOrEx === 'string' ? EXIDX[idOrEx] : idOrEx)?.cat === 'stretching'

// The cardio area an exercise belongs to, from its name and equipment. The catalogue files a
// treadmill run under "stationary bike", so the name decides before the equipment does.
export function cardioAreaOf(ex) {
  const n = (ex?.n || '').toLowerCase()
  if (/treadmill/.test(n)) return /walk/.test(n) ? 'walking' : 'running'
  if (/\bbike\b|bicycle|aquabike|elliptical|rowing|stepper|stepmill|cross trainer|wave machine/.test(n) || /bike|machine/.test(ex?.eq || '')) return 'machines'
  if (/\brun|running|\bjog|sprint|trot/.test(n)) return 'running'
  if (/\bwalk|march/.test(n)) return 'walking'
  return 'other'
}
// The stretching area: where on the body, from the catalogue's body part.
const STRETCH_AREA = {
  'upper legs': 'legs', 'lower legs': 'legs',
  back: 'back', waist: 'back',
  chest: 'upper', shoulders: 'upper', 'upper arms': 'upper', 'lower arms': 'upper', neck: 'upper',
}
// The catalogue has a single full-body stretch; it goes with the trunk.
export const stretchAreaOf = ex => STRETCH_AREA[ex?.bp] || 'back'

// English names are i18n keys where shown. `staples` lead an area's Suggested list (after what
// you have logged): the plain versions most people mean, before the drills.
export const ACTIVITY_GROUPS = [
  {
    id: 'cardio', n: 'Cardio', icon: 'heart', of: ex => (isCardio(ex) ? cardioAreaOf(ex) : null),
    areas: [
      { id: 'running', n: 'Running', icon: 'figureRun', staples: ['0685', '2197', '5216', '4004', '10677'] },
      { id: 'walking', n: 'Walking', icon: 'steps', staples: ['2258', '2259', '3666', '3004'] },
      { id: 'machines', n: 'Bike & machines', icon: 'bike', staples: ['5214', '1161', '2192', '2311', '0938'] },
      { id: 'other', n: 'Other', icon: 'bolt', staples: ['2612', '3094', '1160', '3380'] },
    ],
  },
  {
    id: 'stretching', n: 'Stretching', icon: 'stretch', of: ex => (isStretch(ex) ? stretchAreaOf(ex) : null),
    areas: [
      { id: 'legs', n: 'Legs & hips', icon: 'legs', staples: ['1511', '4300', '1053', '1377', '6761', '1424'] },
      { id: 'back', n: 'Back & core', icon: 'abs', staples: ['0945', '1051', '3243', '1346', '4307'] },
      { id: 'upper', n: 'Upper body', icon: 'arm', staples: ['1980', '0817', '1271', '0462', '1850'] },
    ],
  },
]
export const activityGroup = id => ACTIVITY_GROUPS.find(g => g.id === id) || null
/** The activity group and area of an exercise: { group, area }, or null for anything else. */
export function activityOf(ex) {
  for (const g of ACTIVITY_GROUPS) { const area = ex && g.of(ex); if (area) return { group: g.id, area } }
  return null
}

/** True when the sets of this entry are timed with the stopwatch: cardio, and stretches held for time. */
export function usesStopwatch(cfg) {
  const m = modeOf(cfg)
  return m === 'cardio' || (m === 'time' && isStretch(cfg?.id))
}

// What the stopwatch writes to a cardio row: its minutes, exactly — 1:29 is 1.4833, not a
// rounded 1 — so the row reads back the time it measured (history.js fmtMin shows it as 1:29).
export const cardioMinutes = sec => Math.round(Math.max(0, Number(sec) || 0) / 60 * 1e4) / 1e4

/** Writes `sec` measured by the stopwatch into a set of the given mode (in place). */
export function logElapsed(set, sec, mode) {
  if (mode === 'cardio') set.min = cardioMinutes(sec)
  else set.sec = sec
  return set
}
