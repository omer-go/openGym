// Per-muscle roles from the catalogue's `muscleRoles` (catalogue/README.md): which single muscle
// does the work, which help, which hold the joints still. Seeded for part of the catalogue only,
// so every caller keeps a fallback for an exercise with none. The data is loaded on first use,
// not with the app: most sessions never open an exercise's detail.

let roles = null, pending = null

export function loadMuscleRoles() {
  if (roles) return Promise.resolve(roles)
  return pending ||= import('./exercise-roles.json').then(m => (roles = m.default || m))
}

export const muscleRolesOf = id => (roles && roles[id]) || null

// English names, also the i18n keys.
export const ROLE_MUSCLE_NAME = {
  'front-delt': 'Front delt', 'side-delt': 'Side delt', 'rear-delt': 'Rear delt',
  supraspinatus: 'Supraspinatus', infraspinatus: 'Infraspinatus', 'teres-minor': 'Teres minor',
  subscapularis: 'Subscapularis', 'teres-major': 'Teres major',
  'upper-trap': 'Upper traps', 'middle-trap': 'Middle traps', 'lower-trap': 'Lower traps',
  rhomboids: 'Rhomboids', 'levator-scapulae': 'Levator scapulae', 'serratus-anterior': 'Serratus',
  'pec-minor': 'Pec minor',
  'pec-major-clavicular': 'Upper chest', 'pec-major-sternal': 'Mid and lower chest', lats: 'Lats',
  coracobrachialis: 'Coracobrachialis',
  biceps: 'Biceps', brachialis: 'Brachialis', brachioradialis: 'Brachioradialis', triceps: 'Triceps',
  'triceps-long-head': 'Triceps (long head)', 'wrist-flexors': 'Wrist flexors',
  'wrist-extensors': 'Wrist extensors',
  'rectus-abdominis': 'Abs', obliques: 'Obliques', 'transverse-abdominis': 'Deep abs',
  'erector-spinae': 'Spinal erectors', 'quadratus-lumborum': 'Quadratus lumborum',
  'glute-max': 'Glutes', 'glute-med': 'Side glutes', 'hip-flexors': 'Hip flexors',
  adductors: 'Adductors', 'adductor-magnus': 'Adductor magnus', hamstrings: 'Hamstrings',
  quads: 'Quads', calves: 'Calves', 'tibialis-anterior': 'Shins',
  sternocleidomastoid: 'Front of neck', 'neck-extensors': 'Back of neck',
}

// The rows the detail sheet shows. `steady` folds the three stabilizer roles into one line: the
// difference between them matters to the catalogue, not to someone choosing a lift.
export function roleRows(r) {
  if (!r || !r.target?.length) return null
  const steady = [...(r.dynamicStabilizers || []), ...(r.stabilizers || []), ...(r.antagonistStabilizers || [])]
  return {
    main: [
      { key: 'target', label: 'Works', muscles: r.target },
      ...(r.synergists?.length ? [{ key: 'synergists', label: 'Helps', muscles: r.synergists }] : []),
    ],
    steady: steady.length ? { key: 'steady', label: 'Holds steady', muscles: steady } : null,
  }
}
