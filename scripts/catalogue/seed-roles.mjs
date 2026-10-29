#!/usr/bin/env node
// Seeds "muscleRoles" from the templates in roles/patterns.mjs:
//
//   node scripts/catalogue/seed-roles.mjs            write roles into the exercises in scope below
//   node scripts/catalogue/seed-roles.mjs --dry      only print what it would do
//   node scripts/catalogue/seed-roles.mjs --since <git ref>
//                                                    also rewrite roles the templates at <ref> gave
//
// An exercise that already has "muscleRoles" is never touched: once a person has edited one, the
// templates have no say over it. After a template is corrected, --since passes the correction on
// to the exercises whose roles are still exactly what the old templates wrote. Prints the names it left for a person, and the ones worth a look
// (combinations, or a template whose target is not the exercise's own).
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rolesFor, TARGET_OF } from './roles/patterns.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DIR = path.join(ROOT, 'catalogue/exercises')
const dry = process.argv.includes('--dry')
const since = process.argv[process.argv.indexOf('--since') + 1]

// The templates as they were at <ref>, loaded beside the current ones so their imports resolve.
let oldRolesFor = null
if (process.argv.includes('--since')) {
  const tmp = path.join(path.dirname(fileURLToPath(import.meta.url)), 'roles', `.patterns-${process.pid}.mjs`)
  fs.writeFileSync(tmp, execFileSync('git', ['show', `${since}:scripts/catalogue/roles/patterns.mjs`], { cwd: ROOT }))
  try { oldRolesFor = (await import(tmp)).rolesFor } finally { fs.unlinkSync(tmp) }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// Exercises that are lifted, not stretched: the shoulders (the pilot), then the chest, back, arms,
// legs and waist, where jumping and throwing work (plyometrics) is a push-up, a press or a squat too,
// and the whole-body lifts. Neck work has its own templates still to write; a press or a pulldown
// behind the neck is not neck work.
const LIFTED = ['strength', 'calisthenics', 'olympic', 'isometric', 'rehab']
const inScope = e => !e.variantOf && !/(?<!behind )\bneck\b/.test(e.name) && (
  ((e.bodyPart === 'shoulders' || ['delts', 'traps'].includes(e.target)) && LIFTED.includes(e.category)) ||
  (['chest', 'back', 'upper arms', 'lower arms', 'upper legs', 'lower legs', 'waist', 'full body'].includes(e.bodyPart) && [...LIFTED, 'plyometrics'].includes(e.category)))

const review = [], look = []
let written = 0, kept = 0, reseeded = 0
for (const f of fs.readdirSync(DIR).sort()) {
  const p = path.join(DIR, f)
  const e = JSON.parse(fs.readFileSync(p, 'utf8'))
  if (!inScope(e)) continue
  if (e.muscleRoles) {
    const was = oldRolesFor?.(e)
    if (!was?.roles || !same(was.roles, e.muscleRoles)) { kept++; continue }
    const got = rolesFor(e)
    if (got.roles && !same(got.roles, e.muscleRoles)) {
      reseeded++
      if (!dry) fs.writeFileSync(p, JSON.stringify({ ...e, muscleRoles: got.roles }, null, 2) + '\n')
    }
    continue
  }
  const got = rolesFor(e)
  if (got.review) { review.push(`${e.id}  ${e.name}  (${got.review})`); continue }
  const off = !got.roles.target.some(m => (TARGET_OF[m] || '').split(', ').includes(e.target))
  if (got.combined || off) look.push(`${e.id}  ${e.name}  [${got.patterns.join(' + ')}]${off ? `  target "${e.target}" vs ${got.roles.target.join(', ')}` : ''}`)
  written++
  if (!dry) fs.writeFileSync(p, JSON.stringify({ ...e, muscleRoles: got.roles }, null, 2) + '\n')
}
console.log(`${dry ? 'would write' : 'wrote'} ${written}, kept ${kept} already edited, ${review.length} left for a person`)
if (oldRolesFor) console.log(`${dry ? 'would rewrite' : 'rewrote'} ${reseeded} the templates at ${since} gave`)
if (review.length) console.log('\nLeft for a person:\n  ' + review.join('\n  '))
if (look.length) console.log('\nWorth a look:\n  ' + look.join('\n  '))
