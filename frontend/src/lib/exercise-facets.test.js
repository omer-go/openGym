import { describe, expect, it } from 'vitest'
import { MOVES, kitOf, moveOf, angleOf, isTail, rareWords, optionsOf, narrow, KIT_FACET, MOVE_FACET, ANGLE_FACET, FEW } from './exercise-facets.js'
import { CATALOGUE as EXERCISES } from './exercises.js'
import { MOVES as CATALOGUE_MOVES } from '../../../scripts/catalogue/validate.mjs'
import ROLES from './exercise-roles.json'
import fs from 'node:fs'

const ex = (n, eq = 'barbell', more = {}) => ({ id: n, n, eq, ...more })

describe('tags', () => {
  it('reads the kit off the equipment, folding its kinds together', () => {
    expect(kitOf(ex('a', 'ez barbell'))).toBe('barbell')
    expect(kitOf(ex('a', 'smith machine'))).toBe('machine')
    expect(kitOf(ex('a', 'rope'))).toBe('cable')
    expect(kitOf(ex('a', 'weighted'))).toBe('body')
    expect(kitOf(ex('a', 'weight plate'))).toBe('plate')
    expect(kitOf(ex('a', 'stability ball'))).toBe('ball')
    expect(kitOf(ex('a', 'medicine ball'))).toBe('ball')
    expect(kitOf(ex('a', 'bosu ball'))).toBe('ball')
    expect(kitOf(ex('a', 'sandbag'))).toBe('other')
  })
  it('reads the movement off the name, the first rule that matches winning', () => {
    expect(moveOf(ex('barbell bench press'))).toBe('press')
    expect(moveOf(ex('romanian deadlift'))).toBe('hinge')
    expect(moveOf(ex('barbell bent over row'))).toBe('row')
    expect(moveOf(ex('cable upright row'))).toBe('upright')
    expect(moveOf(ex('dumbbell lateral raise'))).toBe('lateral')
    expect(moveOf(ex('hanging knee raise'))).toBe('legraise')
    expect(moveOf(ex('flutter kicks'))).toBe('legraise')
    expect(moveOf(ex('band pull apart'))).toBe('ytw')
    expect(moveOf(ex('dead hang'))).toBe('grip')
    expect(moveOf(ex('anything at all', 'body weight', { cat: 'yoga' }))).toBe('mobility')
    expect(moveOf(ex('zzz'))).toBe('other')
  })
  it('files a compound lift by what it is, not by the grip or the feet its name gives', () => {
    expect(moveOf(ex('dumbbell reverse grip squeeze bench press', 'dumbbell', { pt: 'push-horizontal' }))).toBe('press')
    expect(moveOf(ex('barbell feet flat bench press', 'barbell', { pt: 'push-horizontal' }))).toBe('press')
    expect(moveOf(ex('dumbbell split squat front foot elevated', 'dumbbell', { pt: 'lunge' }))).toBe('lunge')
    expect(moveOf(ex('barbell hang clean', 'barbell', { pt: 'hinge' }))).toBe('clean')
    // An isolation lift or one with no pattern still reads its name as before.
    expect(moveOf(ex('dead hang', 'body weight', { pt: 'isolation' }))).toBe('grip')
    expect(moveOf(ex('dumbbell toe raise', 'dumbbell'))).toBe('ankle')
  })
  it('takes the movement the catalogue sets by hand before reading the name', () => {
    expect(moveOf(ex('prone hamstring', 'body weight', { mo: 'legcurl' }))).toBe('legcurl')
    expect(moveOf(ex('dumbbell lateral raise', 'dumbbell', { mo: 'other' }))).toBe('other')
    expect(moveOf(ex('anything at all', 'body weight', { cat: 'yoga', mo: 'plank' }))).toBe('plank')
  })
  it('lets the catalogue set only the movements the app knows', () => {
    expect(CATALOGUE_MOVES).toEqual([...MOVES.map(([id]) => id), 'other'])
    const set = EXERCISES.filter(e => e.mo)
    expect(set.length).toBeGreaterThan(100)
    for (const e of set) expect(CATALOGUE_MOVES).toContain(e.mo)
  })
  it('tells a shoulder press from a chest press, and splits the extensions, curls and calf raises', () => {
    expect(moveOf(ex('dumbbell seated shoulder press', 'dumbbell'))).toBe('ohp')
    expect(moveOf(ex('barbell standing military press'))).toBe('ohp')
    expect(moveOf(ex('dumbbell arnold press', 'dumbbell'))).toBe('ohp')
    expect(moveOf(ex('lever press', 'leverage machine', { pt: 'push-vertical' }))).toBe('ohp')
    expect(moveOf(ex('lever press', 'leverage machine', { pt: 'push-horizontal' }))).toBe('press')
    expect(moveOf(ex('barbell clean and press'))).toBe('clean')
    expect(moveOf(ex('cable overhead triceps extension (rope attachment)', 'cable'))).toBe('ohext')
    expect(moveOf(ex('dumbbell seated triceps extension', 'dumbbell'))).toBe('ohext')
    expect(moveOf(ex('ez bar standing french press', 'ez barbell'))).toBe('ohext')
    expect(moveOf(ex('barbell lying triceps extension skull crusher'))).toBe('skull')
    expect(moveOf(ex('dumbbell standing bent over one arm triceps extension', 'dumbbell'))).toBe('skull')
    expect(moveOf(ex('dumbbell hammer curl', 'dumbbell'))).toBe('hammer')
    expect(moveOf(ex('cable standing biceps curl (with rope)', 'cable'))).toBe('hammer')
    expect(moveOf(ex('dumbbell revers grip biceps curl', 'dumbbell'))).toBe('hammer')
    expect(moveOf(ex('dumbbell incline curl', 'dumbbell'))).toBe('stretchcurl')
    expect(moveOf(ex('ez barbell preacher curl', 'ez barbell'))).toBe('stretchcurl')
    expect(moveOf(ex('barbell prone incline curl'))).toBe('curl')
    expect(moveOf(ex('barbell spider curl'))).toBe('curl')
    expect(moveOf(ex('lever seated calf raise', 'leverage machine'))).toBe('seatedcalf')
    expect(moveOf(ex('dumbbell squat hold calf raise', 'dumbbell'))).toBe('seatedcalf')
    expect(moveOf(ex('standing calf raise', 'body weight'))).toBe('calf')
    expect(moveOf(ex('donkey calf raise', 'body weight'))).toBe('calf')
  })
  // The hand-read muscle roles say which head or which muscle a lift is for; the finer moves
  // above are read off the name, so the two are held against each other here. A row on these
  // lists was read and the name's reading kept on purpose.
  it('agrees with the muscle roles on which side of each split a lift is', () => {
    const KEPT = new Set(['4667', '5239', '7177'])
    const target = e => (ROLES[e.id]?.target || []).join('+')
    const odd = EXERCISES.filter(e => !KEPT.has(e.id)).filter(e => {
      const m = moveOf(e), t = target(e)
      if (m === 'seatedcalf') return !t.includes('soleus')
      if (m === 'calf') return t.includes('soleus')
      if (m === 'ohext') return t !== 'triceps-long-head'
      if (m === 'skull') return t === 'triceps-long-head'
      if (m === 'hammer') return !t.includes('brachialis')
      if (m === 'curl' || m === 'stretchcurl') return t.includes('brachialis')
      if (m === 'ohp') return e.pt && e.pt !== 'push-vertical'
      if (m === 'press') return e.pt === 'push-vertical'
      return false
    })
    expect(odd.map(e => `${e.id} ${e.n}`)).toEqual([])
  })
  it('does not take a grip width, a front raise or a pulley for something else', () => {
    expect(moveOf(ex('close grip bench press'))).toBe('press')
    expect(moveOf(ex('dumbbell front raise'))).toBe('front')
    expect(moveOf(ex('cable high pulley row', 'cable'))).not.toBe('upright')
    expect(moveOf(ex('kneeling cable crunch', 'cable'))).toBe('crunch')
  })
  it('asks the bench angle of chest presses and flyes only', () => {
    expect(angleOf(ex('incline dumbbell press', 'dumbbell', { tg: 'pectorals' }))).toBe('incline')
    expect(angleOf(ex('decline bench press', 'barbell', { tg: 'pectorals' }))).toBe('decline')
    expect(angleOf(ex('dumbbell fly', 'dumbbell', { tg: 'pectorals' }))).toBe('flat')
    expect(angleOf(ex('incline dumbbell curl', 'dumbbell', { tg: 'biceps' }))).toBe(null)
    expect(angleOf(ex('pec deck stretch', 'body weight', { tg: 'pectorals' }))).toBe(null)
  })
  it('marks the long tail: form checks, numbered versions, board presses', () => {
    expect(isTail(ex('bench press (form check)'))).toBe(true)
    expect(isTail(ex('push-up v. 2'))).toBe(true)
    expect(isTail(ex('barbell board press'))).toBe(true)
    expect(isTail(ex('barbell bench press'))).toBe(false)
  })
  it('counts the unusual words of a name, a named variant having one', () => {
    expect(rareWords(ex('dumbbell bench press'))).toBe(0)
    expect(rareWords(ex('dumbbell svend press'))).toBe(1)
  })
  it('gives every built-in a kit and a movement, and leaves few to Other', () => {
    const other = EXERCISES.filter(e => moveOf(e) === 'other').length
    expect(other / EXERCISES.length).toBeLessThan(0.15)
    for (const e of EXERCISES) expect(typeof kitOf(e)).toBe('string')
  })
  // Every lift the planner could pick has to land somewhere: a movement, a kit and the muscle
  // roles that say what it trains. What doesn't is on a list someone read: the entries the
  // catalogue marks "other" by hand, the kit that has no group of its own, and the posture
  // references unplaced.tsv gives no roles.
  it('places every lift, or has a reviewed reason not to', () => {
    const LIFTS = new Set(['strength', 'calisthenics', 'olympic', 'isometric'])
    const ODD_KIT = new Set(['sandbag', 'macebell', 'tire', 'hammer', 'roller', 'wheel roller'])
    const table = fs.readFileSync(new URL('../../../scripts/catalogue/roles/unplaced.tsv', import.meta.url), 'utf8')
    const [head, ...rows] = table.trim().split('\n').map(l => l.split('\t'))
    const noRoles = new Set(rows.filter(r => !r[head.indexOf('new target')]).map(r => r[0]))
    const lifts = EXERCISES.filter(e => LIFTS.has(e.cat))
    expect(lifts.filter(e => moveOf(e) === 'other' && e.mo !== 'other').map(e => e.n)).toEqual([])
    expect(lifts.filter(e => kitOf(e) === 'other' && !ODD_KIT.has(e.eq)).map(e => `${e.n} (${e.eq})`)).toEqual([])
    expect(lifts.filter(e => !ROLES[e.id] && !noRoles.has(e.id)).map(e => e.n)).toEqual([])
    expect(noRoles.size).toBe(7)
  })
})

describe('options', () => {
  const list = [
    ...['a', 'b', 'c', 'd'].map(k => ex(k + ' bench press')),
    ...['a', 'b', 'c'].map(k => ex(k + ' dumbbell fly', 'dumbbell')),
    ex('push-up', 'body weight'), ex('zzz'),
  ]
  it('counts each answer and what of it you have done, most first', () => {
    const o = optionsOf(KIT_FACET, list, new Set(['a dumbbell fly']))
    expect(o.map(x => [x.id, x.count, x.done])).toEqual([['barbell', 5, 0], ['dumbbell', 3, 1], ['body', 1, 0]])
  })
  it('folds a movement with fewer than three into Other, last', () => {
    const o = optionsOf(MOVE_FACET, list)
    expect(o.map(x => x.id)).toEqual(['press', 'fly', 'other'])
    expect(o.at(-1)).toMatchObject({ count: 2, values: expect.arrayContaining(['pushup', 'other']) })
  })
  it('has no options when an exercise has no answer', () => {
    expect(optionsOf(ANGLE_FACET, [ex('x bench press', 'barbell', { tg: 'pectorals' }), ex('x curl', 'barbell', { tg: 'biceps' })])).toEqual([])
  })
  it('keeps a fixed order where the facet has one', () => {
    const chest = [ex('incline press', 'barbell', { tg: 'pectorals' }), ex('a press', 'barbell', { tg: 'pectorals' }), ex('b press', 'barbell', { tg: 'pectorals' })]
    expect(optionsOf(ANGLE_FACET, chest).map(o => o.id)).toEqual(['flat', 'incline'])
  })
})

describe('narrow', () => {
  const many = [
    ...Array.from({ length: 6 }, (_, i) => ex(`b${i} bench press`)),
    ...Array.from({ length: 5 }, (_, i) => ex(`d${i} dumbbell fly`, 'dumbbell')),
  ]
  const facets = [KIT_FACET, MOVE_FACET]
  it('asks the first question that splits the list', () => {
    const { list, step } = narrow(many, facets)
    expect(list).toHaveLength(11)
    expect(step.facet).toBe('kit')
  })
  it('stops asking once few enough are left, keeping their order', () => {
    const { list, step } = narrow(many, facets, { kit: ['barbell'] })
    expect(step).toBe(null)
    expect(list.map(x => x.id)).toEqual(many.slice(0, 6).map(x => x.id))
    expect(list.length).toBeLessThanOrEqual(FEW)
  })
  it('skips an answered "any" and a question that does not split', () => {
    const big = [...many, ...Array.from({ length: 3 }, (_, i) => ex(`c${i} bench press`))]
    // Any kit: the movement is next. Only barbell presses left: nothing splits, so the list.
    expect(narrow(big, facets, { kit: '*' }).step.facet).toBe('move')
    const presses = Array.from({ length: 12 }, (_, i) => ex(`p${i} bench press`))
    expect(narrow(presses, facets)).toMatchObject({ step: null })
  })
})
