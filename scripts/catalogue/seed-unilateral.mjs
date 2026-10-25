#!/usr/bin/env node
// Seeds "unilateral" (one arm or one leg at a time) from the exercise's name:
//
//   node scripts/catalogue/seed-unilateral.mjs         write "unilateral": true where the name says so
//   node scripts/catalogue/seed-unilateral.mjs --dry   only print what it would do
//
// An exercise that already has "unilateral" (true or false) is never touched: once a person has
// set it, the name rule has no say over it. Set "unilateral": false to overrule a wrong match.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DIR = path.join(ROOT, 'catalogue/exercises')
const dry = process.argv.includes('--dry')

// One limb at a time: "one arm", "single leg", "unilateral", and the lifts that are one-legged by
// nature (lunges, split squats, step-ups, pistols), a side plank and a suitcase carry. "Two-one"
// and "(two)" name both limbs together.
export const ONE_SIDED = /\b(one|single)[- ]?(arm|leg|hand|handed|legged|armed|side|knee|foot)\b|\bunilateral\b|\bsplit squat\b|\bbulgarian\b|\blunges?\b|\bstep[- ]?ups?\b|\bpistol\b|\bside plank\b|\bsuitcase\b/
const BOTH = /\btwo[- ]one\b|\(two\)/
export const oneSided = name => ONE_SIDED.test(name) && !BOTH.test(name)

// "unilateral" goes after "category", where a reader looks for what kind of exercise it is.
const withFlag = e => Object.fromEntries(Object.entries(e).flatMap(([k, v]) => (k === 'category' ? [[k, v], ['unilateral', true]] : [[k, v]])))

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let written = 0, kept = 0
  for (const f of fs.readdirSync(DIR).sort()) {
    const p = path.join(DIR, f)
    const e = JSON.parse(fs.readFileSync(p, 'utf8'))
    if (e.variantOf || !oneSided(e.name)) continue
    if ('unilateral' in e) { kept++; continue }
    const out = 'category' in e ? withFlag(e) : { ...e, unilateral: true }
    written++
    if (dry) console.log(`${e.id}  ${e.name}`)
    else fs.writeFileSync(p, JSON.stringify(out, null, 2) + '\n')
  }
  console.log(`${dry ? 'would write' : 'wrote'} ${written}, left ${kept} already set`)
}
