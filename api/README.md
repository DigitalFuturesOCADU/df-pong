# The DFPONG API

Everything controllers, the game and the admin panel can send each other, in one file:
[`dfpong-api.json`](dfpong-api.json). The readable reference is generated from it:
[`docs/API.md`](../docs/API.md).

The API is expected to change as the class finds new things to do with it. This folder is how
it changes without the game, the Arduino library, the Settings Builder and the docs drifting apart.

## What comes from the spec

| File | Made by `build.mjs` | Used by |
|---|---|---|
| `game/cc26/js/api.js` | the whole spec, as JavaScript | the game, Settings Builder, admin panel and tests (settings tables, labels, names, UUIDs, timing) |
| `docs/API.md` | reference tables | people |
| `df-pong-controller/src/DFPongSpec.h` | ranges, limits, names, UUIDs, timing | the Arduino library (only when that repo is checked out next to this one) |

`build.mjs` also checks the spec against the game: every built-in sound and music name must exist
in the game folder (its `assets/*/manifest.json`, `js/audio.js` and `js/music.js`), and every file
there must be in the spec.

## Changing the API

1. Edit `dfpong-api.json`.
2. Run `node api/build.mjs`. It checks the spec, then rewrites the generated files.
3. If the change is something people can use, raise `version` (1.0 → 1.1) and add a `changelog`
   entry saying what's new.
4. Commit the spec and the generated files together. For library changes, also release a new library
   version (the Library Manager only sees tagged releases).

`node api/build.mjs --check` changes nothing and fails if the spec has a problem or a generated file
is out of date. GitHub runs it on every push (`.github/workflows/api.yml`).

### Examples

- **A new built-in sound**: add the file and its line to `game/cc26/assets/sounds/manifest.json`,
  add the name to `sounds` in the spec, run the build. Older libraries still accept the new name
  (with a note in the Serial Monitor); a library rebuilt from the spec knows it.
- **A new controller setting**: add it to `settings` with `"status": "experimental"` and
  `"since"` set to the new version. Then teach the game to use it (`settings.js` picks it up
  automatically for validation; the effect itself is game code) and add a library function.
  Once it has been used for a while without changes, make it `stable`.
- **Retiring something**: mark it `deprecated` with `replacedBy`, keep it working for at least a
  school year, then remove it in a new major version.

## The rules

These are also in the spec (`evolution`), so they show up in `docs/API.md`:

- The movement characteristic never changes.
- Add, don't change: new settings, names, values and messages arrive in a minor version, and
  existing ones keep their meaning.
- Readers forgive: the game ignores unknown settings and fixes values it can't use; controllers and
  admin panels ignore fields they don't know.
- `experimental` items may still change; `deprecated` items keep working for at least a year;
  `planned` names are reserved but not built yet.
- Breaking changes need a new major version and a new `configVersion`. Avoid them: controllers out in
  the world keep sending `"v": 1` for years.

## Older class folders

Each class folder keeps the `js/api.js` it shipped with, so a new spec never changes an old game.
`build.mjs` writes to `game/cc26` by default. For next year's folder:

```bash
node api/build.mjs --game game/cc27
```

(and change the default in `build.mjs` once that folder is the current one).
