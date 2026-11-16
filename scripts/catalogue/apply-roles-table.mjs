#!/usr/bin/env node
// Writes a hand-made table of roles into the catalogue:
//
//   node scripts/catalogue/apply-roles-table.mjs scripts/catalogue/roles/biceps-heads.tsv
//   node scripts/catalogue/apply-roles-table.mjs <table> --dry      only print what it would change
//
// The table is tab-separated with a header row. It needs the columns "id", "new target" and
// "new synergists" (muscles separated by commas); the other columns are there for the person who
// reads it: the exercise's text, its old roles and why each one was decided the way it was. Only
// the target and the helpers change: the muscles that hold steady stay as they are. Run
// validate.mjs and build.mjs afterwards.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DIR = path.join(ROOT, 'catalogue/exercises')
const file = process.argv[2]
const dry = process.argv.includes('--dry')
if (!file) { console.error('usage: apply-roles-table.mjs <table.tsv> [--dry]'); process.exit(1) }

const [head, ...lines] = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => l.split('\t'))
const col = name => {
  const i = head.indexOf(name)
  if (i < 0) { console.error(`${file}: no "${name}" column`); process.exit(1) }
  return i
}
const [ID, TARGET, HELPERS] = [col('id'), col('new target'), col('new synergists')]
const muscles = cell => (cell || '').split(',').map(s => s.trim()).filter(Boolean)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

let changed = 0
for (const row of lines) {
  const p = path.join(DIR, `${row[ID]}.json`)
  const e = JSON.parse(fs.readFileSync(p, 'utf8'))
  const { target: _t, synergists: _s, ...rest } = e.muscleRoles || {}
  const target = muscles(row[TARGET]), synergists = muscles(row[HELPERS])
  if (!target.length) { console.error(`${row[ID]}: the table gives no target`); process.exit(1) }
  // Rebuilt in the catalogue's key order: target and helpers first, the steady muscles after.
  const roles = { target, ...(synergists.length ? { synergists } : {}), ...rest }
  if (same(roles, e.muscleRoles)) continue
  changed++
  console.log(`${row[ID]} ${e.name}: ${e.muscleRoles?.target} -> ${target}`)
  if (!dry) fs.writeFileSync(p, JSON.stringify({ ...e, muscleRoles: roles }, null, 2) + '\n')
}
console.log(`${changed} of ${lines.length} ${dry ? 'would change' : 'changed'}`)
