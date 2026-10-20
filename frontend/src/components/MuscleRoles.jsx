import { useEffect, useState } from 'react'
import { t } from '../lib/i18n.js'
import { loadMuscleRoles, muscleRolesOf, ROLE_MUSCLE_NAME, roleRows } from '../lib/muscle-roles.js'
import Icon from './Icon.jsx'

// An exercise's catalogue roles, or null; loads them on first use and re-renders once they're in.
export function useMuscleRoles(id) {
  const [, setLoaded] = useState(0)
  useEffect(() => {
    let live = true
    loadMuscleRoles().then(() => { if (live) setLoaded(1) }, () => {})
    return () => { live = false }
  }, [])
  return muscleRolesOf(id)
}

// What each muscle does in this exercise, for the entries the catalogue has roles for. Nothing
// at all for the rest: the tags at the top of the sheet already say the main muscles.
export default function MuscleRoles({ id }) {
  const rows = roleRows(useMuscleRoles(id))
  const [open, setOpen] = useState(false)
  if (!rows) return null
  const line = r => <div className="mroles-row" key={r.key}>
    <span className="mroles-k">{t(r.label)}</span>
    <span className="mroles-v">{r.muscles.map(m => t(ROLE_MUSCLE_NAME[m] || m)).join(', ')}</span>
  </div>
  return <>
    <h4 className="sec">{t('Muscles')}</h4>
    <div className="mroles">
      {rows.main.map(line)}
      {rows.steady && open && line(rows.steady)}
      {rows.steady && <button type="button" className="mroles-more" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {open ? t('Hide stabilizers') : t('Show stabilizers')} <Icon name="chevronRight" />
      </button>}
    </div>
  </>
}
