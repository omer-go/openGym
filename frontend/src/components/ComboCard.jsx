import { Fragment, useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { exOr } from '../lib/exercises.js'
import { modeOf, isBw, EFFORT, effortOf, fmtSec, fmtMin } from '../lib/history.js'
import { isSideSet } from '../lib/workout-model.js'
import { usesStopwatch } from '../lib/activities.js'
import { comboRound, comboSpanAt } from '../lib/combo.js'
import { effortColor } from '../lib/effort.js'
import { fmtNum } from '../lib/format.js'
import { t, exerciseNameFor } from '../lib/i18n.js'
import { effortPickerSheet, menuSheet } from '../sheets.jsx'
import { Thumb } from './Media.jsx'
import Icon from './Icon.jsx'
import { Check, NumberField } from './ui.jsx'

// A combo (lib/combo.js): a superset drawn as one card that shows one round at a time — a photo
// and the round's numbers per exercise, ticked down the list with no rest between them, then the
// rest between rounds in the card and the next round's rows in their place. The round chips
// open a finished round to look at or fix. Every edit goes through the same wiring an exercise
// block uses (`propsFor`), so the sets it writes are a superset's sets.
export default function ComboCard({ entries, unit, meta, propsFor, onShowAll, onUnpair, inert = false }) {
  const S = useStore(s => s.S)
  const timer = useUI(s => s.timer)
  const working = useUI(s => s.work)
  const state = comboRound(entries, unit)
  const [view, setView] = useState(state.round)
  // A finished round moves the card on: whatever round you had open, the next one is the one
  // to do now.
  useEffect(() => { setView(state.round) }, [state.round])
  const r = Math.min(view, Math.max(0, state.rounds - 1))
  const kind = effortOf(S)
  const eff = EFFORT[kind]
  const resting = !inert && timer && !timer.ready && unit.includes(timer.forIdx)
  const openMenu = () => menuSheet({ sections: [{ items: [
    { icon: 'list', label: t('Show every exercise'), onClick: onShowAll },
    { icon: 'link', label: t('Unpair'), onClick: onUnpair },
  ] }] })

  const effortButton = (s, idx, si, p) => {
    const v = s[eff.f] ?? null
    const color = effortColor(kind === 'rpe' ? (v == null ? null : 10 - v) : v)
    const open = () => effortPickerSheet(kind, v, nv => {
      p.onField(si, eff.f, nv)
      if (nv == null) return
      // Rating a set ends it, as in an exercise block; read live, a re-render can stale `s`.
      const fresh = useStore.getState().S.active?.entries[idx]?.sets[si]
      if (fresh && !fresh.done) p.onToggle(si)
    })
    return v == null
      ? <button className="effcell is-empty cb-eff" aria-label={t(eff.hd)} onClick={open}>{t(eff.hd)}</button>
      : <button className="effcell cb-eff" aria-label={t(eff.hd)} onClick={open}
        style={color ? { color, borderColor: color, background: `color-mix(in srgb, ${color} 20%, var(--surface-2))` } : undefined}>
        {t(eff.hd)} {fmtNum(v)}</button>
  }
  const field = (value, unitLabel, onChange, dec = false) => (
    <label className="cb-f"><NumberField decimal={dec} value={value ?? ''} onChange={onChange} /><span>{unitLabel}</span></label>
  )

  const row = idx => {
    const entry = entries[idx]
    const ex = exOr(entry.id)
    const p = propsFor(idx)
    const span = comboSpanAt(entry, r)
    const cfg = { ...(entry.target || {}), id: entry.id }
    const mode = modeOf(cfg)
    const timed = mode === 'time'
    const watch = usesStopwatch(cfg)
    const name = <span className="cb-name">{exerciseNameFor(ex)}</span>
    // A member planned for fewer rounds than the others sits this one out.
    if (!span) return <div key={idx} className="cb-row skip"><Thumb ex={ex} />{name}<span className="dim small">{t('Not this round')}</span></div>
    const [si, count] = span
    const s = entry.sets[si]
    const play = i => timed && !watch && !inert && <button className="setgo" aria-label={t('Start set')}
      disabled={entry.sets[i].done || !!working} onClick={() => p.onStartTimed(i)}><Icon name="play" /></button>
    let cells
    if (isSideSet(s)) {
      // Reps logged per side: each side's own tick, the numbers as they stand.
      cells = <>
        <span className="cb-f ro">{fmtNum(s.sides.L.r || 0)}<span>{t('L')}</span></span>
        <Check checked={s.sides.L.done} label={t('Left done')} onChange={() => p.onToggleSide(si, 'L')} />
        <span className="cb-f ro">{fmtNum(s.sides.R.r || 0)}<span>{t('R')}</span></span>
        <Check checked={s.sides.R.done} label={t('Right done')} onChange={() => p.onToggleSide(si, 'R')} />
      </>
    } else if (count === 2) {
      // A hold timed per side: its L row and its R row, each started and ticked on its own.
      cells = [si, si + 1].map(i => <Fragment key={i}>
        <span className="cb-side">{entry.sets[i].side === 'R' ? t('R') : t('L')}</span>
        {field(entry.sets[i].sec, t('sec'), v => p.onField(i, 'sec', v))}
        {play(i)}
        <Check checked={entry.sets[i].done} label={t('{0} done', exerciseNameFor(ex))} onChange={() => p.onToggle(i)} />
      </Fragment>)
    } else {
      cells = <>
        {mode === 'reps' && !isBw(cfg) && field(s.w, S.unit, v => p.onField(si, 'w', v), true)}
        {mode === 'reps' && field(s.r, t('reps'), v => p.onField(si, 'r', v))}
        {timed && field(s.sec, t('sec'), v => p.onField(si, 'sec', v))}
        {mode === 'cardio' && (watch && Number(s.min) % 1
          ? <span className="cb-f ro">{fmtMin(s.min)}<span>{t('min')}</span></span>
          : field(s.min, t('min'), v => p.onField(si, 'min', v)))}
        {play(si)}
        {mode === 'reps' && eff && effortButton(s, idx, si, p)}
        <Check checked={s.done} label={t('{0} done', exerciseNameFor(ex))} onChange={() => p.onToggle(si)} />
      </>
    }
    const done = entry.sets.slice(si, si + count).every(x => x.done)
    return <div key={idx} className={'cb-row' + (done ? ' done' : '')} data-exidx={idx}>
      <Thumb ex={ex} />{name}<span className="cb-cells">{cells}</span>
    </div>
  }

  return <div className="ss-card combo">
    <div className="cb-hd">
      <span className="cb-title">{meta.name || t('Combo')}</span>
      {state.rounds > 1 && <span className="tag acc nocap">{state.allDone ? t('{0} rounds done', state.rounds) : t('Round {0} of {1}', state.round + 1, state.rounds)}</span>}
      <button className="iconbtn" aria-label={t('More')} onClick={openMenu}><Icon name="more" /></button>
    </div>
    {state.rounds > 1 && <div className="cb-rounds" role="tablist">
      {state.done.map((d, k) => <button key={k} role="tab" aria-selected={k === r}
        className={'chip' + (k === r ? ' on' : '') + (d ? ' done' : '')} onClick={() => setView(k)}>
        {t('R{0}', k + 1)}{d && <Icon name="check" />}
      </button>)}
    </div>}
    <div className="cb-list">{unit.map(row)}</div>
    {resting && <div className="cb-rest">
      <Icon name="timer" /><span>{t('Rest {0}', fmtSec(timer.left))}</span>
      {state.round > 0 && !state.allDone && <span className="dim small">{t('then round {0}', state.round + 1)}</span>}
      <button className="chip on" onClick={() => useUI.getState().stopRest()}>{t('Start now')}</button>
    </div>}
  </div>
}
