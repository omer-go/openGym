// The duration picker for rest times, laid out like the weight picker (WeightPicker.jsx): the
// time big in the middle between − and + steps, and a grid of one-tap preset times under it
// (lib/duration.js durationChips). Tapping the time turns it into a field to type any value in:
// seconds ("90") or minutes and seconds ("1:30", "1.30" on a phone's number pad).
//
// 0 is not a chip: when 0 means something (`off`: "Off", "Skip", "Default (1:30)") it is its own
// full-width choice above the grid.
//
//   durationSheet({ title, value, min, max, off, footer, onDone: sec => … })   // Done saves
import { useRef, useState } from 'react'
import { t } from '../lib/i18n.js'
import { useUI } from '../store/useUI.js'
import { REST_MAX, clampDuration, fmtDuration, durationText, durationChips, durationStep, parseDuration } from '../lib/duration.js'
import { Button } from './ui.jsx'

/**
 * The picker itself, controlled: `onChange(sec)` gets every value picked, already clamped to
 * [min, max]. `readRef.current()` answers the value with a half-typed number included, so a
 * Done tapped while the field is still open saves what was typed.
 */
export function DurationPicker({ value, onChange, min = 0, max = REST_MAX, off = null, readRef }) {
  const v = clampDuration(value, min, max)
  const [text, setText] = useState(null)   // the typed text while the field is open
  const input = useRef(null)
  const typed = () => {
    const n = parseDuration(text)
    return n == null ? v : clampDuration(n, min, max)
  }
  if (readRef) readRef.current = () => (text == null ? v : typed())
  const pick = n => { const next = clampDuration(n, min, max); if (next !== v) onChange(next) }
  const commit = () => { if (text == null) return; pick(typed()); setText(null) }
  const edit = () => {
    setText(v > 0 ? String(v) : '')
    requestAnimationFrame(() => { input.current?.focus(); input.current?.select() })
  }
  const offPick = off != null && min <= 0
  const chips = durationChips(min, max, v)
  return <div className="wpick dpick" data-nodrag="">
    <div className="wstep">
      <button type="button" className="stp" aria-label={t('{0} seconds shorter', durationStep(v, -1))}
        disabled={v <= min} onClick={() => { commit(); pick(v - durationStep(v, -1)) }}>−<small>{durationStep(v, -1)}s</small></button>
      <div className="readout">
        {text != null
          ? <input ref={input} className="dp-in" type="text" inputMode="decimal" autoComplete="off" enterKeyHint="done"
              aria-label={t('Seconds, or minutes:seconds')} value={text} onChange={e => setText(e.target.value)}
              onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } if (e.key === 'Escape') setText(null) }} />
          : <button type="button" className="v dp-v" aria-label={t('{0}, tap to type a time', durationText(v, { off }))} onClick={edit}>
              {v > 0 || !offPick ? fmtDuration(v) : <span className="auto">{off}</span>}
            </button>}
        <div className="small dim">{text != null ? t('Like 90 or 1.30') : t('Tap the time to type one')}</div>
      </div>
      <button type="button" className="stp" aria-label={t('{0} seconds longer', durationStep(v, 1))}
        disabled={v >= max} onClick={() => { commit(); pick(v + durationStep(v, 1)) }}>+<small>{durationStep(v, 1)}s</small></button>
    </div>
    {offPick && <button type="button" className={'chip dp-off' + (v === 0 ? ' on' : '')} aria-pressed={v === 0}
      onClick={() => { setText(null); pick(0) }}>{off}</button>}
    <div className="wgrid" role="group" aria-label={t('Rest')}>
      {chips.map(s => <button type="button" key={s} className={'chip' + (s === v ? ' on' : '')} aria-pressed={s === v}
        onClick={() => { setText(null); pick(s) }}>{fmtDuration(s)}</button>)}
    </div>
  </div>
}

/* The picker in a sheet with Done. Nothing is saved until Done: closing the sheet any other way
   leaves the setting as it was. */
function DurationSheet({ title, value, min, max, off, footer, onDone, close }) {
  const [v, setV] = useState(clampDuration(value, min, max))
  const read = useRef(null)
  return <>
    <h3>{title}</h3>
    <DurationPicker value={v} onChange={setV} min={min} max={max} off={off} readRef={read} />
    {footer && <p className="dim small dw-foot">{footer}</p>}
    <Button variant="primary" onClick={() => { const now = read.current ? read.current() : v; close(); onDone(now) }}>{t('Done')}</Button>
    <div style={{ height: 8 }} />
  </>
}

/** Opens the picker in a bottom sheet; `onDone(sec)` runs on Done with the clamped value. */
export function durationSheet({ title, value, min = 0, max = REST_MAX, off = null, footer = null, onDone }) {
  return useUI.getState().openSheet(close =>
    <DurationSheet title={title} value={value} min={min} max={max} off={off} footer={footer} onDone={onDone} close={close} />)
}
