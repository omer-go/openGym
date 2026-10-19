// What variation of a movement an exercise is: its bench angle and its tool. The one-tap
// workouts (lib/coverage.js) rotate these, so a flat barbell bench is followed by an incline or
// a decline, on dumbbells or the smith machine, rather than the same bench every week.
//
// The catalogue has no angle field, so it is read from the name; the tool is the catalogue's
// equipment folded into families, so an EZ bar counts as a barbell and a sled as a machine.

const TOOL = {
  barbell: 'barbell', 'ez barbell': 'barbell', 'olympic barbell': 'barbell', 'trap bar': 'barbell',
  dumbbell: 'dumbbell', 'smith machine': 'smith', cable: 'cable',
  'leverage machine': 'machine', 'sled machine': 'machine',
  'body weight': 'bodyweight', weighted: 'bodyweight', assisted: 'bodyweight',
  kettlebell: 'kettlebell', band: 'band', 'resistance band': 'band',
}

/** { angle: 'incline' | 'decline' | 'flat', tool: 'barbell' | 'dumbbell' | … | 'other' } */
export function variantOf(ex) {
  const n = String(ex?.n || '').toLowerCase()
  const angle = /\bincline\b/.test(n) ? 'incline' : /\bdecline\b/.test(n) ? 'decline' : 'flat'
  return { angle, tool: TOOL[ex?.eq] || 'other' }
}
