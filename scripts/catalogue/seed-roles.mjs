#!/usr/bin/env node
// Seeds "muscleRoles" from the templates in roles/patterns.mjs:
//
//   node scripts/catalogue/seed-roles.mjs            write roles into the shoulder, chest and back exercises
//   node scripts/catalogue/seed-roles.mjs --dry      only print what it would do
//
// An exercise that already has "muscleRoles" is never touched: once a person has edited one, the
// templates have no say over it. Prints the names it left for a person, and the ones worth a look
// (combinations, or a template whose target is not the exercise's own).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rolesFor, TARGET_OF } from './roles/patterns.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DIR = path.join(ROOT, 'catalogue/exercises')
const dry = process.argv.includes('--dry')

// Exercises that are lifted, not stretched: the shoulders (the pilot), then the chest and back,
// where jumping and throwing work (plyometrics) is a push-up or a press too. Neck work has its
// own templates still to write.
const LIFTED = ['strength', 'calisthenics', 'olympic', 'isometric', 'rehab']
const inScope = e => !e.variantOf && !/\bneck\b/.test(e.name) && (
  ((e.bodyPart === 'shoulders' || ['delts', 'traps'].includes(e.target)) && LIFTED.includes(e.category)) ||
  (['chest', 'back'].includes(e.bodyPart) && [...LIFTED, 'plyometrics'].includes(e.category)))

const review = [], look = []
let written = 0, kept = 0
for (const f of fs.readdirSync(DIR).sort()) {
  const p = path.join(DIR, f)
  const e = JSON.parse(fs.readFileSync(p, 'utf8'))
  if (!inScope(e)) continue
  if (e.muscleRoles) { kept++; continue }
  const got = rolesFor(e)
  if (got.review) { review.push(`${e.id}  ${e.name}  (${got.review})`); continue }
  const off = !got.roles.target.some(m => (TARGET_OF[m] || '').split(', ').includes(e.target))
  if (got.combined || off) look.push(`${e.id}  ${e.name}  [${got.patterns.join(' + ')}]${off ? `  target "${e.target}" vs ${got.roles.target.join(', ')}` : ''}`)
  written++
  if (!dry) fs.writeFileSync(p, JSON.stringify({ ...e, muscleRoles: got.roles }, null, 2) + '\n')
}
console.log(`${dry ? 'would write' : 'wrote'} ${written}, kept ${kept} already edited, ${review.length} left for a person`)
if (review.length) console.log('\nLeft for a person:\n  ' + review.join('\n  '))
if (look.length) console.log('\nWorth a look:\n  ' + look.join('\n  '))
