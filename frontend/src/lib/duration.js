// Durations in whole seconds, as the rest timer stores them (S.restSec, S.restPauseSec, an
// exercise's target.restSec). The picker (components/DurationPicker.jsx) offers them as preset
// chips, ± steps and a typed number, and every place that shows one goes through fmtDuration,
// so any value ("1:45") reads the same everywhere.
import { t, tn } from './i18n.js'

// The rest timer's range: 0 is "no rest timer", 15 minutes the most the picker takes.
export const REST_MAX = 15 * 60
// A rest-pause burst's rest: never 0 (lib/history.js clamps it to 5 s), five minutes at most.
export const REST_PAUSE_MIN = 5
export const REST_PAUSE_MAX = 5 * 60

/** Whole seconds within [min, max]. Anything that is not a number reads as `min`. */
export function clampDuration(sec, min = 0, max = REST_MAX) {
  const n = Math.round(Number(sec))
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

/** { m, s } for a number of seconds: 90 → { m: 1, s: 30 }. */
export function splitDuration(sec) {
  const n = Math.max(0, Math.round(Number(sec)) || 0)
  return { m: Math.floor(n / 60), s: n % 60 }
}

/** Minutes and seconds back into seconds, clamped to the wheel's range. */
export function joinDuration(m, s, min = 0, max = REST_MAX) {
  return clampDuration((Number(m) || 0) * 60 + (Number(s) || 0), min, max)
}

/**
 * The short form a row shows: "45s" under a minute, "1:30" from a minute up, "Off" for 0 when
 * the caller says 0 means off. Digits stay Western, like the rest of the app's numbers.
 */
export function fmtDuration(sec, { off = null } = {}) {
  const n = Math.max(0, Math.round(Number(sec)) || 0)
  if (!n && off != null) return off
  if (n < 60) return n + 's'
  const { m, s } = splitDuration(n)
  return m + ':' + String(s).padStart(2, '0')
}

/**
 * What a screen reader says: "1 minute 30 seconds", "45 seconds", "2 minutes". 0 is `off` when
 * given (the rest timer's "Off"), "0 seconds" otherwise.
 */
export function durationText(sec, { off = null } = {}) {
  const { m, s } = splitDuration(sec)
  if (!m && !s) return off != null ? off : tn('{0} second', '{0} seconds', 0)
  return [m ? tn('{0} minute', '{0} minutes', m) : null, s ? tn('{0} second', '{0} seconds', s) : null]
    .filter(Boolean).join(' ')
}

/** The rest timer's own wording for a row or a preview: "1:30" or "Off". */
export const fmtRest = sec => fmtDuration(sec, { off: t('Off') })

// The one-tap times the picker offers, from a short superset breather to a heavy triple's rest.
export const DURATION_PRESETS = [10, 15, 20, 30, 45, 60, 90, 120, 180, 300]

/**
 * The preset chips for a picker over [min, max]: the presets in range, plus `value` in its
 * place when it is none of them (a typed 1:45 still shows as picked). 0 is never a chip here;
 * the picker shows it as its own `off` choice.
 */
export function durationChips(min = 0, max = REST_MAX, value = 0) {
  const list = DURATION_PRESETS.filter(s => s >= min && s <= max && s > 0)
  const v = Math.round(Number(value)) || 0
  return v > 0 && v >= min && v <= max && !list.includes(v) ? [...list, v].sort((a, b) => a - b) : list
}

/**
 * The ± step from `sec`: 5 seconds under a minute, 15 from a minute up, so a step down from
 * 1:00 lands on 0:55 and a step up from 1:00 on 1:15.
 */
export function durationStep(sec, dir) {
  const n = Math.max(0, Math.round(Number(sec)) || 0)
  return dir > 0 ? (n >= 60 ? 15 : 5) : (n > 60 ? 15 : 5)
}

/**
 * A typed duration back into seconds: "90" or "90s" is seconds, "1:30" (or "1.30") minutes and
 * seconds, "2m" minutes. Anything else is null, so the picker keeps what it had.
 */
export function parseDuration(text) {
  const s = String(text ?? '').trim().toLowerCase().replace(/\s+/g, '')
  if (!s) return null
  let m = s.match(/^(\d+)[:.](\d{1,2})$/)
  if (m) return Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null
  m = s.match(/^(\d+)(?:s|sec)?$/)
  if (m) return Number(m[1])
  m = s.match(/^(\d+)(?:m|min)$/)
  if (m) return Number(m[1]) * 60
  return null
}
