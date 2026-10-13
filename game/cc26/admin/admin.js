/*
 * DF Pong admin panel.
 *
 * Opens in the same browser as the game (works with no setup), or on any
 * device when the game and this page both use a relay (see server/README.md).
 * Speaks the messages described in docs/PROTOCOL.md, section 6.
 */

const params = new URLSearchParams(location.search);
const form = document.querySelector('.connect-form');
form.room.value = params.get('room') || localStorage.getItem('dfpong:admin:room') || 'cc26';
form.relay.value = params.get('relay') || '';
form.key.value = sessionStorage.getItem('dfpong:admin:key') || '';

let link = null;
let target = ''; // '' = every game in the room
let edited = false; // once the admin edits the form, don't overwrite it with game state
const games = new Map(); // id → {snapshot, seenAt}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

function connect() {
  if (link) link.close();
  games.clear();
  const room = form.room.value.trim() || 'cc26';
  const relay = form.relay.value.trim() || null;
  localStorage.setItem('dfpong:admin:room', room);
  sessionStorage.setItem('dfpong:admin:key', form.key.value);
  const url = new URL(location.href);
  url.searchParams.set('room', room);
  relay ? url.searchParams.set('relay', relay) : url.searchParams.delete('relay');
  history.replaceState(null, '', url);

  link = new AdminLink({
    role: 'admin',
    room,
    relay,
    key: form.key.value,
    onStatus: renderStatus,
    onMessage: (msg) => {
      if (msg.type !== 'game:state') return;
      const snapshot = cleanSnapshot(msg);
      if (!snapshot) return;
      games.set(snapshot.id, { snapshot, seenAt: performance.now() });
      // Show the settings of the game commands go to (or the first game, when they go to all)
      if (!edited && snapshot.id === (target || games.keys().next().value)) fillForm(snapshot);
      renderGames();
    },
  });
  renderStatus(link.status());
  // Ask every game to report in. Repeat once in case the relay was still connecting.
  link.send({ type: 'admin:hello' });
  setTimeout(() => link.send({ type: 'admin:hello' }), 1200);
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  edited = false;
  connect();
});

function renderStatus(status) {
  const parts = [`Room <b>${esc(form.room.value)}</b>: games open in this browser connect automatically.`];
  if (status.relay) {
    const state = { open: 'connected', connecting: 'connecting…', closed: 'reconnecting…', error: `error — ${esc(status.detail)}` }[status.socket] || status.socket;
    parts.push(`Relay: ${state}.`);
  }
  document.querySelector('.link-status').innerHTML = parts.join(' ');
}

// ---------------------------------------------------------------------------
// Games in the room
// ---------------------------------------------------------------------------

/**
 * Anyone on the relay can claim to be a game, so treat every snapshot as untrusted:
 * keep only the fields we show, as the types we expect.
 */
function cleanSnapshot(msg) {
  if (typeof msg.id !== 'string' || !msg.id) return null;
  const text = (v, max = 60) => (typeof v === 'string' ? v.slice(0, max) : '');
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const pick = (obj, keys, fn) => Object.fromEntries(keys.filter((k) => obj && hasOwn(obj, k)).map((k) => [k, fn(obj[k])]));
  const gameKeys = Object.keys(GAME_SETTINGS);
  const players = Array.isArray(msg.players) ? msg.players.slice(0, 2) : [];
  return {
    id: text(msg.id, 32),
    instance: text(msg.instance),
    title: text(msg.title),
    table: text(msg.table, 24),
    liveChanges: hasOwn(LIVE_CHANGES, msg.liveChanges) ? msg.liveChanges : 'point',
    state: text(msg.state, 20),
    score: [num(msg.score?.[0]), num(msg.score?.[1])],
    rules: pick(msg.rules, gameKeys, num),
    house: pick(msg.house, gameKeys, num),
    locks: pick(msg.locks, gameKeys, Boolean),
    policy: hasOwn(POLICIES, msg.policy) ? msg.policy : 'average',
    musicChoice: typeof msg.musicChoice === 'string' ? msg.musicChoice.slice(0, 32) : 'auto',
    music: text(msg.music, 40),
    permissions: pick(msg.permissions, Object.keys(PERMISSIONS), Boolean),
    players: players.map((p, i) => ({
      slot: i + 1,
      name: text(p?.name, 40),
      person: text(p?.person, 40),
      device: p?.device === 'legacy2024' ? 'legacy2024' : Number.isInteger(p?.device) ? p.device : null,
      kind: text(p?.kind, 20),
      status: text(p?.status, 20),
      gen: text(p?.gen, 8),
      color: toHex(parseColor(text(p?.color, 40)) || parseColor(PALETTE.ink)),
      moveSpeed: num(p?.moveSpeed),
      paddleSize: num(p?.paddleSize),
      sounds: p && typeof p.sounds === 'object' ? Object.fromEntries(Object.entries(p.sounds).slice(0, 3).map(([k, v]) => [text(k, 10), text(v, 80)])) : {},
      requests: pick(p?.requests, gameKeys, num),
      issues: Array.isArray(p?.issues) ? p.issues.slice(0, 6).map((m) => text(m, 200)) : [],
    })),
  };
}

function renderGames() {
  const now = performance.now();
  for (const [id, g] of games) if (now - g.seenAt > 20000) games.delete(id);
  const box = document.querySelector('.games');
  if (!games.size) {
    box.innerHTML = `<div class="empty panel">No games found in this room yet. Open the game (same room${form.relay.value ? ' and relay' : ''}) and it will appear here.</div>`;
    return;
  }
  if (target && !games.has(target)) target = '';
  renderSendTo();
  const names = [...games.values()].map((g) => g.snapshot.table).filter(Boolean);
  const twins = names.filter((n, i) => names.indexOf(n) !== i);
  const warning = twins.length ? `<p class="help warn">More than one game is called “${esc(twins[0])}”. Rename one so you can tell them apart.</p>` : '';
  box.innerHTML = warning + [...games.values()]
    .map(({ snapshot: s, seenAt }) => {
      const stale = now - seenAt > 6000;
      const players = s.players
        .map(
          (p) => `
          <div class="admin-player" style="--player:${esc(p.color)}">
            <i class="swatch"></i>
            <div>
              <div class="admin-player-name">${esc(p.name)}${p.person ? ` <span class="help">(${esc(p.person)})</span>` : ''} <span class="score">${esc(s.score[p.slot - 1])}</span></div>
              <div class="help">${describePlayer(p)}</div>
              ${p.issues && p.issues.length ? `<ul class="messages">${p.issues.map((m) => `<li class="warn">${esc(m)}</li>`).join('')}</ul>` : ''}
            </div>
          </div>`
        )
        .join('');
      return `
        <article class="game-card panel ${stale ? 'stale' : ''} ${target === s.id ? 'targeted' : ''}">
          <header>
            <div><b>${esc(s.table || s.title || s.instance)}</b> <span class="help">${esc(s.table ? `${s.title || s.instance} · ${s.id}` : s.id)}</span></div>
            <span class="state-badge" data-state="${esc(s.state)}">${stale ? 'not responding' : esc(s.state)}</span>
          </header>
          <div class="admin-players">${players}</div>
          <p class="help">Music: ${esc(s.music || '—')}</p>
          <p class="help">Playing to ${esc(formatSetting('pointsToWin', s.rules.pointsToWin))} · puck ${esc(formatSetting('puckSpeed', s.rules.puckSpeed))} · ${esc(formatSetting('speedIncrement', s.rules.speedIncrement))} per hit</p>
          <button class="btn ghost rename-btn" data-rename="${esc(s.id)}">${s.table ? 'Rename table' : 'Name this table'}</button>
        </article>`;
    })
    .join('');
}

const gameName = (s) => s.table || s.id;

/** "Send to: All · Table A · Table B", shown when there's more than one game in the room. */
function renderSendTo() {
  const box = document.querySelector('.send-to');
  box.hidden = games.size < 2;
  const options = [['', 'All games'], ...[...games.values()].map(({ snapshot: s }) => [s.id, gameName(s)])];
  box.querySelector('.segmented').innerHTML = options
    .map(([id, label]) => `<button type="button" data-target="${esc(id)}" aria-pressed="${target === id}">${esc(label)}</button>`)
    .join('');
  const chosen = target && games.get(target);
  document.querySelector('.target-help').textContent = chosen ? `Commands and rules go to ${gameName(chosen.snapshot)} only.` : 'Commands go to every game in the room.';
  document.querySelector('.send').textContent = chosen ? `Send rules to ${gameName(chosen.snapshot)}` : 'Send rules to every game';
}

function describePlayer(p) {
  const kind = { controller: p.device === 'legacy2024' ? '2024 controller' : `controller #${p.device}${p.gen ? ' · ' + p.gen : ''}`, keyboard: 'keyboard / touch', cpu: 'computer' }[p.kind] || p.kind;
  const status = p.kind === 'controller' && p.status !== 'connected' ? ` · ${p.status}` : '';
  const extras = [];
  if (p.moveSpeed !== 10) extras.push(`speed ${p.moveSpeed}`);
  if (p.paddleSize !== 100) extras.push(`size ${p.paddleSize}%`);
  for (const [k, v] of Object.entries(p.sounds || {})) extras.push(`${k} sound ${v}`);
  for (const [k, v] of Object.entries(p.requests || {})) extras.push(`asks ${k} ${formatSetting(k, v)}`);
  return esc(kind + status + (extras.length ? ' · ' + extras.join(' · ') : ''));
}

document.querySelector('.send-to').addEventListener('click', (e) => {
  const b = e.target.closest('[data-target]');
  if (!b) return;
  target = b.dataset.target;
  edited = false;
  const chosen = games.get(target || games.keys().next().value);
  if (chosen) fillForm(chosen.snapshot);
  renderGames();
});

document.querySelector('.games').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rename]');
  if (!b || !games.has(b.dataset.rename)) return;
  const s = games.get(b.dataset.rename).snapshot;
  const name = prompt(`Table name for ${gameName(s)} (shown on its screen; leave empty to clear)`, s.table || '');
  if (name === null) return;
  link.send({ type: 'admin:table', target: s.id, name: cleanTableName(name) });
});

setInterval(renderGames, 2000);

// ---------------------------------------------------------------------------
// Rules form
// ---------------------------------------------------------------------------

const rulesForm = document.querySelector('.rules-form');
rulesForm.innerHTML = Object.entries(GAME_SETTINGS)
  .map(
    ([key, s]) => `
    <div class="setting-row" data-rule="${key}">
      <label for="rule-${key}">${s.label}</label>
      <output></output>
      <button type="button" class="lock" data-lock="${key}" aria-pressed="false" title="Lock: ignore what players ask for">
        <svg class="icon" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>
      </button>
      <input id="rule-${key}" type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.default}">
    </div>`
  )
  .join('');

const musicSelect = document.querySelector('[name="music"]');
musicSelect.innerHTML = [
  ['auto', "Players' choice (one player's music, or alternate both each point)"],
  ['p1', "Player 1's pick only"],
  ['p2', "Player 2's pick only"],
  ['off', 'Off'],
  ...Object.entries(GENERATED_TRACKS).map(([name, t]) => [name, `${t.title} (${t.mood}, generated)`]),
]
  .map(([value, label]) => `<option value="${value}">${esc(label)}</option>`)
  .join('');
// Recorded tracks come from the game's music manifest
fetch('../assets/music/manifest.json')
  .then((res) => (res.ok ? res.json() : { tracks: {} }))
  .then((manifest) => {
    const options = Object.entries(manifest.tracks || {})
      .map(([name, t]) => `<option value="${esc(name)}">${esc(t.title)} (${esc(t.mood || '')}, ${esc(t.licence || '')})</option>`)
      .join('');
    musicSelect.insertAdjacentHTML('beforeend', options);
  })
  .catch(() => {});

const policySelect = document.querySelector('[name="policy"]');
policySelect.innerHTML = Object.entries(POLICIES).map(([k, label]) => `<option value="${k}">${label}</option>`).join('');

const liveSelect = document.querySelector('[name="liveChanges"]');
liveSelect.innerHTML = Object.entries(LIVE_CHANGES).map(([k, o]) => `<option value="${k}">${o.label}</option>`).join('');

document.querySelector('.permissions-form').innerHTML = Object.entries(PERMISSIONS)
  .map(([k, label]) => `<label class="check"><input type="checkbox" data-permission="${k}" checked> ${label}</label>`)
  .join('');

function updateOutputs() {
  rulesForm.querySelectorAll('[data-rule]').forEach((row) => {
    row.querySelector('output').textContent = formatSetting(row.dataset.rule, parseFloat(row.querySelector('input').value));
  });
}

function fillForm(s) {
  // Only known keys reach a selector (snapshots are cleaned, but be strict anyway).
  for (const key of Object.keys(GAME_SETTINGS)) {
    if (hasOwn(s.house, key)) rulesForm.querySelector(`[data-rule="${key}"] input`).value = s.house[key];
    if (hasOwn(s.locks, key)) setLock(rulesForm.querySelector(`[data-lock="${key}"]`), s.locks[key]);
  }
  policySelect.value = s.policy;
  liveSelect.value = s.liveChanges;
  if ([...musicSelect.options].some((o) => o.value === s.musicChoice)) musicSelect.value = s.musicChoice;
  for (const key of Object.keys(PERMISSIONS)) {
    if (hasOwn(s.permissions, key)) document.querySelector(`[data-permission="${key}"]`).checked = s.permissions[key];
  }
  updateOutputs();
}

function setLock(button, locked) {
  button.classList.toggle('on', locked);
  button.setAttribute('aria-pressed', String(locked));
}

document.querySelector('.admin').addEventListener('input', () => {
  edited = true;
  updateOutputs();
});
rulesForm.addEventListener('click', (e) => {
  const b = e.target.closest('[data-lock]');
  if (!b) return;
  edited = true;
  setLock(b, b.getAttribute('aria-pressed') !== 'true');
});

document.querySelector('.send').addEventListener('click', () => {
  const rules = {};
  const locks = {};
  rulesForm.querySelectorAll('[data-rule]').forEach((row) => {
    rules[row.dataset.rule] = parseFloat(row.querySelector('input').value);
    locks[row.dataset.rule] = row.querySelector('[data-lock]').getAttribute('aria-pressed') === 'true';
  });
  const permissions = {};
  document.querySelectorAll('[data-permission]').forEach((box) => (permissions[box.dataset.permission] = box.checked));
  link.send({ type: 'admin:rules', rules, locks, policy: policySelect.value, liveChanges: liveSelect.value, music: musicSelect.value, permissions, ...(target ? { target } : {}) });
  edited = false;
  const button = document.querySelector('.send');
  button.textContent = 'Sent ✓';
  setTimeout(renderSendTo, 1500);
});

document.querySelector('.commands').addEventListener('click', (e) => {
  const b = e.target.closest('[data-command]');
  if (!b) return;
  link.send({ type: 'admin:command', command: b.dataset.command, ...(target ? { target } : {}) });
});

function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

updateOutputs();
connect();
