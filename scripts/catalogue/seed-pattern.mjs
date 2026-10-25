#!/usr/bin/env node
// Seeds "pattern" (the movement: squat, hinge, lunge, a push or a pull, a carry, core work, or an
// isolation lift) from the templates in roles/patterns.mjs:
//
//   node scripts/catalogue/seed-pattern.mjs         write "pattern" into the lifted exercises
//   node scripts/catalogue/seed-pattern.mjs --dry   only print what it would do
//
// An exercise that already has "pattern" is never touched: once a person has set it, the
// templates have no say over it. Prints the names no template matches, left for a person.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rolesFor } from './roles/patterns.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DIR = path.join(ROOT, 'catalogue/exercises')
const dry = process.argv.includes('--dry')

// Each template's movement. A template not named here is an isolation lift: one joint, one group.
const MOVEMENT = {
  squat: 'squat, leg-press, hack-squat, sissy-squat, wall-sit, jump, thruster',
  lunge: 'lunge',
  hinge: 'deadlift, hinge, good-morning, hip-thrust, swing, back-extension, reverse-hyper, glute-hyper, ' +
    'clean, snatch, bell-clean, bell-snatch, muscle-clean, muscle-snatch, power-shrug',
  'push-horizontal': 'bench-press, incline-press, decline-press, close-press, squeeze-press, push-up, ' +
    'feet-up-push-up, close-push-up, knee-push-up, planche-press, planche-hold, chest-pass',
  'push-vertical': 'overhead-press, angled-press, push-press, pike-press, handstand-hold, dip, bench-dip, triceps-dip',
  'pull-horizontal': 'row, wide-row, lat-row, rear-delt-row, face-pull, front-lever',
  'pull-vertical': 'pulldown, pull-up, muscle-up, climb, upright-row, high-pull',
  carry: 'carry, overhead-carry, suitcase-carry, yoke, sled-push',
  core: 'crunch, twist-crunch, side-crunch, sit-up, reverse-crunch, leg-raise, flutter, v-up, hanging-raise, ' +
    'jackknife, mountain-climber, plank, side-plank, reverse-plank, hollow, dead-bug, bird-dog, rollout, ' +
    'dragon-flag, l-sit, twist, wiper, chop, pallof, side-bend, windmill, vacuum, superman',
}
const OF = new Map(Object.entries(MOVEMENT).flatMap(([m, ps]) => ps.split(', ').map(p => [p, m])))
export const movementOf = template => OF.get(template) || 'isolation'

// For a name no template takes (a template is about the muscles too): the plain words of a
// movement, first match wins.
const BY_NAME = [
  [/\bneck\b/, 'isolation'],
  [/push[- ]?ups?\b/, 'push-horizontal'],
  [/\blunges?\b/, 'lunge'],
  [/\bswing\b/, 'hinge'],
  [/\bsquat\b/, 'squat'],
  [/mountain climber|\bplank\b|flutter|crunch|\bsit[- ]?ups?\b|\bv[- ]?up\b|leg raise/, 'core'],
]

// A combination (a lunge with a curl, a squat to a press) is the movement of its first compound
// part; all isolation or core work, its first part.
export function patternFor(e) {
  const got = rolesFor(e)
  if (got.review) {
    const hit = BY_NAME.find(([r]) => r.test(e.name))
    return hit ? { pattern: hit[1] } : got
  }
  const ms = got.patterns.map(movementOf)
  return { pattern: ms.find(m => m !== 'isolation' && m !== 'core') || ms[0] }
}

// Lifted work only: a stretch, a pose or cardio has no movement pattern to balance.
const LIFTED = ['strength', 'calisthenics', 'olympic', 'isometric', 'rehab', 'plyometrics']

// "pattern" goes after "category" (and "unilateral"), where a reader looks for what kind of
// exercise it is.
function withPattern(e, pattern) {
  const at = 'unilateral' in e ? 'unilateral' : 'category'
  if (!(at in e)) return { ...e, pattern }
  return Object.fromEntries(Object.entries(e).flatMap(([k, v]) => (k === at ? [[k, v], ['pattern', pattern]] : [[k, v]])))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const review = [], count = {}
  let written = 0, kept = 0
  for (const f of fs.readdirSync(DIR).sort()) {
    const p = path.join(DIR, f)
    const e = JSON.parse(fs.readFileSync(p, 'utf8'))
    if (e.variantOf || !LIFTED.includes(e.category)) continue
    if ('pattern' in e) { kept++; continue }
    const got = patternFor(e)
    if (got.review) { review.push(`${e.id}  ${e.name}  (${got.review})`); continue }
    count[got.pattern] = (count[got.pattern] || 0) + 1
    written++
    if (!dry) fs.writeFileSync(p, JSON.stringify(withPattern(e, got.pattern), null, 2) + '\n')
  }
  console.log(`${dry ? 'would write' : 'wrote'} ${written}, kept ${kept} already set, ${review.length} left for a person`)
  console.log(Object.entries(count).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', '))
  if (review.length) console.log('\nLeft for a person:\n  ' + review.join('\n  '))
}
