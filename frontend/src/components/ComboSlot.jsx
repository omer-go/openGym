import { useState } from 'react'
import { t, tn } from '../lib/i18n.js'
import { exOr } from '../lib/exercises.js'
import { Thumb } from './Media.jsx'
import Icon from './Icon.jsx'

/**
 * A combo in a list of a workout's exercises (the Start sheet's, a planned day's): one card,
 * folded, saying what it works and how much; open, it lists its exercises, each drawn by `row`.
 * `members` are the combo's entries in order (lib/combo.js comboSlots), `muscle` its group's name.
 */
export default function ComboSlot({ members, muscle, row }) {
  const [open, setOpen] = useState(false)
  const tg = members[0].target || {}
  const what = [muscle, tn('{0} exercise', '{0} exercises', members.length),
    tn('{0} set', '{0} sets', members.length * (tg.sets || 1))].filter(Boolean).join(' · ')
  return <div className="gs-combo">
    <button type="button" className={'item' + (open ? ' open' : '')} aria-expanded={open} onClick={() => setOpen(v => !v)}>
      <Thumb ex={exOr(members[0].id)} />
      <div className="grow"><div className="tt">{tg.sgName || t('Combo')}</div><div className="ss">{what}</div></div>
      <span className="muted small">{t('Bodyweight')}</span>
      <Icon name="chevronRight" />
    </button>
    {open && <div className="gs-combo-in">{members.map(row)}</div>}
  </div>
}
