# The exercise catalogue

Every exercise openGym knows lives here, one file each, in plain JSON. The app is built from these
files, so a fix merged here is in the next release for everyone.

- **Browse the list:** [browse/](browse/README.md), one page per body part, each exercise with a link to its picture.
- **Report something without editing:** open an
  [exercise issue](https://github.com/DuarteSantos8/openGym/issues/new?template=exercise.yml).

## What's where

| Path | What it holds |
|---|---|
| `exercises/<id>.json` | One exercise in English: name, body part, equipment, muscles, description, steps |
| `i18n/<lang>.json` | Translations: `{ "<id>": { "name", "description", "instructions" } }` |
| `media/still/<id>.webp`, `media/clip/<id>.mp4` | The picture and animation (180 px). Licensed, not editable, see below |
| `browse/` | Generated overview pages. Don't edit, they are rebuilt |

The id is the exercise's permanent number. Workouts, routines and records store it, so **an id is
never changed, reused or deleted.** A duplicate is fixed by improving one entry, not by removing
the other.

## Fixing an exercise

Open `exercises/<id>.json` (the browse pages link straight to it) and press the pencil on GitHub.

```json
{
  "id": "0025",
  "name": "barbell bench press",
  "bodyPart": "chest",
  "equipment": "barbell",
  "target": "pectorals",
  "secondaryMuscles": ["triceps", "shoulders"],
  "category": "strength",
  "description": "The classic flat-bench press. Builds the chest, front shoulders and triceps.",
  "instructions": [
    "Lie on a flat bench with your eyes under the bar and your feet flat on the floor.",
    "..."
  ]
}
```

- **name**: lowercase, equipment first ("dumbbell incline curl"). The app capitalises it.
- **bodyPart, equipment, target, secondaryMuscles, category**: only the words listed at the top of
  [`scripts/catalogue/validate.mjs`](../scripts/catalogue/validate.mjs). The app filters, translates
  and draws the muscle map from them, so a new word needs app support first. Ask in an issue.
- **unilateral** (optional): `true` when the exercise works one arm or one leg at a time (a one-arm
  row, a split squat, a side plank). Adding it to a plan then logs it per side from the start. It was
  seeded from the names ([`scripts/catalogue/seed-unilateral.mjs`](../scripts/catalogue/seed-unilateral.mjs));
  set `false` to overrule a wrong match, and the seeder leaves it alone.
- **pattern** (optional): the movement, one of `squat`, `hinge`, `lunge`, `push-horizontal`,
  `push-vertical`, `pull-horizontal`, `pull-vertical`, `carry`, `core` or `isolation` (one joint,
  one muscle group). Swap offers the same movement first, and generated workouts balance pushes
  against pulls and squats against hinges. Seeded from the muscle-role templates and the names
  ([`scripts/catalogue/seed-pattern.mjs`](../scripts/catalogue/seed-pattern.mjs)); a stretch, a
  pose or cardio has none. Correct a wrong one by hand and the seeder leaves it alone.
- **move** (optional): the movement in finer words than the pattern, one of `MOVES` in
  `validate.mjs` (`lateral`, `legcurl`, `twist`...). The app reads it off the name and only needs this
  field where the name says too little ("thor lift", "prone hamstring"); `other` marks an entry that
  was read and fits none. Set from a table read by hand,
  [`roles/moves.tsv`](../scripts/catalogue/roles/moves.tsv), with
  [`scripts/catalogue/apply-fields-table.mjs`](../scripts/catalogue/apply-fields-table.mjs). That
  script also takes `new pattern`, `new unilateral`, `new catalogue target` and
  `new secondary muscles` columns; an empty cell leaves the field alone and `-` removes it. Some
  moves are told apart where generated workouts take turns between them: `ohp` (overhead press)
  from `press` (chest press), `ohext` (overhead extension) from `skull` (lying extension),
  `hammer` and `stretchcurl` (incline or preacher) from `curl`, and `seatedcalf` from `calf`. Set
  the field when the name says one and the lift does the other ("lying elbow press" is a `skull`).
- **description**: one or two sentences on what the movement is and what it trains.
- **instructions**: 4 to 7 short steps, second person ("Brace your core..."). No em dashes.
- **muscleMap** (optional): a more precise muscle-map drawing with the body map's own muscle names
  and weights from 0 to 1. Only needed when target and secondaryMuscles don't draw it right.
- **muscleRoles** (optional): what each single muscle does in the movement, with the muscle names
  listed as `ROLE_MUSCLES` in `validate.mjs`. `target` does most of the work, `synergists` help
  move the weight, `dynamicStabilizers` cross two joints and shorten at one while lengthening at
  the other, `stabilizers` hold a joint or the trunk still, and `antagonistStabilizers` hold the
  trunk against the stabilizers' pull. A muscle has one role; leave an empty role out. The app shows
  them on the exercise's detail sheet. The shoulder, chest, back, arm, leg and core exercises were seeded from movement templates
  ([`scripts/catalogue/seed-roles.mjs`](../scripts/catalogue/seed-roles.mjs)); once you edit an
  entry's roles, the seeder never touches it again. A correction to many entries at once can be a
  table read by hand and applied with
  [`scripts/catalogue/apply-roles-table.mjs`](../scripts/catalogue/apply-roles-table.mjs): the
  biceps heads were decided that way, one curl at a time, in
  [`roles/biceps-heads.tsv`](../scripts/catalogue/roles/biceps-heads.tsv). A curl with the arm behind
  the body, a drag or a close grip targets `biceps-long-head`; one with the arm in front, on a pad
  or overhead, or a wide grip, `biceps-short-head`; a standard curl with the elbows at the sides
  stays `biceps`, both heads evenly. The calf raises were split the same way in
  [`roles/calves.tsv`](../scripts/catalogue/roles/calves.tsv): a straight knee (standing, donkey, leg
  press) targets `gastrocnemius`, a bent knee (seated, or from a held squat) `soleus`, and one that
  doesn't say stays `calves`. The strength, calisthenics, isometric and Olympic entries the
  templates couldn't place were read in
  [`roles/unplaced.tsv`](../scripts/catalogue/roles/unplaced.tsv), which also has a
  `new stabilizers` column; a row with no target there (a posture reference) was read and given
  no roles.

  ```json
  "muscleRoles": {
    "target": ["side-delt"],
    "synergists": ["front-delt", "supraspinatus", "middle-trap", "lower-trap", "serratus-anterior"],
    "stabilizers": ["upper-trap", "levator-scapulae", "wrist-extensors", "erector-spinae"]
  }
  ```
- **femaleVariant / variantOf**: links the same exercise drawn on a female figure. Leave as is.
- **textSource: "exercisedb"**: the original 1,324 entries. Their text came under MIT (see NOTICE.md).
  You can still improve them.

## Translating

Translations go in `i18n/<lang>.json`, keyed by id. Anything missing falls back to English, so
partial work is welcome. Translate the name and as much of the steps as you like:

```json
{
  "0025": {
    "name": "Bankdrücken mit der Langhantel",
    "description": "Der Klassiker auf der Flachbank ...",
    "instructions": ["Leg dich so auf die Flachbank, dass ...", "..."]
  }
}
```

Languages: `ar bn de es fr hi hu it ko pl pt pt-BR ru th tr uk zh zh-TW` (the app's languages).
Names follow the language's own conventions. German capitalises nouns; the others are stored
lowercase like English.

## Rules that keep this open

1. **Write it yourself.** Don't copy names, descriptions or steps from other apps, websites, books
   or datasets, and don't paste machine translation unreviewed. Short, correct, plain beats long.
2. **The media is not open.** The pictures and animations are licensed from Gym visual for openGym
   only (see [media/NOTICE.md](media/NOTICE.md)). Don't add, edit or replace media files, don't copy
   them elsewhere, and don't feed them to any AI tool. Fixes to what an exercise *shows* go in an
   issue.
3. **No medical advice.** Describe the movement, not treatments.

## Checking your change

You don't need to run anything: the **Catalogue** check on your pull request does it and says which
file and field is wrong. To run it yourself (Node 20+):

```sh
node scripts/catalogue/validate.mjs     # checks every entry
node scripts/catalogue/build.mjs        # regenerates the app's data files and browse/
```

Commit the regenerated files with your change, or leave that to the maintainer.
