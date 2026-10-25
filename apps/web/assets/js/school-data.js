/* Shared school data for the staff prototypes.
   The Teacher App (Module 3) writes mark sheets here and the School Office (Module 2)
   reads them, so work handed between modules is visible. Everything lives in this
   browser under one key; in production this is the backend (Module 0).
   Sample data is generated deterministically so every browser starts identical. */
const SchoolData = (() => {
  const KEY = 'bchs-school-v1';
  const VERSION = 3; // v3: exams are combined from teachers' PDF sections (HOD weights); v2 added class records and the archive

  const FIRST_F = ['Grace', 'Precious', 'Blessing', 'Mercy', 'Comfort', 'Brenda', 'Faith', 'Joy', 'Sandrine', 'Linda', 'Vanessa', 'Pamela', 'Gladys', 'Doris', 'Esther', 'Ruth', 'Glory', 'Peace', 'Rita', 'Ivy', 'Nadine', 'Clarisse', 'Belinda', 'Stella', 'Prudence'];
  const FIRST_M = ['Divine', 'Prosper', 'Emmanuel', 'Elvis', 'Brandon', 'Valery', 'Clinton', 'Rodrigue', 'Collins', 'Bryan', 'Ivan', 'Lionel', 'Nelson', 'Derick', 'Ferdinand', 'Godlove', 'Wilfred', 'Achille', 'Kenneth', 'Raoul', 'Bertrand', 'Cyril', 'Hilary', 'Joel', 'Terence'];
  const LAST = ['Fon', 'Ndifor', 'Achu', 'Tanyi', 'Ngwa', 'Nji', 'Fuh', 'Ashu', 'Bih', 'Atem', 'Fonyuy', 'Wirba', 'Nkwain', 'Tamfu', 'Che', 'Ngu', 'Awah', 'Mbah', 'Nchang', 'Kum', 'Ambe', 'Neba', 'Fru', 'Akum', 'Tabe', 'Nfor', 'Lukong', 'Mofor', 'Ngong', 'Tangwa', 'Shu', 'Fomba', 'Ndze', 'Yuh', 'Sama', 'Muma', 'Asong', 'Ayuk', 'Enow', 'Tebid'];

  /* Small seeded random generator (mulberry32) so sample data is stable. */
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const pick = (r, list) => list[Math.floor(r() * list.length)];

  function makeStudents(cls, count, seed, fixed = []) {
    const r = rng(seed), used = new Set(fixed.map((f) => f.name)), list = [...fixed];
    while (list.length < count) {
      const female = r() < 0.5, first = pick(r, female ? FIRST_F : FIRST_M), middle = pick(r, LAST), last = pick(r, LAST);
      const name = middle !== last && r() < 0.45 ? `${first} ${middle} ${last}` : `${first} ${last}`;
      if (used.has(name)) continue;
      used.add(name);
      list.push({ name, gender: female ? 'F' : 'M' });
    }
    // Class numbers follow alphabetical order of surname, then first name (as on paper class lists).
    const surname = (n) => n.split(' ').slice(-1)[0];
    list.sort((a, b) => surname(a.name).localeCompare(surname(b.name)) || a.name.localeCompare(b.name));
    return list.map((s, i) => ({ id: `${cls}-${String(i + 1).padStart(2, '0')}`, cls, no: i + 1, name: s.name, gender: s.gender }));
  }

  function marks(students, max, seed, howMany = students.length) {
    const r = rng(seed), out = {};
    students.slice(0, howMany).forEach((s) => {
      const roll = r();
      if (roll < 0.03) { out[s.id] = { raw: null, status: 'ABS', adj: 0, reason: '' }; return; }
      if (roll < 0.045) { out[s.id] = { raw: null, status: 'EXC', adj: 0, reason: '' }; return; }
      const base = max * (0.35 + r() * 0.6);
      out[s.id] = { raw: Math.min(max, Math.round(base * 2) / 2), status: null, adj: 0, reason: '' };
    });
    return out;
  }

  /* Term attendance per student, as the gate scanner (Module 4) would report it. */
  function attendanceSummary(students, seedN) {
    const r = rng(seedN), out = {};
    students.forEach((s) => {
      const absent = r() < 0.7 ? 0 : Math.ceil(r() * 4), unexcused = absent ? Math.floor(r() * (absent + 1)) : 0, late = r() < 0.6 ? Math.floor(r() * 3) : Math.ceil(r() * 6);
      out[s.id] = { days: 20, present: 20 - absent, late, excused: absent - unexcused, unexcused };
    });
    return out;
  }

  function seed() {
    const hours = (h) => new Date(Date.now() - h * 3600e3).toISOString();
    const f5a = makeStudents('f5a', 60, 5, [{ name: 'Grace Nkemtabuh Fon', gender: 'F' }, { name: 'Ngwa Precious', gender: 'F' }]);
    const f4b = makeStudents('f4b', 45, 4);
    const l6s = makeStudents('l6s', 30, 6, [{ name: 'Prosper Wapali', gender: 'M' }]);
    return {
      version: VERSION,
      school: 'BCHS Nkwen',
      year: '2026/2027',
      term: 'Term 1',
      sequences: [
        { id: 'seq1', name: 'Sequence 1', opens: '2026-09-14', closes: '2026-09-30', status: 'Closed' },
        { id: 'seq2', name: 'Sequence 2', opens: '2026-10-05', closes: '2026-10-23', status: 'Open' }
      ],
      teachers: [
        { id: 't1', title: 'Mrs.', name: 'Miriam Tita', email: 'm.tita@bchs.edu.cm', roles: ['Teacher', 'Class Master (Form 5 A)', 'HOD Mathematics'], masterOf: 'f5a', hodOf: ['Mathematics', 'Further Mathematics'] },
        { id: 't2', title: 'Mr.', name: 'Elvis Fonyuy', email: 'e.fonyuy@bchs.edu.cm', roles: ['Teacher'] },
        { id: 't3', title: 'Mr.', name: 'Paul Nji', email: 'p.nji@bchs.edu.cm', roles: ['Teacher'] }
      ],
      classes: [
        { id: 'f5a', name: 'Form 5 A', master: 't1' },
        { id: 'f4b', name: 'Form 4 B', master: 't2' },
        { id: 'l6s', name: 'Lower Sixth Science', master: 't2' }
      ],
      students: [...f5a, ...f4b, ...l6s],
      sheets: [
        { id: 'sh1', cls: 'f5a', subject: 'Mathematics', teacher: 't1', seq: 'seq2', assessment: 'Sequence 2 · Section A', max: 30, due: '2026-10-21', status: 'in_progress', submittedAt: null, entries: marks(f5a, 30, 11, 23), history: [] },
        { id: 'sh6', cls: 'f5a', subject: 'Mathematics', teacher: 't2', seq: 'seq2', assessment: 'Sequence 2 · Section B', max: 20, due: '2026-10-21', status: 'in_progress', submittedAt: null, entries: marks(f5a, 20, 29, 40), history: [] },
        { id: 'sh7', cls: 'f5a', subject: 'Mathematics', teacher: 't3', seq: 'seq2', assessment: 'Sequence 2 · Section C', max: 20, due: '2026-10-21', status: 'not_started', submittedAt: null, entries: {}, history: [] },
        { id: 'sh2', cls: 'f5a', subject: 'Further Mathematics', teacher: 't1', seq: 'seq2', assessment: 'Sequence 2 · Paper 1', max: 20, due: '2026-10-22', status: 'not_started', submittedAt: null, entries: {}, history: [] },
        { id: 'sh5', cls: 'f5a', subject: 'Further Mathematics', teacher: 't2', seq: 'seq2', assessment: 'Sequence 2 · Paper 2', max: 20, due: '2026-10-22', status: 'in_progress', submittedAt: null, entries: marks(f5a, 20, 19, 31), history: [] },
        { id: 'sh3', cls: 'f4b', subject: 'Mathematics', teacher: 't1', seq: 'seq2', assessment: 'Sequence 2 · Written', max: 20, due: '2026-10-07', status: 'submitted', submittedAt: hours(6), entries: marks(f4b, 20, 13), history: [] },
        { id: 'sh4', cls: 'l6s', subject: 'Mathematics', teacher: 't1', seq: 'seq1', assessment: 'Sequence 1 test', max: 20, due: '2026-09-25', status: 'locked', submittedAt: '2026-09-24T10:12:00.000Z', entries: marks(l6s, 20, 17), history: [] }
      ],
      corrections: [],
      notifications: [],
      // Class master's end-of-term work: conduct + remark per student, attendance confirmation.
      classTerm: { f5a: { term: 'Term 1', status: 'draft', attendanceConfirmed: null, submittedAt: null, records: {} } },
      attendance: { f5a: attendanceSummary(f5a, 23) },
      /* Exam papers combined from sections that teachers write on their own computers and upload as PDF.
         The HOD sets each section's weight out of 100 and whether it counts on the report card.
         file.sample marks prototype PDFs that the Teacher App generates on first use. */
      exams: [
        {
          id: 'e1', subject: 'Mathematics', cls: 'f5a', seq: 'seq2', hod: 't1', title: 'Sequence 2 Test', examAt: '2026-10-19T08:00', duration: 120,
          instructions: 'Answer ALL questions in Sections A, B and C. Write your answers in the spaces provided. Calculators are allowed. Show all your working.',
          options: { cover: true, pageNumbers: true }, status: 'collecting', compiled: [],
          sections: [
            { id: 'A', title: 'Algebra', teacher: 't1', due: '2026-10-13', marks: 30, weight: 40, counts: true, sheetId: 'sh1', status: 'accepted', note: '', file: { id: 'smp-e1-A', name: 'Seq2_SectionA_Algebra.pdf', size: 0, pages: 2, pageSize: 'A4', uploadedAt: hours(30), sample: 'algebra' } },
            { id: 'B', title: 'Geometry and Trigonometry', teacher: 't2', due: '2026-10-13', marks: 20, weight: 30, counts: true, sheetId: 'sh6', status: 'uploaded', note: '', file: { id: 'smp-e1-B', name: 'GEOMETRY section B FINAL v3.pdf', size: 0, pages: 1, pageSize: 'Letter', uploadedAt: hours(5), sample: 'geometry' } },
            { id: 'C', title: 'Statistics', teacher: 't3', due: '2026-10-13', marks: 20, weight: 30, counts: true, sheetId: 'sh7', status: 'awaiting', note: '', file: null }
          ]
        },
        {
          id: 'e2', subject: 'Further Mathematics', cls: 'f5a', seq: 'seq2', hod: 't1', title: 'Sequence 2 Test', examAt: '2026-10-20T10:30', duration: 150,
          instructions: 'Answer all questions in Paper 1 and any THREE questions in Paper 2.',
          options: { cover: true, pageNumbers: true }, status: 'collecting', compiled: [],
          sections: [
            { id: 'P1', title: 'Paper 1 · Pure', teacher: 't1', due: '2026-10-14', marks: 20, weight: 50, counts: true, sheetId: 'sh2', status: 'awaiting', note: '', file: null },
            { id: 'P2', title: 'Paper 2 · Mechanics', teacher: 't2', due: '2026-10-14', marks: 20, weight: 50, counts: true, sheetId: 'sh5', status: 'uploaded', note: '', file: { id: 'smp-e2-P2', name: 'FM_P2_mechanics.pdf', size: 0, pages: 2, pageSize: 'A4', uploadedAt: hours(20), sample: 'mechanics' } }
          ]
        },
        {
          id: 'e3', subject: 'Mathematics', cls: 'f4b', seq: 'seq2', hod: 't1', title: 'Sequence 2 Test', examAt: '2026-10-16T08:00', duration: 90,
          instructions: 'Answer all questions. The oral quiz is done in class and does not count on the report card.',
          options: { cover: true, pageNumbers: false }, status: 'collecting', compiled: [],
          sections: [
            { id: 'A', title: 'Written paper', teacher: 't1', due: '2026-10-09', marks: 20, weight: 100, counts: true, sheetId: 'sh3', status: 'accepted', note: '', file: { id: 'smp-e3-A', name: 'F4 written.pdf', size: 0, pages: 1, pageSize: 'A4', uploadedAt: hours(70), sample: 'written' } },
            { id: 'B', title: 'Oral quiz record sheet', teacher: 't1', due: '2026-10-09', marks: 10, weight: 0, counts: false, sheetId: null, status: 'accepted', note: '', file: { id: 'smp-e3-B', name: 'oral_quiz_sheet.pdf', size: 0, pages: 1, pageSize: 'A4', uploadedAt: hours(70), sample: 'oral' } }
          ]
        }
      ],
      // Papers published to the Student Portal's past-paper library after the exam has taken place.
      archive: []
    };
  }

  /* ---------- Gate attendance (Module 4) ----------
     Every student has an ID card whose QR holds an opaque, signed token: a card reference
     (no name, no class), the card version and a signature. Reissuing a card raises the version,
     so the old card is refused at the gate. In production the signature is made on the server
     with a private key; this prototype uses a keyed hash so it works without a backend. */
  const SECRET = 'bchs-prototype-card-key';
  /* cyrb53: small, well-spread string hash (public domain). */
  function hash(str, seedN = 0) {
    let h1 = 0xdeadbeef ^ seedN, h2 = 0x41c6ce57 ^ seedN;
    for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }
  const REF_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const cardRef = (sid) => { const r = rng(hash(sid)); return Array.from({ length: 8 }, () => REF_CHARS[Math.floor(r() * REF_CHARS.length)]).join(''); };
  const sign = (ref, v) => hash(`${SECRET}|${ref}|${v}`).toString(36).toUpperCase().slice(0, 8);
  /* Token printed as the QR on the back of the card. */
  function cardToken(sid) {
    const c = load().gate.cards[sid];
    return c ? `BCHS1:${c.ref}:${c.v}:${sign(c.ref, c.v)}` : '';
  }
  /* Check a scanned token: returns { ok, sid, v, reason }. Works offline against a stored card list. */
  function verifyToken(token, cards = load().gate.cards) {
    const m = /^BCHS1:([A-Z2-9]{8}):(\d+):([A-Z0-9]+)$/.exec(String(token).trim());
    if (!m) return { ok: false, reason: 'notours' };
    const [, ref, vs, sig] = m, v = Number(vs);
    if (sign(ref, v) !== sig) return { ok: false, reason: 'forged' };
    const sid = Object.keys(cards).find((k) => cards[k].ref === ref);
    if (!sid) return { ok: false, reason: 'unknown' };
    if (cards[sid].v !== v) return { ok: false, sid, v, reason: v < cards[sid].v ? 'revoked' : 'unknown' };
    return { ok: true, sid, v };
  }

  /* Geometric avatar standing in for a photo until the school captures real ones.
     Pure #000 / #fff / #3dba3d, all three in every avatar, solid shapes only, unique per student. */
  function avatar(sid) {
    const r = rng(hash(`avatar|${sid}`)), C = ['#000', '#fff', '#3dba3d'];
    for (let i = C.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [C[i], C[j]] = [C[j], C[i]]; }
    const [bg, a, b] = C, q = Math.floor(r() * 4), rot = `rotate(${q * 90} 24 24)`;
    const big = [
      `<path d="M0 48A48 48 0 0 1 48 0V48Z" fill="${a}" transform="${rot}"/>`,
      `<path d="M0 30A24 24 0 0 1 48 30Z" fill="${a}" transform="${rot}"/>`,
      `<circle cx="24" cy="24" r="17" fill="${a}"/>`,
      `<rect x="0" y="0" width="30" height="48" fill="${a}" transform="${rot}"/>`,
      `<path d="M0 0H48L0 48Z" fill="${a}" transform="${rot}"/>`
    ][Math.floor(r() * 5)];
    const p = [[12, 12], [36, 12], [12, 36], [36, 36], [24, 24]][Math.floor(r() * 5)];
    const small = [
      `<circle cx="${p[0]}" cy="${p[1]}" r="7" fill="${b}"/>`,
      `<rect x="${p[0] - 6}" y="${p[1] - 6}" width="12" height="12" fill="${b}"/>`,
      `<rect x="${p[0] - 10}" y="${p[1] - 3}" width="20" height="6" fill="${b}"/>`
    ][Math.floor(r() * 3)];
    return `<svg class="geo-avatar" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><rect width="48" height="48" fill="${bg}"/>${big}${small}</svg>`;
  }

  function gateSeed(students) {
    const cards = {};
    students.forEach((s) => { cards[s.id] = { ref: cardRef(s.id), v: 1, issued: '2026-09-07', history: [] }; });
    // Two cards already reissued this term (lost / damaged): their version-1 cards are refused at the gate.
    ['f5a-14', 'f4b-07'].forEach((sid) => { if (cards[sid]) { cards[sid].v = 2; cards[sid].issued = '2026-09-28'; cards[sid].history.push({ v: 1, reason: sid === 'f5a-14' ? 'Lost' : 'Damaged', at: '2026-09-28' }); } });
    return {
      config: { dayStart: '06:30', lateAfter: '07:30', absentAfter: '09:00', notify: true, gateName: 'Main gate' },
      staff: [{ id: 'dm1', title: 'Mr.', name: 'Wilfred Ngu', email: 'w.ngu@bchs.edu.cm', roles: ['Discipline Master'] }],
      duty: ['dm1', 't1', 't2', 't3'], // staff allowed to run the gate app
      cards,
      days: {},   // date → { sid: earliest arrival } (what reports and parents see)
      events: [], // every scan received, including duplicates from other phones (audit)
      alerts: [], // parent notifications waiting for the Parent App (Module 5)
      demo: null  // prototype clock: { base, startedAt } puts the gate at a morning time
    };
  }

  let cache = null;
  function load() {
    if (cache) return cache;
    try { cache = JSON.parse(localStorage.getItem(KEY)); } catch { cache = null; }
    if (!cache || cache.version !== VERSION) { cache = seed(); save(); }
    // Gate data was added after v3; add it without wiping Teacher App work.
    if (!cache.gate) { cache.gate = gateSeed(cache.students); save(); }
    return cache;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(cache)); return true; } catch { return false; }
  }
  function reset() { cache = seed(); cache.gate = gateSeed(cache.students); save(); return cache; }
  /* Gate data only (cards, arrivals, alerts); marks and exams are left alone. */
  function resetGate() { load(); cache.gate = gateSeed(cache.students); save(); return cache; }
  /* Pick up changes made by another module open in a different tab. */
  function onChange(fn) {
    window.addEventListener('storage', (e) => { if (e.key === KEY) { cache = null; fn(load()); } });
  }

  return { KEY, load, save, reset, resetGate, onChange, cardToken, verifyToken, avatar };
})();
