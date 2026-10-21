import { describe, expect, it } from 'vitest'
import { kitOf, moveOf, angleOf, isTail, rareWords, optionsOf, narrow, KIT_FACET, MOVE_FACET, ANGLE_FACET, FEW } from './exercise-facets.js'
import { CATALOGUE as EXERCISES } from './exercises.js'

const ex = (n, eq = 'barbell', more = {}) => ({ id: n, n, eq, ...more })

describe('tags', () => {
  it('reads the kit off the equipment, folding its kinds together', () => {
    expect(kitOf(ex('a', 'ez barbell'))).toBe('barbell')
    expect(kitOf(ex('a', 'smith machine'))).toBe('machine')
    expect(kitOf(ex('a', 'rope'))).toBe('cable')
    expect(kitOf(ex('a', 'weighted'))).toBe('body')
    expect(kitOf(ex('a', 'stability ball'))).toBe('other')
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
