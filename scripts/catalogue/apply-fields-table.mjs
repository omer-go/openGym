#!/usr/bin/env node
// Writes a hand-made table of exercise fields into the catalogue:
//
//   node scripts/catalogue/apply-fields-table.mjs scripts/catalogue/roles/moves.tsv
//   node scripts/catalogue/apply-fields-table.mjs <table> --dry      only print what it would change
//
// The table is tab-separated with a header row and an "id" column. Each of these columns is
// optional, and a table carries only the ones it decides:
//
//   new move                one of MOVES in validate.mjs
//   new pattern             one of PATTERNS
//   new unilateral          true or false
//   new catalogue target    one of TARGETS (the exercise's "target", not its muscle roles)
//   new secondary muscles   SECONDARY words separated by commas
//
// An empty cell leaves the field as it is, and "-" removes it (the secondary muscles are a list,
// so "-" empties it). The other columns are there for the person who reads the table: the
// exercise's text and why each field was decided the way it was. Run validate.mjs and build.mjs
// afterwards.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { KEYS, MOVES, PATTERNS, TARGETS, SECONDARY } from './validate.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DIR = path.join(ROOT, 'catalogue/exercises')
const file = process.argv[2]
const dry = process.argv.includes('--dry')
if (!file) { console.error('usage: apply-fields-table.mjs <table.tsv> [--dry]'); process.exit(1) }

const [head, ...lines] = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => l.split('\t'))
const ID = head.indexOf('id')
if (ID < 0) { console.error(`${file}: no "id" column`); process.exit(1) }
const fail = (id, msg) => { console.error(`${id}: ${msg}`); process.exit(1) }
const list = cell => cell.split(',').map(s => s.trim()).filter(Boolean)

// Each column: the field it writes, and how a cell turns into that field's value.
const FIELDS = [
  ['new move', 'move', (v, id) => MOVES.includes(v) ? v : fail(id, `"${v}" is not one of MOVES`)],
  ['new pattern', 'pattern', (v, id) => PATTERNS.includes(v) ? v : fail(id, `"${v}" is not one of PATTERNS`)],
  ['new unilateral', 'unilateral', (v, id) => v === 'true' ? true : v === 'false' ? false : fail(id, `unilateral "${v}" is not true or false`)],
  ['new catalogue target', 'target', (v, id) => TARGETS.includes(v) ? v : fail(id, `"${v}" is not one of TARGETS`)],
  ['new secondary muscles', 'secondaryMuscles', (v, id) => {
    const out = list(v)
    const bad = out.find(m => !SECONDARY.includes(m))
    return bad ? fail(id, `"${bad}" is not one of SECONDARY`) : out
  }],
].map(([name, key, parse]) => ({ i: head.indexOf(name), key, parse })).filter(c => c.i >= 0)
if (!FIELDS.length) { console.error(`${file}: none of the "new ..." columns`); process.exit(1) }

let changed = 0
for (const row of lines) {
  const id = row[ID]
  const p = path.join(DIR, `${id}.json`)
  const e = JSON.parse(fs.readFileSync(p, 'utf8'))
  const next = { ...e }
  for (const { i, key, parse } of FIELDS) {
    const cell = (row[i] || '').trim()
    if (!cell) continue
    if (cell === '-') { if (key === 'secondaryMuscles') next[key] = []; else delete next[key] }
    else next[key] = parse(cell, id)
  }
  // Rebuilt in the catalogue's key order, so a new field lands where a person would put it.
  const out = {}
  for (const k of KEYS) if (k in next) out[k] = next[k]
  // A row that changes no field leaves its file alone, even where the keys are out of order.
  const diff = FIELDS.map(f => f.key).filter(k => JSON.stringify(e[k]) !== JSON.stringify(out[k]))
  if (!diff.length) continue
  changed++
  console.log(`${id} ${e.name}: ${diff.map(k => `${k} ${JSON.stringify(e[k] ?? '-')} -> ${JSON.stringify(out[k] ?? '-')}`).join(', ')}`)
  if (!dry) fs.writeFileSync(p, JSON.stringify(out, null, 2) + '\n')
}
console.log(`${changed} of ${lines.length} ${dry ? 'would change' : 'changed'}`)
