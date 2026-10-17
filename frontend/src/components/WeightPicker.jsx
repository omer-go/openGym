// The few-taps weight picker on an exercise's settings sheet (lib/weight-pick.js): one-tap
// "Suggested" / "Same as last" cards, then the weight on ± steppers and a grid of nearby
// weights in the equipment's steps, and reps as chips.
import { useState } from 'react'
import { fmtNum, fmtDaysAgo } from '../lib/format.js'
import { t, tn } from '../lib/i18n.js'
import {
  GRID_N, REP_CHIPS, pickStep, snapWeight, gridBase, gridWeights, keepBase, maxWeight,
} from '../lib/weight-pick.js'

/** "135 lb × 8". */
export const fmtPick = (w, reps, unit) => `${fmtNum(w)} ${unit} × ${reps}`

/**
 * `weight`, `anchor`, `last` and the quick picks are all in `unit` (lb). `anchor` is where the
 * grid opens when no weight is set (last time's, else a light start); `last` is last time's
 * weight, marked in the grid. `onQuick` gets a pick ({ w, reps }) — the sheet saves on it, so
 * it is one tap.
 */
export default function WeightPicker({ ex, unit, weight, reps, onWeight, onReps, quick, onQuick, anchor, last, repStep = 1, showReps = true }) {
  const step = pickStep(ex, unit)
  const cur = weight > 0 ? weight : 0
  const from = cur > 0 ? cur : anchor || 0
  const [base, setBase] = useState(() => gridBase(from, step, unit))
  const set = w => {
    const snapped = snapWeight(w, step, unit)
    setBase(b => keepBase(b, snapped, step, unit))
    onWeight(snapped)
  }
  const weights = gridWeights(base, step, unit)
  const top = Math.round(maxWeight(unit) / step)
  const reps0 = REP_CHIPS.includes(reps) || !(reps > 0) ? REP_CHIPS : [...REP_CHIPS, reps].sort((a, b) => a - b)
  const card = (cls, label, pick, sub) => (
    <button type="button" className={'qk ' + cls} onClick={() => onQuick(pick)}>
      <small>{label}</small>
      <b>{fmtNum(pick.w)}<em> {unit}</em> × {pick.reps}</b>
      <span>{sub}</span>
    </button>
  )
  const why = quick?.next?.why === 'hit' ? t('You hit {0} reps last time', quick.same?.reps)
    : quick?.next?.why === 'rep' ? t('One more rep than last time') : t('First time: a light start')
  return <div className="wpick">
    {quick && <div className="quick">
      {card(quick.same ? 'sug' : 'sug solo', quick.same ? t('Suggested') : t('Suggested start'), quick.next, why)}
      {quick.same && card('', t('Same as last'), quick.same,
        [tn('{0} set', '{0} sets', quick.same.sets), quick.same.d ? fmtDaysAgo(quick.same.d) : null].filter(Boolean).join(' · '))}
    </div>}
    {quick && <div className="or">{t('or set your own')}</div>}
    <div className="wstep">
      <button type="button" className="stp" aria-label={t('{0} {1} lighter', fmtNum(step), unit)}
        onClick={() => set(from - step)} disabled={from <= 0}>−<small>{fmtNum(step)}</small></button>
      <div className="readout">
        <div className="v">{cur > 0 ? <>{fmtNum(cur)}<small>{unit}</small></> : <span className="auto">{t('Auto')}</span>}</div>
        {!(cur > 0) && <div className="small dim">{last > 0 ? t('Starts from last time') : t('Tap a weight')}</div>}
      </div>
      <button type="button" className="stp" aria-label={t('{0} {1} heavier', fmtNum(step), unit)}
        onClick={() => set(cur > 0 ? cur + step : from || step)}>+<small>{fmtNum(step)}</small></button>
    </div>
    <div className="wgrid" role="group" aria-label={t('Weight')}>
      {weights.map(w => {
        const on = cur > 0 && Math.abs(w - cur) < step / 2
        const lt = !on && last > 0 && Math.abs(w - last) < step / 2
        return <button type="button" key={w} className={'chip' + (on ? ' on' : lt ? ' lt' : '')} aria-pressed={on}
          title={lt ? t('Last time') : undefined} onClick={() => set(w)}>{fmtNum(w)}</button>
      })}
    </div>
    <div className="wshift">
      <button type="button" className="link" disabled={base <= 0} onClick={() => setBase(b => Math.max(0, b - GRID_N))}>‹ {t('Lighter')}</button>
      <button type="button" className="link" disabled={base + GRID_N > top} onClick={() => setBase(b => Math.min(top - GRID_N + 1, b + GRID_N))}>{t('Heavier')} ›</button>
    </div>
    {showReps && <>
      <div className="wlabel">{t('Reps')}</div>
      <div className="rgrid" role="group" aria-label={t('Reps')} style={{ '--n': reps0.length }}>
        {reps0.map(r => <button type="button" key={r} className={'chip' + (r === reps ? ' on' : '')} aria-pressed={r === reps}
          disabled={repStep > 1 && r % repStep !== 0} onClick={() => onReps(r)}>{r}</button>)}
      </div>
    </>}
  </div>
}
