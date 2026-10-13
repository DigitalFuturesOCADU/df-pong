#!/usr/bin/env node
/*
 * DFPONG API build: turns api/dfpong-api.json into the files that use it.
 *
 *   node api/build.mjs           check the spec, then write the generated files
 *   node api/build.mjs --check   check the spec and fail if any generated file is out of date
 *
 * Options:
 *   --game <folder>      the class folder that follows this spec (default game/cc26).
 *                        Older folders keep the api.js they shipped with.
 *   --library <folder>   a df-pong-controller checkout (default ../df-pong-controller, if it exists)
 *
 * No dependencies: Node 18 or newer.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const CHECK = args.includes('--check');
const GAME = resolve(ROOT, option('--game', 'game/cc26'));
const LIBRARY = resolve(ROOT, option('--library', '../df-pong-controller'));
const HAS_LIBRARY = existsSync(join(LIBRARY, 'library.properties'));

const spec = JSON.parse(readFileSync(join(ROOT, 'api/dfpong-api.json'), 'utf8'));
const problems = [];
const problem = (message) => problems.push(message);
const entries = (obj) => Object.entries(obj || {}).filter(([key]) => !key.startsWith('$'));
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// ---------------------------------------------------------------------------
// 1. Is the spec consistent?
// ---------------------------------------------------------------------------

const STATUSES = Object.keys(spec.evolution.status);
const NAME_PATTERN = /^[a-z0-9_-]{1,32}$/;
const TYPES = ['text', 'color', 'number', 'sound', 'music'];

if (!/^\d+\.\d+$/.test(spec.version)) problem(`version "${spec.version}" should look like 1.0`);
if (String(spec.configVersion) !== spec.version.split('.')[0]) problem(`configVersion ${spec.configVersion} should match the major version of ${spec.version}`);
if (!spec.changelog.some((c) => c.version === spec.version)) problem(`the changelog has no entry for version ${spec.version}`);

const checkStatus = (where, item) => {
  if (item.status && !STATUSES.includes(item.status)) problem(`${where}: unknown status "${item.status}"`);
  if (item.status === 'deprecated' && !item.replacedBy) problem(`${where}: deprecated items need replacedBy`);
  if (item.since && !/^\d+\.\d+$/.test(item.since)) problem(`${where}: since "${item.since}" should look like 1.0`);
};

for (const [key, s] of entries(spec.settings)) {
  const where = `settings.${key}`;
  checkStatus(where, s);
  if (!['player', 'request'].includes(s.kind)) problem(`${where}: kind must be player or request`);
  if (!TYPES.includes(s.type)) problem(`${where}: unknown type "${s.type}"`);
  if (!hasOwn(spec.permissions, s.permission) || s.permission.startsWith('$')) problem(`${where}: unknown permission "${s.permission}"`);
  if (!hasOwn(spec.changeGroups, s.changes)) problem(`${where}: unknown change group "${s.changes}"`);
  if (s.kind === 'request' && s.changes !== 'match') problem(`${where}: rule requests are shared, so changes must be "match"`);
  if (s.type === 'number') {
    for (const field of ['min', 'max', 'step', 'default']) if (typeof s[field] !== 'number') problem(`${where}: numbers need ${field}`);
    if (!(s.min <= s.default && s.default <= s.max)) problem(`${where}: default ${s.default} is outside ${s.min}–${s.max}`);
  }
  if (['text', 'sound', 'music'].includes(s.type) && !(s.maxLength > 0)) problem(`${where}: ${s.type} settings need maxLength`);
  if (!s.library) problem(`${where}: name the library function that sets it`);
}
const mediaLengths = new Set(entries(spec.settings).filter(([, s]) => s.type === 'sound' || s.type === 'music').map(([, s]) => s.maxLength));
if (mediaLengths.size > 1) problem('every sound and music setting should have the same maxLength (the library shares one limit)');

const oneDefault = (name, obj) => {
  const defaults = entries(obj).filter(([, o]) => o.default);
  if (defaults.length !== 1) problem(`${name}: exactly one option should be the default`);
};
oneDefault('liveChanges', spec.liveChanges);
oneDefault('policies', spec.policies);
for (const [key, o] of entries(spec.liveChanges)) checkStatus(`liveChanges.${key}`, o);

for (const [kind, list] of [['sounds', spec.sounds], ['music', spec.music]]) {
  for (const [name, item] of entries(list)) {
    if (!NAME_PATTERN.test(name)) problem(`${kind}.${name}: names are lowercase letters, digits, - and _ (up to 32)`);
    checkStatus(`${kind}.${name}`, item);
  }
}
for (const [name] of entries(spec.music)) {
  if (hasOwn(spec.sounds, name)) problem(`"${name}" is both a sound and a music name; the game would refuse it as music`);
}
for (const [key, p] of entries(spec.permissions)) checkStatus(`permissions.${key}`, p);

const actionCodes = new Map();
for (const [name, a] of entries(spec.actions.codes)) {
  const where = `actions.${name}`;
  checkStatus(where, a);
  if (!Number.isInteger(a.code) || a.code < 1 || a.code > 255) problem(`${where}: code must be a whole number from 1 to 255`);
  if (actionCodes.has(a.code)) problem(`${where}: code ${a.code} is already used by ${actionCodes.get(a.code)}`);
  actionCodes.set(a.code, name);
  if (a.status === 'planned') continue;
  if (!(a.bytes >= 1 && a.bytes <= spec.actions.maxBytes)) problem(`${where}: bytes must be 1–${spec.actions.maxBytes}`);
  if (!a.library) problem(`${where}: name the library function that sends it`);
  if (a.permission && !hasOwn(spec.permissions, a.permission)) problem(`${where}: unknown permission "${a.permission}"`);
  if (a.emotes && !(Array.isArray(a.emotes) && a.emotes.length)) problem(`${where}: emotes should be a list of words`);
}

for (const [key, f] of entries(spec.classList.fields)) checkStatus(`classList.${key}`, f);
for (const [type, m] of entries(spec.admin.messages)) checkStatus(`admin.messages.${type}`, m);
for (const [name, c] of entries(spec.bluetooth.characteristics)) {
  checkStatus(`bluetooth.${name}`, c);
  if (!hasOwn(spec.bluetooth.uuidBase, name)) problem(`bluetooth.${name}: no uuidBase`);
}

// ---------------------------------------------------------------------------
// 2. Does the game folder have what the spec promises?
// ---------------------------------------------------------------------------

const gameFile = (path) => join(GAME, path);
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const sameSet = (what, specNames, actualNames, where) => {
  const missing = specNames.filter((n) => !actualNames.includes(n));
  const extra = actualNames.filter((n) => !specNames.includes(n));
  if (missing.length) problem(`${what} in the spec but not in ${where}: ${missing.join(', ')}`);
  if (extra.length) problem(`${what} in ${where} but not in the spec: ${extra.join(', ')}`);
};

if (existsSync(GAME)) {
  const rel = relative(ROOT, GAME);
  const soundManifest = readJson(gameFile('assets/sounds/manifest.json'));
  const roleOnly = new Set(Object.values(soundManifest.roles || {}).filter((n) => !hasOwn(spec.sounds, n))); // e.g. the room sound
  const fileSounds = Object.keys(soundManifest.sounds || {}).filter((n) => !roleOnly.has(n));
  const specFileSounds = entries(spec.sounds).filter(([, s]) => s.kind !== 'synth').map(([n]) => n);
  sameSet('Recorded sounds', specFileSounds, fileSounds, `${rel}/assets/sounds/manifest.json`);

  const audio = readFileSync(gameFile('js/audio.js'), 'utf8');
  const recipes = audio.slice(audio.indexOf('const SYNTH_RECIPES'));
  for (const [name, s] of entries(spec.sounds)) {
    if (s.kind === 'synth' && !new RegExp(`\\n\\s+${name}:`).test(recipes)) problem(`synth sound "${name}" has no recipe in ${rel}/js/audio.js`);
  }

  const musicManifest = readJson(gameFile('assets/music/manifest.json'));
  const specRecorded = entries(spec.music).filter(([, m]) => m.kind === 'recorded').map(([n]) => n);
  sameSet('Recorded music', specRecorded, Object.keys(musicManifest.tracks || {}), `${rel}/assets/music/manifest.json`);

  const musicJs = readFileSync(gameFile('js/music.js'), 'utf8');
  const generated = musicJs.slice(musicJs.indexOf('const GENERATED_TRACKS'));
  const generatedNames = [...generated.matchAll(/\n {2}([a-z0-9_-]+): \{/g)].map((m) => m[1]);
  const specGenerated = entries(spec.music).filter(([, m]) => m.kind === 'generated').map(([n]) => n);
  sameSet('Generated music', specGenerated, generatedNames, `${rel}/js/music.js`);
} else {
  problem(`game folder ${GAME} not found (use --game)`);
}

// ---------------------------------------------------------------------------
// 3. Generated files
// ---------------------------------------------------------------------------

const BANNER = 'Generated from api/dfpong-api.json by api/build.mjs. Edit the spec, not this file.';

function gameApiJs() {
  return `/*
 * api.js — the DFPONG API ${spec.version}: settings, names and limits this game follows.
 * ${BANNER}
 *
 * settings.js builds its tables from this, so the game, the library and the docs agree.
 */

const DFPONG_API = Object.freeze(${JSON.stringify(spec, null, 2)});
`;
}

const upper = (key) => key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
const cString = (text) => `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const cNumber = (n, decimal) => (decimal ? (Number.isInteger(n) ? `${n}.0` : String(n)) : String(n));

function libraryHeader() {
  const lines = [];
  for (const [key, s] of entries(spec.settings)) {
    if (s.type === 'number') {
      const decimal = !Number.isInteger(s.step);
      const type = decimal ? 'double' : 'long';
      lines.push(`    // ${s.label}${s.status !== 'stable' ? ` (${s.status})` : ''}`);
      for (const field of ['min', 'max', 'default']) lines.push(`    const ${type} ${upper(key)}_${field.toUpperCase()} = ${cNumber(s[field], decimal)};`);
    }
  }
  const nameSetting = spec.settings.name;
  const media = [...mediaLengths][0];
  const names = (list) => entries(list).map(([n]) => `        ${cString(n)},`).join('\n');
  const timing = entries(spec.bluetooth.timing).map(([k, t]) => `    const unsigned long ${upper(k)} = ${t.value}; // ${t.description}`);
  const actionLines = [];
  for (const [name, a] of entries(spec.actions.codes)) {
    if (a.status === 'planned') {
      actionLines.push(`    // code ${a.code} is reserved for ${name} (planned)`);
      continue;
    }
    actionLines.push(`    const uint8_t ACTION_${upper(name)} = ${a.code};${a.status !== 'stable' ? ` // ${a.status}` : ''}`);
    if (a.minIntervalMs) actionLines.push(`    const unsigned long ${upper(name)}_MIN_INTERVAL_MS = ${a.minIntervalMs};`);
    if (a.cooldownMs) actionLines.push(`    const unsigned long ${upper(name)}_COOLDOWN_MS = ${a.cooldownMs};`);
    if (a.emotes) {
      actionLines.push(`    const char* const ${upper(name)}_EMOTES[] = { ${a.emotes.map(cString).join(', ')} };`);
      actionLines.push(`    const size_t ${upper(name)}_EMOTE_COUNT = ${a.emotes.length};`);
    }
  }
  return `// ${BANNER}
//
// The DFPONG API ${spec.version}: the limits and names the game and this library agree on.
// The game also accepts names this library doesn't know yet, so a newer game can add sounds
// and music without a new library release.

#ifndef DFPONG_SPEC_H
#define DFPONG_SPEC_H

#include <stddef.h>
#include <stdint.h>

#define DFPONG_API_VERSION ${cString(spec.version)}
#define DFPONG_CONFIG_VERSION ${spec.configVersion}

namespace DFPongSpec {

    // Bluetooth
    const char* const SERVICE_UUID_BASE = ${cString(spec.bluetooth.uuidBase.service)};
    const char* const MOVEMENT_UUID_BASE = ${cString(spec.bluetooth.uuidBase.movement)};
    const char* const CONFIG_UUID_BASE = ${cString(spec.bluetooth.uuidBase.config)};
    const char* const ACTIONS_UUID_BASE = ${cString(spec.bluetooth.uuidBase.actions)};
    const int CONTROLLER_NUMBER_MIN = ${spec.bluetooth.controllerNumber.min};
    const int CONTROLLER_NUMBER_MAX = ${spec.bluetooth.controllerNumber.max};
    const size_t CONFIG_MAX_BYTES = ${spec.bluetooth.characteristics.config.maxBytes};
    const unsigned long CONFIG_MIN_UPDATE_MS = ${spec.bluetooth.characteristics.config.minUpdateMs};
${timing.join('\n')}

    // Settings
    const size_t NAME_MAX_CHARACTERS = ${nameSetting.maxLength};
    const size_t MEDIA_MAX_LENGTH = ${media}; // sound and music names or links
${lines.join('\n')}

    // Actions (byte 0 of a packet on the actions characteristic)
    const size_t ACTIONS_MAX_BYTES = ${spec.actions.maxBytes};
${actionLines.join('\n')}

    // Built-in sound names (hitSound, scoreSound, winSound)
    const char* const SOUNDS[] = {
${names(spec.sounds)}
    };
    const size_t SOUND_COUNT = sizeof(SOUNDS) / sizeof(SOUNDS[0]);

    // Built-in music names
    const char* const MUSIC[] = {
${names(spec.music)}
    };
    const size_t MUSIC_COUNT = sizeof(MUSIC) / sizeof(MUSIC[0]);

}  // namespace DFPongSpec

#endif
`;
}

const md = {
  esc: (t) => String(t ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' '),
  table(head, rows) {
    return [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(md.esc).join(' | ')} |`)].join('\n');
  },
};
const statusText = (item) => (item.status && item.status !== 'stable' ? `**${item.status}**` : 'stable') + (item.since ? ` · ${item.since}` : '');

function apiMarkdown() {
  const s = spec;
  const range = (x) =>
    x.type === 'number' ? `${x.min}–${x.max}, default ${x.default}` : x.maxLength ? `up to ${x.maxLength} characters` : x.type === 'color' ? '"#rrggbb" or a color name' : '';
  const example = { v: s.configVersion, name: 'Thunderpaddle', color: '#d08b5b', moveSpeed: 14, hitSound: 'pluck', pointsToWin: 7 };
  const changeLabel = (key) => ({ looks: 'looks', handling: 'handling', match: 'next match' })[key] || key;
  const sections = [];

  sections.push(`<!-- ${BANNER} -->

# ${s.name} ${s.version}

${s.evolution.summary}

- Machine-readable: [api/dfpong-api.json](../api/dfpong-api.json). How to change it: [api/README.md](../api/README.md).
- How connecting works step by step (handshake, reconnecting, padding): [PROTOCOL.md](PROTOCOL.md).

## How the API changes

${s.evolution.rules.map((r) => `- ${r}`).join('\n')}

${md.table(['Status', 'Meaning'], Object.entries(s.evolution.status))}

Every item says its status and the version it arrived in (\`since\`). A controller's settings
carry \`"v": ${s.configVersion}\`, the API's major version.`);

  const b = s.bluetooth;
  sections.push(`## Bluetooth

${b.description} UUID = base + suffix. ${b.uuidSuffix} Controller numbers: ${b.controllerNumber.min}–${b.controllerNumber.max}.

${md.table(
  ['Characteristic', 'UUID base', 'Properties', 'Status', 'What it does'],
  entries(b.characteristics).map(([name, c]) => [`\`${name}\``, `\`${b.uuidBase[name]}\``, (c.properties || []).join(', ') || '—', statusText(c), c.description])
)}

Movement values (${b.characteristics.movement.size}):

${md.table(['Value', 'Name', 'Meaning'], entries(b.characteristics.movement.values).map(([v, x]) => [v, x.name, x.description]))}

${b.characteristics.movement.otherValues} Settings JSON: at most ${b.characteristics.config.maxBytes} bytes, updated at most every ${b.characteristics.config.minUpdateMs} ms.

${md.table(['Timing', 'Value', 'Meaning'], entries(b.timing).map(([k, t]) => [`\`${k}\``, String(t.value), t.description]))}`);

  sections.push(`## Controller settings

One JSON object on the config characteristic, for example:

\`\`\`json
${JSON.stringify(example)}
\`\`\`

All keys are optional. **player** settings only change your side; **requests** are shared game rules,
settled with the other player when the match starts (see policies). "During a match" says when a change
takes effect if the controller changes it mid-match (see below).

${md.table(
  ['Key', 'Kind', 'Type', 'Range', 'Permission', 'During a match', 'Library', 'Status'],
  entries(s.settings).map(([k, x]) => [`\`${k}\``, x.kind, x.type, range(x), `\`${x.permission}\``, changeLabel(x.changes), `\`${x.library}()\``, statusText(x)])
)}

${entries(s.settings).map(([k, x]) => `- \`${k}\`: ${x.description}`).join('\n')}`);

  const act = s.actions;
  sections.push(`## Actions

${act.description} Each packet is at most ${act.maxBytes} bytes: byte 0 is the action code, then the action's bytes.
Readers ignore extra bytes and unknown codes, so later versions can add to them.

${md.table(
  ['Code', 'Action', 'Bytes', 'Fields', 'Library', 'Limits', 'Status'],
  entries(act.codes).map(([name, a]) => [
    String(a.code),
    `\`${name}\``,
    a.bytes ? String(a.bytes) : '—',
    entries(a.fields).map(([f, t]) => `${f}: ${t}`).join('; ') || '—',
    a.library ? `\`${a.library}()\`` : '—',
    [a.minIntervalMs && `at most every ${a.minIntervalMs} ms`, a.cooldownMs && `one per ${a.cooldownMs / 1000} s`, a.permission && `permission \`${a.permission}\``].filter(Boolean).join(', ') || '—',
    statusText(a),
  ])
)}

${entries(act.codes).map(([name, a]) => `- \`${name}\`: ${a.description}${a.emotes ? ` Emotes: ${a.emotes.map((e, i) => `${i} = ${e}`).join(', ')}.` : ''}`).join('\n')}`);

  sections.push(`## When changes apply during a match

The host chooses (house setting \`liveChanges\`). ${entries(s.changeGroups).map(([k, t]) => `**${changeLabel(k)}**: ${t}`).join(' ')}

${md.table(
  ['`liveChanges`', 'Label', 'Looks', 'Handling', 'Status'],
  entries(s.liveChanges).map(([k, o]) => [`\`${k}\`${o.default ? ' (default)' : ''}`, o.label, o.looks, o.handling, statusText(o)])
)}`);

  sections.push(`## House settings

Permissions (which kinds of settings controllers may use):

${md.table(['Permission', 'Label'], entries(s.permissions).map(([k, o]) => [`\`${k}\``, o.label]))}

Policies (how two different rule requests are settled):

${md.table(['Policy', 'Label'], entries(s.policies).map(([k, o]) => [`\`${k}\`${o.default ? ' (default)' : ''}`, o.label]))}`);

  sections.push(`## Built-in sounds

For \`hitSound\`, \`scoreSound\` and \`winSound\`. Any \`https://\` link to a short sound file works too.

${md.table(['Name', 'Kind', 'What it is'], entries(s.sounds).map(([n, x]) => [`\`${n}\``, x.kind, x.description]))}

## Music

For \`music\`. Any \`https://\` link to a music file works too.

${md.table(['Name', 'Kind', 'Mood', 'Credit', 'Licence'], entries(s.music).map(([n, x]) => [`\`${n}\``, x.kind, x.mood, x.credit || 'DF Pong', x.licence || '']))}`);

  sections.push(`## Class list

${s.classList.description} File: \`${s.classList.file}\`.

${md.table(
  ['Field', 'Type', 'Limits', 'Status', 'Meaning'],
  entries(s.classList.fields).map(([k, f]) => [`\`${k}\`${f.required ? ' (required)' : ''}`, f.type, f.type === 'number' ? `${f.min}–${f.max}` : `up to ${f.maxLength} characters`, statusText(f), f.description])
)}`);

  sections.push(`## Admin messages

${s.admin.description} ${s.admin.rooms}

${entries(s.admin.messages)
  .map(
    ([type, m]) =>
      `### \`${type}\`\n\n${m.direction} · ${statusText(m)}${m.description ? `\n\n${m.description}` : ''}${
        m.fields ? `\n\n${md.table(['Field', 'Meaning'], entries(m.fields).map(([f, t]) => [`\`${f}\``, t]))}` : ''
      }`
  )
  .join('\n\n')}`);

  sections.push(`## Planned

${entries(s.planned).map(([k, p]) => `- **${k}** (${p.status}): ${p.description}`).join('\n')}

## Changelog

${s.changelog.map((c) => `### ${c.version} (${c.date})\n\n${c.changes.map((x) => `- ${x}`).join('\n')}`).join('\n\n')}
`);

  return sections.join('\n\n');
}

const outputs = [
  [join(GAME, 'js/api.js'), gameApiJs()],
  [join(ROOT, 'docs/API.md'), apiMarkdown()],
];
if (HAS_LIBRARY) outputs.push([join(LIBRARY, 'src/DFPongSpec.h'), libraryHeader()]);

// ---------------------------------------------------------------------------
// 4. Write, or check
// ---------------------------------------------------------------------------

if (problems.length) {
  console.error(`The spec has ${problems.length} problem${problems.length > 1 ? 's' : ''}:`);
  problems.forEach((p) => console.error(`  - ${p}`));
  process.exit(1);
}

const stale = [];
for (const [path, text] of outputs) {
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (current === text) continue;
  if (CHECK) stale.push(path);
  else {
    writeFileSync(path, text);
    console.log(`wrote ${relative(ROOT, path)}`);
  }
}

if (CHECK && stale.length) {
  console.error('Out of date (run `node api/build.mjs`):');
  stale.forEach((p) => console.error(`  - ${relative(ROOT, p)}`));
  process.exit(1);
}
console.log(`${spec.name} ${spec.version}: spec OK${CHECK ? ', generated files up to date' : ''}${HAS_LIBRARY ? '' : ' (library not found, skipped DFPongSpec.h)'}`);
