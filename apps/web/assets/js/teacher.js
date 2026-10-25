/* Teacher App — Module 3 prototype.
   - Marks: one-student-at-a-time entry, review & submit, 24 h edit window (school's clock), corrections.
   - Exams: teachers upload their section as PDF; the HOD sets weights out of 100, chooses which
     sections count on the report card, and compiles one paper. Every teacher's pages are copied
     untouched, so nobody's formatting can disturb anyone else's.
   - Class master: remarks, conduct, attendance confirmation.
   - Works offline: the phone keeps its own copy and an outbox; SchoolData plays the school server.
   Spec: docs/spec/03-module-plans.md §Module 3. */
(() => {
  const $ = (s, p = document) => p.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LOCAL = {
    get(k, d) { try { const v = localStorage.getItem('bchs-teacher-' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('bchs-teacher-' + k, JSON.stringify(v)); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem('bchs-teacher-' + k); } catch { /* storage unavailable */ } }
  };
  const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const ME_ID = 't1';                  // prototype: Mrs. Miriam Tita (teacher, class master, HOD Mathematics)
  const EDIT_MS = 24 * 3600e3;         // edit window after the school system receives a submission
  const LOCK_MINUTES = 5;
  const MAX_PIN_TRIES = 5;
  const MAX_PDF_MB = 20;
  const DAY = 864e5;
  const PHONE = () => matchMedia('(max-width: 899px)').matches;

  let db = SchoolData.load();          // the "school server" in this prototype
  let P = loadPhone();                 // this phone's own copy and outbox


  const NAV = [['home', 'Home'], ['classes', 'Classes'], ['exams', 'Exams'], ['sync', 'Sync'], ['account', 'Account']];
  const TOP = NAV.map((n) => n[0]);

  const ui = { view: 'home', prev: 'home', sheetId: null, idx: 0, order: 'no', target: 'raw', buf: '', filter: 'all', q: '', showList: false, undo: [], msg: null, mIdx: 0, mView: 'remarks', mFilter: 'all', examId: null, secId: null };
  const pin = { mode: 'pin', value: '', first: '', tries: 0, msg: '' };
  let lastActive = Date.now(), syncing = false, syncTimer = 0, installEvent = null, wakeLock = null, swWaiting = null, busy = '';

  // ---------- Phone storage ----------
  function loadPhone() {
    const p = LOCAL.get('device', null);
    if (p && p.v === 3) return p;
    return { v: 3, deviceId: 'phone-' + Math.random().toString(36).slice(2, 7), sheets: {}, classTerm: {}, exams: {}, outbox: [], seq: 0, lastSync: null, offline: false, clockOffset: 0, skew: 0, seenDecisions: [] };
  }
  function savePhone() {
    if (!LOCAL.set('device', P)) toast('This phone is out of storage space. Free some space so your work keeps saving.');
    const s = $('#savedAt');
    if (s) s.textContent = 'Saved on this phone ' + new Date(deviceNow()).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  /* Files (PDF sections and compiled papers) live in IndexedDB: large binary data, kept on the phone. */
  const Files = (() => {
    let opening = null; const mem = new Map();
    const open = () => opening || (opening = new Promise((res, rej) => {
      if (!('indexedDB' in window)) return rej(new Error('IndexedDB unavailable'));
      const r = indexedDB.open('bchs-files', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
    async function put(id, bytes) {
      try { const d = await open(); await new Promise((res, rej) => { const tx = d.transaction('files', 'readwrite'); tx.objectStore('files').put(bytes, id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
      catch { mem.set(id, bytes); }
    }
    async function get(id) {
      try { const d = await open(); return await new Promise((res, rej) => { const q = d.transaction('files').objectStore('files').get(id); q.onsuccess = () => res(q.result || mem.get(id) || null); q.onerror = () => rej(q.error); }); }
      catch { return mem.get(id) || null; }
    }
    return { put, get };
  })();

  // ---------- Clocks ----------
  const worldNow = () => Date.now() + (db.demoOffset || 0);
  const serverNow = () => worldNow();
  const deviceNow = () => worldNow() + (P.clockOffset || 0);
  const trustedNow = () => deviceNow() + (P.skew || 0);
  const online = () => !P.offline && navigator.onLine !== false;

  // ---------- Data helpers ----------
  const me = () => db.teachers.find((t) => t.id === ME_ID);
  const teacherName = (id) => { const t = db.teachers.find((x) => x.id === id); return t ? `${t.title} ${t.name}` : '—'; };
  const className = (id) => db.classes.find((c) => c.id === id)?.name || '—';
  const studentName = (sid) => db.students.find((s) => s.id === sid)?.name || sid;
  const seqName = (id) => db.sequences.find((s) => s.id === id)?.name || '';
  const openSeq = () => db.sequences.find((s) => s.status === 'Open');
  const sheet = () => db.sheets.find((s) => s.id === ui.sheetId);
  const mySheets = () => db.sheets.filter((s) => s.teacher === ME_ID);
  const loc = (sh) => P.sheets[sh.id] || (P.sheets[sh.id] = { entries: {}, base: {}, status: 'not_started', submittedAt: null, pendingSubmit: false });
  const blank = () => ({ raw: null, status: null, adj: 0, reason: '' });
  const strip = (e) => ({ raw: e.raw ?? null, status: e.status || null, adj: e.adj || 0, reason: e.reason || '' });
  const entry = (sh, sid) => ({ ...blank(), ...(loc(sh).entries[sid] || {}) });
  const isDone = (e) => !!(e && (e.status || e.raw != null));
  const round2 = (v) => Math.round(v * 100) / 100;
  const fmt = (v) => (v == null ? '' : String(round2(v)));
  const signed = (v) => (v > 0 ? '+' : '') + fmt(v);
  const totalOf = (e) => (e.raw == null ? null : round2(e.raw + (e.adj || 0)));
  const show = (e) => (!e || !isDone(e) ? 'no mark' : e.status ? e.status : fmt(totalOf(e)));
  const surname = (n) => n.split(' ').slice(-1)[0];
  const initials = (n) => { const p = n.split(' '); return (p[0][0] + p[p.length - 1][0]).toUpperCase(); };
  const sameEntry = (a, b) => JSON.stringify(strip(a || blank())) === JSON.stringify(strip(b || blank()));
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  function roster(sh) {
    const list = db.students.filter((s) => s.cls === sh.cls);
    return ui.order === 'az' ? list.sort((a, b) => a.name.localeCompare(b.name)) : list.sort((a, b) => a.no - b.no);
  }
  function progress(sh) {
    const r = db.students.filter((s) => s.cls === sh.cls), L = loc(sh);
    return { done: r.filter((s) => isDone(L.entries[s.id])).length, total: r.length };
  }
  const editableUntil = (sh) => (loc(sh).submittedAt ? new Date(new Date(loc(sh).submittedAt).getTime() + EDIT_MS) : null);
  function state(sh) {
    const L = loc(sh);
    if (L.status === 'locked') return 'locked';
    if (L.pendingSubmit) return 'submitting';
    if (L.status === 'submitted' && L.submittedAt && trustedNow() >= editableUntil(sh).getTime()) return 'locked';
    return L.status;
  }
  const isEditable = (sh) => ['not_started', 'in_progress', 'submitting', 'submitted'].includes(state(sh));
  const STATE = { not_started: ['Not started', ''], in_progress: ['In progress', 'pending'], submitting: ['Waiting to sync', 'pending'], submitted: ['Submitted', 'approved'], locked: ['Locked', ''] };
  const openSheets = () => mySheets().filter((s) => ['not_started', 'in_progress'].includes(state(s)));
  // Someone else's sheet, as the school system has it.
  const serverState = (sh) => (sh.status === 'submitted' && worldNow() >= new Date(sh.submittedAt).getTime() + EDIT_MS ? 'locked' : sh.status);
  const sheetState = (sh) => (sh.teacher === ME_ID ? state(sh) : serverState(sh));
  const sheetEntry = (sh, sid) => (sh.teacher === ME_ID ? entry(sh, sid) : { ...blank(), ...(sh.entries[sid] || {}) });
  const finished = (st) => ['submitted', 'locked', 'submitting'].includes(st);

  // Class master
  const masterClass = () => db.classes.find((c) => c.master === ME_ID);
  const term = (cls) => P.classTerm[cls] || (P.classTerm[cls] = { records: {}, status: 'draft', attendanceConfirmed: null, pendingSubmit: false });
  const masterRoster = (cls) => db.students.filter((s) => s.cls === cls).sort((a, b) => a.no - b.no);
  const CONDUCT = ['Excellent', 'Very good', 'Good', 'Fair', 'Poor'];
  const CONDUCT_SHORT = { Excellent: 'Exc.', 'Very good': 'V. good', Good: 'Good', Fair: 'Fair', Poor: 'Poor' };
  const PHRASES = ['Hardworking and focused.', 'A pleasure to teach.', 'Participates well in class.', 'Shows good leadership.', 'Can do better with more effort.', 'Should revise more regularly.', 'Must improve punctuality.', 'Needs to be more attentive in class.'];
  const recordDone = (r) => !!(r && r.conduct && r.remark && r.remark.trim().length >= 3);

  // Exams (combined from sections)
  const isHOD = (ex) => ex.hod === ME_ID;
  const hodExams = () => Object.values(P.exams).filter(isHOD).sort((a, b) => String(a.examAt).localeCompare(String(b.examAt)));
  const mySections = () => Object.values(P.exams).flatMap((ex) => ex.sections.filter((s) => s.teacher === ME_ID).map((sec) => ({ ex, sec }))).sort((a, b) => a.sec.due.localeCompare(b.sec.due));
  const currentExam = () => P.exams[ui.examId];
  const currentSection = () => { const ex = currentExam(); return { ex, sec: ex?.sections.find((s) => s.id === ui.secId) }; };
  const weightTotal = (ex) => ex.sections.filter((s) => s.counts).reduce((n, s) => n + (Number(s.weight) || 0), 0);
  const sectionOfSheet = (sh) => { for (const ex of Object.values(P.exams)) { const sec = ex.sections.find((s) => s.sheetId === sh.id); if (sec) return { ex, sec }; } return null; };
  const SEC_STATE = { awaiting: ['Waiting for upload', 'pending'], uploaded: ['Uploaded', ''], accepted: ['Accepted by HOD', 'approved'], returned: ['Returned', 'rejected'] };
  function examStatus(ex) {
    const n = ex.sections.length, up = ex.sections.filter((s) => s.file).length, returned = ex.sections.filter((s) => s.status === 'returned').length, total = weightTotal(ex);
    const cover = !!(ex.title && ex.examAt && ex.duration), last = ex.compiled[ex.compiled.length - 1];
    if (ex.status === 'published') return { key: 'published', label: 'In past papers', cls: 'approved', detail: 'Published to the students\' past-paper library' };
    if (ex.status === 'outdated') return { key: 'outdated', label: 'Needs recompiling', cls: 'pending', detail: 'A section or the cover changed after the last compile' };
    if (ex.status === 'compiled') return { key: 'compiled', label: 'Compiled', cls: 'approved', detail: `Version ${ex.compiled.length} · ${last?.pages || '?'} pages` };
    if (up === n && !returned && total === 100 && cover) return { key: 'ready', label: 'Ready to compile', cls: 'approved', detail: `All ${n} sections in · weights total 100%` };
    return { key: 'collecting', label: 'Collecting sections', cls: 'pending', detail: [`${up} of ${n} sections uploaded`, total !== 100 ? `weights ${total}%` : '', returned ? `${returned} returned` : ''].filter(Boolean).join(' · ') };
  }

  const dayDiff = (iso) => Math.round((new Date(iso.slice(0, 10) + 'T00:00:00') - new Date(new Date(deviceNow()).toDateString())) / DAY);
  const fmtDay = (iso) => new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const fmtTime = (d) => new Date(d).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtClock = (d) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtDT = (v) => (v ? new Date(v).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Not set');
  function dueChip(iso, label = 'Due') {
    const d = dayDiff(iso), cls = d < 0 ? 'bad' : d <= 2 ? 'warn' : '';
    const text = d < 0 ? `${-d} day${d === -1 ? '' : 's'} late` : d === 0 ? `${label} today` : d === 1 ? `${label} tomorrow` : `${label} ${fmtDay(iso)}`;
    return `<span class="ta-due ${cls}">${text}</span>`;
  }
  const badge = (text, cls = '') => `<span class="badge ${cls}">${esc(text)}</span>`;

  // ---------- Outbox ----------
  const live = (o) => ['pending', 'sending', 'conflict', 'rejected'].includes(o.state);
  const attention = () => P.outbox.filter((o) => o.state === 'conflict' || o.state === 'rejected');
  const waiting = () => P.outbox.filter((o) => o.state === 'pending' || o.state === 'sending');
  const hasPending = (sheetId, sid) => P.outbox.some((o) => o.sheetId === sheetId && o.sid === sid && live(o));

  function enqueue(op) {
    P.outbox.push({ id: `${P.deviceId}-${++P.seq}`, clientAt: new Date(deviceNow()).toISOString(), state: 'pending', ...op });
    savePhone();
    scheduleSync();
  }
  /* Marks typed one key at a time collapse into a single outbox item per student. */
  function enqueueMark(sh, sid, e) {
    P.outbox.forEach((o) => { if (o.type === 'mark' && o.sheetId === sh.id && o.sid === sid && (o.state === 'conflict' || o.state === 'rejected')) o.state = 'superseded'; });
    const pending = P.outbox.find((o) => o.type === 'mark' && o.sheetId === sh.id && o.sid === sid && o.state === 'pending');
    if (pending) { pending.entry = strip(e); pending.clientAt = new Date(deviceNow()).toISOString(); savePhone(); scheduleSync(); return; }
    enqueue({ type: 'mark', sheetId: sh.id, sid, entry: strip(e), base: loc(sh).base[sid] || 0 });
  }
  /* Remarks and HOD settings change often while typing: keep one waiting item per record. */
  function enqueueUpsert(same, op) {
    const pending = P.outbox.find((o) => o.state === 'pending' && o.type === op.type && same(o));
    if (pending) { Object.assign(pending, op, { clientAt: new Date(deviceNow()).toISOString() }); savePhone(); scheduleSync(); return; }
    enqueue(op);
  }

  // ---------- The school server (simulated) ----------
  const COVER_FIELDS = ['title', 'examAt', 'duration', 'instructions', 'options'];
  function serverApply(op) {
    const now = serverNow(), at = new Date(now).toISOString();
    const reject = (reason, extra = {}) => ({ state: 'rejected', reason, ...extra });
    if (op.type === 'mark' || op.type === 'submit' || op.type === 'correction') {
      const sh = db.sheets.find((s) => s.id === op.sheetId);
      if (!sh) return reject('This mark sheet no longer exists on the school system.');
      const seq = db.sequences.find((s) => s.id === sh.seq);
      const closesAt = sh.submittedAt ? new Date(sh.submittedAt).getTime() + EDIT_MS : null;
      const locked = sh.status === 'locked' || (sh.status === 'submitted' && now >= closesAt);
      if (op.type === 'mark') {
        if (locked) return reject(`The edit window closed ${fmtClock(closesAt || now)} by the school's clock. Send a correction request instead.`, { kind: 'window' });
        if (seq && seq.status !== 'Open') return reject(`${seq.name} is closed for marks on the school system.`, { kind: 'closed' });
        const cur = sh.entries[op.sid], curV = cur ? (cur.v || 1) : 0;
        if (curV !== op.base) {
          if (sameEntry(cur, op.entry)) return { state: 'synced', serverAt: at, v: curV };
          return { state: 'conflict', reason: 'This mark was changed on the school system after your phone last synced.', serverEntry: strip(cur || blank()), serverV: curV };
        }
        sh.entries[op.sid] = { ...strip(op.entry), v: curV + 1, at, by: ME_ID, device: P.deviceId };
        if (sh.status === 'not_started') sh.status = 'in_progress';
        return { state: 'synced', serverAt: at, v: curV + 1 };
      }
      if (op.type === 'submit') {
        if (locked) return reject('This sheet is already locked on the school system.');
        const missing = db.students.filter((s) => s.cls === sh.cls && !isDone(sh.entries[s.id])).length;
        if (missing) return reject(`${missing} student${missing > 1 ? 's have' : ' has'} no mark on the school system yet. Fix the items that need attention, then submit again.`);
        if (sh.status !== 'submitted') { sh.status = 'submitted'; sh.submittedAt = at; sh.history.push({ at, by: ME_ID, action: 'submitted', device: P.deviceId }); }
        return { state: 'synced', serverAt: at, submittedAt: sh.submittedAt };
      }
      db.corrections.push({ id: 'cr-' + op.id, sheetId: op.sheetId, sid: op.sid, from: op.from, to: op.to, reason: op.reason, by: ME_ID, at, status: 'Pending' });
      return { state: 'synced', serverAt: at };
    }
    if (op.type === 'remark' || op.type === 'attendanceConfirm' || op.type === 'classTermSubmit') {
      const ct = db.classTerm[op.cls];
      if (!ct) return reject('There is no class record for this class on the school system.');
      if (ct.status !== 'draft') return reject(`The class record was already ${ct.status === 'approved' ? 'approved by the Principal' : 'sent to the Principal'}. Ask the office to reopen it.`);
      if (op.type === 'remark') { ct.records[op.sid] = { ...op.record, at }; return { state: 'synced', serverAt: at }; }
      if (op.type === 'attendanceConfirm') { ct.attendanceConfirmed = at; return { state: 'synced', serverAt: at }; }
      const missing = db.students.filter((s) => s.cls === op.cls && !recordDone(ct.records[s.id])).length;
      if (missing) return reject(`${missing} student${missing > 1 ? 's have' : ' has'} no conduct or remark on the school system yet.`);
      if (!ct.attendanceConfirmed) return reject('The attendance summary has not been confirmed yet.');
      ct.status = 'submitted'; ct.submittedAt = at;
      return { state: 'synced', serverAt: at };
    }
    if (['sectionUpload', 'examUpdate', 'sectionReview', 'examCompile', 'examPublish'].includes(op.type)) {
      const ex = db.exams.find((x) => x.id === op.examId);
      if (!ex) return reject('This paper is not on the school system.');
      if (ex.status === 'published') return reject('This paper is already in the past-paper library and can no longer change.');
      const sec = ex.sections.find((s) => s.id === op.secId);
      if (op.type === 'sectionUpload') {
        if (!sec || sec.teacher !== ME_ID) return reject('This section is not assigned to you.');
        sec.file = clone(op.file); sec.status = 'uploaded'; sec.note = '';
        if (ex.status === 'compiled') ex.status = 'outdated';
        return { state: 'synced', serverAt: at };
      }
      if (ex.hod !== ME_ID) return reject('Only the HOD can do this.');
      if (op.type === 'examUpdate') {
        const before = JSON.stringify(COVER_FIELDS.map((f) => ex[f]));
        COVER_FIELDS.forEach((f) => { ex[f] = clone(op.fields[f]); });
        op.sections.forEach((u) => { const s = ex.sections.find((x) => x.id === u.id); if (s) { s.weight = u.weight; s.counts = u.counts; } });
        if (ex.status === 'compiled' && before !== JSON.stringify(COVER_FIELDS.map((f) => ex[f]))) ex.status = 'outdated';
        return { state: 'synced', serverAt: at };
      }
      if (op.type === 'sectionReview') {
        if (!sec) return reject('That section no longer exists.');
        sec.status = op.status; sec.note = op.note || '';
        return { state: 'synced', serverAt: at };
      }
      if (op.type === 'examCompile') {
        ex.compiled.push({ v: ex.compiled.length + 1, at, by: ME_ID, fileId: op.file.id, pages: op.file.pages, size: op.file.size });
        ex.sections.forEach((s) => { if (s.file && s.status === 'uploaded') s.status = 'accepted'; });
        ex.status = 'compiled';
        return { state: 'synced', serverAt: at };
      }
      if (!ex.compiled.length) return reject('Compile the paper before publishing it.');
      ex.status = 'published'; ex.publishedAt = at;
      db.archive.push({ id: 'pp-' + ex.id, examId: ex.id, subject: ex.subject, title: `${ex.title} · ${ex.subject}`, level: className(ex.cls).replace(/ [A-Z]$/, ''), type: 'Sequence', term: db.term, year: ex.examAt.slice(0, 4), fileId: ex.compiled[ex.compiled.length - 1].fileId, publishedAt: at });
      return { state: 'synced', serverAt: at };
    }
    if (op.type === 'notify') {
      db.notifications.push({ id: 'nt-' + op.id, to: op.to, from: ME_ID, text: op.text, at });
      return { state: 'synced', serverAt: at };
    }
    return reject('Unknown change type.');
  }

  /* Bring the server's version onto the phone, without overwriting anything not yet sent. */
  function pull() {
    mySheets().forEach((sh) => {
      const L = loc(sh);
      Object.entries(sh.entries).forEach(([sid, se]) => {
        const v = se.v || 1;
        if ((L.base[sid] || 0) < v && !hasPending(sh.id, sid)) { L.entries[sid] = strip(se); L.base[sid] = v; }
      });
      if (L.pendingSubmit) return;
      if (sh.status === 'submitted' || sh.status === 'locked') { L.status = sh.status; L.submittedAt = sh.submittedAt; }
      else if (L.status === 'not_started' && Object.values(L.entries).some(isDone)) L.status = 'in_progress';
      else if (L.status === 'submitted' && sh.status !== 'submitted') L.status = sh.status;
    });
    const mc = masterClass(), st = mc && db.classTerm[mc.id];
    if (st) {
      const t = term(mc.id), unsent = (type, sid) => P.outbox.some((o) => o.type === type && o.cls === mc.id && (!sid || o.sid === sid) && live(o));
      Object.entries(st.records).forEach(([sid, rec]) => { if (!unsent('remark', sid)) t.records[sid] = { conduct: rec.conduct, remark: rec.remark }; });
      if (!unsent('attendanceConfirm')) t.attendanceConfirmed = st.attendanceConfirmed;
      if (!unsent('classTermSubmit')) { t.status = st.status; t.pendingSubmit = false; }
    }
    db.exams.filter((x) => x.hod === ME_ID || x.sections.some((s) => s.teacher === ME_ID)).forEach((ex) => {
      if (!P.outbox.some((o) => o.examId === ex.id && live(o))) P.exams[ex.id] = clone(ex);
    });
  }

  async function sync(manual = false) {
    if (syncing) return;
    if (!online()) { if (manual) toast('No connection. Your work is safe on this phone and will send when you are back online.'); renderStatus(); return; }
    syncing = true; renderStatus();
    db = SchoolData.load();
    const batch = P.outbox.filter((o) => o.state === 'pending');
    batch.forEach((o) => { o.state = 'sending'; });
    renderStatus();
    await wait(batch.length ? 500 : 250);
    if (!online()) { batch.forEach((o) => { o.state = 'pending'; }); syncing = false; savePhone(); renderStatus(); return; }
    let accepted = 0, flagged = 0;
    batch.forEach((op) => {
      const res = serverApply(op);
      Object.assign(op, res, { sentAt: new Date(serverNow()).toISOString() });
      const sh = db.sheets.find((s) => s.id === op.sheetId);
      if (res.state === 'synced') {
        accepted++;
        if (op.type === 'mark' && sh) {
          loc(sh).base[op.sid] = res.v;
          P.outbox.forEach((o) => { if (o !== op && o.type === 'mark' && o.sheetId === op.sheetId && o.sid === op.sid && o.state === 'pending') o.base = res.v; });
        }
        if (op.type === 'submit' && sh) Object.assign(loc(sh), { pendingSubmit: false, status: 'submitted', submittedAt: res.submittedAt });
      } else {
        flagged++;
        if (op.type === 'submit' && sh) Object.assign(loc(sh), { pendingSubmit: false, status: 'in_progress' });
      }
      if (op.type === 'classTermSubmit') { const t = term(op.cls); t.pendingSubmit = false; if (res.state === 'synced') t.status = 'submitted'; }
    });
    SchoolData.save();
    pull();
    const seen = new Set(P.seenDecisions || []);
    const decided = db.corrections.filter((c) => c.by === ME_ID && c.status !== 'Pending' && !seen.has(c.id));
    decided.forEach((c) => seen.add(c.id));
    P.seenDecisions = [...seen];
    if (decided.length) setTimeout(() => toast(decided.length === 1 ? `Correction ${decided[0].status.toLowerCase()}: ${studentName(decided[0].sid)} ${decided[0].status === 'Approved' ? `is now ${decided[0].to}` : `stays ${decided[0].from}`}.` : `${decided.length} correction requests were decided. See Home.`), 600);
    P.skew = serverNow() - deviceNow();
    P.lastSync = new Date(serverNow()).toISOString();
    const keep = P.outbox.filter((o) => o.state !== 'synced' && o.state !== 'superseded' && o.state !== 'resolved');
    const recent = P.outbox.filter((o) => o.state === 'synced').slice(-40);
    P.outbox = [...keep, ...recent].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    savePhone();
    syncing = false;
    if (flagged) toast(`${flagged} change${flagged > 1 ? 's need' : ' needs'} your attention. Open Sync.`);
    else if (manual && accepted) toast(`${accepted} change${accepted > 1 ? 's' : ''} sent to the school system.`);
    else if (manual) toast('Everything is up to date.');
    const typing = document.activeElement?.matches?.('#view input, #view textarea, #view select');
    if (ui.view === 'entry') { renderStatus(); if (!typing) refreshEntry(); }
    else if (!$('#modalLayer').classList.contains('open') && !typing && !busy) render();
    else renderStatus();
  }
  function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(() => sync(), 1500); }

  // ---------- Toast and modal ----------
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3400);
  }
  function modal(title, body) { $('#modalTitle').textContent = title; $('#modalBody').innerHTML = body; $('#modalLayer').classList.add('open'); }
  const closeModal = () => $('#modalLayer').classList.remove('open');
  const actions = (cancel, primary, act, extra = '') => `<div class="form-actions"><button class="mini-btn" data-close>${cancel}</button><button class="mini-btn primary" data-act="${act}" ${extra}>${primary}</button></div>`;

  // ---------- Geometric pieces (pure #000 / #fff / #3dba3d; every piece uses all three) ----------
  const svg = (box, body) => `<svg class="art" viewBox="${box}" aria-hidden="true" focusable="false">${body}</svg>`;
  // The app is dark, so the pieces sit on black: K is the main shape colour (white), W the cut-out (black).
  const K = '#fff', W = '#000', G = '#3dba3d';
  const ART = {
    gate: svg('0 0 470 340', `<rect x="30" y="20" width="200" height="300" fill="${K}"/><rect x="60" y="60" width="140" height="18" fill="${W}"/><rect x="60" y="98" width="100" height="18" fill="${W}"/><rect x="60" y="136" width="120" height="18" fill="${W}"/><circle cx="170" cy="250" r="46" fill="${G}"/><path d="M148 250l16 16 30-34" fill="none" stroke="${K}" stroke-width="12"/><path d="M250 340A170 170 0 0 1 420 170V340Z" fill="${K}"/><circle cx="372" cy="292" r="28" fill="${W}"/><rect x="270" y="20" width="130" height="110" fill="${W}"/><rect x="300" y="50" width="70" height="50" fill="${K}"/><rect x="320" y="66" width="30" height="18" fill="${G}"/><circle cx="446" cy="60" r="20" fill="${K}"/>`),
    home: svg('0 0 230 110', `<path d="M0 110A60 60 0 0 1 120 110Z" fill="${K}"/><circle cx="60" cy="110" r="26" fill="${W}"/><circle cx="60" cy="110" r="10" fill="${G}"/><rect x="140" y="10" width="14" height="100" fill="${K}"/><rect x="166" y="10" width="64" height="14" fill="${W}"/><rect x="166" y="38" width="44" height="14" fill="${K}"/><rect x="166" y="66" width="64" height="44" fill="${W}"/><rect x="180" y="80" width="16" height="16" fill="${K}"/><circle cx="104" cy="26" r="12" fill="${W}"/>`),
    classes: svg('0 0 230 110', `<rect width="64" height="48" fill="${K}"/><rect x="74" width="64" height="48" fill="${W}"/><rect x="148" width="64" height="48" fill="${K}"/><rect y="62" width="64" height="48" fill="${W}"/><rect x="74" y="62" width="64" height="48" fill="${K}"/><rect x="148" y="62" width="64" height="48" fill="${W}"/><circle cx="106" cy="24" r="12" fill="${G}"/><circle cx="32" cy="86" r="12" fill="${K}"/><circle cx="180" cy="86" r="12" fill="${G}"/><rect x="220" width="10" height="110" fill="${K}"/>`),
    exams: svg('0 0 230 110', `<rect x="70" width="110" height="80" fill="${K}"/><rect x="40" y="15" width="110" height="80" fill="${W}"/><rect x="10" y="30" width="110" height="80" fill="${K}"/><rect x="26" y="48" width="70" height="10" fill="${W}"/><rect x="26" y="68" width="48" height="10" fill="${W}"/><rect x="26" y="88" width="60" height="10" fill="${G}"/><circle cx="204" cy="70" r="24" fill="${W}"/><circle cx="204" cy="70" r="10" fill="${K}"/>`),
    sync: svg('0 0 230 110', `<path d="M10 55A45 45 0 0 1 100 55Z" fill="${K}"/><path d="M130 55A45 45 0 0 0 220 55Z" fill="${W}"/><rect x="10" y="64" width="90" height="12" fill="${W}"/><rect x="130" y="34" width="90" height="12" fill="${K}"/><circle cx="55" cy="40" r="10" fill="${G}"/><circle cx="175" cy="72" r="10" fill="${G}"/><rect x="104" y="88" width="22" height="22" fill="${K}"/>`),
    account: svg('0 0 230 110', `<circle cx="55" cy="55" r="50" fill="${K}"/><circle cx="55" cy="55" r="26" fill="${W}"/><circle cx="55" cy="55" r="10" fill="${G}"/><rect x="100" y="45" width="120" height="20" fill="${K}"/><rect x="170" y="65" width="16" height="30" fill="${K}"/><rect x="200" y="65" width="16" height="20" fill="${K}"/><rect x="120" y="10" width="40" height="20" fill="${W}"/>`),
    empty: svg('0 0 112 72', `<rect width="72" height="72" fill="${K}"/><circle cx="36" cy="36" r="22" fill="${G}"/><circle cx="36" cy="36" r="8" fill="${W}"/><rect x="80" width="32" height="12" fill="${K}"/><rect x="80" y="24" width="20" height="12" fill="${G}"/><rect x="80" y="48" width="32" height="24" fill="${K}"/>`),
    side: svg('0 0 220 560', `<rect width="220" height="160" fill="${G}"/><rect x="20" y="24" width="64" height="14" fill="${W}"/><circle cx="110" cy="160" r="70" fill="${K}"/><circle cx="110" cy="160" r="30" fill="${W}"/><rect y="270" width="140" height="22" fill="${K}"/><rect y="310" width="96" height="22" fill="${K}"/><rect x="160" y="270" width="60" height="62" fill="${G}"/><path d="M0 560V380A180 180 0 0 1 180 560Z" fill="${K}"/><circle cx="60" cy="500" r="26" fill="${G}"/><rect x="194" y="380" width="26" height="180" fill="${G}"/><rect x="194" y="440" width="26" height="14" fill="${W}"/>`)
  };
  const ART_FOR = { home: 'home', classes: 'classes', entry: 'classes', review: 'classes', master: 'classes', exams: 'exams', section: 'exams', exam: 'exams', sync: 'sync', account: 'account' };

  // ---------- Sign-in and PIN ----------
  const brand = '<span class="tp-brand"><span class="tp-brand-mark"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3l8 4-8 4-8-4 8-4zM6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" stroke="#3DBA3D" stroke-width="1.8"/></svg></span><span>BCHS Nkwen<small>Teacher app</small></span></span>';
  /* Split screen, like the Student Portal: a panel with a piece, the form beside it. */
  function gate(card, isPin) {
    const g = $('#gate');
    g.classList.toggle('pin', !!isPin);
    g.innerHTML = `<aside class="tp-gate-art">${brand}${ART.gate}<div><h2>Marks, papers and class records, even offline.</h2><p>Enter marks one student at a time, upload your exam section and send your class record, from the classroom or at home.</p></div></aside><div class="tp-gate-main"><div class="ta-gate-card">${card}</div></div>`;
  }

  function showGate(mode, msg = '') {
    $('#app').classList.remove('active');
    closeModal(); releaseWake();
    const g = $('#gate'); g.hidden = false;
    if (mode === 'signin') {
      gate(`<span class="tp-label">Staff access</span><h1>Sign in</h1><p>Use your school staff account. You will then choose a PIN for this phone.</p>
        ${msg ? `<p class="ta-msg err" style="margin:0 0 1rem">${esc(msg)}</p>` : ''}
        <form id="signinForm"><label class="form-label">Staff email<input name="email" type="email" value="m.tita@bchs.edu.cm" autocomplete="username" required></label><label class="form-label">Password<input name="password" type="password" value="demo-password" autocomplete="current-password" required></label><button class="mini-btn primary" type="submit">Sign in</button></form>
        <p class="ta-gate-note">The first sign-in downloads your classes, so it needs internet. After that the app works offline. Preview: any password signs you in as Mrs. Miriam Tita.</p>`);
      return;
    }
    Object.assign(pin, { mode, value: '', msg });
    renderPin();
  }
  function renderPin() {
    const t = me(), heads = { setpin: ['Choose a 4-digit PIN', 'You will use it to open the app on this phone.'], confirmpin: ['Enter the PIN again', 'To make sure it is right.'], pin: [`Welcome back, ${t.title} ${surname(t.name)}`, 'Enter your PIN to unlock.'] }[pin.mode];
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];
    gate(`<span class="tp-label">${pin.mode === 'pin' ? 'Locked' : 'This phone'}</span><h1>${heads[0]}</h1><p>${heads[1]}</p>
      <div class="ta-pin-dots" aria-label="${pin.value.length} of 4 digits entered">${[0, 1, 2, 3].map((i) => `<i class="${i < pin.value.length ? 'on' : ''}"></i>`).join('')}</div>
      <div class="ta-pin-msg" role="alert">${esc(pin.msg)}</div>
      <div class="ta-pinpad">${keys.map((k) => `<button class="ta-key${k === 'C' || k === '⌫' ? ' fn' : ''}" data-pin="${k}" aria-label="${k === 'C' ? 'Clear' : k === '⌫' ? 'Delete' : k}">${k === 'C' ? 'Clear' : k}</button>`).join('')}</div>
      ${pin.mode === 'pin' ? '<p class="ta-gate-note">Forgot your PIN? <button data-act="forgetPin">Sign in again</button>. Unsent work stays on this phone.</p>' : ''}`, true);
  }
  function pinPress(k) {
    haptic();
    if (k === '⌫') pin.value = pin.value.slice(0, -1);
    else if (k === 'C') pin.value = '';
    else if (/^\d$/.test(k) && pin.value.length < 4) pin.value += k;
    pin.msg = '';
    if (pin.value.length === 4) {
      if (pin.mode === 'setpin') { pin.first = pin.value; pin.mode = 'confirmpin'; pin.value = ''; }
      else if (pin.mode === 'confirmpin') {
        if (pin.value === pin.first) { LOCAL.set('pin', pin.value); LOCAL.set('session', true); pin.tries = 0; return enterApp(); }
        Object.assign(pin, { mode: 'setpin', value: '', msg: 'The PINs did not match. Choose your PIN again.' });
      } else if (pin.value === LOCAL.get('pin', null)) { pin.tries = 0; return enterApp(); }
      else {
        pin.tries += 1; pin.value = '';
        if (pin.tries >= MAX_PIN_TRIES) { LOCAL.del('pin'); LOCAL.del('session'); pin.tries = 0; return showGate('signin', 'Too many wrong PINs. Please sign in again.'); }
        pin.msg = `Wrong PIN. ${MAX_PIN_TRIES - pin.tries} ${MAX_PIN_TRIES - pin.tries === 1 ? 'try' : 'tries'} left.`;
      }
    }
    renderPin();
  }
  function enterApp() {
    $('#gate').hidden = true;
    $('#app').classList.add('active');
    const t = me();
    $('#railInitials').textContent = initials(t.name);
    $('#railInitials').title = `${t.title} ${t.name} · ${t.roles.join(' · ')}`;
    lastActive = Date.now();
    if (!Object.keys(P.sheets).length) { db = SchoolData.load(); pull(); P.lastSync = new Date(serverNow()).toISOString(); savePhone(); }
    navigator.storage?.persist?.();
    render();
    sync();
  }
  const lock = () => showGate('pin');

  // ---------- Phone features ----------
  const haptic = () => { try { navigator.vibrate?.(8); } catch { /* not supported */ } };
  async function holdWake() { try { if ('wakeLock' in navigator && !wakeLock && document.visibilityState === 'visible') { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch { wakeLock = null; } }
  function releaseWake() { try { wakeLock?.release(); } catch { /* already released */ } wakeLock = null; }
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // ---------- Shared UI pieces (one pattern everywhere) ----------
  const CHEV = '<svg class="ta-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  /* Rows lead with a label that means something (a due date, a subject code, a section letter),
     never a stock icon. TOK is the short fallback for rows with nothing better to show. */
  const TOK = { list: 'MKS', file: 'PDF', layers: 'PPR', users: 'REC', sync: 'SYNC', approve: 'COR', phone: 'APP', shield: 'PIN', user: 'ME', database: 'DATA', calendar: 'CLK' };
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const dateTok = (iso) => { const d = new Date(String(iso).slice(0, 10) + 'T00:00:00'); return Number.isNaN(d.getTime()) ? 'NOW' : `<b>${d.getDate()}</b><small>${MON[d.getMonth()]}</small>`; };
  const code = (subject) => { const w = String(subject).split(/\s+/); return (w.length > 1 ? w.map((x) => x[0]).join('') : subject.slice(0, 3)).toUpperCase(); };
  /* Custom solid marks for the phone tab bar, drawn like the geometric pieces (not an icon set). */
  const GLYPH = {
    home: '<rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><circle cx="17" cy="17" r="4"/>',
    classes: '<rect x="3" y="4" width="18" height="4"/><rect x="3" y="10" width="12" height="4"/><rect x="3" y="16" width="16" height="4"/>',
    exams: '<path d="M8 3h13v13h-3V6H8z"/><rect x="3" y="8" width="13" height="13"/>',
    sync: '<path d="M3 11a9 9 0 0 1 18 0z"/><path d="M21 13a9 9 0 0 1-18 0z"/>',
    account: '<circle cx="12" cy="8" r="5"/><path d="M3 22a9 9 0 0 1 18 0z"/>'
  };
  const glyph = (k) => `<svg class="tp-glyph" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${GLYPH[k]}</svg>`;
  /* A full-width row: label tile, title, one line of detail, optional progress, status on the right. */
  function row(it) {
    const tag = it.attrs ? 'button' : 'div', tok = it.tok ?? TOK[it.icon] ?? '';
    return `<${tag} class="ta-item ${it.attrs ? '' : 'static'}" ${it.attrs || ''}><span class="ta-tok ${it.tone || ''}${String(tok).startsWith('<b>') ? ' date' : ''}">${tok}</span><span class="ta-item-main"><b>${esc(it.title)}</b>${it.sub ? `<small>${it.sub}</small>` : ''}${it.progress != null ? `<span class="ta-progress ${it.progress >= 100 ? 'done' : ''}"><i style="width:${Math.min(100, it.progress)}%"></i></span>` : ''}</span><span class="ta-item-side">${it.side || ''}</span>${it.attrs ? CHEV : '<span></span>'}</${tag}>`;
  }
  const group = (title, body, aside = '') => `<section class="ta-group"><div class="ta-group-head"><h2>${title}</h2>${aside}</div>${body}</section>`;
  const listCard = (rows) => `<div class="ta-card-list">${rows.join('')}</div>`;
  const empty = (title, text) => `<div class="ta-card-list"><div class="ta-empty">${ART.empty}<div><b>${title}</b><span>${text}</span></div></div></div>`;
  const notice = (tone, title, text, act = '') => `<div class="ta-notice ${tone}"><div><b>${title}</b>${text ? `<span>${text}</span>` : ''}</div>${act}</div>`;
  const kvList = (pairs) => `<dl class="ta-kv">${pairs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

  // ---------- Shell ----------
  function setTop(title, crumb, actionsHTML = '') {
    $('#title').textContent = title;
    $('#crumb').textContent = crumb;
    $('#topActions').innerHTML = actionsHTML;
    $('#syncPill').innerHTML = syncPill();
  }
  function syncPill() {
    const a = attention().length, w = waiting().length;
    const [cls, text] = !online() ? ['off', w ? `Offline · ${w} on phone` : 'Offline']
      : syncing ? ['busy', 'Syncing…'] : a ? ['bad', `${a} need${a > 1 ? '' : 's'} attention`]
      : w ? ['busy', `${w} waiting`] : ['ok', P.lastSync ? `Synced ${new Date(P.lastSync).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Not synced yet'];
    return `<button class="ta-pill ${cls}" data-page="sync" aria-label="Sync status: ${esc(text)}">${text}</button>`;
  }
  function renderStatus() {
    const p = $('#syncPill'); if (p) p.innerHTML = syncPill();
    const n = attention().length + waiting().length;
    document.querySelectorAll('[data-page="sync"] .count').forEach((c) => c.remove());
    if (n) document.querySelectorAll('#railNav [data-page="sync"], #tabbar [data-page="sync"]').forEach((b) => b.insertAdjacentHTML('beforeend', `<span class="count">${n}</span>`));
  }
  function render() {
    const top = TOP.includes(ui.view), active = top ? ui.view : ui.prev;
    const counts = { home: tasks().length, sync: attention().length + waiting().length };
    $('#app').classList.toggle('entering', ui.view === 'entry' || (ui.view === 'master' && ui.mView === 'remarks'));
    $('#railNav').innerHTML = NAV.map(([k, l]) => `<button class="tp-tab ${k === active ? 'active' : ''}" data-page="${k}" ${k === active ? 'aria-current="page"' : ''}><span>${l}</span>${counts[k] ? `<span class="count">${counts[k]}</span>` : ''}</button>`).join('');
    $('#tabbar').innerHTML = NAV.map(([k, l]) => `<button class="${k === active ? 'on' : ''}" data-page="${k}" ${k === active ? 'aria-current="page"' : ''}>${glyph(k)}<span>${l}</span>${counts[k] ? `<span class="count">${counts[k]}</span>` : ''}</button>`).join('');
    $('#backBtn').hidden = top;
    $('#bandArt').innerHTML = ART[ART_FOR[ui.view]] || '';
    const shown = ui.view;
    VIEWS[ui.view]();
    if (ui.view !== shown) return; // the view redirected and rendered itself
    // Wide screens: the reading column stays comfortable and a geometric piece fills the free side.
    const v = $('#view');
    const art = top && ui.view !== 'home'; // Home uses the full width for its widgets
    v.classList.toggle('with-art', art);
    if (art) v.insertAdjacentHTML('beforeend', `<aside class="tp-side-art" aria-hidden="true">${ART.side}</aside>`);
    document.title = $('#title').textContent + ' | BCHS Teacher';
    if (ui.view === 'entry') holdWake(); else releaseWake();
    if (ui.view === 'exam') loadPreview();
  }
  function go(view, extra = {}) {
    if (TOP.includes(ui.view)) ui.prev = ui.view;
    Object.assign(ui, { view }, extra);
    render(); window.scrollTo(0, 0);
  }

  // ---------- Home: figures, widgets that open each part of the app, and the to-do list ----------
  const widget = (title, body, o = {}) => `<section class="tp-w ${o.cls || ''}"><header class="tp-w-h"><h2>${title}</h2>${o.aside || ''}</header>${body}</section>`;
  const more = (label, attrs) => `<button class="ta-link" ${attrs}>${label}</button>`;
  function homeHTML() {
    const seq = openSeq(), todo = tasks(), recent = updates(), open = openSheets();
    const sheets = mySheets().sort((a, b) => (state(a) === 'locked') - (state(b) === 'locked') || a.due.localeCompare(b.due));
    const entered = open.reduce((n, sh) => n + progress(sh).done, 0), toEnter = open.reduce((n, sh) => n + progress(sh).total, 0);
    const secs = mySections(), toUpload = secs.filter(({ sec }) => sec.status === 'awaiting' || sec.status === 'returned').length, papers = hodExams();
    const mc = masterClass(), t = mc && term(mc.id), r = mc ? masterRoster(mc.id) : [], recDone = mc ? r.filter((s) => recordDone(t.records[s.id])).length : 0;
    const w = waiting().length, a = attention().length, left = seq ? dayDiff(seq.closes) : null;
    const stat = (label, value, sub, attrs, done) => `<button class="tp-stat ${done ? 'done' : ''}" ${attrs}><span>${label}</span><b>${value}</b><small>${sub}</small></button>`;
    const actions = (...b) => `<div class="tp-w-actions">${b.join('')}</div>`;
    return `<div class="tp-stats">
        ${stat('Marks entered', `${entered}/${toEnter}`, `${open.length} open sheet${open.length === 1 ? '' : 's'}`, 'data-page="classes"', toEnter > 0 && entered === toEnter)}
        ${stat('Sections to upload', toUpload, toUpload ? 'for exam papers' : 'all uploaded', 'data-page="exams"', !toUpload)}
        ${mc ? stat('Class record', `${recDone}/${r.length}`, `${esc(mc.name)} remarks`, 'data-act="openMaster"', recDone === r.length) : ''}
        ${stat('Waiting to sync', w + a, a ? `${a} need${a > 1 ? '' : 's'} attention` : online() ? 'online' : 'offline', 'data-page="sync"', !w && !a)}
      </div>
      <div class="tp-home">
        ${widget('To do', todo.length ? listCard(todo.map(row)) : empty('You are all caught up', 'New mark sheets, sections to upload and papers to compile appear here.'), { cls: 'span-2', aside: todo.length ? `<span class="ta-group-count">${todo.length}</span>` : '' })}
        ${widget('Sequence', seq ? `<div class="tp-w-b"><span class="tp-label">${esc(seq.name)} · open</span><div class="tp-big">${Math.max(0, left)}<small> day${left === 1 ? '' : 's'} left</small></div><p>Marks close ${fmtDay(seq.closes)}. Deadlines follow the school system's clock, not the phone's.</p></div>` : '<div class="tp-w-b"><p>No sequence is open for marks.</p></div>')}
        ${widget('Mark sheets', sheets.length ? listCard(sheets.map((sh) => { const p = progress(sh), st = state(sh), [label, cls] = STATE[st]; return row({ tok: code(sh.subject), title: `${sh.subject} · ${className(sh.cls)}`, sub: `${esc(sh.assessment)} · ${p.done} of ${p.total} entered`, progress: finished(st) ? null : pct(p.done, p.total), side: badge(label, cls), attrs: `data-open="${sh.id}"` }); })) : empty('No mark sheets', 'Sheets assigned to you appear here.'), { cls: 'span-2', aside: more('All classes', 'data-page="classes"') })}
        ${mc ? widget(`Class record · ${esc(mc.name)}`, `<div class="tp-w-b"><span class="tp-label">${t.pendingSubmit ? 'Sending to the Principal' : t.status === 'draft' ? 'Remarks and conduct' : 'Sent to the Principal'}</span><div class="tp-big">${recDone}<small>/${r.length} done</small></div><span class="ta-progress ${recDone === r.length ? 'done' : ''}"><i style="width:${pct(recDone, r.length)}%"></i></span><p>Attendance summary ${t.attendanceConfirmed ? `confirmed ${fmtClock(t.attendanceConfirmed)}` : 'not confirmed yet'}.</p>${actions('<button class="mini-btn primary" data-act="openMaster">Remarks and conduct</button>', '<button class="mini-btn" data-act="openMasterAtt">Attendance</button>')}</div>`) : ''}
        ${widget('Exam papers', secs.length || papers.length ? listCard([
          ...secs.map(({ ex, sec }) => { const [label, cls] = SEC_STATE[sec.status]; return row({ tok: esc(sec.id), tone: sec.status === 'accepted' ? 'ok' : sec.status === 'returned' ? 'warn' : '', title: `Section ${sec.id} · ${ex.subject}, ${className(ex.cls)}`, sub: `${esc(sec.title)} · ${sec.marks} marks`, side: badge(label, cls), attrs: `data-act="openSection" data-ex="${ex.id}" data-sec="${sec.id}"` }); }),
          ...papers.map((ex) => { const st = examStatus(ex); return row({ tok: code(ex.subject), tone: st.key === 'ready' || st.key === 'outdated' ? 'ok' : '', title: `${ex.subject} paper · ${className(ex.cls)} (HOD)`, sub: esc(st.detail), side: badge(st.label, st.cls), attrs: `data-act="openExam" data-ex="${ex.id}"` }); })
        ]) : empty('No exam papers', 'Sections your HOD assigns you appear here.'), { cls: 'span-2', aside: more('Exams', 'data-page="exams"') })}
        ${widget('This phone', `<div class="tp-w-b"><span class="tp-label">${online() ? 'Online' : 'Offline'}</span><div class="tp-big">${w + a}<small> waiting</small></div><p>${a ? `${a} change${a > 1 ? 's need' : ' needs'} your attention. ` : ''}Last synced ${P.lastSync ? fmtTime(P.lastSync) : 'never'}.</p>${actions(`<button class="mini-btn primary" data-act="syncNow" ${syncing ? 'disabled' : ''}>Sync now</button>`, '<button class="mini-btn" data-page="sync">Sync centre</button>')}</div>`)}
        ${recent.length ? widget('Recent updates', listCard(recent.map(row)), { cls: 'span-3' }) : ''}
      </div>`;
  }

  function tasks() {
    const out = [], att = attention().length;
    if (att) out.push({ due: '0', tok: 'NOW', tone: 'bad', title: `${att} change${att > 1 ? 's need' : ' needs'} your attention`, sub: 'The school system did not accept them. Open Sync to fix them.', attrs: 'data-page="sync"' });
    openSheets().forEach((sh) => {
      const p = progress(sh), link = sectionOfSheet(sh);
      out.push({ due: sh.due, icon: 'list', title: `Enter marks · ${sh.subject}, ${className(sh.cls)}`, sub: `${esc(sh.assessment)} · ${p.done} of ${p.total} entered${link && link.sec.counts ? ` · ${link.sec.weight}% of the paper` : ''}`, progress: pct(p.done, p.total), side: dueChip(sh.due), attrs: `data-open="${sh.id}"` });
    });
    mySections().filter(({ sec }) => sec.status === 'awaiting' || sec.status === 'returned').forEach(({ ex, sec }) => {
      out.push({ due: sec.due, icon: 'file', tone: sec.status === 'returned' ? 'warn' : '', title: `Upload Section ${sec.id} · ${ex.subject}, ${className(ex.cls)}`, sub: sec.status === 'returned' ? `Returned by the HOD: ${esc(sec.note)}` : `${esc(sec.title)} · ${sec.marks} marks · PDF`, side: dueChip(sec.due), attrs: `data-act="openSection" data-ex="${ex.id}" data-sec="${sec.id}"` });
    });
    hodExams().forEach((ex) => {
      const st = examStatus(ex);
      if (!['collecting', 'ready', 'outdated'].includes(st.key)) return;
      const verb = st.key === 'ready' ? 'Compile' : st.key === 'outdated' ? 'Recompile' : 'Prepare';
      out.push({ due: ex.examAt.slice(0, 10), icon: 'layers', tone: st.key === 'collecting' ? '' : 'ok', title: `${verb} the ${ex.subject} paper · ${className(ex.cls)}`, sub: esc(st.detail), side: dueChip(ex.examAt, 'Exam'), attrs: `data-act="openExam" data-ex="${ex.id}"` });
    });
    const mc = masterClass();
    if (mc) {
      const t = term(mc.id), r = masterRoster(mc.id), done = r.filter((s) => recordDone(t.records[s.id])).length;
      if (t.status === 'draft' && !t.pendingSubmit) out.push({ due: '2026-12-04', icon: 'users', title: `Class record · ${mc.name}`, sub: `${done} of ${r.length} remarks · attendance ${t.attendanceConfirmed ? 'confirmed' : 'not confirmed'}`, progress: pct(done, r.length), side: dueChip('2026-12-04'), attrs: 'data-act="openMaster"' });
    }
    return out.sort((a, b) => String(a.due).localeCompare(String(b.due))).map((x) => ({ tok: dateTok(x.due), ...x }));
  }
  function updates() {
    const out = [];
    db.corrections.filter((c) => c.by === ME_ID && c.status !== 'Pending').forEach((c) => out.push({ at: c.decidedAt, tok: 'COR', tone: c.status === 'Approved' ? 'ok' : 'bad', title: `Correction ${c.status.toLowerCase()} · ${studentName(c.sid)}`, sub: `${esc(c.from)} → ${esc(c.to)}${c.note ? ` · “${esc(c.note)}”` : ''}` }));
    mySections().filter(({ sec }) => sec.status === 'accepted').forEach(({ ex, sec }) => out.push({ at: sec.file?.uploadedAt, tok: esc(sec.id), tone: 'ok', title: `Section ${sec.id} accepted · ${ex.subject}, ${className(ex.cls)}`, sub: `${esc(sec.file?.name || '')}` }));
    hodExams().forEach((ex) => ex.sections.filter((s) => s.teacher !== ME_ID && s.status === 'uploaded').forEach((s) => out.push({ at: s.file.uploadedAt, tok: esc(s.id), title: `${teacherName(s.teacher)} uploaded Section ${s.id}`, sub: `${esc(ex.subject)} · ${esc(className(ex.cls))} · waiting for you to check`, attrs: `data-act="openExam" data-ex="${ex.id}"` })));
    return out.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 5);
  }
  function installRow() {
    if (standalone() || LOCAL.get('installHidden', false)) return '';
    if (installEvent) return group('This phone', listCard([row({ icon: 'phone', title: 'Install the teacher app', sub: 'Opens full screen from your home screen and works without internet.', attrs: 'data-act="install"' })]), '<button class="ta-link" data-act="hideInstall">Hide</button>');
    if (isIOS()) return group('This phone', listCard([row({ icon: 'phone', title: 'Add to your home screen', sub: 'In Safari tap Share, then “Add to Home Screen”. iPhones keep the app\'s data safe only once it is added.' })]), '<button class="ta-link" data-act="hideInstall">Done</button>');
    return '';
  }

  // ---------- Views ----------
  const VIEWS = {
    home() {
      const t = me(), h = new Date(deviceNow()).getHours();
      setTop(`${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}, ${t.title} ${surname(t.name)}`, new Date(deviceNow()).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }));
      $('#view').innerHTML = `<div class="ta-page wide">${homeHTML()}${installRow()}</div>`;
    },

    classes() {
      setTop('Classes', `${db.year} · ${db.term}`);
      const ids = [...new Set([...mySheets().map((s) => s.cls), masterClass()?.id].filter(Boolean))];
      $('#view').innerHTML = `<div class="ta-page">${ids.map((c) => {
        const rows = mySheets().filter((s) => s.cls === c).sort((a, b) => a.due.localeCompare(b.due)).map((sh) => {
          const p = progress(sh), st = state(sh), [label, cls] = STATE[st], link = sectionOfSheet(sh);
          const when2 = st === 'submitted' ? ` · editable until ${fmtClock(editableUntil(sh))}` : st === 'locked' ? ' · changes need a correction' : ` · due ${fmtDay(sh.due)}`;
          return row({ tok: code(sh.subject), title: `${sh.subject} · ${sh.assessment}`, sub: `${p.done} of ${p.total} entered · out of ${sh.max}${link && link.sec.counts ? ` · ${link.sec.weight}% of the paper` : ''}${when2}`, progress: finished(st) ? null : pct(p.done, p.total), side: badge(label, cls), attrs: `data-open="${sh.id}"` });
        });
        const mc = masterClass();
        if (mc && mc.id === c) {
          const t = term(mc.id), r = masterRoster(c), done = r.filter((s) => recordDone(t.records[s.id])).length;
          rows.push(row({ tok: 'REC', title: 'Class record (class master)', sub: `Remarks and conduct ${done}/${r.length} · attendance ${t.attendanceConfirmed ? 'confirmed' : 'not confirmed'}`, side: badge(t.pendingSubmit ? 'Sending' : t.status === 'draft' ? 'In progress' : 'Sent', t.status === 'draft' ? 'pending' : 'approved'), attrs: 'data-act="openMaster"' }));
        }
        return group(esc(className(c)), listCard(rows));
      }).join('')}</div>`;
    },

    exams() {
      setTop('Exams', 'Sections and combined papers');
      const mine = mySections(), dept = hodExams();
      $('#view').innerHTML = `<div class="ta-page">
        <p class="ta-context plain">Write your section on your computer, save it as PDF, and upload it here. The HOD combines all sections into one paper without changing anyone's layout.</p>
        ${group('My sections', mine.length ? listCard(mine.map(({ ex, sec }) => {
          const [label, cls] = SEC_STATE[sec.status];
          return row({ tok: esc(sec.id), tone: sec.status === 'returned' ? 'warn' : sec.status === 'accepted' ? 'ok' : '', title: `Section ${sec.id} · ${sec.title}`, sub: `${esc(ex.subject)} · ${esc(className(ex.cls))} · ${sec.marks} marks${sec.file ? ` · ${esc(sec.file.name)}` : ` · upload by ${fmtDay(sec.due)}`}`, side: badge(label, cls), attrs: `data-act="openSection" data-ex="${ex.id}" data-sec="${sec.id}"` });
        })) : empty('No sections assigned', 'When your HOD assigns you a section, it appears here.'))}
        ${dept.length ? group('Department papers · you are HOD', listCard(dept.map((ex) => {
          const st = examStatus(ex), up = ex.sections.filter((s) => s.file).length;
          return row({ tok: code(ex.subject), tone: st.key === 'ready' || st.key === 'outdated' ? 'ok' : '', title: `${ex.subject} · ${className(ex.cls)}`, sub: `${esc(ex.title)} · ${up} of ${ex.sections.length} sections · exam ${fmtDT(ex.examAt)}`, progress: ['collecting', 'ready'].includes(st.key) ? pct(up, ex.sections.length) : null, side: badge(st.label, st.cls), attrs: `data-act="openExam" data-ex="${ex.id}"` });
        }))) : ''}
      </div>`;
    },

    section() {
      const { ex, sec } = currentSection();
      if (!sec) return go('exams');
      const [label, cls] = SEC_STATE[sec.status], f = sec.file, locked = ex.status === 'published';
      setTop(`Section ${sec.id} · ${sec.title}`, `${ex.subject} · ${className(ex.cls)} · ${ex.title}`);
      const fileCard = f
        ? `<div class="ta-file"><span class="ta-file-icon">PDF</span><div class="ta-file-main"><b>${esc(f.name)}</b><small>${f.pages} page${f.pages > 1 ? 's' : ''} · ${esc(f.pageSize)}${f.size ? ` · ${kb(f.size)}` : ''} · uploaded ${fmtClock(f.uploadedAt)}</small></div><div class="ta-file-actions"><button class="mini-btn" data-act="viewSection" data-ex="${ex.id}" data-sec="${sec.id}">View</button>${locked ? '' : '<label class="mini-btn">Replace<input type="file" accept="application/pdf,.pdf" data-upload hidden></label>'}</div></div>
           ${f.pageSize !== 'A4' ? `<p class="ta-hint">Your pages are ${esc(f.pageSize)} size. They are kept exactly as they are; printers fit them to A4 automatically.</p>` : ''}`
        : `<label class="ta-drop" id="drop"><input type="file" accept="application/pdf,.pdf" data-upload hidden><span class="ta-drop-icon">PDF</span><b>Choose your PDF</b><small>${PHONE() ? 'From your phone or Google Drive' : 'or drag it here'} · up to ${MAX_PDF_MB} MB</small></label>
           <p class="ta-hint">Written in Word? Save it as PDF first. A PDF keeps your layout exactly as you made it. <button class="ta-link" data-act="wordHelp">How to save as PDF</button></p>`;
      $('#view').innerHTML = `<div class="ta-page">
        ${sec.status === 'returned' ? notice('warn', 'Returned by your HOD', esc(sec.note)) : ''}
        ${group('Status', listCard([row({ tok: esc(sec.id), tone: cls === 'approved' ? 'ok' : cls === 'rejected' ? 'warn' : '', title: label, sub: sec.status === 'awaiting' ? `Upload by ${fmtDay(sec.due)}` : sec.status === 'uploaded' ? `${esc(teacherName(ex.hod))} will check it before compiling the paper.` : sec.status === 'accepted' ? 'Your HOD has accepted this section.' : 'Upload a corrected PDF.' , side: sec.status === 'awaiting' ? dueChip(sec.due) : '' })]))}
        ${group('Your file', fileCard)}
        ${group('About this section', `<div class="ta-card-list">${kvList([['Paper', `${esc(ex.subject)} · ${esc(className(ex.cls))} · ${esc(ex.title)}`], ['Exam', fmtDT(ex.examAt)], ['Marked out of', `${sec.marks} marks`], ['On the report card', sec.counts ? `${sec.weight}% of the subject mark (set by the HOD)` : 'Does not count'], ['HOD', esc(teacherName(ex.hod))]])}</div>`)}
      </div>`;
      const drop = $('#drop');
      if (drop) {
        drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('over'));
        drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) uploadSection(e.dataTransfer.files[0]); });
      }
    },

    exam() {
      const ex = currentExam();
      if (!ex) return go('exams');
      const st = examStatus(ex), locked = ex.status === 'published';
      setTop(`${ex.subject} · ${className(ex.cls)}`, `${ex.title} · ${st.label}`);
      $('#view').innerHTML = `<div class="ta-page wide"><div class="ta-split"><div>
        ${st.key === 'outdated' ? notice('warn', 'The paper needs recompiling', 'A section or the cover changed after the last compile. Recompile before printing.') : ''}
        ${group('Sections', `<div class="ta-card-list">${ex.sections.map((s) => sectionEditor(ex, s, locked)).join('')}</div>`, `<span class="ta-group-count">${ex.sections.filter((s) => s.file).length}/${ex.sections.length} in</span>`)}
        <div id="weightsBlock">${weightsBlock(ex, locked)}</div>
        ${group('Cover page', coverForm(ex, locked))}
        ${group('Results for the report card', resultsBlock(ex))}
      </div><aside><div id="paperBlock">${paperBlock(ex)}</div></aside></div></div>`;
    },

    sync() {
      setTop('Sync', 'Between this phone and the school system');
      const att = attention(), wait_ = waiting(), done = P.outbox.filter((o) => o.state === 'synced').slice(-15).reverse();
      const off = P.clockOffset || 0, offText = off === 0 ? 'correct' : `${off > 0 ? '+' : '−'}${Math.round(Math.abs(off) / 3600e3)} h from the real time`;
      $('#view').innerHTML = `<div class="ta-page">
        ${group('Status', `<div class="ta-card-list">
          <div class="ta-item static"><span class="ta-tok ${online() ? 'ok' : 'warn'}">NET</span><span class="ta-item-main"><b>${online() ? 'Online' : 'Offline'}</b><small>${online() ? 'Changes send automatically.' : 'Changes stay on this phone until you are back online.'} Last synced ${P.lastSync ? fmtTime(P.lastSync) : 'never'}.</small></span><span class="ta-item-side"><button class="mini-btn primary" data-act="syncNow" ${syncing ? 'disabled' : ''}>Sync now</button></span><span></span></div>
          <div class="ta-item static"><span class="ta-tok">OFF</span><span class="ta-item-main"><b>Offline mode (demo)</b><small>Pretend the phone has no network.</small></span><span class="ta-item-side"><label class="ta-switch"><input type="checkbox" data-act="toggleOffline" ${P.offline ? 'checked' : ''} aria-label="Offline mode"></label></span><span></span></div>
          <div class="ta-item static"><span class="ta-tok">CLK</span><span class="ta-item-main"><b>Phone clock</b><small>${fmtTime(deviceNow())}, ${offText}. Deadlines are always judged by the school system's clock.</small></span><span></span><span></span></div>
        </div>`)}
        ${att.length ? group(`Needs your attention (${att.length})`, `<div class="ta-card-list">${att.map((o) => opRow(o, o.state === 'conflict'
          ? `<button class="mini-btn primary" data-act="keepMine" data-id="${o.id}">Keep my mark</button><button class="mini-btn" data-act="useSchool" data-id="${o.id}">Use the school's mark</button>`
          : o.type === 'mark' ? `${o.kind === 'window' ? `<button class="mini-btn primary" data-act="correctFromOp" data-id="${o.id}">Request a correction</button>` : ''}<button class="mini-btn" data-act="discardOp" data-id="${o.id}">Discard my change</button>`
          : `<button class="mini-btn" data-act="dismissOp" data-id="${o.id}">Dismiss</button>`)).join('')}</div>`) : ''}
        ${group(`Waiting to send (${wait_.length})`, wait_.length ? `<div class="ta-card-list">${wait_.map((o) => opRow(o)).join('')}</div>` : empty('Nothing waiting', 'Everything on this phone is on the school system.'))}
        ${done.length ? group('Recently sent', `<div class="ta-card-list">${done.map((o) => opRow(o)).join('')}</div>`) : ''}
        ${group('Prototype tests', `<div class="ta-card-list ta-demo">
          <div class="ta-item static"><span class="ta-tok">+25H</span><span class="ta-item-main"><b>Let time pass</b><small>Both clocks move forward together. Now ${(db.demoOffset || 0) / 3600e3} h ahead.</small></span><span class="ta-item-side"><button class="mini-btn" data-act="passTime">+25 hours</button></span><span></span></div>
          <div class="ta-item static"><span class="ta-tok">−2D</span><span class="ta-item-main"><b>Change the phone's date</b><small>What a teacher might try to reopen a locked sheet.</small></span><span class="ta-item-side ta-btns"><button class="mini-btn" data-act="clockBack">2 days back</button><button class="mini-btn" data-act="clockReset">Reset</button></span><span></span></div>
          <div class="ta-item static"><span class="ta-tok">TCH</span><span class="ta-item-main"><b>Other teachers finish their work</b><small>Mr. Fonyuy and Mr. Nji upload their sections and submit their marks.</small></span><span class="ta-item-side"><button class="mini-btn" data-act="othersFinish">Simulate</button></span><span></span></div>
          <div class="ta-item static"><span class="ta-tok">SRV</span><span class="ta-item-main"><b>Change on the school system</b><small>One of your marks is changed on the server, so your next edit to it conflicts.</small></span><span class="ta-item-side"><button class="mini-btn" data-act="serverChange">Simulate</button></span><span></span></div>
        </div>`)}
      </div>`;
    },

    account() {
      const t = me();
      setTop('Account', 'Teacher app');
      $('#view').innerHTML = `<div class="ta-page">
        ${group('Profile', `<div class="ta-card-list">${kvList([['Name', `${esc(t.title)} ${esc(t.name)}`], ['Email', esc(t.email)], ['Roles', t.roles.map(esc).join(' · ')], ['This phone', `${esc(P.deviceId)} · ${standalone() ? 'installed app' : 'in the browser'}`]])}</div>`)}
        ${swWaiting ? group('Update', listCard([row({ tok: 'NEW', tone: 'ok', title: 'A new version is ready', sub: 'Tap to update. Your work is kept.', attrs: 'data-act="applyUpdate"' })])) : ''}
        ${installRow()}
        ${group('Security', listCard([
          row({ tok: 'PIN', title: 'Change PIN', sub: `The app locks after ${LOCK_MINUTES} minutes without use.`, attrs: 'data-act="changePin"' }),
          row({ tok: 'LOCK', title: 'Lock now', sub: 'Use before handing your phone to anyone.', attrs: 'data-act="lockNow"' }),
          row({ tok: 'OUT', tone: 'bad', title: 'Sign out of this phone', sub: waiting().length ? `${waiting().length} change${waiting().length > 1 ? 's are' : ' is'} not sent yet. Sync first.` : 'Removes your PIN and your classes from this phone.', attrs: 'data-act="signOut"' })
        ]))}
        ${group('Prototype', listCard([row({ tok: 'DATA', title: 'Reset sample data', sub: 'Restores the original classes, marks and exam sections.', attrs: 'data-act="resetData"' })]))}
      </div>`;
    },

    master() {
      const mc = masterClass(), t = term(mc.id), r = masterRoster(mc.id);
      const locked = t.status !== 'draft' || t.pendingSubmit, done = r.filter((s) => recordDone(t.records[s.id])).length;
      setTop(`Class record · ${mc.name}`, `${db.term} · ${done}/${r.length} done${t.attendanceConfirmed ? ' · attendance confirmed' : ''}`,
        `${ui.mView === 'remarks' ? `<button class="mini-btn ta-list-btn" data-act="toggleList">${ui.showList ? 'Card' : 'List'}</button>` : ''}<button class="mini-btn primary" data-act="sendRecord" ${locked ? 'disabled' : ''}>${t.pendingSubmit ? 'Sending…' : t.status === 'draft' ? 'Send to Principal' : 'Sent'}</button>`);
      if (ui.mView === 'attendance') { $('#view').innerHTML = `<div class="ta-page wide">${masterAttendance(mc, t, r, locked)}</div>`; return; }
      ui.mIdx = Math.min(ui.mIdx, r.length - 1);
      $('#view').innerHTML = `<div class="ta-entry ${ui.showList ? 'show-list' : ''}"><aside class="ta-list" aria-label="Students">${masterTools(r, t)}<div class="ta-list-body" id="taList">${masterRows(r, t)}</div></aside><section class="ta-pane" id="taPane">${masterPane(mc, t, r, locked)}</section></div>`;
      scrollListToCurrent();
    },

    entry() {
      const sh = sheet(), r = roster(sh);
      ui.idx = Math.min(ui.idx, r.length - 1);
      setTop(`${sh.subject} · ${className(sh.cls)}`, `${sh.assessment} · out of ${sh.max}`,
        `<button class="mini-btn ta-list-btn" data-act="toggleList">${ui.showList ? 'Card' : 'List'}</button><button class="mini-btn primary" data-act="review">Review</button>`);
      $('#view').innerHTML = `<div class="ta-entry ${ui.showList ? 'show-list' : ''}"><aside class="ta-list" aria-label="Class list">${listTools(sh)}<div class="ta-list-body" id="taList">${listRows(sh)}</div></aside><section class="ta-pane" id="taPane">${pane(sh)}</section></div>`;
      scrollListToCurrent();
    },

    review() {
      const sh = sheet(), r = roster(sh), es = r.map((s) => [s, entry(sh, s.id)]);
      const marked = es.filter(([, e]) => e.raw != null), totals = marked.map(([, e]) => totalOf(e)), to20 = (v) => (v / sh.max) * 20;
      const count = (code) => es.filter(([, e]) => e.status === code).length, missing = es.filter(([, e]) => !isDone(e));
      const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null;
      const bands = [['Below 8', (v) => v < 8], ['8 to 10', (v) => v >= 8 && v < 10], ['10 to 12', (v) => v >= 10 && v < 12], ['12 to 16', (v) => v >= 12 && v < 16], ['16 and up', (v) => v >= 16]];
      const st = state(sh), editable = isEditable(sh), link = sectionOfSheet(sh);
      setTop(`Review · ${sh.subject}`, `${className(sh.cls)} · ${sh.assessment} · out of ${sh.max}`);
      $('#view').innerHTML = `<div class="ta-page">
        <div class="metric-grid"><article class="metric"><span>Entered</span><strong>${marked.length}</strong><small>of ${r.length} students</small></article><article class="metric"><span>ABS · EXC · NT</span><strong>${count('ABS')} · ${count('EXC')} · ${count('NT')}</strong><small>status codes</small></article><article class="metric"><span>Class average</span><strong>${avg == null ? '—' : fmt(avg)}</strong><small>${avg == null ? '' : `out of ${sh.max} · ${fmt(to20(avg))} / 20`}</small></article><article class="metric"><span>Highest · lowest</span><strong>${totals.length ? `${fmt(Math.max(...totals))} · ${fmt(Math.min(...totals))}` : '—'}</strong><small>out of ${sh.max}</small></article></div>
        ${group('Spread, converted to /20', `<div class="ta-card-list"><div class="ta-dist">${bands.map(([l, f]) => `<div><b>${totals.filter((v) => f(to20(v))).length}</b><small>${l}</small></div>`).join('')}</div></div>`, `<span class="ta-group-count">${totals.filter((v) => to20(v) < 10).length} below 10</span>`)}
        ${missing.length ? group(`${missing.length} without a mark`, listCard(missing.slice(0, 12).map(([s]) => row({ tok: s.no, title: `${s.no}. ${s.name}`, attrs: `data-jump="${r.indexOf(s)}"` })).concat(missing.length > 12 ? [`<div class="ta-item static"><span></span><span class="ta-item-main"><small>and ${missing.length - 12} more</small></span><span></span><span></span></div>`] : [])), editable ? '<button class="ta-link" data-act="markNT">Mark all as Not taken</button>' : '') : ''}
        ${link ? notice('', `Section ${link.sec.id} of the ${link.ex.subject} paper`, link.sec.counts ? `It counts ${link.sec.weight}% of the subject mark. Your HOD combines it with the other sections once all are submitted.` : 'This section does not count on the report card.') : ''}
        <div class="ta-submit">${st === 'submitted' ? `<p>Submitted ${fmtTime(loc(sh).submittedAt)}. You can still change marks until <b>${fmtTime(editableUntil(sh))}</b>; changes save and send automatically.</p><button class="mini-btn" data-act="backToSheet">Back to the sheet</button>`
          : st === 'submitting' ? '<p>Submitted on this phone. It goes to the school system at the next sync, and the 24-hour edit window starts when the school system receives it.</p><button class="mini-btn" data-act="backToSheet">Back to the sheet</button>'
          : st === 'locked' ? '<p>This sheet is locked. To change a mark, open the student on the sheet and send a correction request to the Vice Principal.</p><button class="mini-btn" data-act="backToSheet">Back to the sheet</button>'
          : `<p>${missing.length ? 'Every student needs a mark or a status (ABS, EXC or NT) before you can submit.' : 'After you submit you can still edit for 24 hours, counted from when the school system receives it. Then the sheet locks, and changes need a correction request approved by the Vice Principal.'}</p><button class="mini-btn primary" data-act="submit" ${missing.length ? 'disabled' : ''}>Submit mark sheet</button>`}</div>
      </div>`;
    }
  };

  function opRow(o, actionsHTML = '') {
    const sh = db.sheets.find((s) => s.id === o.sheetId), ex = P.exams[o.examId] || db.exams.find((x) => x.id === o.examId);
    const what = {
      mark: () => `${studentName(o.sid)} · ${show(o.entry)}`,
      submit: () => 'Submit mark sheet',
      correction: () => `Correction · ${studentName(o.sid)} · ${o.from} → ${o.to}`,
      remark: () => `Remark and conduct · ${studentName(o.sid)}`,
      attendanceConfirm: () => `Confirm attendance summary · ${className(o.cls)}`,
      classTermSubmit: () => `Send class record to the Principal · ${className(o.cls)}`,
      sectionUpload: () => `Upload Section ${o.secId} · ${o.file?.name || ''}`,
      examUpdate: () => 'Paper settings (weights, cover)',
      sectionReview: () => `Section ${o.secId} ${o.status === 'accepted' ? 'accepted' : 'returned'}`,
      examCompile: () => `Compiled paper · ${o.file?.pages || '?'} pages`,
      examPublish: () => 'Publish to past papers',
      notify: () => `Reminder to ${teacherName(o.to)}`
    }[o.type]?.() || o.type;
    const context = sh ? `${sh.subject} · ${className(sh.cls)} · ` : ex ? `${ex.subject} · ${className(ex.cls)} · ` : '';
    const stLabel = { pending: 'On phone', sending: 'Sending', synced: 'Sent', conflict: 'Conflict', rejected: 'Not accepted' }[o.state] || o.state;
    return `<div class="ta-op ${o.state}"><div><b>${esc(what)}</b><small>${esc(context)}saved ${fmtClock(o.clientAt)}${o.sentAt ? ` · sent ${fmtClock(o.sentAt)}` : ''}</small>${o.reason ? `<p>${esc(o.reason)}${o.state === 'conflict' ? ` School system: <b>${esc(show(o.serverEntry))}</b>. This phone: <b>${esc(show(o.entry))}</b>.` : ''}</p>` : ''}${actionsHTML ? `<div class="ta-op-actions">${actionsHTML}</div>` : ''}</div><span class="ta-op-state">${stLabel}</span></div>`;
  }

  // ---------- Exams: HOD parts ----------
  function sectionEditor(ex, s, locked) {
    const [label, cls] = SEC_STATE[s.status], f = s.file, dis = locked ? 'disabled' : '';
    return `<div class="ta-sec">
      <div class="ta-sec-head"><span class="ta-sec-id">${esc(s.id)}</span><div class="ta-sec-title"><b>${esc(s.title)}</b><small>${esc(teacherName(s.teacher))}${s.teacher === ME_ID ? ' (you)' : ''} · ${s.marks} marks</small></div>${badge(label, cls)}</div>
      <div class="ta-sec-file">${f
        ? `<span class="ta-file-icon sm">PDF</span><span class="ta-sec-fname"><b>${esc(f.name)}</b><small>${f.pages} page${f.pages > 1 ? 's' : ''} · ${esc(f.pageSize)} · ${fmtClock(f.uploadedAt)}</small></span><button class="mini-btn" data-act="viewSection" data-ex="${ex.id}" data-sec="${s.id}">View</button>`
        : `<span class="ta-sec-fname"><b>Not uploaded yet</b><small>Due ${fmtDay(s.due)}</small></span>${s.teacher === ME_ID ? `<button class="mini-btn primary" data-act="openSection" data-ex="${ex.id}" data-sec="${s.id}">Upload</button>` : `<button class="mini-btn" data-act="remindTeacher" data-ex="${ex.id}" data-sec="${s.id}" ${dis}>Remind</button>`}`}</div>
      ${s.status === 'returned' && s.note ? `<p class="ta-sec-note">Returned: ${esc(s.note)}</p>` : ''}
      <div class="ta-sec-controls">
        <label class="ta-weight ${s.counts ? '' : 'off'}"><span>Weight</span><input type="number" min="0" max="100" step="5" inputmode="numeric" data-weight="${s.id}" value="${s.counts ? s.weight : 0}" ${s.counts && !locked ? '' : 'disabled'} aria-label="Weight of section ${esc(s.id)} in percent"><span>%</span></label>
        <label class="ta-switch"><input type="checkbox" data-counts="${s.id}" ${s.counts ? 'checked' : ''} ${dis}><span>Counts on report card</span></label>
        ${f && s.status === 'uploaded' && !locked ? `<span class="ta-sec-review"><button class="mini-btn" data-act="returnSection" data-ex="${ex.id}" data-sec="${s.id}">Return</button><button class="mini-btn primary" data-act="acceptSection" data-ex="${ex.id}" data-sec="${s.id}">Accept</button></span>` : ''}
      </div>
    </div>`;
  }

  function weightsBlock(ex, locked) {
    const counted = ex.sections.filter((s) => s.counts), total = weightTotal(ex), ok = total === 100;
    const shades = ['k', 'g', 'm', 'k2', 'g2'];
    const bar = counted.map((s, i) => `<i class="w-${shades[i % shades.length]}" style="width:${Math.min(100, Number(s.weight) || 0)}%" title="Section ${esc(s.id)}: ${s.weight}%"><span>${esc(s.id)} ${s.weight}%</span></i>`).join('');
    return group('Report card weighting', `<div class="ta-card-list ta-weights-card">
        <div class="ta-wbar ${ok ? '' : total > 100 ? 'over' : 'under'}">${bar}${total < 100 ? `<i class="w-gap" style="width:${100 - total}%"><span>${100 - total}% left</span></i>` : ''}</div>
        <div class="ta-wfoot"><span class="ta-wtotal ${ok ? 'ok' : 'bad'}">${ok ? 'Total 100%' : total > 100 ? `Total ${total}%, ${total - 100}% too much` : `Total ${total}%, ${100 - total}% to give`}</span>${locked ? '' : `<button class="ta-link" data-act="shareEqually" data-ex="${ex.id}">Share equally</button>`}</div>
        <p class="ta-hint">${counted.length} of ${ex.sections.length} sections count on the report card. A student's subject mark is each counted section converted to /20, weighted as above. Sections that do not count still appear on the printed paper.</p>
      </div>`);
  }

  function coverForm(ex, locked) {
    const dis = locked ? 'disabled' : '';
    return `<div class="ta-card-list ta-form">
      <label class="form-label">Title on the cover<input data-ex-field="title" value="${esc(ex.title)}" ${dis}></label>
      <div class="ta-form-row"><label class="form-label">Exam date and time<input type="datetime-local" data-ex-field="examAt" value="${esc(ex.examAt)}" ${dis}></label><label class="form-label">Duration (minutes)<input type="number" min="10" max="300" inputmode="numeric" data-ex-field="duration" value="${esc(ex.duration)}" ${dis}></label></div>
      <label class="form-label">Instructions to candidates<textarea rows="3" data-ex-field="instructions" ${dis}>${esc(ex.instructions)}</textarea></label>
      <label class="ta-switch block"><input type="checkbox" data-opt="cover" ${ex.options.cover ? 'checked' : ''} ${dis}><span>Add a cover page<small>School, subject, class, date, instructions and the list of sections with their marks and pages.</small></span></label>
      <label class="ta-switch block"><input type="checkbox" data-opt="pageNumbers" ${ex.options.pageNumbers ? 'checked' : ''} ${dis}><span>Add page numbers in the bottom margin<small>Switch off if a teacher's own footer could be covered.</small></span></label>
    </div>`;
  }

  function readiness(ex) {
    const n = ex.sections.length, up = ex.sections.filter((s) => s.file).length, returned = ex.sections.filter((s) => s.status === 'returned').length, total = weightTotal(ex);
    return [
      [up === n, up === n ? `All ${n} sections uploaded` : `${up} of ${n} sections uploaded`],
      [!returned, returned ? `${returned} section${returned > 1 ? 's' : ''} returned for changes` : 'No section waiting for changes'],
      [total === 100, total === 100 ? 'Report card weights total 100%' : `Report card weights total ${total}%`],
      [!!(ex.title && ex.examAt && ex.duration), ex.title && ex.examAt && ex.duration ? 'Cover details complete' : 'Cover needs a title, date and duration']
    ];
  }

  function paperBlock(ex) {
    const st = examStatus(ex), checks = readiness(ex), ready = checks.every((c) => c[0]), last = ex.compiled[ex.compiled.length - 1], pages = ex.sections.reduce((n, s) => n + (s.file?.pages || 0), 0) + (ex.options.cover ? 1 : 0);
    const examPassed = new Date(ex.examAt).getTime() < worldNow();
    return `${group('Paper', `<div class="ta-card-list ta-paper-card">
        <div class="ta-paper-status"><b>${esc(st.label)}</b><small>${esc(st.detail)}</small></div>
        ${ex.status === 'published' ? '' : `<ul class="ta-checks">${checks.map(([ok, text]) => `<li class="${ok ? 'ok' : ''}">${esc(text)}</li>`).join('')}</ul>
        <div class="ta-paper-act"><button class="mini-btn primary block" data-act="compile" ${ready && !busy ? '' : 'disabled'}>${busy === 'compile' ? 'Combining…' : last ? 'Compile again' : 'Compile paper'}</button><small>${ready ? `About ${pages} page${pages > 1 ? 's' : ''}. Every section's pages are copied exactly as uploaded.` : 'Finish the items above to compile.'}</small></div>`}
        ${last ? `<div class="ta-version"><div><b>Version ${last.v}</b><small>${last.pages} pages · ${fmtClock(last.at)}${st.key === 'outdated' ? ' · out of date' : ''}</small></div><div class="ta-btns"><button class="mini-btn" data-act="openPaper">Open</button><button class="mini-btn" data-act="printPaper">Print</button><button class="mini-btn" data-act="downloadPaper">Save</button></div></div>` : ''}
        ${last && !PHONE() ? '<div class="ta-preview" id="preview"><span class="ta-muted">Loading preview…</span></div>' : ''}
        ${last && ex.status !== 'published' ? `<div class="ta-paper-act"><button class="mini-btn block" data-act="publishPaper" ${examPassed && st.key === 'compiled' ? '' : 'disabled'}>Publish to students' past papers</button><small>${examPassed ? (st.key === 'compiled' ? 'The exam has taken place.' : 'Recompile first.') : `Available after the exam (${fmtDT(ex.examAt)}).`}</small></div>` : ''}
      </div>`)}`;
  }

  function resultsBlock(ex) {
    const counted = ex.sections.filter((s) => s.counts && s.sheetId), sheets = counted.map((s) => [s, db.sheets.find((x) => x.id === s.sheetId)]).filter(([, sh]) => sh);
    if (!sheets.length) return empty('No marks to combine', 'No counted section is linked to a mark sheet.');
    const pending = sheets.filter(([, sh]) => !finished(sheetState(sh)));
    if (pending.length) return listCard(sheets.map(([s, sh]) => { const st = sheetState(sh), p = sh.teacher === ME_ID ? progress(sh) : (() => { const r = db.students.filter((x) => x.cls === sh.cls); return { done: r.filter((x) => isDone(sh.entries[x.id])).length, total: r.length }; })(); return row({ tok: esc(s.id), tone: finished(st) ? 'ok' : '', title: `Section ${s.id} marks · ${teacherName(sh.teacher)}`, sub: `${p.done} of ${p.total} entered · ${s.weight}% of the subject`, side: badge(STATE[st]?.[0] || st, STATE[st]?.[1] || '') }); }).concat([`<div class="ta-item static"><span></span><span class="ta-item-main"><small>Results appear here once every counted section's marks are submitted.</small></span><span></span><span></span></div>`]));
    const r = db.students.filter((s) => s.cls === ex.cls).sort((a, b) => a.no - b.no);
    const rows = r.map((stu) => {
      const parts = sheets.map(([s, sh]) => { const e = sheetEntry(sh, stu.id), t = totalOf(e); return { s, code: e.status, v: t == null ? null : (t / sh.max) * 20 }; });
      const complete = parts.every((p) => p.v != null), total = complete ? parts.reduce((n, p) => n + (p.v * p.s.weight) / 100, 0) : null;
      return { stu, parts, total };
    });
    const totals = rows.map((x) => x.total).filter((v) => v != null), avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null;
    return `<div class="ta-card-list"><div class="ta-results-head"><span>Class average <b>${avg == null ? '—' : fmt(avg)}</b> / 20</span><span>${totals.filter((v) => v < 10).length} below the pass mark</span></div>
      <div class="ta-table-wrap"><table class="ta-table"><thead><tr><th>No.</th><th>Student</th>${sheets.map(([s]) => `<th class="num">${esc(s.id)} · ${s.weight}%</th>`).join('')}<th class="num">Subject /20</th></tr></thead><tbody>
      ${rows.map((x) => `<tr class="${x.total != null && x.total < 10 ? 'below' : ''}"><td>${x.stu.no}</td><td>${esc(x.stu.name)}</td>${x.parts.map((p) => `<td class="num">${p.code || (p.v == null ? '—' : fmt(p.v))}</td>`).join('')}<td class="num"><b>${x.total == null ? '—' : fmt(x.total)}</b></td></tr>`).join('')}
      </tbody></table></div><p class="ta-hint" style="padding:0 1rem 1rem">Students with ABS, EXC or NT in a counted section get no subject mark here; the school's rules apply on the report card.</p></div>`;
  }

  function hodSave(ex) {
    enqueueUpsert((o) => o.examId === ex.id, { type: 'examUpdate', examId: ex.id, fields: Object.fromEntries(COVER_FIELDS.map((f) => [f, clone(ex[f])])), sections: ex.sections.map((s) => ({ id: s.id, weight: s.weight, counts: s.counts })) });
  }
  function refreshExamParts() {
    const ex = currentExam(); if (!ex) return;
    const w = $('#weightsBlock'), p = $('#paperBlock');
    if (w) w.innerHTML = weightsBlock(ex, ex.status === 'published');
    if (p) { p.innerHTML = paperBlock(ex); loadPreview(); }
    $('#crumb').textContent = `${ex.title} · ${examStatus(ex).label}`;
  }

  // ---------- PDF: loading, samples, combining ----------
  let pdfLib = null;
  function loadPdfLib() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    return pdfLib || (pdfLib = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = '../assets/vendor/pdf-lib.min.js';
      s.onload = () => res(window.PDFLib);
      s.onerror = () => { pdfLib = null; rej(new Error('The PDF tools could not load. Connect once so the app can store them.')); };
      document.head.appendChild(s);
    }));
  }
  /* Only characters the standard PDF fonts can draw (Windows-1252). */
  const safe = (s) => String(s ?? '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/[^\x20-\x7E -ÿ]/g, '?');

  /* Prototype sample sections: deliberately different layouts, fonts and paper sizes. */
  async function makeSample(kind) {
    const { PDFDocument, StandardFonts, rgb, PageSizes } = await loadPdfLib();
    const doc = await PDFDocument.create(), k = rgb(0, 0, 0), grey = rgb(0.45, 0.45, 0.45);
    const lines = (page, font, size, x, y, texts, gap) => texts.forEach((t, i) => page.drawText(safe(t), { x, y: y - i * gap, size, font, color: k }));
    if (kind === 'algebra') {
      const tr = await doc.embedFont(StandardFonts.TimesRoman), tb = await doc.embedFont(StandardFonts.TimesRomanBold);
      for (let p = 0; p < 2; p++) {
        const page = doc.addPage(PageSizes.A4);
        page.drawText(safe('SECTION A: ALGEBRA'), { x: 56, y: 780, size: 16, font: tb });
        page.drawText(safe('(30 marks) Answer ALL questions in this section.'), { x: 56, y: 760, size: 11, font: tr, color: grey });
        page.drawLine({ start: { x: 56, y: 750 }, end: { x: 539, y: 750 }, thickness: 1, color: k });
        const qs = p === 0 ? [['1.', 'Solve the equation 2x^2 - 7x + 3 = 0.', '(6 marks)'], ['2.', 'Simplify (3a^2 b)(4ab^3) / 6a^2 b^2.', '(4 marks)'], ['3.', 'Make r the subject of the formula V = (1/3) pi r^2 h.', '(5 marks)']] : [['4.', 'The sum of two numbers is 17 and their difference is 5. Find the numbers.', '(7 marks)'], ['5.', 'Factorise completely: 6x^2 + x - 12.', '(8 marks)']];
        let y = 715;
        qs.forEach(([n, q, m]) => { page.drawText(n, { x: 56, y, size: 12, font: tb }); page.drawText(safe(q), { x: 80, y, size: 12, font: tr }); page.drawText(m, { x: 470, y, size: 11, font: tr, color: grey }); for (let l = 1; l <= 5; l++) page.drawLine({ start: { x: 80, y: y - 22 * l }, end: { x: 539, y: y - 22 * l }, thickness: 0.4, color: grey }); y -= 150; });
        page.drawText(safe(`BCHS Mathematics Dept. - Section A - page ${p + 1}`), { x: 56, y: 30, size: 8, font: tr, color: grey });
      }
    } else if (kind === 'geometry') {
      // US Letter, heavy black banner, two columns and drawn figures: an unusual layout on purpose.
      const hb = await doc.embedFont(StandardFonts.HelveticaBold), h = await doc.embedFont(StandardFonts.Helvetica);
      const page = doc.addPage(PageSizes.Letter);
      page.drawRectangle({ x: 0, y: 712, width: 612, height: 80, color: k });
      page.drawText('SECTION B', { x: 36, y: 752, size: 30, font: hb, color: rgb(1, 1, 1) });
      page.drawText(safe('GEOMETRY & TRIGONOMETRY  -  20 MARKS'), { x: 36, y: 726, size: 12, font: h, color: rgb(1, 1, 1) });
      page.drawLine({ start: { x: 306, y: 690 }, end: { x: 306, y: 80 }, thickness: 2, color: k });
      lines(page, hb, 13, 36, 670, ['QUESTION 6'], 0);
      lines(page, h, 10.5, 36, 650, ['In triangle ABC, AB = 8 cm, BC = 6 cm', 'and angle ABC = 90 degrees.', '', 'a) Calculate AC.               [3]', 'b) Find angle BAC to 1 d.p.   [4]'], 16);
      page.drawLine({ start: { x: 60, y: 450 }, end: { x: 260, y: 450 }, thickness: 1.5, color: k });
      page.drawLine({ start: { x: 60, y: 450 }, end: { x: 60, y: 580 }, thickness: 1.5, color: k });
      page.drawLine({ start: { x: 60, y: 580 }, end: { x: 260, y: 450 }, thickness: 1.5, color: k });
      lines(page, hb, 11, 48, 436, ['B'], 0); lines(page, hb, 11, 48, 584, ['A'], 0); lines(page, hb, 11, 266, 436, ['C'], 0);
      lines(page, hb, 13, 330, 670, ['QUESTION 7'], 0);
      lines(page, h, 10.5, 330, 650, ['A circle has centre O and radius', '5 cm. Chord PQ is 8 cm long.', '', 'a) Find the distance from O', '   to PQ.                    [5]', 'b) Find angle POQ.        [8]'], 16);
      page.drawCircle({ x: 455, y: 470, size: 70, borderColor: k, borderWidth: 1.5 });
      page.drawLine({ start: { x: 399, y: 428 }, end: { x: 511, y: 428 }, thickness: 1.5, color: k });
      page.drawText(safe('>> TURN OVER FOR SECTION C <<'), { x: 190, y: 40, size: 12, font: hb });
    } else if (kind === 'mechanics') {
      const cr = await doc.embedFont(StandardFonts.Courier), cb = await doc.embedFont(StandardFonts.CourierBold);
      for (let p = 0; p < 2; p++) {
        const page = doc.addPage(p === 0 ? PageSizes.A4 : [PageSizes.A4[1], PageSizes.A4[0]]);
        const { width, height } = page.getSize();
        page.drawRectangle({ x: 30, y: 30, width: width - 60, height: height - 60, borderColor: k, borderWidth: 2 });
        page.drawText(safe(p === 0 ? 'PAPER 2  MECHANICS' : 'PAPER 2 (continued)  -  DATA TABLE'), { x: 50, y: height - 70, size: 15, font: cb });
        if (p === 0) lines(page, cr, 11, 50, height - 110, ['8. A particle of mass 2 kg moves under a force', '   F = (6i - 4j) N. Find its acceleration.        [6]', '', '9. A ball is thrown vertically upwards at 20 m/s.', '   Find the greatest height reached (g = 10).     [7]', '', '10. Use the table on the next page (landscape).   [7]'], 18);
        else {
          const cols = ['t (s)', '0', '1', '2', '3', '4', '5'], rowsT = ['v (m/s)', '0', '4', '8', '12', '15', '17'];
          cols.forEach((c, i) => { page.drawText(c, { x: 60 + i * 100, y: height - 140, size: 12, font: cb }); page.drawText(rowsT[i], { x: 60 + i * 100, y: height - 175, size: 12, font: cr }); });
          page.drawLine({ start: { x: 50, y: height - 150 }, end: { x: width - 50, y: height - 150 }, thickness: 1, color: k });
          lines(page, cr, 11, 60, height - 230, ['Plot v against t and estimate the distance travelled in the first 5 seconds.'], 0);
        }
      }
    } else {
      const h = await doc.embedFont(StandardFonts.Helvetica), hb = await doc.embedFont(StandardFonts.HelveticaBold);
      const page = doc.addPage(PageSizes.A4);
      page.drawText(safe(kind === 'oral' ? 'ORAL QUIZ - RECORD SHEET (not on report card)' : 'MATHEMATICS - FORM 4 - WRITTEN PAPER'), { x: 50, y: 790, size: 14, font: hb });
      lines(page, h, 11, 50, 760, kind === 'oral' ? ['Teacher asks 10 quick questions; tick each correct answer.', '', '1. 7 x 8          2. 144 / 12        3. 15% of 60', '4. sqrt(81)       5. 2^5             6. 0.25 as a fraction'] : ['1. Simplify (2^3 x 2^5) / 2^4.                          [5]', '2. Solve 2x + y = 7 and x - y = 2.                      [7]', '3. Find the area of a circle of radius 7 cm (pi = 22/7). [8]'], 22);
    }
    return doc.save();
  }
  async function fileBytes(file) {
    let bytes = await Files.get(file.id);
    if (!bytes && file.sample) { bytes = await makeSample(file.sample); await Files.put(file.id, bytes); }
    return bytes;
  }

  /* Combine: cover page (optional) + every section's pages copied exactly + optional page numbers. */
  async function combine(ex) {
    const { PDFDocument, StandardFonts, rgb, PageSizes } = await loadPdfLib();
    const out = await PDFDocument.create(), font = await out.embedFont(StandardFonts.Helvetica), bold = await out.embedFont(StandardFonts.HelveticaBold), k = rgb(0, 0, 0);
    const parts = [];
    for (const s of ex.sections) {
      const bytes = await fileBytes(s.file);
      if (!bytes) throw new Error(`The file for Section ${s.id} is not on this phone yet. Sync, then try again.`);
      parts.push({ s, doc: await PDFDocument.load(bytes) });
    }
    let next = ex.options.cover ? 2 : 1;
    const ranges = parts.map((p) => { const n = p.doc.getPageCount(), r = n === 1 ? `${next}` : `${next}-${next + n - 1}`; next += n; return r; });
    if (ex.options.cover) {
      const page = out.addPage(PageSizes.A4), W = 595.28, center = (t, y, size, f) => page.drawText(safe(t), { x: (W - f.widthOfTextAtSize(safe(t), size)) / 2, y, size, font: f, color: k });
      const wrap = (text, size, f, maxW) => { const words = safe(text).split(/\s+/), out2 = []; let line = ''; words.forEach((w) => { const t = line ? `${line} ${w}` : w; if (f.widthOfTextAtSize(t, size) > maxW && line) { out2.push(line); line = w; } else line = t; }); if (line) out2.push(line); return out2; };
      center('BAPTIST COMPREHENSIVE HIGH SCHOOL, NKWEN', 790, 14, bold);
      center(`${db.year}  -  ${db.term}  -  ${seqName(ex.seq)}`, 770, 10, font);
      page.drawLine({ start: { x: 50, y: 758 }, end: { x: W - 50, y: 758 }, thickness: 1.5, color: k });
      center(ex.subject.toUpperCase(), 712, 24, bold);
      center(`${className(ex.cls)}  -  ${ex.title}`, 688, 13, font);
      const totalMarks = ex.sections.reduce((n, s) => n + s.marks, 0), when = new Date(ex.examAt);
      const info = [['Date', when.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })], ['Time', when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })], ['Duration', `${ex.duration} minutes`], ['Total', `${totalMarks} marks`]];
      info.forEach(([a, b], i) => { const y = 640 - i * 20; page.drawText(safe(a), { x: 150, y, size: 11, font: bold }); page.drawText(safe(b), { x: 250, y, size: 11, font }); });
      page.drawRectangle({ x: 50, y: 500, width: W - 100, height: 46, borderColor: k, borderWidth: 1 });
      page.drawText('Name: ......................................................................', { x: 62, y: 527, size: 11, font });
      page.drawText('Class number: ..............', { x: 62, y: 509, size: 11, font });
      page.drawText('INSTRUCTIONS', { x: 50, y: 470, size: 11, font: bold });
      wrap(ex.instructions, 11, font, W - 100).forEach((l, i) => page.drawText(l, { x: 50, y: 452 - i * 15, size: 11, font }));
      let y = 452 - wrap(ex.instructions, 11, font, W - 100).length * 15 - 24;
      page.drawText('SECTION', { x: 50, y, size: 9, font: bold }); page.drawText('TOPIC', { x: 120, y, size: 9, font: bold }); page.drawText('MARKS', { x: 420, y, size: 9, font: bold }); page.drawText('PAGES', { x: 490, y, size: 9, font: bold });
      page.drawLine({ start: { x: 50, y: y - 6 }, end: { x: W - 50, y: y - 6 }, thickness: 0.8, color: k });
      parts.forEach((p, i) => { const yy = y - 24 - i * 20; page.drawText(safe(p.s.id), { x: 50, y: yy, size: 11, font: bold }); page.drawText(safe(p.s.title), { x: 120, y: yy, size: 11, font }); page.drawText(String(p.s.marks), { x: 420, y: yy, size: 11, font }); page.drawText(ranges[i], { x: 490, y: yy, size: 11, font }); });
      center('DO NOT OPEN THIS BOOKLET UNTIL YOU ARE TOLD TO DO SO.', 70, 11, bold);
    }
    for (const p of parts) {
      const copied = await out.copyPages(p.doc, p.doc.getPageIndices());
      copied.forEach((pg) => out.addPage(pg));
    }
    if (ex.options.pageNumbers) {
      const pages = out.getPages(), n = pages.length;
      pages.forEach((pg, i) => { const { width } = pg.getSize(), t = `Page ${i + 1} of ${n}`; pg.drawText(t, { x: (width - font.widthOfTextAtSize(t, 8)) / 2, y: 10, size: 8, font, color: k }); });
    }
    return { bytes: await out.save(), pages: out.getPageCount() };
  }

  function pdfURL(bytes) { return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); }
  function openPdf(bytes) {
    const url = pdfURL(bytes), w = window.open(url, '_blank');
    if (!w) savePdf(bytes, 'paper.pdf');
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }
  function savePdf(bytes, name) {
    const a = document.createElement('a'); a.href = pdfURL(bytes); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  function printPdf(bytes) {
    if (PHONE()) { openPdf(bytes); toast('Use the print or share button in the PDF viewer.'); return; }
    const frame = document.createElement('iframe'); frame.className = 'ta-print-frame'; frame.src = pdfURL(bytes);
    frame.onload = () => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { openPdf(bytes); } };
    document.body.appendChild(frame);
    setTimeout(() => { URL.revokeObjectURL(frame.src); frame.remove(); }, 120000);
  }
  async function loadPreview() {
    const box = $('#preview'), ex = currentExam();
    if (!box || !ex) return;
    const last = ex.compiled[ex.compiled.length - 1], bytes = last && await Files.get(last.fileId);
    if (!$('#preview')) return;
    box.innerHTML = bytes ? `<iframe title="Paper preview" src="${pdfURL(bytes)}#view=FitH"></iframe>` : '<span class="ta-muted">The compiled file is not on this device.</span>';
  }

  // ---------- Exams: teacher upload ----------
  function wordHelp() {
    modal('Save your section as PDF', `<p>A PDF keeps your fonts, tables, diagrams and spacing exactly as you made them, so your section prints just as you intended.</p>
      <dl class="ta-kv"><div><dt>Word on Windows</dt><dd>File → Save As → choose “PDF” under “Save as type” → Save.</dd></div><div><dt>Word on Mac</dt><dd>File → Save As → File Format “PDF” → Export.</dd></div><div><dt>Word on a phone</dt><dd>Tap ⋯ → Share or Export → PDF.</dd></div><div><dt>Google Docs</dt><dd>File → Download → PDF document.</dd></div><div><dt>LibreOffice</dt><dd>File → Export as → Export as PDF.</dd></div></dl>
      <p class="ta-hint">Open the PDF once before uploading to check it looks right.</p><div class="form-actions"><button class="mini-btn primary" data-close>Got it</button></div>`);
  }
  async function uploadSection(file) {
    const { ex, sec } = currentSection();
    if (!sec) return;
    const name = file.name || 'section.pdf', ext = name.split('.').pop().toLowerCase();
    if (['doc', 'docx', 'odt', 'rtf', 'pages'].includes(ext)) return wordHelp();
    if (ext !== 'pdf' && file.type !== 'application/pdf') return toast('Please choose a PDF file.');
    if (file.size > MAX_PDF_MB * 1048576) return toast(`That file is ${kb(file.size)}. The limit is ${MAX_PDF_MB} MB; save it again with smaller images.`);
    busy = 'upload'; toast('Checking your PDF…');
    try {
      const { PDFDocument } = await loadPdfLib(), bytes = new Uint8Array(await file.arrayBuffer());
      let doc;
      try { doc = await PDFDocument.load(bytes); }
      catch (e) { busy = ''; return toast(/encrypt/i.test(String(e)) ? 'This PDF is password-protected. Save it again without a password, then upload.' : 'This file could not be read as a PDF. Save it again from Word as PDF.'); }
      const n = doc.getPageCount(), { width, height } = doc.getPage(0).getSize(), near = (a, b) => Math.abs(a - b) < 4;
      const portrait = [Math.min(width, height), Math.max(width, height)], pageSize = near(portrait[0], 595.28) && near(portrait[1], 841.89) ? 'A4' : near(portrait[0], 612) && near(portrait[1], 792) ? 'Letter' : 'custom size';
      const id = `f-${P.deviceId}-${Date.now().toString(36)}`;
      await Files.put(id, bytes);
      const meta = { id, name, size: file.size, pages: n, pageSize, uploadedAt: new Date(deviceNow()).toISOString() };
      sec.file = meta; sec.status = 'uploaded'; sec.note = '';
      if (ex.status === 'compiled') ex.status = 'outdated';
      enqueue({ type: 'sectionUpload', examId: ex.id, secId: sec.id, file: meta });
      busy = ''; render();
      toast(`Uploaded: ${n} page${n > 1 ? 's' : ''}. ${online() ? 'Your HOD can now see it.' : 'It will send when you are back online.'}`);
    } catch (e) { busy = ''; toast(e.message || 'Upload failed.'); }
  }

  // ---------- Grade entry parts ----------
  function listTools(sh) {
    const missing = roster(sh).filter((s) => !isDone(loc(sh).entries[s.id])).length;
    return `<div class="ta-list-tools"><input type="search" placeholder="Find by name or class number" value="${esc(ui.q)}" data-search aria-label="Find a student">
      <div class="seg" role="group"><button class="${ui.filter === 'all' ? 'on' : ''}" data-act="filter" data-v="all">All</button><button class="${ui.filter === 'missing' ? 'on' : ''}" data-act="filter" data-v="missing">Missing (${missing})</button></div>
      <div class="seg" role="group"><button class="${ui.order === 'no' ? 'on' : ''}" data-act="order" data-v="no">Class no.</button><button class="${ui.order === 'az' ? 'on' : ''}" data-act="order" data-v="az">A to Z</button></div></div>`;
  }
  function valueChip(sh, s) {
    const e = entry(sh, s.id), unsent = hasPending(sh.id, s.id) ? '<i class="ta-unsent" title="Not sent yet"></i>' : '';
    if (e.status) return `<span class="ta-val code">${e.status}${unsent}</span>`;
    if (e.raw != null) return `<span class="ta-val ok">${fmt(totalOf(e))}${unsent}</span>`;
    return '<span class="ta-val miss">—</span>';
  }
  function listRows(sh) {
    const r = roster(sh), q = ui.q.trim().toLowerCase(), L = loc(sh);
    const rows = r.map((s, i) => [s, i]).filter(([s]) => (ui.filter === 'all' || !isDone(L.entries[s.id])) && (!q || s.name.toLowerCase().includes(q) || String(s.no) === q));
    return rows.length ? rows.map(([s, i]) => `<button class="ta-li ${i === ui.idx ? 'current' : ''}" data-jump="${i}"><span>${s.no}</span><b>${esc(s.name)}</b>${valueChip(sh, s)}</button>`).join('') : '<p class="ta-muted" style="padding:1rem">No students match.</p>';
  }
  function pane(sh) {
    const r = roster(sh), s = r[ui.idx], e = entry(sh, s.id), p = progress(sh), editable = isEditable(sh), st = state(sh);
    const rawShown = ui.target === 'raw' && editable ? ui.buf : fmt(e.raw);
    const adjShown = ui.target === 'adj' && editable ? ui.buf : (e.adj ? signed(e.adj) : '');
    const total = totalOf(e), corr = myCorrections().find((c) => c.sheetId === sh.id && c.sid === s.id && (c.status === 'Pending' || c.status === 'Waiting'));
    const keys = ['1', '2', '3', '⌫', '4', '5', '6', 'C', '7', '8', '9', '±', '.', '0', 'undo'];
    const keyLabel = { C: 'Clear', '±': '+/−', undo: 'Undo', '⌫': '⌫' };
    const unsent = hasPending(sh.id, s.id);
    return `${!editable ? '<div class="ta-lockbar">Locked: marks can no longer be changed here. Use “Request a correction” below.</div>' : st === 'submitted' ? `<div class="ta-lockbar">Submitted. You can still edit until ${fmtTime(editableUntil(sh))}.</div>` : st === 'submitting' ? '<div class="ta-lockbar">Submitted on this phone. Waiting to sync.</div>' : ''}
      <div class="ta-card" aria-live="polite">
        <div class="ta-student"><span class="ta-photo" aria-hidden="true">${initials(s.name)}</span><div><b>${esc(s.name)}</b><small>${ui.idx + 1} of ${r.length} · ${p.done} entered</small></div><div class="ta-no">${s.no}<small>Class no.</small></div></div>
        <div class="ta-fields">
          <button class="ta-field ${ui.target === 'raw' && editable ? 'active' : ''} ${e.status ? 'status' : ''}" data-target="raw" ${editable ? '' : 'disabled'}><span>Mark</span><b class="${!e.status && rawShown === '' ? 'empty' : ''}">${e.status ? statusName(e.status) : rawShown === '' ? '—' : esc(rawShown)}${e.status ? '' : `<small> / ${sh.max}</small>`}</b></button>
          <button class="ta-field ${ui.target === 'adj' && editable ? 'active' : ''}" data-target="adj" ${editable && !e.status ? '' : 'disabled'}><span>Bonus / penalty</span><b class="${adjShown === '' ? 'empty' : ''}">${adjShown === '' ? '0' : esc(adjShown)}</b></button>
        </div>
        ${editable ? `<div class="ta-chips">${[['ABS', 'Absent'], ['EXC', 'Excused'], ['NT', 'Not taken']].map(([c, l]) => `<button class="ta-chip ${e.status === c ? 'on' : ''}" data-chip="${c}" aria-pressed="${e.status === c}">${c}<small>${l}</small></button>`).join('')}</div>` : ''}
        ${e.adj ? `<div class="ta-reason"><input data-reason value="${esc(e.reason)}" placeholder="Reason for the ${e.adj > 0 ? 'bonus' : 'penalty'} (required)" aria-label="Reason" ${editable ? '' : 'disabled'}></div>` : ''}
        <div class="ta-total"><span>Total${unsent ? ' · <i class="ta-unsent"></i> not sent yet' : ''}</span><b>${e.status ? e.status : total == null ? '—' : `${fmt(total)} / ${sh.max} · ${fmt((total / sh.max) * 20)} / 20`}</b></div>
        ${ui.msg ? `<div class="ta-msg ${ui.msg.type}" role="alert">${esc(ui.msg.text)}</div>` : ''}
        ${!editable ? `<div class="ta-correct">${corr ? `<span>Correction ${corr.status === 'Waiting' ? 'waiting to send' : 'pending with the Vice Principal'}: ${esc(corr.from)} → ${esc(corr.to)}</span>` : '<button class="mini-btn" data-act="correction">Request a correction</button>'}</div>` : ''}
        <div class="ta-nav"><button class="mini-btn" data-act="prev" ${ui.idx === 0 ? 'disabled' : ''}>Previous</button><button class="mini-btn primary" data-act="next">${ui.idx === r.length - 1 ? 'Review sheet' : 'Next student'}</button></div>
        ${editable ? `<div class="ta-keypad">${keys.map((k) => `<button class="ta-key${['C', '±', 'undo', '⌫'].includes(k) ? ' fn' : ''}${k === 'undo' ? ' wide' : ''}" data-key="${k}" ${k === 'undo' && !ui.undo.length ? 'disabled' : ''} aria-label="${k === '⌫' ? 'Delete' : keyLabel[k] || k}">${keyLabel[k] || k}</button>`).join('')}</div>` : ''}
      </div>
      <div class="ta-card-tools"><span class="ta-saved" id="savedAt">Saved on this phone</span><span class="ta-kbd-hint">Keyboard: digits, Enter = next, ↑ = previous</span></div>`;
  }
  const statusName = (c) => ({ ABS: 'Absent', EXC: 'Excused', NT: 'Not taken' }[c]);
  function refreshEntry() {
    const sh = sheet(); if (!sh || ui.view !== 'entry') return;
    const list = $('#taList'), top = list ? list.scrollTop : 0;
    $('#taPane').innerHTML = pane(sh);
    if (list) { list.innerHTML = listRows(sh); list.scrollTop = top; }
    const tools = $('.ta-list-tools');
    if (tools) { const focused = document.activeElement === tools.querySelector('[data-search]'); tools.outerHTML = listTools(sh); if (focused) { const n = $('[data-search]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }
    renderStatus();
  }
  function scrollListToCurrent() { const cur = $('#taList .ta-li.current'); if (cur) cur.scrollIntoView({ block: 'nearest' }); }
  function loadBuffer() {
    const sh = sheet(), s = roster(sh)[ui.idx], e = entry(sh, s.id);
    ui.target = 'raw'; ui.buf = e.raw == null ? '' : fmt(e.raw);
  }
  function setEntry(sh, sid, e) {
    const L = loc(sh);
    if (e.raw == null && !e.status && !e.adj) delete L.entries[sid]; else L.entries[sid] = strip(e);
    if (L.status === 'not_started') L.status = 'in_progress';
    enqueueMark(sh, sid, e);
  }
  function pushUndo(sh, sid) {
    const cur = loc(sh).entries[sid];
    ui.undo.push({ sid, before: cur ? { ...cur } : null, idx: ui.idx });
    if (ui.undo.length > 60) ui.undo.shift();
  }
  function apply(sh, s, buf) {
    const e = entry(sh, s.id);
    if (ui.target === 'raw') {
      if (buf === '' || buf === '.') { e.raw = null; e.adj = 0; e.reason = ''; }
      else {
        const v = parseFloat(buf);
        if (Number.isNaN(v)) return 'That is not a number.';
        if (v > sh.max) return `${fmt(v)} is above the maximum of ${sh.max}.`;
        if (v + (e.adj || 0) > sh.max) return `With the ${signed(e.adj)} adjustment the total would be above ${sh.max}.`;
        if (v + (e.adj || 0) < 0) return 'The total cannot be below 0.';
        e.raw = v;
      }
      e.status = null;
    } else {
      const v = /^[+-]?\.?$/.test(buf) ? 0 : parseFloat(buf);
      if (Number.isNaN(v)) return 'That is not a number.';
      if (v !== 0 && e.raw == null) return 'Enter the mark first, then any bonus or penalty.';
      const t = (e.raw || 0) + v;
      if (t > sh.max) return `The total ${fmt(t)} would be above the maximum of ${sh.max}.`;
      if (t < 0) return 'The total cannot be below 0.';
      e.adj = v;
      if (v === 0) e.reason = '';
    }
    pushUndo(sh, s.id);
    setEntry(sh, s.id, e);
    if (ui.target === 'raw' && e.raw === 0) ui.msg = { type: 'info', text: '0 recorded. If the student was absent, use ABS instead.' };
    return '';
  }
  function press(k) {
    const sh = sheet();
    if (!isEditable(sh)) return;
    haptic();
    if (k === 'undo') return undo();
    const s = roster(sh)[ui.idx], before = ui.buf;
    ui.msg = null;
    if (k === 'C') ui.buf = '';
    else if (k === '⌫') { ui.buf = ui.buf.slice(0, -1); if (/^[+-]$/.test(ui.buf)) ui.buf = ''; }
    else if (k === '±') {
      const e = entry(sh, s.id);
      if (e.status) { ui.msg = { type: 'err', text: `Students marked ${e.status} cannot get a bonus or penalty.` }; return refreshEntry(); }
      if (ui.target !== 'adj') { ui.target = 'adj'; ui.buf = e.adj ? signed(e.adj) : ''; }
      ui.buf = ui.buf.startsWith('-') ? ui.buf.slice(1) : '-' + ui.buf.replace(/^\+/, '');
    } else if (k === '.') { if (ui.buf.includes('.')) return; ui.buf = (/^[+-]?$/.test(ui.buf) ? ui.buf + '0' : ui.buf) + '.'; }
    else if (/^\d$/.test(k)) {
      let nb = ui.buf + k;
      nb = nb.replace(/^([+-]?)0(\d)/, '$1$2');
      if (/\.\d{3}$/.test(nb) || nb.replace(/[^\d]/g, '').length > 5) return;
      ui.buf = nb;
    }
    const err = apply(sh, s, ui.buf);
    if (err) { ui.buf = before; ui.msg = { type: 'err', text: err }; try { navigator.vibrate?.([30, 40, 30]); } catch { /* not supported */ } }
    refreshEntry();
  }
  function setStatus(code) {
    const sh = sheet(); if (!isEditable(sh)) return;
    haptic();
    const s = roster(sh)[ui.idx], e = entry(sh, s.id);
    pushUndo(sh, s.id);
    if (e.status === code) setEntry(sh, s.id, { ...e, status: null });
    else { setEntry(sh, s.id, { raw: null, status: code, adj: 0, reason: '' }); ui.msg = null; return next(); }
    loadBuffer(); refreshEntry();
  }
  function undo() {
    const sh = sheet(), last = ui.undo.pop();
    if (!last) return;
    setEntry(sh, last.sid, last.before || blank());
    ui.idx = roster(sh).findIndex((s) => s.id === last.sid); ui.msg = { type: 'info', text: 'Last change undone.' };
    loadBuffer(); refreshEntry(); scrollListToCurrent();
  }
  function next() {
    const sh = sheet(), r = roster(sh), e = entry(sh, r[ui.idx].id);
    if (isEditable(sh) && e.adj && !e.reason.trim()) { ui.msg = { type: 'err', text: `Add a reason for the ${e.adj > 0 ? 'bonus' : 'penalty'} before moving on.` }; return refreshEntry(); }
    if (ui.idx >= r.length - 1) { ui.view = 'review'; render(); window.scrollTo(0, 0); return; }
    ui.idx += 1; ui.msg = null; loadBuffer(); refreshEntry(); scrollListToCurrent();
  }
  function prev() { if (ui.idx === 0) return; ui.idx -= 1; ui.msg = null; loadBuffer(); refreshEntry(); scrollListToCurrent(); }
  function openSheet(id) {
    if (TOP.includes(ui.view)) ui.prev = ui.view;
    ui.sheetId = id; ui.view = 'entry'; ui.showList = false; ui.undo = []; ui.msg = null; ui.q = ''; ui.filter = 'all';
    const sh = sheet(), r = roster(sh), firstMissing = r.findIndex((s) => !isDone(loc(sh).entries[s.id]));
    ui.idx = isEditable(sh) && firstMissing >= 0 ? firstMissing : 0;
    loadBuffer(); render(); window.scrollTo(0, 0);
  }

  // ---------- Corrections ----------
  function myCorrections() {
    const sent = db.corrections.filter((c) => c.by === ME_ID).map((c) => ({ ...c, label: c.status }));
    const unsent = P.outbox.filter((o) => o.type === 'correction' && (o.state === 'pending' || o.state === 'sending')).map((o) => ({ ...o, status: 'Waiting', label: 'Not sent yet' }));
    return [...unsent, ...sent];
  }
  function correctionModal(sh, s, presetTo = '') {
    const e = entry(sh, s.id);
    modal('Request a correction', `<p><b>${esc(s.name)}</b> · No. ${s.no}<br>${esc(sh.subject)} · ${esc(className(sh.cls))} · ${esc(sh.assessment)} (out of ${sh.max})</p>
      <p class="modal-note">Current mark on the sheet: <b>${esc(show(e))}</b>. The Vice Principal approves or rejects the request; you will see the decision on your Home screen.</p>
      <label class="form-label">Correct mark (number, ABS, EXC or NT)<input id="corrTo" value="${esc(presetTo)}" placeholder="e.g. 21.5" autocomplete="off"></label>
      <label class="form-label">Reason<textarea id="corrReason" rows="3" placeholder="e.g. Marks for question 4 were left out when adding up"></textarea></label>
      <p class="ta-msg err" id="corrErr" hidden></p>
      ${actions('Cancel', 'Send request', 'sendCorrection')}`);
    $('#modalBody').dataset.sheet = sh.id; $('#modalBody').dataset.sid = s.id;
  }

  // ---------- Class master parts ----------
  const masterTabs = () => `<div class="seg" role="group"><button class="${ui.mView === 'remarks' ? 'on' : ''}" data-act="mView" data-v="remarks">Remarks and conduct</button><button class="${ui.mView === 'attendance' ? 'on' : ''}" data-act="mView" data-v="attendance">Attendance</button></div>`;
  function masterTools(r, t) {
    const todo = r.filter((s) => !recordDone(t.records[s.id])).length;
    return `<div class="ta-list-tools">${masterTabs()}<div class="seg" role="group"><button class="${ui.mFilter === 'all' ? 'on' : ''}" data-act="mFilter" data-v="all">All</button><button class="${ui.mFilter === 'todo' ? 'on' : ''}" data-act="mFilter" data-v="todo">To do (${todo})</button></div></div>`;
  }
  function masterRows(r, t) {
    const rows = r.map((s, i) => [s, i]).filter(([s]) => ui.mFilter === 'all' || !recordDone(t.records[s.id]));
    return rows.length ? rows.map(([s, i]) => { const rec = t.records[s.id]; return `<button class="ta-li ${i === ui.mIdx ? 'current' : ''}" data-mjump="${i}"><span>${s.no}</span><b>${esc(s.name)}</b><span class="ta-val ${recordDone(rec) ? 'ok' : 'miss'}">${rec?.conduct ? CONDUCT_SHORT[rec.conduct] : '—'}</span></button>`; }).join('') : '<p class="ta-muted" style="padding:1rem">Every student is done.</p>';
  }
  function masterPane(mc, t, r, locked) {
    const s = r[ui.mIdx], rec = t.records[s.id] || {}, att = (db.attendance[mc.id] || {})[s.id];
    const marks = db.sheets.filter((x) => x.cls === mc.id && x.seq === openSeq()?.id).map((x) => {
      const e = sheetEntry(x, s.id), tt = totalOf(e);
      return `<span>${esc(x.subject)} ${esc(x.assessment.replace(/^Sequence \d+ · /, ''))} <b>${e.status || (tt == null ? '—' : fmt((tt / x.max) * 20))}</b></span>`;
    }).join('');
    return `${locked ? `<div class="ta-lockbar">${t.pendingSubmit ? 'Sending to the Principal at the next sync.' : 'Sent to the Principal. Ask the office to reopen the record if something must change.'}</div>` : ''}
      <div class="ta-card">
        <div class="ta-student"><span class="ta-photo" aria-hidden="true">${initials(s.name)}</span><div><b>${esc(s.name)}</b><small>${ui.mIdx + 1} of ${r.length}</small></div><div class="ta-no">${s.no}<small>Class no.</small></div></div>
        <div class="ta-facts"><div><span>This sequence (/20)</span><p>${marks || 'No marks yet'}</p></div><div><span>Attendance this term</span><p>${att ? `Present <b>${att.present}/${att.days}</b> · late <b>${att.late}</b> · absent <b>${att.excused + att.unexcused}</b>${att.unexcused ? ` (${att.unexcused} unexcused)` : ''}` : '—'}</p></div></div>
        <div class="ta-sub">Conduct</div>
        <div class="ta-conduct">${CONDUCT.map((c) => `<button class="ta-chip ${rec.conduct === c ? 'on' : ''}" data-conduct="${c}" aria-pressed="${rec.conduct === c}" ${locked ? 'disabled' : ''}>${c}</button>`).join('')}</div>
        <div class="ta-sub">Remark for the report card <small id="remarkCount">${(rec.remark || '').length}/200</small></div>
        <div class="ta-reason"><textarea data-remark rows="3" maxlength="200" placeholder="Write a short remark, or tap a phrase below" ${locked ? 'disabled' : ''}>${esc(rec.remark || '')}</textarea></div>
        ${locked ? '' : `<div class="ta-phrases">${PHRASES.map((p) => `<button class="ta-phrase" data-phrase="${esc(p)}">${esc(p)}</button>`).join('')}</div>`}
        <div class="ta-nav"><button class="mini-btn" data-act="mPrev" ${ui.mIdx === 0 ? 'disabled' : ''}>Previous</button><button class="mini-btn primary" data-act="mNext">${ui.mIdx === r.length - 1 ? 'Done' : 'Next student'}</button></div>
      </div>
      <div class="ta-card-tools"><span class="ta-saved" id="savedAt">Saved on this phone</span></div>`;
  }
  function masterAttendance(mc, t, r, locked) {
    const att = db.attendance[mc.id] || {}, list = r.map((s) => [s, att[s.id] || { days: 0, present: 0, late: 0, excused: 0, unexcused: 0 }]);
    const days = list[0]?.[1].days || 0, rate = days ? Math.round((list.reduce((n, [, a]) => n + a.present, 0) / (days * list.length)) * 100) : 0;
    const flagged = (a) => a.unexcused > 0 || a.late >= 4;
    return `<div class="ta-tabs-row">${masterTabs()}</div>
      <div class="metric-grid"><article class="metric"><span>School days</span><strong>${days}</strong><small>this term so far</small></article><article class="metric"><span>Class attendance</span><strong>${rate}%</strong><small>present on school days</small></article><article class="metric"><span>Unexcused absences</span><strong>${list.filter(([, a]) => a.unexcused).length}</strong><small>students</small></article><article class="metric"><span>Often late</span><strong>${list.filter(([, a]) => a.late >= 4).length}</strong><small>4 or more late arrivals</small></article></div>
      ${group('Attendance summary for the report cards', `<div class="ta-card-list"><div class="ta-results-head"><span>From the gate scanner. Check the highlighted students before confirming.</span>${t.attendanceConfirmed ? badge(`Confirmed ${fmtClock(t.attendanceConfirmed)}`, 'approved') : `<button class="mini-btn primary" data-act="confirmAttendance" ${locked ? 'disabled' : ''}>Confirm summary</button>`}</div>
        <div class="ta-table-wrap"><table class="ta-table"><thead><tr><th>No.</th><th>Student</th><th class="num">Present</th><th class="num">Late</th><th class="num">Excused</th><th class="num">Unexcused</th></tr></thead><tbody>${list.map(([s, a]) => `<tr class="${flagged(a) ? 'flag' : ''}"><td>${s.no}</td><td>${esc(s.name)}</td><td class="num">${a.present}/${a.days}</td><td class="num">${a.late}</td><td class="num">${a.excused}</td><td class="num"><b>${a.unexcused}</b></td></tr>`).join('')}</tbody></table></div></div>`)}`;
  }
  function masterRefresh() {
    const mc = masterClass(), t = term(mc.id), r = masterRoster(mc.id), locked = t.status !== 'draft' || t.pendingSubmit;
    const list = $('#taList'), top = list ? list.scrollTop : 0;
    $('#taPane').innerHTML = masterPane(mc, t, r, locked);
    if (list) { list.innerHTML = masterRows(r, t); list.scrollTop = top; }
    const done = r.filter((s) => recordDone(t.records[s.id])).length;
    $('#crumb').textContent = `${db.term} · ${done}/${r.length} done${t.attendanceConfirmed ? ' · attendance confirmed' : ''}`;
    renderStatus();
  }
  function setRecord(field, value) {
    const mc = masterClass(), t = term(mc.id), s = masterRoster(mc.id)[ui.mIdx];
    t.records[s.id] = { ...(t.records[s.id] || {}), [field]: value };
    enqueueUpsert((o) => o.cls === mc.id && o.sid === s.id, { type: 'remark', cls: mc.id, sid: s.id, record: { ...t.records[s.id] } });
  }

  // ---------- Actions ----------
  const findOp = (id) => P.outbox.find((o) => o.id === id);
  const examOf = (b) => P.exams[b.dataset.ex];
  const ACT = {
    // Marks
    toggleList() { ui.showList = !ui.showList; render(); },
    review() { ui.view = 'review'; render(); window.scrollTo(0, 0); },
    backToSheet() { ui.view = 'entry'; loadBuffer(); render(); },
    prev, next,
    filter(b) { ui.filter = b.dataset.v; refreshEntry(); },
    order(b) { const sh = sheet(), sid = roster(sh)[ui.idx].id; ui.order = b.dataset.v; ui.idx = roster(sh).findIndex((s) => s.id === sid); refreshEntry(); scrollListToCurrent(); },
    markNT() { const sh = sheet(), n = roster(sh).filter((s) => !isDone(loc(sh).entries[s.id])).length; modal('Mark as Not taken?', `<p>${n} student${n > 1 ? 's have' : ' has'} no mark. Mark ${n > 1 ? 'them' : 'this student'} as <b>Not taken (NT)</b>? NT is left out of averages. Use ABS instead for students who missed the test without an excuse.</p>${actions('Cancel', 'Mark as NT', 'confirmNT')}`); },
    confirmNT() { const sh = sheet(); roster(sh).filter((s) => !isDone(loc(sh).entries[s.id])).forEach((s) => setEntry(sh, s.id, { raw: null, status: 'NT', adj: 0, reason: '' })); closeModal(); render(); toast('Remaining students marked as Not taken.'); },
    submit() { const sh = sheet(); modal('Submit mark sheet?', `<p><b>${esc(sh.subject)} · ${esc(className(sh.cls))}</b><br>${esc(sh.assessment)}, out of ${sh.max}.</p><p>You can still edit for 24 hours, counted from when the school system receives it${online() ? '' : ' (your phone is offline, so it will send at the next sync)'}. After that the sheet locks and changes need a correction request approved by the Vice Principal.</p>${actions('Not yet', 'Submit', 'confirmSubmit')}`); },
    confirmSubmit() { const sh = sheet(), L = loc(sh); L.status = 'submitted'; L.pendingSubmit = true; enqueue({ type: 'submit', sheetId: sh.id }); closeModal(); go(ui.prev || 'classes'); toast(online() ? 'Submitting to the school system…' : 'Submitted on this phone. It will send when you are back online.'); if (online()) sync(); },
    correction() { const sh = sheet(); correctionModal(sh, roster(sh)[ui.idx]); },
    sendCorrection() {
      const body = $('#modalBody'), sh = db.sheets.find((x) => x.id === body.dataset.sheet), s = db.students.find((x) => x.id === body.dataset.sid);
      const to = $('#corrTo').value.trim().toUpperCase(), reason = $('#corrReason').value.trim(), err = $('#corrErr'), fail = (m) => { err.textContent = m; err.hidden = false; };
      if (!['ABS', 'EXC', 'NT'].includes(to)) { const v = parseFloat(to); if (Number.isNaN(v) || v < 0 || v > sh.max) return fail(`Enter a mark from 0 to ${sh.max}, or ABS, EXC or NT.`); }
      if (reason.length < 5) return fail('Explain the reason so the Vice Principal can decide.');
      const from = show(entry(sh, s.id));
      if (from === to) return fail('That is the same as the current mark.');
      enqueue({ type: 'correction', sheetId: sh.id, sid: s.id, from, to, reason });
      closeModal(); if (ui.view === 'entry') refreshEntry(); else render();
      toast(online() ? 'Correction request sent to the Vice Principal.' : 'Correction request saved. It will send when you are back online.');
    },

    // Exams: teacher
    openSection(b) { go('section', { examId: b.dataset.ex, secId: b.dataset.sec }); },
    wordHelp,
    async viewSection(b) { const ex = examOf(b), s = ex.sections.find((x) => x.id === b.dataset.sec); try { const bytes = await fileBytes(s.file); if (!bytes) return toast('This file is not on this phone yet. Sync, then try again.'); openPdf(bytes); } catch (e) { toast(e.message); } },

    // Exams: HOD
    openExam(b) { go('exam', { examId: b.dataset.ex }); },
    acceptSection(b) { const ex = examOf(b), s = ex.sections.find((x) => x.id === b.dataset.sec); s.status = 'accepted'; s.note = ''; enqueue({ type: 'sectionReview', examId: ex.id, secId: s.id, status: 'accepted' }); render(); toast(`Section ${s.id} accepted.`); },
    returnSection(b) { const ex = examOf(b), s = ex.sections.find((x) => x.id === b.dataset.sec); modal(`Return Section ${s.id}?`, `<p>${esc(teacherName(s.teacher))} is asked to upload a corrected PDF.</p><label class="form-label">What needs changing<textarea id="returnNote" rows="3" placeholder="e.g. Question 7(b) needs its marks shown; total should be 20"></textarea></label>${actions('Cancel', 'Return section', 'doReturn')}`); $('#modalBody').dataset.ex = ex.id; $('#modalBody').dataset.sec = s.id; },
    doReturn() {
      const body = $('#modalBody'), ex = P.exams[body.dataset.ex], s = ex.sections.find((x) => x.id === body.dataset.sec), note = $('#returnNote').value.trim();
      if (note.length < 5) return toast('Say what needs changing.');
      s.status = 'returned'; s.note = note;
      enqueue({ type: 'sectionReview', examId: ex.id, secId: s.id, status: 'returned', note });
      closeModal(); render(); toast(`Section ${s.id} returned to ${teacherName(s.teacher)}.`);
    },
    remindTeacher(b) { const ex = examOf(b), s = ex.sections.find((x) => x.id === b.dataset.sec); enqueue({ type: 'notify', to: s.teacher, text: `Please upload Section ${s.id} (${s.title}) of the ${ex.subject} paper for ${className(ex.cls)} by ${fmtDay(s.due)}.` }); toast(`Reminder ${online() ? 'sent' : 'saved'} for ${teacherName(s.teacher)}.`); },
    shareEqually(b) { const ex = examOf(b), counted = ex.sections.filter((s) => s.counts), base = Math.floor(100 / counted.length); counted.forEach((s, i) => { s.weight = base + (i < 100 - base * counted.length ? 1 : 0); }); hodSave(ex); render(); },
    async compile() {
      const ex = currentExam();
      if (!readiness(ex).every((c) => c[0]) || busy) return;
      busy = 'compile'; refreshExamParts();
      try {
        const { bytes, pages } = await combine(ex), id = `paper-${ex.id}-${Date.now().toString(36)}`;
        await Files.put(id, bytes);
        const meta = { id, pages, size: bytes.length };
        ex.compiled.push({ v: ex.compiled.length + 1, at: new Date(deviceNow()).toISOString(), by: ME_ID, fileId: id, pages, size: bytes.length });
        ex.sections.forEach((s) => { if (s.file && s.status === 'uploaded') s.status = 'accepted'; });
        ex.status = 'compiled';
        enqueue({ type: 'examCompile', examId: ex.id, file: meta });
        busy = ''; render(); toast(`Paper compiled: ${pages} pages.`);
      } catch (e) { busy = ''; refreshExamParts(); toast(e.message || 'The paper could not be compiled.'); }
    },
    async openPaper() { const ex = currentExam(), last = ex.compiled[ex.compiled.length - 1], bytes = last && await Files.get(last.fileId); if (!bytes) return toast('The compiled file is not on this device.'); openPdf(bytes); },
    async printPaper() { const ex = currentExam(), last = ex.compiled[ex.compiled.length - 1], bytes = last && await Files.get(last.fileId); if (!bytes) return toast('The compiled file is not on this device.'); printPdf(bytes); },
    async downloadPaper() { const ex = currentExam(), last = ex.compiled[ex.compiled.length - 1], bytes = last && await Files.get(last.fileId); if (!bytes) return toast('The compiled file is not on this device.'); savePdf(bytes, `${ex.subject} ${className(ex.cls)} ${ex.title} v${last.v}.pdf`.replace(/[^\w .-]/g, '')); },
    publishPaper() { modal('Publish to past papers?', '<p>Students will be able to download this paper from the Student Portal. Marks and weights are never published.</p>' + actions('Cancel', 'Publish', 'doPublish')); },
    doPublish() { const ex = currentExam(); ex.status = 'published'; enqueue({ type: 'examPublish', examId: ex.id }); closeModal(); render(); toast(online() ? 'Published to the past-paper library.' : 'Saved. It publishes when you are back online.'); if (online()) sync(); },

    // Class master
    openMasterAtt() { go('master', { mView: 'attendance', showList: false, mFilter: 'all', mIdx: 0 }); },
    openMaster() { const mc = masterClass(), t = term(mc.id), r = masterRoster(mc.id), i = r.findIndex((s) => !recordDone(t.records[s.id])); go('master', { mView: 'remarks', showList: false, mFilter: 'all', mIdx: i < 0 ? 0 : i }); },
    mView(b) { ui.mView = b.dataset.v; ui.showList = false; render(); },
    mFilter(b) { ui.mFilter = b.dataset.v; render(); },
    mPrev() { if (ui.mIdx > 0) { ui.mIdx -= 1; masterRefresh(); scrollListToCurrent(); } },
    mNext() {
      const mc = masterClass(), t = term(mc.id), r = masterRoster(mc.id);
      if (ui.mIdx < r.length - 1) { ui.mIdx += 1; masterRefresh(); scrollListToCurrent(); return; }
      const todo = r.filter((s) => !recordDone(t.records[s.id])).length;
      toast(todo ? `${todo} student${todo > 1 ? 's still need' : ' still needs'} conduct and a remark. Use “To do” to find them.` : 'Every student is done. Confirm the attendance summary, then send the record to the Principal.');
    },
    confirmAttendance() { modal('Confirm the attendance summary?', `<p>You confirm these figures are correct for the report cards of <b>${esc(masterClass().name)}</b>.</p>${actions('Cancel', 'Confirm', 'doConfirmAttendance')}`); },
    doConfirmAttendance() { const mc = masterClass(); term(mc.id).attendanceConfirmed = new Date(deviceNow()).toISOString(); enqueue({ type: 'attendanceConfirm', cls: mc.id }); closeModal(); render(); toast('Attendance summary confirmed.'); },
    sendRecord() {
      const mc = masterClass(), t = term(mc.id), r = masterRoster(mc.id), todo = r.filter((s) => !recordDone(t.records[s.id])), issues = [];
      if (todo.length) issues.push(`${todo.length} student${todo.length > 1 ? 's still need' : ' still needs'} conduct and a remark (${todo.slice(0, 3).map((s) => esc(s.name)).join(', ')}${todo.length > 3 ? ' and others' : ''}).`);
      if (!t.attendanceConfirmed) issues.push('The attendance summary is not confirmed yet (Attendance tab).');
      if (issues.length) return modal('Not ready to send', `<ul class="ta-issues">${issues.map((i) => `<li>${i}</li>`).join('')}</ul><div class="form-actions"><button class="mini-btn primary" data-close>OK</button></div>`);
      modal('Send to the Principal?', `<p>Remarks, conduct and the attendance summary for <b>${esc(mc.name)}</b> go to the Principal for the report cards. You cannot change them afterwards unless the office reopens the record.</p>${actions('Not yet', 'Send', 'doSendRecord')}`);
    },
    doSendRecord() { const mc = masterClass(), t = term(mc.id); t.pendingSubmit = true; enqueue({ type: 'classTermSubmit', cls: mc.id }); closeModal(); render(); toast(online() ? 'Sending to the Principal…' : 'Saved. It will send when you are back online.'); if (online()) sync(); },

    // Sync
    syncNow() { sync(true); },
    toggleOffline(b) { P.offline = b.checked; savePhone(); render(); toast(P.offline ? 'Offline mode on. Changes stay on this phone.' : 'Back online. Sending changes…'); if (!P.offline) sync(); },
    keepMine(b) { const op = findOp(b.dataset.id); if (!op) return; const sh = db.sheets.find((s) => s.id === op.sheetId); op.base = op.serverV; op.state = 'pending'; delete op.reason; delete op.serverEntry; loc(sh).base[op.sid] = op.serverV; savePhone(); render(); sync(true); },
    useSchool(b) { const op = findOp(b.dataset.id); if (!op) return; const sh = db.sheets.find((s) => s.id === op.sheetId), L = loc(sh); if (isDone(op.serverEntry)) L.entries[op.sid] = strip(op.serverEntry); else delete L.entries[op.sid]; L.base[op.sid] = op.serverV; op.state = 'resolved'; savePhone(); render(); toast("Using the school system's mark."); },
    discardOp(b) { const op = findOp(b.dataset.id); if (!op) return; const sh = db.sheets.find((s) => s.id === op.sheetId), se = sh.entries[op.sid], L = loc(sh); if (se && isDone(se)) L.entries[op.sid] = strip(se); else delete L.entries[op.sid]; L.base[op.sid] = se ? (se.v || 1) : 0; op.state = 'resolved'; savePhone(); render(); toast('Your change was discarded.'); },
    correctFromOp(b) { const op = findOp(b.dataset.id); if (!op) return; const sh = db.sheets.find((s) => s.id === op.sheetId), s = db.students.find((x) => x.id === op.sid), want = show(op.entry); ACT.discardOp(b); correctionModal(sh, s, want === 'no mark' ? '' : want); },
    dismissOp(b) { const op = findOp(b.dataset.id); if (op) { op.state = 'resolved'; savePhone(); render(); } },
    passTime() { db = SchoolData.load(); db.demoOffset = (db.demoOffset || 0) + 25 * 3600e3; SchoolData.save(); render(); toast('25 hours have passed on both clocks.'); },
    clockBack() { P.clockOffset = (P.clockOffset || 0) - 2 * DAY; savePhone(); render(); toast("Phone clock set 2 days back. Edits made offline are still judged by the school's clock."); },
    clockReset() { P.clockOffset = 0; P.skew = 0; db = SchoolData.load(); db.demoOffset = 0; SchoolData.save(); savePhone(); render(); toast('Clocks reset to real time.'); },
    async othersFinish() {
      db = SchoolData.load();
      const at = new Date(serverNow()).toISOString();
      for (const ex of db.exams) for (const s of ex.sections) if (s.teacher !== ME_ID && !s.file) { s.file = { id: `smp-${ex.id}-${s.id}`, name: `${s.title} final.pdf`, size: 0, pages: 1, pageSize: 'A4', uploadedAt: at, sample: 'written' }; s.status = 'uploaded'; }
      db.sheets.filter((sh) => sh.teacher !== ME_ID && sh.seq === openSeq()?.id).forEach((sh) => {
        db.students.filter((s) => s.cls === sh.cls).forEach((s) => { if (!isDone(sh.entries[s.id])) sh.entries[s.id] = { raw: Math.round((sh.max * (0.3 + Math.random() * 0.65)) * 2) / 2, status: null, adj: 0, reason: '', v: 1, at, by: sh.teacher }; });
        if (sh.status !== 'submitted') { sh.status = 'submitted'; sh.submittedAt = at; sh.history.push({ at, by: sh.teacher, action: 'submitted' }); }
      });
      SchoolData.save(); pull(); savePhone(); render();
      toast('The other teachers uploaded their sections and submitted their marks.');
    },
    serverChange() {
      db = SchoolData.load();
      const op = P.outbox.find((o) => o.type === 'mark' && o.state === 'pending');
      const sh = op ? db.sheets.find((s) => s.id === op.sheetId) : db.sheets.find((s) => s.teacher === ME_ID && ['in_progress', 'submitted'].includes(s.status));
      const sid = op ? op.sid : Object.keys(sh.entries).find((k) => sh.entries[k].raw != null);
      const cur = sh.entries[sid] || { v: 0 }, raw = Math.min(sh.max, Math.max(0, (cur.raw ?? sh.max / 2) + 2));
      sh.entries[sid] = { raw, status: null, adj: 0, reason: '', v: (cur.v || (cur.raw != null ? 1 : 0)) + 1, at: new Date(serverNow()).toISOString(), by: 'office' };
      SchoolData.save(); render();
      toast(op ? `The school system changed ${studentName(sid)} to ${fmt(raw)}. Sync to see the conflict.` : `The school system changed ${studentName(sid)} to ${fmt(raw)}. Edit that student on the phone to see a conflict.`);
    },

    // Account
    install() { if (!installEvent) return; installEvent.prompt(); installEvent.userChoice.finally(() => { installEvent = null; render(); }); },
    hideInstall() { LOCAL.set('installHidden', true); render(); },
    applyUpdate() { swWaiting?.postMessage('activate-update'); },
    changePin() { showGate('setpin'); },
    lockNow: lock,
    forgetPin() { LOCAL.del('pin'); LOCAL.del('session'); showGate('signin'); },
    signOut() { const w = waiting().length; modal('Sign out of this phone?', `<p>${w ? `<b>${w} change${w > 1 ? 's have' : ' has'} not been sent yet</b> and will be lost. Connect and sync first if you can.` : 'Your PIN and your classes will be removed from this phone. Everything you entered is already on the school system.'}</p>${actions('Cancel', 'Sign out', 'confirmSignOut')}`); },
    confirmSignOut() { LOCAL.del('pin'); LOCAL.del('session'); LOCAL.del('device'); P = loadPhone(); ui.view = 'home'; showGate('signin'); },
    resetData() { modal('Reset sample data?', `<p>The school server's data and this phone's copy are both restored to the original sample data.</p>${actions('Cancel', 'Reset', 'confirmReset')}`); },
    confirmReset() { db = SchoolData.reset(); LOCAL.del('device'); P = loadPhone(); pull(); P.lastSync = new Date(serverNow()).toISOString(); savePhone(); closeModal(); ui.view = 'home'; ui.prev = 'home'; render(); toast('Sample data restored.'); }
  };

  // ---------- Events ----------
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-close]') || t === $('#modalLayer')) return closeModal();
    const b = t.closest('[data-pin],[data-page],[data-open],[data-jump],[data-mjump],[data-conduct],[data-phrase],[data-target],[data-key],[data-chip],[data-act]');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.pin) return pinPress(d.pin);
    if (d.page) { ui.view = d.page; ui.prev = d.page; ui.showList = false; render(); window.scrollTo(0, 0); return; }
    if (d.open) return openSheet(d.open);
    if (d.mjump !== undefined) { ui.mIdx = +d.mjump; ui.showList = false; $('.ta-entry')?.classList.remove('show-list'); const lb = $('.ta-list-btn'); if (lb) lb.textContent = 'List'; return masterRefresh(); }
    if (d.conduct) { haptic(); setRecord('conduct', d.conduct); return masterRefresh(); }
    if (d.phrase) { const ta = $('[data-remark]'), cur = ta.value.trim(), nx = (cur ? cur + ' ' : '') + d.phrase; if (nx.length > 200) return toast('The remark would be longer than 200 characters.'); setRecord('remark', nx); return masterRefresh(); }
    if (d.jump !== undefined) {
      ui.idx = +d.jump; ui.msg = null; ui.showList = false;
      if (ui.view !== 'entry') { ui.view = 'entry'; loadBuffer(); return render(); }
      loadBuffer(); $('.ta-entry')?.classList.remove('show-list'); const lb = $('.ta-list-btn'); if (lb) lb.textContent = 'List';
      return refreshEntry();
    }
    if (d.target) { const sh = sheet(), en = entry(sh, roster(sh)[ui.idx].id); ui.target = d.target; ui.buf = d.target === 'raw' ? (en.raw == null ? '' : fmt(en.raw)) : (en.adj ? signed(en.adj) : ''); return refreshEntry(); }
    if (d.key) return press(d.key);
    if (d.chip) return setStatus(d.chip);
    if (d.act && b.type !== 'checkbox') return ACT[d.act]?.(b);
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('input[type=checkbox][data-act]')) return ACT[t.dataset.act]?.(t);
    if (t.matches('[data-upload]') && t.files[0]) return uploadSection(t.files[0]);
    const ex = currentExam();
    if (t.matches('[data-counts]') && ex) { const s = ex.sections.find((x) => x.id === t.dataset.counts); s.counts = t.checked; if (!s.counts) s.weight = 0; hodSave(ex); render(); return; }
    if (t.matches('[data-opt]') && ex) { ex.options[t.dataset.opt] = t.checked; if (ex.status === 'compiled') ex.status = 'outdated'; hodSave(ex); refreshExamParts(); return; }
    if (t.matches('[data-ex-field]') && ex && ex.status === 'compiled') { ex.status = 'outdated'; refreshExamParts(); }
  });

  $('#backBtn').addEventListener('click', () => {
    const back = { review: 'entry', entry: ui.prev, master: ui.prev, section: ui.prev, exam: ui.prev }[ui.view] || 'home';
    ui.view = TOP.includes(back) || back === 'entry' ? back : 'home'; ui.showList = false;
    if (ui.view === 'entry') loadBuffer();
    render(); window.scrollTo(0, 0);
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'signinForm') return;
    e.preventDefault();
    LOCAL.set('session', true);
    showGate('setpin');
  });

  document.addEventListener('input', (e) => {
    const t = e.target, ex = currentExam();
    if (t.matches('[data-search]')) { ui.q = t.value; const list = $('#taList'); if (list) list.innerHTML = listRows(sheet()); }
    else if (t.matches('[data-remark]')) {
      setRecord('remark', t.value);
      const c = $('#remarkCount'); if (c) c.textContent = `${t.value.length}/200`;
      const mc = masterClass(), list = $('#taList');
      if (list) { const top = list.scrollTop; list.innerHTML = masterRows(masterRoster(mc.id), term(mc.id)); list.scrollTop = top; }
    }
    else if (t.matches('[data-weight]') && ex) {
      const s = ex.sections.find((x) => x.id === t.dataset.weight);
      s.weight = Math.max(0, Math.min(100, Math.round(Number(t.value) || 0)));
      hodSave(ex);
      const w = $('#weightsBlock'), p = $('#paperBlock'); if (w) w.innerHTML = weightsBlock(ex, false); if (p) { p.innerHTML = paperBlock(ex); loadPreview(); }
    }
    else if (t.matches('[data-ex-field]') && ex) {
      const f = t.dataset.exField; ex[f] = f === 'duration' ? Number(t.value) : t.value;
      hodSave(ex);
      const p = $('#paperBlock'); if (p) p.innerHTML = paperBlock(ex);
    }
    else if (t.matches('[data-reason]')) {
      const sh = sheet(), s = roster(sh)[ui.idx], en = { ...entry(sh, s.id), reason: t.value };
      loc(sh).entries[s.id] = strip(en);
      enqueueMark(sh, s.id, en);
    }
  });

  document.addEventListener('keydown', (e) => {
    lastActive = Date.now();
    if (!$('#gate').hidden && $('.ta-pinpad')) { if (/^\d$/.test(e.key)) pinPress(e.key); else if (e.key === 'Backspace') pinPress('⌫'); return; }
    if (e.key === 'Escape' && $('#modalLayer').classList.contains('open')) return closeModal();
    if (ui.view !== 'entry' || !$('#app').classList.contains('active') || $('#modalLayer').classList.contains('open')) return;
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
    if (/^\d$/.test(e.key) || e.key === '.') { e.preventDefault(); press(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); press('⌫'); }
    else if (e.key === 'Delete') { e.preventDefault(); press('C'); }
    else if (e.key === '-' || e.key === '+') { e.preventDefault(); press('±'); }
    else if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); prev(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  });
  ['pointerdown', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true }));
  setInterval(() => {
    if (!$('#app').classList.contains('active')) return;
    if (Date.now() - lastActive > LOCK_MINUTES * 60e3) return lock();
    if (online() && waiting().length) sync();
  }, 15000);
  window.addEventListener('online', () => { renderStatus(); sync(); });
  window.addEventListener('offline', () => renderStatus());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible' || !$('#app').classList.contains('active')) return; if (ui.view === 'entry') holdWake(); sync(); });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; if ($('#app').classList.contains('active') && ['home', 'account'].includes(ui.view)) render(); });
  window.addEventListener('appinstalled', () => { installEvent = null; toast('Installed. Open BCHS Teacher from your home screen.'); });
  SchoolData.onChange((fresh) => {
    db = fresh;
    const typing = document.activeElement?.matches?.('#view input, #view textarea, #view select');
    if ($('#app').classList.contains('active') && ui.view !== 'entry' && !typing && !busy && !$('#modalLayer').classList.contains('open')) render();
  });

  // ---------- Installable app ----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const watch = (w) => w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) { swWaiting = w; toast('An update is ready. Open Account to update.'); } });
      if (reg.waiting && navigator.serviceWorker.controller) swWaiting = reg.waiting;
      reg.addEventListener('updatefound', () => watch(reg.installing));
    }).catch(() => { /* offline support needs HTTPS */ });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded && swWaiting) { reloaded = true; location.reload(); } });
  }

  // ---------- Start ----------
  if (LOCAL.get('session', false) && LOCAL.get('pin', null)) showGate('pin');
  else showGate('signin');
})();
