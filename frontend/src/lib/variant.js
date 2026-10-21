// What variation of a movement an exercise is: its tool and its position. The one-tap workouts
// (lib/coverage.js) rotate these, so a barbell curl is followed by one on dumbbells or a cable,
// and a standing curl by a seated or an incline one, rather than the same curl every week.
//
// The catalogue has no position field, so it is read from the name: the bench angle (incline,
// decline) first, then how the body is placed; 'plain' when the name says neither, as a flat
// bench press or a squat. The tool is the catalogue's
// equipment folded into families, so an EZ bar counts as a barbell and a sled as a machine.

const TOOL = {
  barbell: 'barbell', 'ez barbell': 'barbell', 'olympic barbell': 'barbell', 'trap bar': 'barbell',
  dumbbell: 'dumbbell', 'smith machine': 'smith', cable: 'cable',
  'leverage machine': 'machine', 'sled machine': 'machine',
  'body weight': 'bodyweight', weighted: 'bodyweight', assisted: 'bodyweight',
  kettlebell: 'kettlebell', band: 'band', 'resistance band': 'band',
}

// Name words -> position, the first that matches wins: an incline bench lying row is incline.
const POSITION = [
  ['incline', /\bincline\b/], ['decline', /\bdecline\b/], ['hanging', /\bhanging\b/],
  ['kneeling', /\bkneeling\b/], ['seated', /\b(seated|sitting)\b/], ['lying', /\b(lying|prone|supine)\b/],
  ['bent-over', /\bbent[ -]over\b/], ['standing', /\bstanding\b/],
]

/** { tool: 'barbell' | 'dumbbell' | … | 'other', position: 'incline' | 'seated' | … | 'plain' } */
export function variantOf(ex) {
  const n = String(ex?.n || '').toLowerCase()
  const position = POSITION.find(([, re]) => re.test(n))?.[0] || 'plain'
  return { tool: TOOL[ex?.eq] || 'other', position }
}
