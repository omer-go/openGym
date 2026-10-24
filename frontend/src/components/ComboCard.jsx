import { Fragment, useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { exOr } from '../lib/exercises.js'
import { modeOf, isBw, EFFORT, effortOf, fmtSec, fmtMin } from '../lib/history.js'
import { isSideSet } from '../lib/workout-model.js'
import { usesStopwatch } from '../lib/activities.js'
import { comboRound, comboSpanAt, comboRowsFrom } from '../lib/combo.js'
import { effortColor } from '../lib/effort.js'
import { fmtNum } from '../lib/format.js'
import { t, exerciseNameFor, exerciseNameClass } from '../lib/i18n.js'
import { effortPickerSheet, menuSheet } from '../sheets.jsx'
import { Thumb } from './Media.jsx'
import Icon from './Icon.jsx'
import { Button, Check, NumberField, Stepper } from './ui.jsx'

// A combo (lib/combo.js): a superset drawn as one card that shows one round at a time — a photo
// and the round's numbers per exercise, ticked down the list with no rest between them, then the
// rest between rounds in the card and the next round's rows in their place. The round chips
// open a finished round to look at or fix. Every edit goes through the same wiring an exercise
// block uses (`propsFor`), so the sets it writes are a superset's sets. An exercise's photo and
// name open what you can do to it in the combo: swap it, or take it out. Add exercise under the
// list puts one more in, in every round.
export default function ComboCard({ entries, unit, meta, propsFor, onShowAll, onUnpair, onRemove, onAdd, inert = false }) {
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
    onAdd && { icon: 'plus', label: t('Add exercise'), onClick: onAdd },
    { icon: 'list', label: t('Show every exercise'), onClick: onShowAll },
    { icon: 'link', label: t('Unpair'), onClick: onUnpair },
    onRemove && { icon: 'trash', label: t('Remove combo'), onClick: onRemove, danger: true },
  ].filter(Boolean) }] })
  const exerciseMenu = (idx, ex) => {
    const p = propsFor(idx)
    menuSheet({ title: exerciseNameFor(ex), titleClass: exerciseNameClass(ex), sections: [{ items: [
      { icon: 'swap', label: t('Swap exercise'), sub: t('The next similar exercise'), onClick: p.onQuickSwap, disabled: p.busy },
      { icon: 'magnifier', label: t('Choose exercise'), onClick: p.onSwap, disabled: p.busy },
      { icon: 'trash', label: t('Remove from combo'), onClick: p.onRemoveExercise, danger: true, disabled: p.busy },
    ] }] })
  }
  // Reps or seconds: one tap on a usual number, the stepper for any other. It goes to the round
  // on show and every later one not done yet, so an exercise is set once for the whole combo.
  const countButton = (idx, f, value, unitLabel, p) => {
    const ex = exOr(entries[idx].id)
    const open = () => countSheet({
      title: exerciseNameFor(ex), titleClass: exerciseNameClass(ex), unit: unitLabel, value, step: f === 'sec' ? 5 : 1,
      chips: f === 'sec' ? [15, 20, 30, 45, 60, 90] : [5, 8, 10, 12, 15, 20, 25, 30],
      onPick: v => { for (const i of comboRowsFrom(entries[idx], r)) p.onField(i, f, v) },
    })
    return <button className="cb-f" onClick={open} disabled={inert}>{fmtNum(Number(value) || 0)}{unitLabel !== cols.hd && <span>{unitLabel}</span>}</button>
  }

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
      ? <button className="effcell is-empty cb-eff" aria-label={t(eff.hd)} onClick={open}>–</button>
      : <button className="effcell cb-eff" aria-label={t(eff.hd)} onClick={open}
        style={color ? { color, borderColor: color, background: `color-mix(in srgb, ${color} 20%, var(--surface-2))` } : undefined}>
        {fmtNum(v)}</button>
  }
  const field = (value, unitLabel, onChange, dec = false) => (
    <label className="cb-f"><NumberField decimal={dec} value={value ?? ''} onChange={onChange} />{unitLabel && <span>{unitLabel}</span>}</label>
  )
  // The card's columns, as an exercise block has them: weight, then the count (reps, or seconds
  // or minutes when no member counts reps), effort, a timed hold's start and the tick, with one
  // heading row over them. A column none of this round's exercises uses is left out, and a count
  // that is not the column's own carries its unit.
  const cols = (() => {
    const modes = unit.map(idx => {
      const cfg = { ...(entries[idx].target || {}), id: entries[idx].id }
      return { mode: modeOf(cfg), bw: isBw(cfg), watch: usesStopwatch(cfg) }
    })
    const has = m => modes.some(x => x.mode === m)
    const w = modes.some(x => x.mode === 'reps' && !x.bw)
    const e = !!eff && has('reps')
    const go = !inert && modes.some(x => x.mode === 'time' && !x.watch)
    const hd = has('reps') ? t('reps') : has('time') ? t('sec') : t('min')
    const tpl = ['36px', 'minmax(0,1fr)', w && '46px', '40px', e && '38px', go && '30px', '30px'].filter(Boolean).join(' ')
    return { w, e, go, hd, tpl }
  })()

  const row = idx => {
    const entry = entries[idx]
    const ex = exOr(entry.id)
    const p = propsFor(idx)
    const span = comboSpanAt(entry, r)
    const cfg = { ...(entry.target || {}), id: entry.id }
    const mode = modeOf(cfg)
    const timed = mode === 'time'
    const watch = usesStopwatch(cfg)
    // The photo, the name (wrapping when it is long) and the numbers in the card's columns.
    const Tap = inert ? 'span' : 'button'
    const open = inert ? undefined : () => exerciseMenu(idx, ex)
    const name = <>
      <Tap className="cb-pic" onClick={open}><Thumb ex={ex} /></Tap>
      <Tap className="cb-name" onClick={open}>{exerciseNameFor(ex)}</Tap>
    </>
    // A member planned for fewer rounds than the others sits this one out.
    if (!span) return <div key={idx} className="cb-row skip">{name}<span className="cb-wide dim small">{t('Not this round')}</span></div>
    const [si, count] = span
    const s = entry.sets[si]
    const play = i => timed && !watch && !inert && <button className="setgo" aria-label={t('Start set')}
      disabled={entry.sets[i].done || !!working} onClick={() => p.onStartTimed(i)}><Icon name="play" /></button>
    let cells
    if (isSideSet(s)) {
      // Reps logged per side: each side's own tick, the numbers as they stand.
      cells = <span className="cb-wide">
        <span className="cb-f ro">{fmtNum(s.sides.L.r || 0)}<span>{t('L')}</span></span>
        <Check checked={s.sides.L.done} label={t('Left done')} onChange={() => p.onToggleSide(si, 'L')} />
        <span className="cb-f ro">{fmtNum(s.sides.R.r || 0)}<span>{t('R')}</span></span>
        <Check checked={s.sides.R.done} label={t('Right done')} onChange={() => p.onToggleSide(si, 'R')} />
      </span>
    } else if (count === 2) {
      // A hold timed per side: its L row and its R row, each started and ticked on its own.
      cells = <span className="cb-wide">{[si, si + 1].map(i => <Fragment key={i}>
        <span className="cb-side">{entry.sets[i].side === 'R' ? t('R') : t('L')}</span>
        {countButton(idx, 'sec', entry.sets[i].sec, t('sec'), p)}
        {play(i)}
        <Check checked={entry.sets[i].done} label={t('{0} done', exerciseNameFor(ex))} onChange={() => p.onToggle(i)} />
      </Fragment>)}</span>
    } else {
      const minUnit = cols.hd === t('min') ? null : t('min')
      cells = <>
        {cols.w && (mode === 'reps' && !isBw(cfg) ? field(s.w, null, v => p.onField(si, 'w', v), true) : <span />)}
        {mode === 'reps' && countButton(idx, 'r', s.r, t('reps'), p)}
        {timed && countButton(idx, 'sec', s.sec, t('sec'), p)}
        {mode === 'cardio' && (watch && Number(s.min) % 1
          ? <span className="cb-f ro">{fmtMin(s.min)}{minUnit && <span>{minUnit}</span>}</span>
          : field(s.min, minUnit, v => p.onField(si, 'min', v)))}
        {cols.e && (mode === 'reps' ? effortButton(s, idx, si, p) : <span />)}
        {cols.go && (play(si) || <span />)}
        <Check checked={s.done} label={t('{0} done', exerciseNameFor(ex))} onChange={() => p.onToggle(si)} />
      </>
    }
    const done = entry.sets.slice(si, si + count).every(x => x.done)
    return <div key={idx} className={'cb-row' + (done ? ' done' : '')} data-exidx={idx}>
      {name}{cells}
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
    <div className="cb-list" style={{ '--cb-cols': cols.tpl }}>
      <div className="cb-row cb-head" aria-hidden="true">
        <span /><span />{cols.w && <span>{S.unit}</span>}<span>{cols.hd}</span>{cols.e && <span>{t(eff.hd)}</span>}{cols.go && <span />}<span />
      </div>
      {unit.map(row)}
    </div>
    {onAdd && !inert && <Button variant="plain" size="sm" icon="plus" className="cb-add" onClick={onAdd}>{t('Add exercise')}</Button>}
    {resting && <div className="cb-rest">
      <Icon name="timer" /><span>{t('Rest {0}', fmtSec(timer.left))}</span>
      {state.round > 0 && !state.allDone && <span className="dim small">{t('then round {0}', state.round + 1)}</span>}
      <button className="chip on" onClick={() => useUI.getState().stopRest()}>{t('Start now')}</button>
    </div>}
  </div>
}

function countSheet(opts) {
  useUI.getState().openSheet(close => <CountPick {...opts} close={close} />)
}

function CountPick({ title, titleClass, unit, value, step, chips, onPick, close }) {
  const [v, setV] = useState(Number(value) || 0)
  const pick = n => { onPick(n); close() }
  return <>
    <h3 className={titleClass || undefined} style={{ marginBottom: 4 }}>{title}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('This round and the ones after it')}</div>
    <div className="chips" style={{ flexWrap: 'wrap', overflow: 'visible', touchAction: 'auto', padding: 0, marginBottom: 16 }}>
      {chips.map(n => <button key={n} className={'chip nocap' + (n === v ? ' on' : '')} onClick={() => pick(n)}>{n}</button>)}
    </div>
    <Stepper label={unit} value={v} step={step} min={0} decimal={false} onChange={setV} />
    <div style={{ marginTop: 18 }}><Button variant="primary" onClick={() => pick(v)}>{t('Done')}</Button></div>
  </>
}
