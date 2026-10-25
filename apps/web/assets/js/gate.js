/* Gate App — Module 4 prototype (attendance at the school gate, staff-operated).
   - Runs on a staff phone or a shared school phone at the gate; each staff member on duty
     unlocks it with their own PIN. Students never touch it.
   - Arrival by card scan (camera, next stage) or manual check-in (class + class number + reason).
   - Works offline: the student list is stored on the phone; check-ins queue in an outbox and
     sync. The school server keeps the earliest arrival when two phones record the same student,
     and corrects (and flags) times from a phone whose clock is wrong.
   - Parents are told "Arrived at school at HH:MM" (gate arrival, never "in class").
   Spec: docs/spec/03-module-plans.md §Module 4. Shared data: assets/js/school-data.js (gate). */
(() => {
  const $ = (s, p = document) => p.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LOCAL = {
    get(k, d) { try { const v = localStorage.getItem('bchs-gate-' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('bchs-gate-' + k, JSON.stringify(v)); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem('bchs-gate-' + k); } catch { /* storage unavailable */ } }
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const LOCK_MINUTES = 10;
  const MAX_PIN_TRIES = 5;
  const SKEW_LIMIT = 2 * 60e3;           // a phone clock more than 2 minutes off is corrected and flagged
  const REASONS = ['Forgot card', 'Lost card', 'Damaged card', 'Other'];

  let db = SchoolData.load();            // the "school server" in this prototype
  let P = loadPhone();                   // this phone's own copy and outbox

  const NAV = [['gate', 'Gate'], ['today', 'Today'], ['sync', 'Sync']];
  const TOP = NAV.map((n) => n[0]);
  const ui = { view: 'gate', prev: 'gate', cls: null, num: '', reason: '', q: '', filter: 'arrived', tcls: 'all' };
  const pin = { mode: 'pin', value: '', first: '', tries: 0, msg: '', staff: null };
  let lastActive = Date.now(), syncing = false, syncTimer = 0, resultTimer = 0;

  // ---------- Phone storage ----------
  function loadPhone() {
    const p = LOCAL.get('device', null);
    if (p && p.v === 1) return p;
    return { v: 1, deviceId: 'gate-' + Math.random().toString(36).slice(2, 7), staff: null, roster: null, known: {}, log: [], outbox: [], seq: 0, lastSync: null, offline: false, clockOffset: 0, skew: 0, sound: true };
  }
  function savePhone() { if (!LOCAL.set('device', P)) toast('This phone is out of storage space. Free some space so check-ins keep saving.'); }

  // ---------- Clocks ----------
  /* The prototype can put the whole school at a morning time (Sync → Morning rush), so lateness is easy to see. */
  const worldNow = () => { const d = db.gate.demo; return d ? d.base + (Date.now() - d.startedAt) : Date.now(); };
  const serverNow = () => worldNow();
  const deviceNow = () => worldNow() + (P.clockOffset || 0);
  const online = () => !P.offline && navigator.onLine !== false;
  const pad = (n) => String(n).padStart(2, '0');
  const dayOf = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const hhmm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const today = () => dayOf(deviceNow());
  const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never');

  // ---------- Data helpers ----------
  const cfg = () => P.roster?.config || db.gate.config;
  const staffList = () => [...db.teachers, ...db.gate.staff];
  const staffById = (id) => staffList().find((s) => s.id === id);
  const staffName = (id) => { const s = staffById(id); return s ? `${s.title} ${s.name}` : '—'; };
  const initials = (n) => { const p = n.split(' '); return (p[0][0] + p[p.length - 1][0]).toUpperCase(); };
  const roster = () => P.roster?.students || [];
  const classes = () => P.roster?.classes || [];
  const className = (id) => classes().find((c) => c.id === id)?.name || '—';
  const student = (sid) => roster().find((s) => s.id === sid);
  const classRoster = (c) => roster().filter((s) => s.cls === c).sort((a, b) => a.no - b.no);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  function cacheRoster() {
    db = SchoolData.load();
    P.roster = {
      at: new Date(serverNow()).toISOString(),
      classes: db.classes.map(({ id, name }) => ({ id, name })),
      students: db.students.map(({ id, cls, no, name }) => ({ id, cls, no, name })),
      cards: JSON.parse(JSON.stringify(db.gate.cards)),
      config: { ...db.gate.config }
    };
  }
  /* Today's arrivals as this phone knows them: the school's list at the last sync plus this phone's own. */
  function arrivals(day = today()) {
    const out = { ...(P.known[day] || {}) };
    P.log.filter((e) => e.day === day).forEach((e) => { if (!out[e.sid] || e.at < out[e.sid].at) out[e.sid] = e; });
    return out;
  }

  // ---------- Recording an arrival ----------
  function record(sid, method, reason = '', cardV = null) {
    const t = deviceNow(), day = dayOf(t), prev = arrivals(day)[sid];
    if (prev) return { dup: true, prev, sid };
    const e = { id: `${P.deviceId}-${++P.seq}`, sid, day, at: new Date(t).toISOString(), time: hhmm(t), method, reason, cardV, staff: P.staff, device: P.deviceId, late: hhmm(t) > cfg().lateAfter };
    P.log.push(e);
    P.outbox.push({ ...e, state: 'pending' });
    savePhone(); scheduleSync();
    return { entry: e, sid };
  }

  // ---------- The school server (simulated) ----------
  function serverApply(op, skew) {
    const g = db.gate;
    if (g.events.some((x) => x.id === op.id)) return { state: 'synced' }; // the same check-in sent twice is applied once
    const flagged = Math.abs(skew) > SKEW_LIMIT, t = new Date(op.at).getTime() + (flagged ? skew : 0);
    const at = new Date(t).toISOString(), day = flagged ? dayOf(t) : op.day, time = hhmm(t);
    const late = time > g.config.lateAfter, serverAt = new Date(serverNow()).toISOString();
    const ev = { id: op.id, sid: op.sid, day, at, time, clientAt: op.at, serverAt, method: op.method, reason: op.reason, cardV: op.cardV, staff: op.staff, device: op.device, late, clock: flagged ? 'corrected' : 'ok' };
    g.events.push(ev);
    const list = g.days[day] || (g.days[day] = {}), cur = list[op.sid];
    if (cur && cur.at <= at) { ev.kept = false; return { state: 'duplicate', keptAt: cur.time, keptDevice: cur.device, clock: ev.clock }; }
    list[op.sid] = { at, time, method: op.method, reason: op.reason, late, device: op.device, staff: op.staff, event: op.id, clock: ev.clock };
    ev.kept = true;
    if (!cur && g.config.notify) {
      const s = db.students.find((x) => x.id === op.sid);
      g.alerts.push({ id: 'al-' + op.id, sid: op.sid, day, text: `${s ? s.name : 'Your child'} arrived at school at ${time}.`, at: serverAt, status: 'queued' });
    }
    return { state: 'synced', clock: ev.clock };
  }

  async function sync(manual = false) {
    if (syncing || !P.staff) return;
    if (!online()) { if (manual) toast('No connection. Check-ins are safe on this phone and send when you are back online.'); renderStatus(); return; }
    syncing = true; renderStatus();
    db = SchoolData.load();
    const batch = P.outbox.filter((o) => o.state === 'pending');
    batch.forEach((o) => { o.state = 'sending'; });
    await wait(batch.length ? 400 : 200);
    if (!online()) { batch.forEach((o) => { o.state = 'pending'; }); syncing = false; savePhone(); renderStatus(); return; }
    const skew = serverNow() - deviceNow();
    let dups = 0, fixed = 0;
    batch.forEach((op) => {
      const res = serverApply(op, skew);
      Object.assign(op, res, { sentAt: new Date(serverNow()).toISOString() });
      if (res.state === 'duplicate') dups++;
      if (res.clock === 'corrected') fixed++;
    });
    SchoolData.save();
    P.skew = skew;
    P.lastSync = new Date(serverNow()).toISOString();
    cacheRoster();
    const sday = dayOf(serverNow());
    P.known = { [sday]: { ...(db.gate.days[sday] || {}) } };
    const keep = P.outbox.filter((o) => o.state === 'pending' || o.state === 'sending'), done = P.outbox.filter((o) => !keep.includes(o)).slice(-40);
    P.outbox = [...keep, ...done];
    P.log = P.log.filter((e) => e.day >= dayOf(deviceNow() - 864e5));
    savePhone();
    syncing = false;
    if (fixed) toast(`This phone's clock is ${Math.round(Math.abs(skew) / 60e3)} min ${skew > 0 ? 'slow' : 'fast'}. ${fixed} time${fixed > 1 ? 's were' : ' was'} corrected and flagged for the office.`);
    else if (dups) toast(`${dups} student${dups > 1 ? 's were' : ' was'} already recorded by another phone. The earliest time is kept.`);
    else if (manual) toast(batch.length ? `${batch.length} check-in${batch.length > 1 ? 's' : ''} sent to the school system.` : 'Everything is up to date.');
    if (!$('#modalLayer').classList.contains('open') && !document.activeElement?.matches?.('#view input')) render(); else renderStatus();
  }
  function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(() => sync(), 1500); }
  const waiting = () => P.outbox.filter((o) => o.state === 'pending' || o.state === 'sending');

  // ---------- Feedback: toast, modal, sound, vibration ----------
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3600); }
  function modal(title, body) { $('#modalTitle').textContent = title; $('#modalBody').innerHTML = body; $('#modalLayer').classList.add('open'); }
  const closeModal = () => $('#modalLayer').classList.remove('open');
  const actions = (cancel, primary, act) => `<div class="form-actions"><button class="mini-btn" data-close>${cancel}</button><button class="mini-btn primary" data-act="${act}">${primary}</button></div>`;
  let audio = null;
  function beep(kind) {
    if (!P.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const tones = kind === 'ok' ? [[880, 0.09]] : kind === 'late' ? [[880, 0.08], [620, 0.14]] : [[300, 0.16], [300, 0.16]];
      let t = audio.currentTime;
      tones.forEach(([f, d]) => { const o = audio.createOscillator(), g = audio.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.value = 0.05; o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + d); t += d + 0.05; });
    } catch { /* no audio */ }
  }
  const buzz = (p) => { try { navigator.vibrate?.(p); } catch { /* not supported */ } };

  // ---------- Geometric pieces (on black: white and green shapes, black cut-outs) ----------
  const svg = (box, body) => `<svg class="art" viewBox="${box}" aria-hidden="true" focusable="false">${body}</svg>`;
  const K = '#000', W = '#fff', G = '#3dba3d';
  const ART = {
    signin: svg('0 0 470 340', `<path d="M40 340V170A130 130 0 0 1 300 170V340H230V182A60 60 0 0 0 110 182V340Z" fill="${W}"/><circle cx="170" cy="262" r="42" fill="${G}"/><rect x="58" y="292" width="34" height="34" fill="${K}"/><rect x="320" y="60" width="130" height="190" fill="${G}"/><rect x="340" y="80" width="90" height="90" fill="${W}"/><rect x="352" y="92" width="26" height="26" fill="${K}"/><rect x="392" y="92" width="26" height="26" fill="${K}"/><rect x="352" y="132" width="26" height="26" fill="${K}"/><rect x="396" y="136" width="14" height="14" fill="${K}"/><rect x="340" y="196" width="70" height="14" fill="${K}"/><rect x="340" y="220" width="44" height="14" fill="${K}"/>`),
    gate: svg('0 0 230 110', `<path d="M0 110V60A45 45 0 0 1 90 60V110H64V64A19 19 0 0 0 26 64V110Z" fill="${W}"/><circle cx="45" cy="92" r="10" fill="${G}"/><rect x="110" y="20" width="70" height="90" fill="${G}"/><rect x="122" y="32" width="46" height="46" fill="${K}"/><rect x="130" y="40" width="12" height="12" fill="${W}"/><rect x="148" y="58" width="12" height="12" fill="${W}"/><rect x="196" y="20" width="14" height="90" fill="${W}"/><rect x="216" y="50" width="14" height="60" fill="${G}"/>`),
    today: svg('0 0 230 110', `<rect width="110" height="110" fill="${W}"/><rect x="12" y="12" width="22" height="22" fill="${K}"/><rect x="44" y="12" width="22" height="22" fill="${K}"/><rect x="76" y="12" width="22" height="22" fill="${G}"/><rect x="12" y="44" width="22" height="22" fill="${K}"/><rect x="44" y="44" width="22" height="22" fill="${G}"/><rect x="76" y="44" width="22" height="22" fill="${K}"/><rect x="12" y="76" width="22" height="22" fill="${G}"/><rect x="44" y="76" width="22" height="22" fill="${K}"/><rect x="128" y="70" width="20" height="40" fill="${G}"/><rect x="156" y="44" width="20" height="66" fill="${W}"/><rect x="184" y="20" width="20" height="90" fill="${G}"/><circle cx="218" cy="12" r="12" fill="${W}"/>`),
    sync: svg('0 0 230 110', `<path d="M0 110V20A90 90 0 0 1 90 110Z" fill="${W}"/><circle cx="22" cy="88" r="14" fill="${K}"/><path d="M230 0V90A90 90 0 0 1 140 0Z" fill="${G}"/><circle cx="208" cy="22" r="14" fill="${W}"/><rect x="100" y="48" width="30" height="14" fill="${W}"/>`),
    account: svg('0 0 230 110', `<rect y="30" width="80" height="80" fill="${G}"/><circle cx="40" cy="70" r="22" fill="${K}"/><circle cx="40" cy="70" r="9" fill="${W}"/><rect x="96" y="62" width="134" height="16" fill="${W}"/><rect x="196" y="78" width="16" height="26" fill="${W}"/><rect x="170" y="78" width="12" height="18" fill="${W}"/><rect x="110" y="10" width="40" height="40" fill="${W}"/><rect x="120" y="20" width="20" height="20" fill="${G}"/>`),
    empty: svg('0 0 112 72', `<rect width="72" height="72" fill="${W}"/><path d="M14 72V40a22 22 0 0 1 44 0v32H46V42a10 10 0 0 0-20 0v30Z" fill="${K}"/><circle cx="36" cy="16" r="7" fill="${G}"/><rect x="80" width="32" height="72" fill="${G}"/><rect x="88" y="10" width="16" height="16" fill="${K}"/>`)
  };
  const ART_FOR = { gate: 'gate', manual: 'gate', today: 'today', sync: 'sync', account: 'account' };
  /* Custom solid marks for the phone tab bar, drawn like the geometric pieces (not an icon set). */
  const GLYPH = {
    gate: '<path d="M3 22V11a9 9 0 0 1 18 0v11h-5v-10a4 4 0 0 0-8 0v10z"/>',
    today: '<rect x="3" y="3" width="5" height="5"/><rect x="10" y="3" width="5" height="5"/><rect x="17" y="3" width="4" height="5"/><rect x="3" y="10" width="5" height="5"/><rect x="10" y="10" width="5" height="5"/><rect x="3" y="17" width="5" height="4"/>',
    sync: '<path d="M3 11a9 9 0 0 1 18 0z"/><path d="M21 13a9 9 0 0 1-18 0z"/>'
  };
  const glyph = (k) => `<svg class="tp-glyph" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${GLYPH[k]}</svg>`;

  // ---------- Sign-in, staff on duty and PIN ----------
  const brand = '<span class="tp-brand"><span class="tp-brand-mark"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3l8 4-8 4-8-4 8-4zM6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" stroke="#3DBA3D" stroke-width="1.8"/></svg></span><span>BCHS Nkwen<small>Gate app</small></span></span>';
  function gateScreen(card, isPin) {
    const g = $('#gate');
    g.hidden = false;
    g.classList.toggle('pin', !!isPin);
    g.innerHTML = `<aside class="tp-gate-art">${brand}${ART.signin}<div><h2>Every arrival, checked by a person, even offline.</h2><p>Scan the card or enter the class number, check the face, and the parent is told when their child arrived.</p></div></aside><div class="tp-gate-main"><div class="ta-gate-card">${card}</div></div>`;
  }
  const pins = () => LOCAL.get('pins', {});
  function showWho(msg = '') {
    $('#app').classList.remove('active'); closeModal(); closeResult();
    const known = Object.keys(pins()).filter((id) => staffById(id));
    if (!known.length) return showSignin(msg);
    gateScreen(`<span class="tp-label">${esc(cfg().gateName)}</span><h1>Who is on duty?</h1><p>Each staff member unlocks the gate phone with their own PIN, so every check-in shows who recorded it.</p>
      ${msg ? `<p class="ta-msg err" style="margin:0 0 1rem">${esc(msg)}</p>` : ''}
      <div class="ta-card-list">${known.map((id) => { const s = staffById(id); return `<button class="ta-item" data-who="${id}"><span class="ta-tok">${initials(s.name)}</span><span class="ta-item-main"><b>${esc(s.title)} ${esc(s.name)}</b><small>${esc(s.roles.join(' · '))}</small></span><span class="ta-item-side"></span><svg class="ta-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg></button>`; }).join('')}</div>
      <p class="ta-gate-note">Not listed? <button data-act="newStaff">Sign in as another staff member</button>. Check-ins waiting to upload stay on this phone.</p>`);
  }
  function showSignin(msg = '') {
    $('#app').classList.remove('active'); closeModal(); closeResult();
    gateScreen(`<span class="tp-label">Gate duty</span><h1>Sign in</h1><p>Use your school staff account. You will then choose a PIN for this phone.</p>
      ${msg ? `<p class="ta-msg err" style="margin:0 0 1rem">${esc(msg)}</p>` : ''}
      <form id="signinForm"><label class="form-label">Staff email<input name="email" type="email" value="w.ngu@bchs.edu.cm" autocomplete="username" required></label><label class="form-label">Password<input name="password" type="password" value="demo-password" autocomplete="current-password" required></label><button class="mini-btn primary" type="submit">Sign in</button></form>
      <p class="ta-gate-note">Only staff on the gate-duty list can use this app. The first sign-in stores today's student list on the phone, so it needs internet. Preview: any password works; try w.ngu@bchs.edu.cm (Discipline Master) or m.tita@bchs.edu.cm.</p>`);
  }
  function showPin(mode, staffId, msg = '') { Object.assign(pin, { mode, staff: staffId, value: '', msg }); renderPin(); }
  function renderPin() {
    const s = staffById(pin.staff), heads = { setpin: ['Choose a 4-digit PIN', 'You will use it to unlock the gate phone.'], confirmpin: ['Enter the PIN again', 'To make sure it is right.'], pin: [`${s.title} ${s.name}`, 'Enter your PIN to start gate duty.'] }[pin.mode];
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];
    $('#app').classList.remove('active');
    gateScreen(`<span class="tp-label">${pin.mode === 'pin' ? 'Unlock' : 'This phone'}</span><h1>${esc(heads[0])}</h1><p>${heads[1]}</p>
      <div class="ta-pin-dots" aria-label="${pin.value.length} of 4 digits entered">${[0, 1, 2, 3].map((i) => `<i class="${i < pin.value.length ? 'on' : ''}"></i>`).join('')}</div>
      <div class="ta-pin-msg" role="alert">${esc(pin.msg)}</div>
      <div class="ta-pinpad">${keys.map((k) => `<button class="ta-key${k === 'C' || k === '⌫' ? ' fn' : ''}" data-pin="${k}" aria-label="${k === 'C' ? 'Clear' : k === '⌫' ? 'Delete' : k}">${k === 'C' ? 'Clear' : k}</button>`).join('')}</div>
      <p class="ta-gate-note"><button data-act="who">Someone else is on duty</button></p>`, true);
  }
  function pinPress(k) {
    buzz(8);
    if (k === '⌫') pin.value = pin.value.slice(0, -1);
    else if (k === 'C') pin.value = '';
    else if (/^\d$/.test(k) && pin.value.length < 4) pin.value += k;
    pin.msg = '';
    if (pin.value.length === 4) {
      const all = pins();
      if (pin.mode === 'setpin') { pin.first = pin.value; pin.mode = 'confirmpin'; pin.value = ''; }
      else if (pin.mode === 'confirmpin') {
        if (pin.value === pin.first) { all[pin.staff] = pin.value; LOCAL.set('pins', all); return startDuty(pin.staff); }
        Object.assign(pin, { mode: 'setpin', value: '', msg: 'The PINs did not match. Choose your PIN again.' });
      } else if (pin.value === all[pin.staff]) { pin.tries = 0; return startDuty(pin.staff); }
      else {
        pin.tries += 1; pin.value = '';
        if (pin.tries >= MAX_PIN_TRIES) { delete all[pin.staff]; LOCAL.set('pins', all); pin.tries = 0; return showSignin('Too many wrong PINs. Please sign in again.'); }
        pin.msg = `Wrong PIN. ${MAX_PIN_TRIES - pin.tries} ${MAX_PIN_TRIES - pin.tries === 1 ? 'try' : 'tries'} left.`;
      }
    }
    renderPin();
  }
  function startDuty(staffId) {
    const changed = P.staff !== staffId;
    P.staff = staffId;
    if (!P.roster) cacheRoster();
    savePhone();
    $('#gate').hidden = true;
    $('#app').classList.add('active');
    const s = staffById(staffId);
    $('#meBtn').textContent = initials(s.name);
    $('#meBtn').title = `${s.title} ${s.name} · on duty`;
    lastActive = Date.now();
    if (changed) { ui.view = 'gate'; ui.prev = 'gate'; }
    scanWorker(); // load the QR reader now, so the first camera frame can be read
    render(); sync();
    if (changed) toast(`${s.title} ${s.name} is on duty at the ${cfg().gateName.toLowerCase()}.`);
  }
  const lock = () => (P.staff ? showPin('pin', P.staff) : showWho());

  // ---------- Shared UI pieces ----------
  const CHEV = '<svg class="ta-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  const badge = (text, cls = '') => `<span class="badge ${cls}">${esc(text)}</span>`;
  const group = (title, body, aside = '') => `<section class="ta-group"><div class="ta-group-head"><h2>${title}</h2>${aside}</div>${body}</section>`;
  const widget = (title, body, o = {}) => `<section class="tp-w ${o.cls || ''}"><header class="tp-w-h"><h2>${title}</h2>${o.aside || ''}</header>${body}</section>`;
  const empty = (title, text) => `<div class="ta-card-list"><div class="ta-empty">${ART.empty}<div><b>${title}</b><span>${text}</span></div></div></div>`;
  const kvList = (pairs) => `<dl class="ta-kv">${pairs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  const tags = (e) => `${e.late ? badge('Late', 'rejected') : badge('On time', 'approved')}${e.method === 'manual' ? badge('Manual', 'pending') : ''}`;
  /* An arrival row: the student's geometric avatar stands where the photo will go. */
  function arow(s, e, attrs = '') {
    const tag = attrs ? 'button' : 'div';
    return `<${tag} class="ta-item ${attrs ? '' : 'static'}" ${attrs}><span class="ta-tok av">${SchoolData.avatar(s.id)}</span><span class="ta-item-main"><b>${esc(s.name)}</b><small>${esc(className(s.cls))} · No. ${s.no}${e ? ` · ${e.time}${e.method === 'manual' && e.reason ? ` · ${esc(e.reason)}` : ''}` : ''}</small></span><span class="ta-item-side">${e ? tags(e) : badge('Not yet')}</span>${attrs ? CHEV : '<span></span>'}</${tag}>`;
  }

  // ---------- Shell ----------
  function setTop(title, crumb, actionsHTML = '') {
    $('#title').textContent = title;
    $('#crumb').textContent = crumb;
    $('#topActions').innerHTML = actionsHTML;
    $('#syncPill').innerHTML = syncPill();
  }
  function syncPill() {
    const w = waiting().length;
    const [cls, text] = !online() ? ['off', w ? `Offline · ${w} on phone` : 'Offline'] : syncing ? ['busy', 'Syncing…'] : w ? ['busy', `${w} waiting`] : ['ok', P.lastSync ? `Synced ${hhmm(new Date(P.lastSync).getTime())}` : 'Not synced yet'];
    return `<button class="ta-pill ${cls}" data-page="sync" aria-label="Sync status: ${esc(text)}">${text}</button>`;
  }
  function renderStatus() {
    const p = $('#syncPill'); if (p) p.innerHTML = syncPill();
    const n = waiting().length;
    document.querySelectorAll('[data-page="sync"] .count').forEach((c) => c.remove());
    if (n) document.querySelectorAll('#railNav [data-page="sync"], #tabbar [data-page="sync"]').forEach((b) => b.insertAdjacentHTML('beforeend', `<span class="count">${n}</span>`));
  }
  function render() {
    const top = TOP.includes(ui.view), active = top ? ui.view : ui.prev, n = waiting().length;
    $('#railNav').innerHTML = NAV.map(([k, l]) => `<button class="tp-tab ${k === active ? 'active' : ''}" data-page="${k}" ${k === active ? 'aria-current="page"' : ''}><span>${l}</span>${k === 'sync' && n ? `<span class="count">${n}</span>` : ''}</button>`).join('');
    $('#tabbar').innerHTML = NAV.map(([k, l]) => `<button class="${k === active ? 'on' : ''}" data-page="${k}" ${k === active ? 'aria-current="page"' : ''}>${glyph(k)}<span>${l}</span>${k === 'sync' && n ? `<span class="count">${n}</span>` : ''}</button>`).join('');
    $('#backBtn').hidden = top;
    $('#bandArt').innerHTML = ART[ART_FOR[ui.view]] || '';
    VIEWS[ui.view]();
    document.title = `${$('#title').textContent} | BCHS Gate`;
  }
  function go(view, extra = {}) {
    if (TOP.includes(ui.view)) ui.prev = ui.view;
    Object.assign(ui, { view }, extra);
    render(); window.scrollTo(0, 0);
  }
  /* The big clock on the Gate screen ticks without redrawing the page. */
  function clockHTML() {
    const t = deviceNow(), now = hhmm(t), late = now > cfg().lateAfter;
    return `<span class="tp-label">Gate clock</span><b>${now}</b><small>${late ? `Late since ${cfg().lateAfter}` : `On time until ${cfg().lateAfter}`}</small>`;
  }

  // ---------- Views ----------
  const VIEWS = {
    gate() {
      const day = today(), arr = arrivals(day), list = Object.entries(arr).map(([sid, e]) => [student(sid), e]).filter(([s]) => s);
      const late = list.filter(([, e]) => e.late).length, manual = list.filter(([, e]) => e.method === 'manual').length, total = roster().length;
      const recent = [...list].sort((a, b) => String(b[1].at).localeCompare(String(a[1].at))).slice(0, 8);
      setTop(cfg().gateName, new Date(deviceNow()).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) + ` · ${staffName(P.staff)} on duty`);
      $('#view').innerHTML = `<div class="ta-page wide">
        <div class="gt-hero">
          <div class="gt-clock ${hhmm(deviceNow()) > cfg().lateAfter ? 'late' : ''}" id="gtClock">${clockHTML()}</div>
          <button class="gt-big" data-act="scan"><svg class="gt-big-mark" viewBox="0 0 48 48" aria-hidden="true"><rect width="20" height="20" fill="#000"/><rect x="6" y="6" width="8" height="8" fill="#3dba3d"/><rect x="28" width="20" height="20" fill="#000"/><rect x="34" y="6" width="8" height="8" fill="#3dba3d"/><rect y="28" width="20" height="20" fill="#000"/><rect x="6" y="34" width="8" height="8" fill="#3dba3d"/><rect x="28" y="28" width="8" height="8" fill="#000"/><rect x="40" y="40" width="8" height="8" fill="#000"/><rect x="40" y="28" width="8" height="8" fill="#fff"/><rect x="28" y="40" width="8" height="8" fill="#fff"/></svg><b>Scan card</b><small>Point the camera at the QR on the back of the ID card</small></button>
          <button class="gt-big alt" data-act="manual"><span class="gt-big-mark num" aria-hidden="true">12</span><b>Manual check-in</b><small>No card: class and class number, then check the face</small></button>
        </div>
        <div class="tp-stats">
          <button class="tp-stat ${total && list.length === total ? 'done' : ''}" data-page="today" data-filter="arrived"><span>Arrived today</span><b>${list.length}/${total}</b><small>${pct(list.length, total)}% of students</small></button>
          <button class="tp-stat" data-page="today" data-filter="late"><span>Late</span><b>${late}</b><small>after ${cfg().lateAfter}</small></button>
          <button class="tp-stat" data-page="today" data-filter="manual"><span>Manual</span><b>${manual}</b><small>${list.length ? pct(manual, list.length) : 0}% of check-ins</small></button>
          <button class="tp-stat ${waiting().length ? '' : 'done'}" data-page="sync"><span>Waiting to upload</span><b>${waiting().length}</b><small>${online() ? 'online' : 'offline · saved on phone'}</small></button>
        </div>
        <div class="tp-home">
          ${widget('Recent check-ins', recent.length ? `<div class="ta-card-list">${recent.map(([s, e]) => arow(s, e)).join('')}</div>` : empty('No arrivals yet today', 'Scan the first card or use manual check-in.'), { cls: 'span-2', aside: `<button class="ta-link" data-page="today">All of today</button>` })}
          ${widget('By class', `<div class="gt-classlist">${classes().map((c) => { const r = classRoster(c.id), n = r.filter((s) => arr[s.id]).length; return `<button class="gt-classrow" data-tcls="${c.id}"><span><b>${esc(c.name)}</b><small>${n} of ${r.length} arrived</small></span><span class="ta-progress ${n === r.length ? 'done' : ''}"><i style="width:${pct(n, r.length)}%"></i></span></button>`; }).join('')}</div>`)}
        </div>
      </div>`;
    },

    manual() {
      setTop('Manual check-in', ui.cls ? `${className(ui.cls)} · type the class number` : 'Choose the class');
      const arr = arrivals();
      if (!ui.cls) {
        $('#view').innerHTML = `<div class="ta-page wide"><p class="ta-context">Use this when a student has no card. Check the face against the picture before confirming; every manual check-in records the reason and who made it.</p>
          <div class="gt-classes">${classes().map((c) => { const r = classRoster(c.id), n = r.filter((s) => arr[s.id]).length; return `<button class="gt-class" data-cls="${c.id}"><b>${esc(c.name)}</b><small>${r.length} students · ${n} arrived</small><span class="ta-progress ${n === r.length ? 'done' : ''}"><i style="width:${pct(n, r.length)}%"></i></span></button>`; }).join('')}</div></div>`;
        return;
      }
      const r = classRoster(ui.cls), s = ui.num ? r.find((x) => x.no === Number(ui.num)) : null, prev = s && arr[s.id];
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];
      const preview = !ui.num
        ? `<div class="gt-preview blank">${ART.empty}<p>Type the class number. The student's picture appears here to check before you confirm.</p></div>`
        : !s ? `<div class="gt-preview blank"><p><b>No student No. ${esc(ui.num)}</b> in ${esc(className(ui.cls))} (${r.length} students). Check the number.</p></div>`
        : `<div class="gt-preview"><div class="gt-face">${SchoolData.avatar(s.id)}</div><div class="gt-who"><b>${esc(s.name)}</b><small>${esc(className(s.cls))} · No. ${s.no}</small></div>
            ${prev ? `<div class="ta-notice warn"><div><b>Already recorded at ${prev.time}</b><span>${prev.method === 'manual' ? 'Manual check-in' : 'Card scan'}${prev.device && prev.device !== P.deviceId ? ' on another gate phone' : ''}. Nothing more to do.</span></div></div>`
            : `<span class="tp-label">Reason</span><div class="gt-reasons">${REASONS.map((x) => `<button class="ta-chip ${ui.reason === x ? 'on' : ''}" data-reason="${x}" aria-pressed="${ui.reason === x}">${x}</button>`).join('')}</div>
              <button class="mini-btn primary block" data-act="confirmManual" ${ui.reason ? '' : 'disabled'}>Check in ${esc(s.name.split(' ')[0])}</button>
              <small class="gt-small">${ui.reason ? 'The face matches? Then confirm.' : 'Choose why there is no card.'}</small>`}</div>`;
      $('#view').innerHTML = `<div class="ta-page wide"><div class="gt-manual">
        <div class="gt-pad">
          <button class="gt-classpick" data-act="pickClass"><span class="tp-label">Class</span><b>${esc(className(ui.cls))}</b><small>Change</small></button>
          <div class="gt-num ${ui.num ? '' : 'empty'}" aria-live="polite"><span>No.</span><b>${esc(ui.num || '—')}</b></div>
          <div class="ta-pinpad gt-keys">${keys.map((k) => `<button class="ta-key${k === 'C' || k === '⌫' ? ' fn' : ''}" data-num="${k}" aria-label="${k === 'C' ? 'Clear' : k === '⌫' ? 'Delete' : k}">${k === 'C' ? 'Clear' : k}</button>`).join('')}</div>
        </div>
        ${preview}
      </div></div>`;
    },

    today() {
      const day = today(), arr = arrivals(day);
      const base = roster().filter((s) => ui.tcls === 'all' || s.cls === ui.tcls).sort((a, b) => a.cls.localeCompare(b.cls) || a.no - b.no);
      const q = ui.q.trim().toLowerCase(), match = (s) => !q || s.name.toLowerCase().includes(q) || String(s.no) === q;
      const sets = { arrived: base.filter((s) => arr[s.id]), missing: base.filter((s) => !arr[s.id]), late: base.filter((s) => arr[s.id]?.late), manual: base.filter((s) => arr[s.id]?.method === 'manual') };
      const list = (sets[ui.filter] || sets.arrived).filter(match);
      if (ui.filter === 'arrived') list.sort((a, b) => String(arr[b.id].at).localeCompare(String(arr[a.id].at)));
      setTop('Today', `${new Date(deviceNow()).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · as this phone knows it`);
      const seg = [['arrived', 'Arrived'], ['missing', 'Not yet'], ['late', 'Late'], ['manual', 'Manual']];
      $('#view').innerHTML = `<div class="ta-page">
        <div class="gt-filters">
          <div class="seg" role="group">${seg.map(([k, l]) => `<button class="${ui.filter === k ? 'on' : ''}" data-filterset="${k}">${l} (${sets[k].length})</button>`).join('')}</div>
          <select class="gt-select" data-tclsel aria-label="Class"><option value="all">All classes</option>${classes().map((c) => `<option value="${c.id}" ${ui.tcls === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
          <input class="gt-search" type="search" placeholder="Find by name or number" value="${esc(ui.q)}" data-search aria-label="Find a student">
        </div>
        ${list.length ? `<div class="ta-card-list" id="todayList">${list.slice(0, 150).map((s) => arow(s, arr[s.id], arr[s.id] ? '' : `data-checkin="${s.id}"`)).join('')}</div>${list.length > 150 ? `<p class="ta-hint">Showing 150 of ${list.length}. Choose a class to see the rest.</p>` : ''}`
          : empty(ui.filter === 'missing' ? 'Everyone has arrived' : 'Nobody here yet', ui.filter === 'missing' ? 'Every student in this list is recorded today.' : 'Check-ins appear here as they happen.')}
        ${ui.filter === 'missing' && list.length ? '<p class="ta-hint">Tap a student who is at the gate without a card to check them in manually.</p>' : ''}
      </div>`;
    },

    sync() {
      setTop('Sync', 'Between this phone and the school system');
      const w = waiting(), done = P.outbox.filter((o) => o.state !== 'pending' && o.state !== 'sending').slice(-15).reverse();
      const skewMin = Math.round(Math.abs(P.skew || 0) / 60e3), off = P.clockOffset || 0;
      const opRow = (o) => { const s = student(o.sid); return `<div class="ta-op ${o.state === 'duplicate' ? 'conflict' : o.state}"><div><b>${esc(s ? s.name : o.sid)} · ${o.time}${o.method === 'manual' ? ' · manual' : ''}</b><small>${esc(s ? className(s.cls) : '')} · ${esc(staffName(o.staff))}${o.sentAt ? ` · sent ${hhmm(new Date(o.sentAt).getTime())}` : ''}</small>${o.state === 'duplicate' ? `<p>Another gate phone recorded this student first, at ${esc(o.keptAt)}. The earliest time is kept; both are in the log.</p>` : o.clock === 'corrected' ? '<p>Time corrected for this phone\'s wrong clock and flagged for the office.</p>' : ''}</div><span class="ta-op-state">${{ pending: 'On phone', sending: 'Sending', synced: 'Sent', duplicate: 'Earlier kept' }[o.state] || o.state}</span></div>`; };
      $('#view').innerHTML = `<div class="ta-page">
        ${group('Status', `<div class="ta-card-list">
          <div class="ta-item static"><span class="ta-tok ${online() ? 'ok' : 'warn'}">NET</span><span class="ta-item-main"><b>${online() ? 'Online' : 'Offline'}</b><small>${online() ? 'Check-ins send automatically.' : 'Check-ins stay on this phone until it is back online.'} Last synced ${fmtTime(P.lastSync)}.</small></span><span class="ta-item-side"><button class="mini-btn primary" data-act="syncNow" ${syncing ? 'disabled' : ''}>Sync now</button></span><span></span></div>
          <div class="ta-item static"><span class="ta-tok">LIST</span><span class="ta-item-main"><b>Student list on this phone</b><small>${roster().length} students in ${classes().length} classes, with card versions · updated ${fmtTime(P.roster?.at)}. Refreshed at every sync.</small></span><span></span><span></span></div>
          <div class="ta-item static"><span class="ta-tok ${skewMin >= 2 ? 'bad' : ''}">CLK</span><span class="ta-item-main"><b>Phone clock</b><small>${skewMin >= 2 ? `${skewMin} min wrong at the last sync. Times from this phone are corrected and flagged.` : 'Matches the school system.'} Arrival times are always checked against the school system's clock.</small></span><span></span><span></span></div>
        </div>`)}
        ${group(`Waiting to upload (${w.length})`, w.length ? `<div class="ta-card-list">${w.map(opRow).join('')}</div>` : empty('Nothing waiting', 'Every check-in on this phone is on the school system.'))}
        ${done.length ? group('Recently sent', `<div class="ta-card-list">${done.map(opRow).join('')}</div>`) : ''}
        ${group('Prototype tests', `<div class="ta-card-list ta-demo">
          <div class="ta-item static"><span class="ta-tok">OFF</span><span class="ta-item-main"><b>Offline mode</b><small>Pretend the gate has no network.</small></span><span class="ta-item-side"><label class="ta-switch"><input type="checkbox" data-act="toggleOffline" ${P.offline ? 'checked' : ''} aria-label="Offline mode"></label></span><span></span></div>
          <div class="ta-item static"><span class="ta-tok">7:05</span><span class="ta-item-main"><b>Morning rush clock</b><small>${db.gate.demo ? `On: the school clock runs from 07:05 today. Late after ${cfg().lateAfter}.` : 'Put the whole school at 07:05 this morning, so arrivals and lateness can be tried at any hour.'}</small></span><span class="ta-item-side ta-btns"><button class="mini-btn" data-act="morning">${db.gate.demo ? 'Restart at 07:05' : 'Start'}</button>${db.gate.demo ? '<button class="mini-btn" data-act="realClock">Real time</button>' : ''}</span><span></span></div>
          <div class="ta-item static"><span class="ta-tok">±10</span><span class="ta-item-main"><b>Wrong phone clock</b><small>${off ? `This phone is ${Math.abs(off) / 60e3} min ${off > 0 ? 'fast' : 'slow'}.` : 'Set this phone 10 minutes slow, as a cheap phone might be.'}</small></span><span class="ta-item-side ta-btns"><button class="mini-btn" data-act="clockSlow">10 min slow</button>${off ? '<button class="mini-btn" data-act="clockReset">Reset</button>' : ''}</span><span></span></div>
          <div class="ta-item static"><span class="ta-tok">2ND</span><span class="ta-item-main"><b>Another gate phone</b><small>A second phone records a student${w.length ? ' this phone has not sent yet, two minutes earlier' : ' who has not arrived yet'}.</small></span><span class="ta-item-side"><button class="mini-btn" data-act="otherPhone">Simulate</button></span><span></span></div>
        </div>`)}
      </div>`;
    },

    account() {
      const s = staffById(P.staff);
      setTop('Gate phone', `${esc(cfg().gateName)} · ${P.deviceId}`);
      $('#view').innerHTML = `<div class="ta-page">
        ${group('On duty', `<div class="ta-card-list">${kvList([['Staff', `${esc(s.title)} ${esc(s.name)}`], ['Roles', s.roles.map(esc).join(' · ')], ['This phone', `${esc(P.deviceId)} · ${esc(cfg().gateName)}`], ['Rules', `School day from ${cfg().dayStart} · late after ${cfg().lateAfter} · absent after ${cfg().absentAfter}`], ['Parent alerts', cfg().notify ? '“Arrived at school at HH:MM”, sent through the Parent App' : 'Off']])}</div>`)}
        ${group('This phone', `<div class="ta-card-list">
          <button class="ta-item" data-act="switchStaff"><span class="ta-tok">DUTY</span><span class="ta-item-main"><b>Hand over gate duty</b><small>The next staff member unlocks with their own PIN. Nothing is lost.</small></span><span class="ta-item-side"></span>${CHEV}</button>
          <button class="ta-item" data-act="lockNow"><span class="ta-tok">LOCK</span><span class="ta-item-main"><b>Lock now</b><small>The phone also locks after ${LOCK_MINUTES} minutes without use.</small></span><span class="ta-item-side"></span>${CHEV}</button>
          <div class="ta-item static"><span class="ta-tok">BEEP</span><span class="ta-item-main"><b>Sound on each check-in</b><small>One beep on time, two tones late, low double beep for a problem. The phone also vibrates.</small></span><span class="ta-item-side"><label class="ta-switch"><input type="checkbox" data-act="toggleSound" ${P.sound ? 'checked' : ''} aria-label="Sound"></label></span><span></span></div>
          <button class="ta-item" data-act="signOut"><span class="ta-tok bad">OUT</span><span class="ta-item-main"><b>Remove me from this phone</b><small>${waiting().length ? `${waiting().length} check-in${waiting().length > 1 ? 's are' : ' is'} not sent yet. Sync first.` : 'Removes your PIN from this phone.'}</small></span><span class="ta-item-side"></span>${CHEV}</button>
        </div>`)}
        ${group('Prototype', `<div class="ta-card-list"><button class="ta-item" data-act="resetGate"><span class="ta-tok">DATA</span><span class="ta-item-main"><b>Reset gate data</b><small>Clears today's arrivals, the parent alerts and this phone's queue. Marks and exams are not touched.</small></span><span class="ta-item-side"></span>${CHEV}</button></div>`)}
      </div>`;
    }
  };

  // ---------- Result screen (shown after every check-in) ----------
  function showResult(res) {
    const s = student(res.sid), el = $('#result');
    let kind, head, line;
    if (res.dup) { kind = 'dup'; head = 'Already recorded'; line = `Arrived at ${res.prev.time}${res.prev.method === 'manual' ? ' (manual)' : ''}. Not counted twice.`; }
    else if (res.entry.late) { kind = 'late'; head = `Late · ${res.entry.time}`; line = `Arrived after ${cfg().lateAfter}.${res.entry.method === 'manual' ? ` Manual: ${res.entry.reason}.` : ''}`; }
    else { kind = 'ok'; head = `Checked in · ${res.entry.time}`; line = res.entry.method === 'manual' ? `Manual: ${res.entry.reason}.` : 'Card verified.'; }
    el.className = `gt-result open ${kind}`;
    el.innerHTML = `<div class="gt-result-card" role="alert"><div class="gt-result-head">${esc(head)}</div><div class="gt-result-face">${SchoolData.avatar(s.id)}</div><b class="gt-result-name">${esc(s.name)}</b><span class="gt-result-meta">${esc(className(s.cls))} · No. ${s.no}</span><p>${esc(line)}</p><small>Tap anywhere to continue</small></div>`;
    beep(kind === 'ok' ? 'ok' : kind === 'late' ? 'late' : 'bad');
    buzz(kind === 'ok' ? 40 : kind === 'late' ? [40, 60, 40] : [120, 60, 120]);
    clearTimeout(resultTimer);
    resultTimer = setTimeout(closeResult, kind === 'dup' ? 3200 : 2200);
  }
  function closeResult() {
    const el = $('#result');
    if (!el || !el.classList.contains('open')) return;
    clearTimeout(resultTimer);
    el.className = 'gt-result';
    el.innerHTML = '';
    if ($('#app').classList.contains('active')) render();
  }

  // ---------- Camera scanner ----------
  /* Built for speed, like a messaging app's scanner:
     - the decoder (ZXing, WebAssembly) loads in a background worker as soon as duty starts,
       so the very first camera frame can be read;
     - every new camera frame is read the moment the previous one is done (no fixed interval);
     - only the square in the middle is read, scaled to at most 720 px, on fast settings;
       every 4th frame reads the whole picture on thorough settings, for codes held off-centre;
     - the camera keeps running while a result shows, so the next card can follow straight away;
       the same code is ignored for 2.5 s so one card is not read twice.
     Android phones with a built-in barcode reader use it instead (it is even faster).
     Stage 2 test: any QR code is accepted and shown; checking cards against the school list comes next. */
  const SCAN = { open: false, stream: null, track: null, worker: null, ready: false, detector: null, busy: false, frame: 0, loop: 0, sent: 0, t0: 0, camAt: 0, reads: 0, last: { text: '', at: 0 }, canvas: null, ctx: null, cams: [], torch: false, zoomed: false, stats: false, n: 0, ms: 0, tick: 0, sheetTimer: 0 };
  function scanWorker() {
    if (SCAN.worker || !window.Worker) return;
    try {
      SCAN.worker = new Worker('../assets/js/gate-scan-worker.js');
      SCAN.worker.onmessage = onDecoded;
      SCAN.worker.onerror = () => { SCAN.worker = null; SCAN.busy = false; };
      SCAN.worker.postMessage({ type: 'warm' });
    } catch { SCAN.worker = null; }
  }
  async function nativeDetector() {
    try {
      if (!('BarcodeDetector' in window)) return null;
      const formats = await window.BarcodeDetector.getSupportedFormats();
      return formats.includes('qr_code') ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
    } catch { return null; }
  }
  /* iPhone: sound only plays after a tap unlocks it, so the Scan button unlocks it. */
  function unlockAudio() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const b = audio.createBuffer(1, 1, 22050), s = audio.createBufferSource();
      s.buffer = b; s.connect(audio.destination); s.start(0);
    } catch { /* no audio */ }
  }
  /* iPhone (iOS 18+): Safari has no vibration API, but toggling a native switch gives a haptic tick. */
  const iosTick = () => { try { $('#hapticSwitch')?.click(); } catch { /* not supported */ } };

  async function openScanner() {
    unlockAudio();
    Object.assign(SCAN, { open: true, t0: performance.now(), camAt: 0, reads: 0, last: { text: '', at: 0 }, n: 0, ms: 0, torch: false, zoomed: false });
    $('#scanner').classList.add('open');
    $('#scanner').setAttribute('aria-hidden', 'false');
    $('#scanSheet').classList.remove('show');
    scanStatus('Starting the camera…');
    scanWorker();
    if (SCAN.detector === null) SCAN.detector = (await nativeDetector()) || false;
    if (!window.isSecureContext) return scanError('The camera only works on a secure (https) address. Open the app from the school\'s web address, not from a file.');
    if (!navigator.mediaDevices?.getUserMedia) return scanError('This browser cannot use the camera. On iPhone, use Safari or the app added to the home screen.');
    try { await startCamera(); } catch (err) { scanError(cameraMessage(err)); }
  }
  async function startCamera() {
    stopCamera();
    const video = $('#scanVideo'), base = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: P.cam ? { ...base, deviceId: { exact: P.cam } } : { ...base, facingMode: { ideal: 'environment' } } }); }
    catch (e) {
      if (!P.cam && e.name !== 'OverconstrainedError') throw e;
      P.cam = null; savePhone();
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
    }
    if (!SCAN.open) { stream.getTracks().forEach((t) => t.stop()); return; }
    SCAN.stream = stream;
    SCAN.track = stream.getVideoTracks()[0];
    try { await SCAN.track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch { /* not supported */ }
    video.muted = true; video.setAttribute('playsinline', ''); video.srcObject = stream;
    await video.play();
    SCAN.camAt = performance.now();
    fitFrame();
    await listCameras();
    scanStatus();
    runLoop();
  }
  function stopCamera() {
    SCAN.loop++;
    if (SCAN.stream) SCAN.stream.getTracks().forEach((t) => t.stop());
    SCAN.stream = null; SCAN.track = null; SCAN.busy = false;
    const v = $('#scanVideo'); if (v) v.srcObject = null;
  }
  function closeScanner() {
    if (!SCAN.open) return;
    SCAN.open = false;
    stopCamera();
    clearTimeout(SCAN.sheetTimer);
    $('#scanner').classList.remove('open');
    $('#scanner').setAttribute('aria-hidden', 'true');
    if ($('#app').classList.contains('active')) render();
  }
  function cameraMessage(err) {
    const n = err?.name || '';
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'Camera permission was refused. On iPhone: tap aA in the address bar → Website Settings → Camera → Allow, then try again. For the home-screen app: Settings → Safari → Camera.';
    if (n === 'NotFoundError') return 'No camera was found on this device.';
    if (n === 'NotReadableError') return 'Another app is using the camera. Close it and try again.';
    return `The camera could not start (${n || 'unknown error'}).`;
  }
  async function listCameras() {
    try {
      const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      SCAN.cams = all.filter((d) => !/front|face|user/i.test(d.label));
      if (!SCAN.cams.length) SCAN.cams = all;
    } catch { SCAN.cams = []; }
  }
  /* The square on screen shows exactly the part of the picture that is read. */
  function fitFrame() {
    const v = $('#scanVideo'), el = $('#scanner'), vw = v.videoWidth, vh = v.videoHeight;
    if (!vw) return;
    const scale = Math.max(el.clientWidth / vw, el.clientHeight / vh), side = Math.min(vw, vh) * 0.72 * scale;
    el.style.setProperty('--vf', `${Math.round(Math.min(side, el.clientWidth - 32, el.clientHeight - 260))}px`);
  }
  function runLoop() {
    const id = ++SCAN.loop, video = $('#scanVideo');
    const next = () => { if (SCAN.open && SCAN.stream && id === SCAN.loop) (video.requestVideoFrameCallback ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick)); };
    const tick = () => { if (id !== SCAN.loop) return; if (!SCAN.busy && video.readyState >= 2) grab(video); next(); };
    next();
  }
  function grab(video) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw) return;
    const hard = ++SCAN.frame % 4 === 0, side = Math.round(Math.min(vw, vh) * (hard ? 1 : 0.72)), n = Math.min(side, 720);
    const sx = (vw - side) >> 1, sy = (vh - side) >> 1;
    if (!SCAN.canvas || SCAN.canvas.width !== n) {
      SCAN.canvas = document.createElement('canvas'); SCAN.canvas.width = n; SCAN.canvas.height = n;
      SCAN.ctx = SCAN.canvas.getContext('2d', { willReadFrequently: true });
    }
    SCAN.ctx.drawImage(video, sx, sy, side, side, 0, 0, n, n);
    SCAN.busy = true;
    SCAN.sent = performance.now();
    if (SCAN.detector) {
      SCAN.detector.detect(SCAN.canvas)
        .then((r) => { SCAN.n++; SCAN.ms += performance.now() - SCAN.sent; onRead(r[0]?.rawValue || null, performance.now() - SCAN.sent); })
        .catch(() => { SCAN.detector = false; })
        .finally(() => { SCAN.busy = false; });
      return;
    }
    if (!SCAN.worker) { SCAN.busy = false; return; }
    const img = SCAN.ctx.getImageData(0, 0, n, n);
    SCAN.worker.postMessage({ type: 'read', id: SCAN.frame, w: n, h: n, buf: img.data.buffer, hard }, [img.data.buffer]);
  }
  function onDecoded(e) {
    const m = e.data;
    if (m.type === 'ready') { SCAN.ready = true; if (SCAN.open) scanStatus(); return; }
    SCAN.busy = false;
    if (m.type === 'error') return;
    SCAN.n++; SCAN.ms += m.ms;
    if (m.text) onRead(m.text, performance.now() - SCAN.sent);
  }
  function onRead(text, ms) {
    if (!text || !SCAN.open) return;
    const now = performance.now();
    if (text === SCAN.last.text && now - SCAN.last.at < 2500) { SCAN.last.at = now; return; }
    SCAN.last = { text, at: now };
    SCAN.reads++;
    lastActive = Date.now();
    beep('ok'); buzz(40); iosTick();
    const f = $('#scanFrame'); f.classList.remove('hit'); void f.offsetWidth; f.classList.add('hit');
    setTimeout(() => f.classList.remove('hit'), 350);
    const kind = /^BCHS1:/.test(text) ? 'BCHS card' : /^https?:\/\//i.test(text) ? 'Link' : /^WIFI:/i.test(text) ? 'Wi-Fi' : 'Text';
    const sinceOpen = SCAN.reads === 1 ? ` · first read ${((now - SCAN.t0) / 1000).toFixed(2)} s after tapping Scan (camera ready in ${((SCAN.camAt - SCAN.t0) / 1000).toFixed(2)} s)` : '';
    const sheet = $('#scanSheet');
    sheet.innerHTML = `<span class="tp-label">${kind} · read ${SCAN.reads}</span><b class="gt-read-text">${esc(text.length > 240 ? `${text.slice(0, 240)}…` : text)}</b><small>Decoded in ${Math.round(ms)} ms${sinceOpen}</small>
      <div class="gt-read-act"><button class="mini-btn" data-act="copyRead">Copy</button>${kind === 'Link' ? '<button class="mini-btn primary" data-act="openRead">Open link</button>' : ''}</div>`;
    sheet.classList.add('show');
    clearTimeout(SCAN.sheetTimer);
    SCAN.sheetTimer = setTimeout(() => sheet.classList.remove('show'), 6000);
    scanStatus();
  }
  function scanStatus(msg) {
    const engine = SCAN.detector ? 'Built-in reader' : SCAN.ready ? 'ZXing engine' : 'Loading reader…';
    $('#scanStatus').innerHTML = `<b>${SCAN.reads ? `${SCAN.reads} read${SCAN.reads > 1 ? 's' : ''}` : 'Scan card'}</b><small>${esc(msg || engine)}</small>`;
    $('#scanHint').textContent = msg && !SCAN.stream ? '' : 'Hold the QR code inside the square';
    const caps = SCAN.track?.getCapabilities?.() || {};
    $('#scanTools').innerHTML = [
      SCAN.cams.length > 1 ? `<button class="gt-scan-pill" data-act="switchCam">Camera ${Math.max(1, SCAN.cams.findIndex((c) => c.deviceId === P.cam) + 1)}/${SCAN.cams.length}</button>` : '',
      caps.torch ? `<button class="gt-scan-pill ${SCAN.torch ? 'on' : ''}" data-act="torch">Light ${SCAN.torch ? 'on' : 'off'}</button>` : '',
      caps.zoom && caps.zoom.max >= 2 ? `<button class="gt-scan-pill ${SCAN.zoomed ? 'on' : ''}" data-act="zoom">${SCAN.zoomed ? '2×' : '1×'}</button>` : '',
      '<button class="gt-scan-pill" data-act="manualFromScan">Manual check-in</button>'
    ].join('');
  }
  function scanError(msg) {
    stopCamera();
    scanStatus('Camera not available');
    $('#scanHint').textContent = '';
    const sheet = $('#scanSheet');
    sheet.innerHTML = `<span class="tp-label">Camera</span><b class="gt-read-text">${esc(msg)}</b><div class="gt-read-act"><button class="mini-btn primary" data-act="retryCam">Try again</button><button class="mini-btn" data-act="manualFromScan">Manual check-in</button></div>`;
    sheet.classList.add('show');
    clearTimeout(SCAN.sheetTimer);
  }
  /* Speed panel for testing: reads per second, average decode time, picture size. */
  setInterval(() => {
    if (!SCAN.open || !SCAN.stats) return;
    const v = $('#scanVideo'), rate = SCAN.n, avg = SCAN.n ? SCAN.ms / SCAN.n : 0;
    $('#scanSpeed').textContent = `${rate} frames read/s · avg ${avg.toFixed(1)} ms · ${v.videoWidth}×${v.videoHeight} · ${SCAN.detector ? 'built-in' : 'ZXing'}`;
    SCAN.n = 0; SCAN.ms = 0;
  }, 1000);
  window.addEventListener('resize', () => { if (SCAN.open) fitFrame(); });

  // ---------- Actions ----------
  const ACT = {
    scan() { openScanner(); },
    closeScan() { closeScanner(); },
    retryCam() { $('#scanSheet').classList.remove('show'); openScanner(); },
    manualFromScan() { closeScanner(); ACT.manual(); },
    switchCam() { if (!SCAN.cams.length) return; const i = SCAN.cams.findIndex((c) => c.deviceId === P.cam); P.cam = SCAN.cams[(i + 1) % SCAN.cams.length].deviceId; savePhone(); startCamera().catch((err) => scanError(cameraMessage(err))); },
    async torch() { try { await SCAN.track.applyConstraints({ advanced: [{ torch: !SCAN.torch }] }); SCAN.torch = !SCAN.torch; } catch { toast('This camera has no light.'); } scanStatus(); },
    async zoom() { const caps = SCAN.track?.getCapabilities?.() || {}; try { await SCAN.track.applyConstraints({ advanced: [{ zoom: SCAN.zoomed ? caps.zoom.min : Math.min(2, caps.zoom.max) }] }); SCAN.zoomed = !SCAN.zoomed; } catch { /* not supported */ } scanStatus(); },
    scanStats() { SCAN.stats = !SCAN.stats; $('#scanSpeed').hidden = !SCAN.stats; $('#scanSpeed').textContent = 'Measuring…'; },
    async copyRead() { try { await navigator.clipboard.writeText(SCAN.last.text); toast('Copied.'); } catch { toast('Copy is not allowed here.'); } },
    openRead() { window.open(SCAN.last.text, '_blank', 'noopener'); },
    manual() { go('manual', { cls: null, num: '' }); },
    pickClass() { ui.cls = null; ui.num = ''; render(); },
    confirmManual() {
      const s = classRoster(ui.cls).find((x) => x.no === Number(ui.num));
      if (!s || !ui.reason) return;
      const res = record(s.id, 'manual', ui.reason);
      ui.num = '';
      showResult(res);
    },
    syncNow() { sync(true); },
    toggleOffline(b) { P.offline = b.checked; savePhone(); render(); toast(P.offline ? 'Offline mode on. Check-ins stay on this phone.' : 'Back online. Sending check-ins…'); if (!P.offline) sync(); },
    toggleSound(b) { P.sound = b.checked; savePhone(); if (P.sound) beep('ok'); },
    morning() {
      db = SchoolData.load();
      const d = new Date(); d.setHours(7, 5, 0, 0);
      db.gate.demo = { base: d.getTime(), startedAt: Date.now() };
      SchoolData.save(); render(); toast('The school clock now reads 07:05. Late after ' + cfg().lateAfter + '.');
    },
    realClock() { db = SchoolData.load(); db.gate.demo = null; SchoolData.save(); render(); toast('Back to the real time.'); },
    clockSlow() { P.clockOffset = -10 * 60e3; savePhone(); render(); toast('This phone is now 10 minutes slow. Record a check-in, then sync.'); },
    clockReset() { P.clockOffset = 0; savePhone(); render(); toast('Phone clock reset.'); },
    otherPhone() {
      db = SchoolData.load();
      const pending = waiting()[0], day = dayOf(serverNow()), list = db.gate.days[day] || (db.gate.days[day] = {});
      const sid = pending ? pending.sid : roster().find((s) => !arrivals(day)[s.id] && !list[s.id])?.id;
      if (!sid) return toast('Every student has arrived.');
      const t = pending ? new Date(pending.at).getTime() - 2 * 60e3 : serverNow(), id = `gate-2nd-${Date.now().toString(36)}`;
      const e = { at: new Date(t).toISOString(), time: hhmm(t), method: 'qr', reason: '', late: hhmm(t) > db.gate.config.lateAfter, device: 'gate-2nd', staff: 't2', event: id, clock: 'ok' };
      db.gate.events.push({ id, sid, day, ...e, clientAt: e.at, serverAt: new Date(serverNow()).toISOString(), kept: true });
      list[sid] = e;
      SchoolData.save();
      if (pending) { toast(`The other phone recorded ${student(sid).name} at ${e.time}. Sync this phone to see the earlier time kept.`); render(); }
      else { sync(); toast(`The other phone recorded ${student(sid).name} at ${e.time}. Try checking them in here: it shows "Already recorded".`); }
    },
    switchStaff() { showWho(); },
    lockNow: lock,
    who() { showWho(); },
    newStaff() { showSignin(); },
    signOut() { const w = waiting().length; modal('Remove you from this phone?', `<p>${w ? `<b>${w} check-in${w > 1 ? 's have' : ' has'} not been sent yet.</b> They stay on the phone and send at the next sync by whoever is on duty.` : 'Your PIN is removed from this phone. Other staff keep theirs.'}</p>${actions('Cancel', 'Remove me', 'confirmSignOut')}`); },
    confirmSignOut() { const all = pins(); delete all[P.staff]; LOCAL.set('pins', all); P.staff = null; savePhone(); closeModal(); showWho(); },
    resetGate() { modal('Reset gate data?', `<p>Today's arrivals, the parent alerts and this phone's queue are cleared. Card versions go back to the sample data.</p>${actions('Cancel', 'Reset', 'confirmResetGate')}`); },
    confirmResetGate() { db = SchoolData.resetGate(); P.log = []; P.outbox = []; P.known = {}; P.clockOffset = 0; cacheRoster(); savePhone(); closeModal(); go('gate'); toast('Gate data reset.'); }
  };

  // ---------- Events ----------
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('#hapticSwitch')) return;
    if ($('#result').classList.contains('open')) { closeResult(); return; }
    if (t.closest('[data-close]') || t === $('#modalLayer')) return closeModal();
    const b = t.closest('[data-pin],[data-who],[data-page],[data-cls],[data-num],[data-reason],[data-tcls],[data-filterset],[data-checkin],[data-act]');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.pin) return pinPress(d.pin);
    if (d.who) return showPin('pin', d.who);
    if (d.page) { if (d.filter) ui.filter = d.filter; ui.view = d.page; ui.prev = TOP.includes(d.page) ? d.page : ui.prev; render(); window.scrollTo(0, 0); return; }
    if (d.cls) { ui.cls = d.cls; ui.num = ''; return render(); }
    if (d.num) { buzz(8); if (d.num === 'C') ui.num = ''; else if (d.num === '⌫') ui.num = ui.num.slice(0, -1); else if (ui.num.length < 3) ui.num = (ui.num + d.num).replace(/^0+/, ''); return render(); }
    if (d.reason) { ui.reason = d.reason; return render(); }
    if (d.tcls) { ui.tcls = d.tcls; ui.filter = 'arrived'; return go('today'); }
    if (d.filterset) { ui.filter = d.filterset; return render(); }
    if (d.checkin) { const s = student(d.checkin); return go('manual', { cls: s.cls, num: String(s.no) }); }
    if (d.act && b.type !== 'checkbox') return ACT[d.act]?.(b);
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('input[type=checkbox][data-act]')) return ACT[t.dataset.act]?.(t);
    if (t.matches('[data-tclsel]')) { ui.tcls = t.value; render(); }
  });
  document.addEventListener('input', (e) => {
    if (!e.target.matches('[data-search]')) return;
    ui.q = e.target.value;
    render();
    const n = $('[data-search]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length);
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'signinForm') return;
    e.preventDefault();
    db = SchoolData.load();
    const email = new FormData(e.target).get('email').trim().toLowerCase(), s = staffList().find((x) => x.email.toLowerCase() === email);
    if (!s) return showSignin('No staff account with that email.');
    if (!db.gate.duty.includes(s.id)) return showSignin(`${s.title} ${s.name} is not on the gate-duty list. Ask the office.`);
    if (pins()[s.id]) return showPin('pin', s.id);
    showPin('setpin', s.id);
  });
  $('#backBtn').addEventListener('click', () => {
    if (ui.view === 'manual' && ui.cls) { ui.cls = null; ui.num = ''; return render(); }
    ui.view = ui.prev || 'gate'; render(); window.scrollTo(0, 0);
  });
  document.addEventListener('keydown', (e) => {
    lastActive = Date.now();
    if (SCAN.open) { if (e.key === 'Escape') closeScanner(); return; }
    if ($('#result').classList.contains('open')) { closeResult(); return; }
    if (!$('#gate').hidden && $('.ta-pinpad') && !$('#app').classList.contains('active')) { if (/^\d$/.test(e.key)) pinPress(e.key); else if (e.key === 'Backspace') pinPress('⌫'); return; }
    if (e.key === 'Escape' && $('#modalLayer').classList.contains('open')) return closeModal();
    if (ui.view !== 'manual' || !ui.cls || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
    if (/^\d$/.test(e.key) && ui.num.length < 3) { ui.num = (ui.num + e.key).replace(/^0+/, ''); render(); }
    else if (e.key === 'Backspace') { ui.num = ui.num.slice(0, -1); render(); }
    else if (e.key === 'Enter' && !$('[data-act="confirmManual"]')?.disabled) ACT.confirmManual();
  });
  ['pointerdown', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true }));
  setInterval(() => {
    const c = $('#gtClock');
    if (c) { c.innerHTML = clockHTML(); c.classList.toggle('late', hhmm(deviceNow()) > cfg().lateAfter); }
  }, 5000);
  setInterval(() => {
    if (!$('#app').classList.contains('active')) return;
    if (SCAN.open) lastActive = Date.now(); // scanning at the gate counts as use
    if (Date.now() - lastActive > LOCK_MINUTES * 60e3) return lock();
    if (online() && waiting().length) sync();
  }, 15000);
  /* Release the camera when the app goes to the background; pick it up again on return. */
  document.addEventListener('visibilitychange', () => {
    if (!SCAN.open) return;
    if (document.visibilityState === 'hidden') stopCamera();
    else startCamera().catch((err) => scanError(cameraMessage(err)));
  });
  window.addEventListener('online', () => { renderStatus(); sync(); });
  window.addEventListener('offline', () => renderStatus());
  SchoolData.onChange((fresh) => { db = fresh; if ($('#app').classList.contains('active') && ui.view !== 'manual' && !$('#result').classList.contains('open') && !$('#modalLayer').classList.contains('open')) render(); });

  // ---------- Installable app ----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { /* offline support needs HTTPS */ });

  // ---------- Start ----------
  if (P.staff && pins()[P.staff]) showPin('pin', P.staff); else showWho();
})();
