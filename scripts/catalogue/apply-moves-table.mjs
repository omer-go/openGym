#!/usr/bin/env node
// Writes a hand-made table of movements into the catalogue:
//
//   node scripts/catalogue/apply-moves-table.mjs scripts/catalogue/roles/moves.tsv
//   node scripts/catalogue/apply-moves-table.mjs <table> --dry      only print what it would change
//
// The table is tab-separated with a header row. It needs the columns "id" and "new move" (one of
// MOVES in validate.mjs); the other columns are there for the person who reads it: the exercise's
// text, the move the name rules gave it and why it was decided the way it was. The app reads the
// names for a movement and takes this field first, so it is only needed where the name says too
// little. Run validate.mjs and build.mjs afterwards.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MOVES } from './validate.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DIR = path.join(ROOT, 'catalogue/exercises')
const file = process.argv[2]
const dry = process.argv.includes('--dry')
if (!file) { console.error('usage: apply-moves-table.mjs <table.tsv> [--dry]'); process.exit(1) }

const [head, ...lines] = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => l.split('\t'))
const col = name => {
  const i = head.indexOf(name)
  if (i < 0) { console.error(`${file}: no "${name}" column`); process.exit(1) }
  return i
}
const [ID, MOVE] = [col('id'), col('new move')]

let changed = 0
for (const row of lines) {
  const p = path.join(DIR, `${row[ID]}.json`)
  const e = JSON.parse(fs.readFileSync(p, 'utf8'))
  const move = row[MOVE].trim()
  if (!MOVES.includes(move)) { console.error(`${row[ID]}: "${move}" is not one of MOVES`); process.exit(1) }
  if (e.move === move) continue
  changed++
  console.log(`${row[ID]} ${e.name}: ${e.move || '-'} -> ${move}`)
  // Placed in the catalogue's key order, after the pattern (or the category when there is none).
  const out = {}
  const after = 'pattern' in e ? 'pattern' : 'category'
  for (const [k, v] of Object.entries(e)) {
    if (k === 'move') continue
    out[k] = v
    if (k === after) out.move = move
  }
  if (!('move' in out)) out.move = move
  if (!dry) fs.writeFileSync(p, JSON.stringify(out, null, 2) + '\n')
}
console.log(`${changed} of ${lines.length} ${dry ? 'would change' : 'changed'}`)
