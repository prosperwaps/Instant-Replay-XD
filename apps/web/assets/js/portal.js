/* BCHS Student Portal — the student's own workspace (Module 1).
   Sample data for one student until grading (Modules 2–3) and attendance (Module 4) are connected.
   Sign-in is not checked yet. Per the spec, students do not see fees or discipline records. */
(() => {
  const $ = (s, p = document) => p.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('bchs-portal-' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('bchs-portal-' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } }
  };
  const toast = (msg) => {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2800);
  };

  // ---------- Sample data ----------
  const ME = { first: 'Grace', name: 'Grace Nkemtabuh Fon', initials: 'GF', id: 'BCHS-2024-0142', cls: 'Form 5 A', track: 'Science', master: 'Mrs. Miriam Tita', dob: '14 March 2010', guardian: 'Nkemtabuh Fon (father)', house: 'Unity House', mode: 'Day student', year: '2026/2027', term: 'Term 1' };
  const TERM_START = '2026-09-08';

  // [subject, coefficient, teacher, sequence 1, sequence 2 (null = not published yet)]
  const SUBJECTS = [
    ['Mathematics', 5, 'Mrs. M. Tita', 15, 16.5], ['Physics', 4, 'Mr. A. Ngwa', 14, null], ['Chemistry', 4, 'Mr. L. Fuh', 16, 17],
    ['Biology', 4, 'Mrs. B. Ashu', 17, null], ['English Language', 3, 'Mr. P. Nji', 15.5, 16], ['French', 3, 'Mme C. Bih', 13, null],
    ['Further Mathematics', 3, 'Mrs. M. Tita', 12, 14], ['Computer Science', 2, 'Mr. E. Fonyuy', 18, null],
    ['Religious Studies', 2, 'Rev. S. Tanyi', 16, 17], ['Geography', 2, 'Mrs. J. Atem', 14, null]
  ];
  const HISTORY = [['S1', '25/26', 14.1], ['S2', '25/26', 14.6], ['S3', '25/26', 15.2], ['S4', '25/26', 15.0], ['S5', '25/26', 15.9], ['S6', '25/26', 16.3]];

  const PERIODS = [['07:30', '08:20'], ['08:20', '09:10'], ['09:10', '10:00'], ['10:20', '11:10'], ['11:10', '12:00'], ['12:40', '13:30'], ['13:30', '14:20']];
  const BREAKS = { 3: 'Short break · 10:00–10:20', 5: 'Lunch · 12:00–12:40' };
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const TT = [
    ['Mathematics', 'Physics', 'Physics', 'English Language', 'Biology', 'Chemistry', 'French'],
    ['Chemistry', 'Chemistry', 'Mathematics', 'Further Mathematics', 'Geography', 'Computer Science', 'Religious Studies'],
    ['Biology', 'Biology', 'English Language', 'Mathematics', 'Physics', 'French', 'Sports'],
    ['Further Mathematics', 'Mathematics', 'Chemistry', 'Physics', 'English Language', 'Biology', 'Library'],
    ['Mathematics', 'French', 'Computer Science', 'Biology', 'Geography', 'Assembly & clubs', 'Clubs']
  ];
  const ROOMS = { Mathematics: 'Room F5A', 'Further Mathematics': 'Room F5A', Physics: 'Physics lab', Chemistry: 'Chemistry lab', Biology: 'Biology lab', 'English Language': 'Room F5A', French: 'Room F5A', 'Computer Science': 'Computer lab', 'Religious Studies': 'Room F5A', Geography: 'Room F4B', Sports: 'Sports field', Library: 'Library', 'Assembly & clubs': 'Main hall', Clubs: 'Club rooms' };

  const EVENTS = [['2026-10-10', 'Open Day', 'Help welcome visiting families'], ['2026-10-19', 'Sequence 2 exams begin', 'Runs until 23 October'], ['2026-10-30', 'Inter-house debate', 'Main hall, 14:30'], ['2026-11-02', 'Half-term break', 'Classes resume 9 November'], ['2026-12-11', 'End of Term 1', 'Report cards released after the class council']];

  const NOTICES = [
    { id: 'n4', date: '2026-10-02', tag: 'Exams', title: 'Sequence 2 examination timetable published', body: 'Sequence 2 exams run from 19 to 23 October. Check your timetable on the noticeboard outside the staff room and bring your ID card to every paper.' },
    { id: 'n3', date: '2026-09-29', tag: 'Event', title: 'Volunteers needed for Open Day', body: 'Students who would like to guide visiting families on 10 October should give their names to their class master by Wednesday.' },
    { id: 'n2', date: '2026-09-15', tag: 'Library', title: 'New revision books in the library', body: 'GCE O-Level revision guides for Biology, Chemistry and Physics are now available for overnight loan.' },
    { id: 'n1', date: '2026-09-08', tag: 'Academic', title: 'Welcome back: Term 1 has begun', body: 'Classes start at 07:30. Arrivals after 07:30 are recorded as late by the gate scanner.' }
  ];

  const PAPERS = [
    ['Biology', 'GCE O-Level Biology, Paper 1', 'Form 5', 'National (GCE)', '2025'], ['Mathematics', 'Terminal exam, Mathematics', 'Form 5', 'Terminal', '2026'],
    ['Chemistry', 'Sequence 1, Chemistry', 'Form 5', 'Sequence', '2026'], ['Physics', 'Regional mock, Physics', 'Form 5', 'Mock', '2025'],
    ['English Language', 'GCE O-Level English, Paper 2', 'Form 5', 'National (GCE)', '2024'], ['Mathematics', 'GCE O-Level Mathematics, Paper 1', 'Form 5', 'National (GCE)', '2025'],
    ['French', 'Terminal exam, French', 'Form 4', 'Terminal', '2025'], ['Geography', 'Sequence 3, Geography', 'Form 4', 'Sequence', '2025'],
    ['Further Mathematics', 'Regional mock, Further Mathematics', 'Form 5', 'Mock', '2026'], ['Computer Science', 'GCE O-Level Computer Science', 'Form 5', 'National (GCE)', '2025']
  ].map(([subject, title, cls, type, year], i) => ({ id: 'p' + i, subject, title, cls, type, year }));
  // Papers published from the Teacher App's exam workspace once the exam has taken place (shared school data).
  try {
    if (typeof SchoolData !== 'undefined') SchoolData.load().archive.forEach((a) => PAPERS.unshift({ id: a.id, subject: a.subject, title: a.title, cls: a.level, type: a.type, year: a.year }));
  } catch { /* shared data unavailable: show the built-in list only */ }

  const RESOURCES = [
    ['Mathematics', 'Notes', 'Quadratic equations: summary and worked examples', 'Mrs. M. Tita', '2026-10-01', '6 pages'],
    ['Biology', 'Video', 'Photosynthesis explained (lesson recording)', 'Mrs. B. Ashu', '2026-09-30', '14 min'],
    ['Chemistry', 'Worksheet', 'Mole calculations practice set', 'Mr. L. Fuh', '2026-09-28', '20 questions'],
    ['Physics', 'Notes', 'Forces and motion: key formulas', 'Mr. A. Ngwa', '2026-09-24', '4 pages'],
    ['English Language', 'Worksheet', 'Summary writing practice', 'Mr. P. Nji', '2026-09-22', '3 passages'],
    ['French', 'Video', 'Le passé composé (lesson recording)', 'Mme C. Bih', '2026-09-18', '11 min'],
    ['Mathematics', 'Worksheet', 'Sequence 2 revision questions', 'Mrs. M. Tita', '2026-10-03', '25 questions'],
    ['Computer Science', 'Notes', 'Algorithms and flowcharts', 'Mr. E. Fonyuy', '2026-09-16', '8 pages']
  ].map(([subject, type, title, teacher, date, detail], i) => ({ id: 'r' + i, subject, type, title, teacher, date, detail }));

  const REPORTS = [
    { term: '2025/2026 · Term 3', date: '2026-07-10', avg: 16.3, rank: '4th of 52', conduct: 'Very good', remark: 'A focused and dependable student. Keep up the steady work in the sciences.', code: 'RC-25T3-0142-7Q' },
    { term: '2025/2026 · Term 2', date: '2026-04-02', avg: 15.45, rank: '6th of 52', conduct: 'Very good', remark: 'Clear progress this term. French needs more regular practice.', code: 'RC-25T2-0142-K4' },
    { term: '2025/2026 · Term 1', date: '2025-12-12', avg: 14.35, rank: '9th of 53', conduct: 'Good', remark: 'A good start. Aim to participate more in class discussions.', code: 'RC-25T1-0142-M2' }
  ];

  // ---------- Helpers ----------
  const now = new Date();
  const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const fmt = (s, o = { day: 'numeric', month: 'short', year: 'numeric' }) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', o);
  const minutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const n2 = (v) => (v == null ? '—' : (Math.round(v * 100) / 100).toFixed(2));
  const subjectAvg = (s) => { const marks = [s[3], s[4]].filter((m) => m != null); return marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : null; };
  const termAverage = () => { let sum = 0, coef = 0; SUBJECTS.forEach((s) => { const a = subjectAvg(s); if (a != null) { sum += a * s[1]; coef += s[1]; } }); return coef ? sum / coef : null; };
  const target = () => +store.get('target', 18);
  const readSet = () => new Set(store.get('read', []));
  const unread = () => NOTICES.filter((n) => !readSet().has(n.id)).length;
  const weekOfTerm = () => Math.max(1, Math.floor((new Date(todayISO()) - new Date(TERM_START)) / (7 * 864e5)) + 1);

  function attendance(dayISO) {
    const d = new Date(dayISO + 'T00:00:00'), wd = d.getDay();
    if (wd === 0 || wd === 6 || dayISO < TERM_START || dayISO > todayISO()) return null;
    const special = { '2026-09-15': ['late', '07:46'], '2026-09-23': ['absent', 'Sick (excused)'], '2026-10-01': ['late', '07:39'] };
    if (special[dayISO]) return { status: special[dayISO][0], time: special[dayISO][1] };
    return { status: 'present', time: '07:' + String(10 + ((d.getDate() * 7) % 18)).padStart(2, '0') };
  }
  function termAttendance() {
    const out = { present: 0, late: 0, absent: 0, days: [] };
    for (let d = new Date(TERM_START + 'T00:00:00'); iso(d) <= todayISO(); d.setDate(d.getDate() + 1)) {
      const r = attendance(iso(d)); if (!r) continue;
      out[r.status]++; out.days.push({ date: iso(d), ...r });
    }
    out.total = out.present + out.late + out.absent;
    out.rate = out.total ? Math.round(((out.present + out.late) / out.total) * 100) : 100;
    return out;
  }

  /* Which day's timetable to show: today on weekdays, otherwise the next Monday. */
  function schoolDay() {
    const wd = now.getDay();
    if (wd >= 1 && wd <= 5) return { index: wd - 1, isToday: true };
    return { index: 0, isToday: false };
  }
  function periodState(i, isToday) {
    if (!isToday) return '';
    const t = now.getHours() * 60 + now.getMinutes(), [a, b] = PERIODS[i].map(minutes);
    return t >= b ? 'done' : t >= a ? 'now' : '';
  }

  // ---------- Views ----------
  const TABS = [['today', 'Today'], ['grades', 'Grades'], ['attendance', 'Attendance'], ['timetable', 'Timetable'], ['reports', 'Report cards'], ['papers', 'Past papers'], ['hub', 'Learning hub'], ['notices', 'Notices']];
  const ui = { month: null, paper: { q: '', subject: '', type: '', cls: '' }, hub: '', noticeFilter: 'all', open: '' };

  const card = (title, body, action = '', cls = '') => `<section class="sp-card ${cls}"><div class="sp-card-head"><h2>${title}</h2>${action}</div>${body}</section>`;
  const stat = (label, value, sub = '', green = false) => `<div class="sp-stat${green ? ' g' : ''}"><span class="sp-label">${label}</span><b>${value}</b><small>${sub}</small></div>`;

  function greeting() { const h = now.getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

  function classesList(dayIndex, isToday) {
    let nextMarked = false;
    return `<div class="sp-list">${PERIODS.map((p, i) => {
      const subj = TT[dayIndex][i], state = periodState(i, isToday);
      let tag = '';
      if (state === 'now') tag = '<span class="sp-tag k">Now</span>';
      else if (state === 'done') tag = '<span class="sp-tag">Done</span>';
      else if (isToday && !nextMarked) { tag = '<span class="sp-tag g">Next</span>'; nextMarked = true; }
      return `${BREAKS[i] ? `<div class="sp-break">${BREAKS[i]}</div>` : ''}<div class="sp-row ${state}"><time>${p[0]}–${p[1]}</time><div><b>${esc(subj)}</b><small>${esc(ROOMS[subj] || '')}</small></div>${tag}</div>`;
    }).join('')}</div>`;
  }

  const VIEWS = {
    today() {
      const avg = termAverage(), tgt = target(), att = termAttendance(), day = schoolDay(), t = todayISO();
      const todayScan = attendance(t);
      const upcoming = EVENTS.filter((e) => e[0] >= t).slice(0, 4);
      const read = readSet();
      return `<div class="sp-grid">
        ${card(day.isToday ? "Today's classes" : `No classes today · ${DAYS[day.index]}'s classes`, classesList(day.index, day.isToday), '<button class="sp-link" data-go="timetable">Full timetable</button>', 'span-2')}
        <div>
          ${card('Term average', `<div class="sp-card-body"><div class="sp-big">${n2(avg)}<small> / 20</small></div>${bar(avg, tgt)}<p class="sp-note">${avg >= tgt ? 'You are at or above your target.' : `${n2(tgt - avg)} below your target of ${tgt}.`}</p></div>`, '<button class="sp-link" data-go="grades">Details</button>')}
          ${card('Attendance', `<div class="sp-card-body"><div class="sp-big">${att.rate}<small>%</small></div><p class="sp-note">${todayScan ? (todayScan.status === 'absent' ? 'Recorded absent today.' : `Checked in today at <b>${todayScan.time}</b>${todayScan.status === 'late' ? ' (late)' : ''}.`) : 'No school today.'} ${att.late} late arrival${att.late === 1 ? '' : 's'} this term.</p></div>`, '<button class="sp-link" data-go="attendance">History</button>', '')}
        </div>
      </div>
      <div class="sp-grid">
        ${card('Coming up', upcoming.length ? `<div class="sp-list">${upcoming.map((e) => `<div class="sp-row"><time>${fmt(e[0], { day: 'numeric', month: 'short' })}</time><div><b>${esc(e[1])}</b><small>${esc(e[2])}</small></div></div>`).join('')}</div>` : '<p class="sp-empty">Nothing scheduled yet.</p>')}
        ${card('Latest notices', `<div class="sp-list">${NOTICES.slice(0, 3).map((n) => `<button class="sp-notice ${read.has(n.id) ? '' : 'unread'}" data-act="openNotice" data-id="${n.id}"><time>${fmt(n.date, { day: 'numeric', month: 'short' })}</time><div><span class="sp-tag">${esc(n.tag)}</span><h3>${esc(n.title)}${read.has(n.id) ? '' : '<span class="sp-new">New</span>'}</h3></div></button>`).join('')}</div>`, '<button class="sp-link" data-go="notices">All notices</button>')}
        ${card('Keep revising', `<div class="sp-list">${RESOURCES.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).map(resourceRow).join('')}</div>`, '<button class="sp-link" data-go="hub">Learning hub</button>')}
      </div>`;
    },

    grades() {
      const avg = termAverage(), tgt = target(), ranked = SUBJECTS.map((s) => [s[0], subjectAvg(s)]).filter((x) => x[1] != null).sort((a, b) => b[1] - a[1]);
      const totalCoef = SUBJECTS.reduce((a, s) => a + s[1], 0);
      const rows = SUBJECTS.map((s) => { const a = subjectAvg(s); return `<tr><td class="${a != null && a < 10 ? 'below' : ''}"><b>${esc(s[0])}</b><small>${esc(s[2])}</small></td><td class="num">${s[1]}</td><td class="num">${n2(s[3])}</td><td class="num">${s[4] == null ? '<span class="sp-tag">Pending</span>' : n2(s[4])}</td><td class="num"><b>${n2(a)}</b></td><td class="num">${a == null ? '—' : n2(a * s[1])}</td></tr>`; }).join('');
      return `<div class="sp-stats">${stat('Term average', n2(avg), 'out of 20', true)}${stat('My target', tgt.toFixed(1), avg >= tgt ? 'Reached' : n2(tgt - avg) + ' to go')}${stat('Strongest', esc(ranked[0][0]), n2(ranked[0][1]))}${stat('Needs attention', esc(ranked[ranked.length - 1][0]), n2(ranked[ranked.length - 1][1]))}</div>
        <div class="sp-grid">
          ${card('Average over time', `<div class="sp-card-body">${chart([...HISTORY, ['S1', '26/27', avg]], tgt)}</div>`, `<form class="sp-target-form" id="targetForm"><label class="sp-field"><span>Target</span><input name="target" type="number" min="10" max="20" step="0.5" value="${tgt}"></label><button class="sp-btn sm" type="submit">Save</button></form>`, 'span-all')}
        </div>
        ${card('Term 1 marks', `<div class="sp-table-wrap"><table class="sp-table"><thead><tr><th>Subject</th><th class="num">Coef</th><th class="num">Seq 1</th><th class="num">Seq 2</th><th class="num">Average</th><th class="num">Points</th></tr></thead><tbody>${rows}<tr class="total"><td>Term average</td><td class="num">${totalCoef}</td><td></td><td></td><td class="num">${n2(avg)}</td><td class="num">/ 20</td></tr></tbody></table></div>`, '<span class="sp-tag">Seq 2 marks appear as teachers publish them</span>')}
        <p class="sp-note">Your average uses subject coefficients: the sum of (average × coefficient) divided by the sum of the coefficients of subjects with marks. Ranks are shown only on official report cards.</p>`;
    },

    attendance() {
      const att = termAttendance(), t = todayISO();
      if (!ui.month) ui.month = t.slice(0, 7);
      const [y, m] = ui.month.split('-').map(Number), first = new Date(y, m - 1, 1), last = new Date(y, m, 0);
      const cells = [];
      const fd = first.getDay(), lead = fd >= 1 && fd <= 5 ? fd - 1 : 0; // weekday columns only, Monday = 0
      for (let i = 0; i < lead; i++) cells.push('<div class="sp-day off"></div>');
      for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
        const wd = d.getDay(); if (wd === 0 || wd === 6) continue;
        const di = iso(d), r = attendance(di), future = di > t, before = di < TERM_START;
        const cls = r ? r.status : future ? 'future' : before ? 'off' : '';
        cells.push(`<div class="sp-day ${cls}${di === t ? ' today' : ''}"><b>${d.getDate()}</b><span>${r ? (r.status === 'absent' ? 'Absent' : r.time) : ''}</span></div>`);
      }
      const minMonth = TERM_START.slice(0, 7), maxMonth = t.slice(0, 7);
      const label = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      return `<div class="sp-stats">${stat('Attendance', att.rate + '%', 'this term', true)}${stat('On time', att.present, 'days')}${stat('Late', att.late, 'arrivals after 07:30')}${stat('Absent', att.absent, att.absent ? 'see below' : 'none')}</div>
        <div class="sp-grid">
          ${card('Calendar', `<div class="sp-card-body"><div class="sp-cal">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => `<div class="sp-cal-h">${d}</div>`).join('')}${cells.join('')}</div><div class="sp-legend"><span><i class="present"></i>On time</span><span><i class="late"></i>Late</span><span><i class="absent"></i>Absent</span><span><i class="future"></i>Coming up</span></div></div>`,
            `<div class="sp-month"><button class="sp-btn ghost sm" data-act="month" data-id="-1" ${ui.month <= minMonth ? 'disabled' : ''} aria-label="Previous month">&larr;</button><b>${label}</b><button class="sp-btn ghost sm" data-act="month" data-id="1" ${ui.month >= maxMonth ? 'disabled' : ''} aria-label="Next month">&rarr;</button></div>`, 'span-2')}
          ${card('Recent check-ins', `<div class="sp-list">${att.days.slice(-8).reverse().map((d) => `<div class="sp-row"><time>${fmt(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</time><div><b>${d.status === 'absent' ? 'Absent' : d.time}</b><small>${d.status === 'absent' ? d.time : 'Main gate scan'}</small></div>${d.status === 'late' ? '<span class="sp-tag k">Late</span>' : d.status === 'absent' ? '<span class="sp-tag">Absent</span>' : ''}</div>`).join('')}</div>`)}
        </div>
        <p class="sp-note">Times come from the gate scanner. If something looks wrong, speak to your class master: only staff can correct attendance.</p>`;
    },

    timetable() {
      const day = schoolDay(), heads = DAYS.map((d, i) => `<div class="h${day.isToday && i === day.index ? ' today' : ''}">${d}</div>`).join('');
      let grid = `<div class="h">Time</div>${heads}`;
      PERIODS.forEach((p, i) => {
        if (BREAKS[i]) grid += `<div class="brk">${BREAKS[i]}</div>`;
        grid += `<div class="t">${p[0]}<br>${p[1]}</div>` + DAYS.map((_, d) => {
          const subj = TT[d][i], isToday = day.isToday && d === day.index, state = isToday ? periodState(i, true) : '';
          return `<div class="c${isToday ? ' today' : ''}${state === 'now' ? ' now' : ''}"><b>${esc(subj)}</b><small>${esc(ROOMS[subj] || '')}</small></div>`;
        }).join('');
      });
      return `${card(`${ME.cls} · weekly timetable`, `<div class="sp-table-wrap"><div class="sp-tt">${grid}</div></div>`, `<span class="sp-tag g">${day.isToday ? 'Today highlighted' : 'Week view'}</span>`)}
        <p class="sp-note">The timetable is set by the school office. Room changes are announced in Notices.</p>`;
    },

    reports() {
      return `<div class="sp-grid two">
        ${card(`${ME.year} · ${ME.term}`, '<div class="sp-card-body"><span class="sp-tag">Not released yet</span><p class="sp-note">Report cards are released by the Principal after the class council at the end of term. You will see it here as soon as it is released.</p></div>')}
        ${REPORTS.map((r) => card(r.term, `<div class="sp-card-body"><div class="sp-report-meta"><div><span class="sp-label">Average</span><b>${n2(r.avg)}</b></div><div><span class="sp-label">Position</span><b>${r.rank}</b></div><div><span class="sp-label">Conduct</span><b>${r.conduct}</b></div></div><p class="sp-remark">${esc(r.remark)}</p><div class="sp-actions"><button class="sp-btn sm" data-act="download" data-id="${r.code}">Download PDF</button><button class="sp-btn ghost sm" data-act="verify" data-id="${r.code}">Verification code</button></div></div>`, `<span class="sp-tag g">Released ${fmt(r.date, { day: 'numeric', month: 'short' })}</span>`)).join('')}
      </div>`;
    },

    papers() {
      const f = ui.paper, subjects = [...new Set(PAPERS.map((p) => p.subject))].sort(), types = ['Sequence', 'Terminal', 'Mock', 'National (GCE)'], classes = [...new Set(PAPERS.map((p) => p.cls))];
      const done = new Set(store.get('downloads', []));
      const list = PAPERS.filter((p) => (!f.subject || p.subject === f.subject) && (!f.type || p.type === f.type) && (!f.cls || p.cls === f.cls) && (p.title + p.subject).toLowerCase().includes(f.q.toLowerCase()));
      const opt = (key, items, all) => `<select data-filter="${key}"><option value="">${all}</option>${items.map((v) => `<option ${f[key] === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
      const typeClass = { Sequence: 't-sequence', Terminal: 't-terminal', Mock: 't-mock', 'National (GCE)': 't-gce' };
      const abbr = (s) => s.split(' ').map((w) => w.slice(0, w.length > 4 ? 3 : w.length)).join(' ').slice(0, 7).toUpperCase();
      return `<div class="sp-filters"><label class="sp-field"><span>Search</span><input type="search" data-filter="q" value="${esc(f.q)}" placeholder="Subject or paper"></label><label class="sp-field"><span>Subject</span>${opt('subject', subjects, 'All subjects')}</label><label class="sp-field"><span>Type</span>${opt('type', types, 'All types')}</label><label class="sp-field"><span>Class</span>${opt('cls', classes, 'All classes')}</label><button class="sp-btn ghost" data-act="clearPapers">Clear</button></div>
        ${list.length ? `<div class="sp-papers">${list.map((p) => `<article class="sp-paper"><div class="sp-paper-top ${typeClass[p.type]}"><b>${abbr(p.subject)}</b><span>${esc(p.type)}</span></div><div class="sp-paper-body"><h3>${esc(p.title)}</h3><p>${esc(p.cls)} · ${esc(p.year)}</p><div class="sp-actions"><button class="sp-btn sm" data-act="paper" data-id="${p.id}">Download</button>${done.has(p.id) ? '<span class="sp-tag g">Saved</span>' : ''}</div></div></article>`).join('')}</div>` : card('No papers found', '<p class="sp-empty">No past papers match these filters. Try clearing one.</p>')}
        <p class="sp-note">Papers are watermarked with your student number. Papers for exams that have not happened yet are never shown.</p>`;
    },

    hub() {
      const subjects = [...new Set(RESOURCES.map((r) => r.subject))].sort();
      const list = RESOURCES.filter((r) => !ui.hub || r.subject === ui.hub).sort((a, b) => b.date.localeCompare(a.date));
      return `<div class="sp-chips"><button class="sp-chip ${ui.hub ? '' : 'on'}" data-act="hub" data-id="">All subjects</button>${subjects.map((s) => `<button class="sp-chip ${ui.hub === s ? 'on' : ''}" data-act="hub" data-id="${esc(s)}">${esc(s)}</button>`).join('')}</div>
        ${card(ui.hub || 'All materials', `<div class="sp-list">${list.map(resourceRow).join('')}</div>`, `<span class="sp-tag">${list.length} item${list.length === 1 ? '' : 's'}</span>`)}
        <p class="sp-note">Materials are shared by your teachers. Videos are small, low-data recordings.</p>`;
    },

    notices() {
      const read = readSet(), list = NOTICES.filter((n) => ui.noticeFilter === 'all' || !read.has(n.id));
      return `<div class="sp-chips"><button class="sp-chip ${ui.noticeFilter === 'all' ? 'on' : ''}" data-act="noticeFilter" data-id="all">All</button><button class="sp-chip ${ui.noticeFilter === 'unread' ? 'on' : ''}" data-act="noticeFilter" data-id="unread">Unread (${unread()})</button>${unread() ? '<button class="sp-chip" data-act="readAll">Mark all as read</button>' : ''}</div>
        ${card('School notices', list.length ? `<div class="sp-list">${list.map((n) => `<button class="sp-notice ${read.has(n.id) ? '' : 'unread'}" data-act="openNotice" data-id="${n.id}" aria-expanded="${ui.open === n.id}"><time>${fmt(n.date)}</time><div><span class="sp-tag">${esc(n.tag)}</span><h3>${esc(n.title)}${read.has(n.id) ? '' : '<span class="sp-new">New</span>'}</h3>${ui.open === n.id ? `<p>${esc(n.body)}</p>` : ''}</div></button>`).join('')}</div>` : '<p class="sp-empty">You have read every notice.</p>')}`;
    },

    profile() {
      return `<div class="sp-grid">
        ${card('My details', `<div class="sp-card-body"><dl class="sp-dl"><dt>Name</dt><dd>${ME.name}</dd><dt>Student no.</dt><dd>${ME.id}</dd><dt>Class</dt><dd>${ME.cls} · ${ME.track}</dd><dt>Class master</dt><dd>${ME.master}</dd><dt>Date of birth</dt><dd>${ME.dob}</dd><dt>House</dt><dd>${ME.house}</dd><dt>Attendance</dt><dd>${ME.mode}</dd><dt>Parent / guardian</dt><dd>${ME.guardian}</dd></dl><p class="sp-note">Details are kept by the school office. If anything is wrong, tell your class master.</p></div>`, '', 'span-2')}
        <div>
          ${card('My target average', `<div class="sp-card-body"><form class="sp-target-form" id="targetForm"><label class="sp-field"><span>Target / 20</span><input name="target" type="number" min="10" max="20" step="0.5" value="${target()}"></label><button class="sp-btn sm" type="submit">Save</button></form><p class="sp-note">Your target is shown on your grades chart. Only you can see it.</p></div>`)}
          ${card('Change password', `<div class="sp-card-body"><form id="pwForm"><label class="sp-field"><span>Current password</span><input name="current" type="password" autocomplete="current-password" required></label><label class="sp-field"><span>New password</span><input name="next" type="password" minlength="8" autocomplete="new-password" required></label><label class="sp-field"><span>Repeat new password</span><input name="again" type="password" minlength="8" autocomplete="new-password" required></label><button class="sp-btn block" type="submit">Update password</button></form></div>`)}
        </div>
      </div>`;
    }
  };

  function resourceRow(r) {
    const cls = r.type.toLowerCase();
    return `<div class="sp-res"><span class="sp-res-ico ${cls}">${r.type === 'Video' ? 'VID' : r.type === 'Notes' ? 'DOC' : 'EX'}</span><div><b>${esc(r.title)}</b><small>${esc(r.subject)} · ${esc(r.teacher)} · ${esc(r.detail)}</small></div><button class="sp-btn ghost sm" data-act="resource" data-id="${r.id}">Open</button></div>`;
  }

  function bar(value, tgt) {
    const pct = (v) => Math.max(0, Math.min(100, ((v - 10) / 10) * 100));
    return `<div class="sp-bar" role="img" aria-label="Average ${n2(value)} against target ${tgt}"><i style="width:${pct(value)}%"></i><b style="left:calc(${pct(tgt)}% - 2px)"></b></div><div class="sp-bar-legend"><span>10</span><span>Target ${tgt}</span><span>20</span></div>`;
  }

  /* Line chart in the portal palette: black line, green target, square markers. */
  function chart(points, tgt) {
    const W = 680, H = 240, L = 44, R = 16, T = 16, B = 40, y = (v) => T + ((20 - v) / 10) * (H - T - B), x = (i) => L + (i * (W - L - R)) / (points.length - 1);
    const grid = [10, 12, 14, 16, 18, 20].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#000" stroke-width="1"/><text x="${L - 10}" y="${y(v) + 4}" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="12">${v}</text>`).join('');
    const line = points.map((p, i) => `${x(i)},${y(p[2])}`).join(' ');
    const marks = points.map((p, i) => { const last = i === points.length - 1; return `<rect x="${x(i) - 7}" y="${y(p[2]) - 7}" width="14" height="14" fill="${last ? '#3dba3d' : '#000'}" stroke="#000" stroke-width="3"/><text x="${x(i)}" y="${H - 20}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700">${p[0]}</text><text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="11">${p[1]}</text>`; }).join('');
    return `<svg class="sp-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Average by sequence, latest ${n2(points[points.length - 1][2])}, target ${tgt}">${grid}<line x1="${L}" x2="${W - R}" y1="${y(tgt)}" y2="${y(tgt)}" stroke="#3dba3d" stroke-width="6"/><text x="${W - R}" y="${y(tgt) - 8}" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700">Target ${tgt}</text><polyline points="${line}" fill="none" stroke="#000" stroke-width="4"/>${marks}</svg>`;
  }

  // ---------- Page header text ----------
  function band(view) {
    const date = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    const B = {
      today: [`${ME.term} · Week ${weekOfTerm()}`, `${greeting()}, ${ME.first}`, `${ME.cls} · ${ME.track} · ${date}`],
      grades: [`${ME.year} · ${ME.term}`, 'My grades', 'Marks appear here as soon as your teachers publish them.'],
      attendance: [`${ME.year} · ${ME.term}`, 'Attendance', 'Your arrival times from the school gate.'],
      timetable: [ME.cls, 'Timetable', 'Your weekly lessons and rooms.'],
      reports: [ME.name, 'Report cards', 'Official end-of-term report cards released by the Principal.'],
      papers: ['Revision', 'Past papers', 'Sequence, terminal, mock and GCE papers chosen by your teachers.'],
      hub: ['Revision', 'Learning hub', 'Notes, worksheets and lesson recordings from your teachers.'],
      notices: ['School', 'Notices', 'Announcements from the school administration.'],
      profile: [ME.id, 'My profile', 'Your details, target and password.']
    }[view];
    $('#bandKicker').textContent = B[0]; $('#bandTitle').textContent = B[1]; $('#bandSub').textContent = B[2];
  }

  // ---------- Router ----------
  let view = 'today';
  function render(keepFocus) {
    const focused = keepFocus && document.activeElement?.dataset?.filter;
    band(view);
    const u = unread();
    $('#spTabs').innerHTML = TABS.map(([k, label]) => `<button class="sp-tab ${k === view ? 'active' : ''}" data-go="${k}" ${k === view ? 'aria-current="page"' : ''}>${label}${k === 'notices' && u ? ` <span class="sp-count">${u}</span>` : ''}</button>`).join('');
    const bell = $('#bellCount'); bell.hidden = !u; bell.textContent = u;
    $('#spMain').innerHTML = VIEWS[view]();
    document.title = (TABS.find((t) => t[0] === view)?.[1] || 'My profile') + ' | BCHS Student Portal';
    if (focused) { const el = document.querySelector(`[data-filter="${focused}"]`); if (el) { el.focus(); if (el.setSelectionRange && el.type === 'search') el.setSelectionRange(el.value.length, el.value.length); } }
  }
  function go(v) { if (VIEWS[v]) { view = v; render(); window.scrollTo(0, 0); } }
  window.addEventListener('hashchange', () => { if (store.get('session', false)) go(location.hash.slice(1) || 'today'); });

  // ---------- Actions ----------
  const ACTIONS = {
    month(dir) {
      const [y, m] = ui.month.split('-').map(Number), d = new Date(y, m - 1 + +dir, 1);
      ui.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; render();
    },
    openNotice(nid) {
      const read = readSet(); read.add(nid); store.set('read', [...read]);
      if (view !== 'notices') { ui.open = nid; location.hash = 'notices'; return; }
      ui.open = ui.open === nid ? '' : nid; render();
    },
    noticeFilter(f) { ui.noticeFilter = f; render(); },
    readAll() { store.set('read', NOTICES.map((n) => n.id)); render(); toast('All notices marked as read.'); },
    hub(s) { ui.hub = s; render(); },
    clearPapers() { ui.paper = { q: '', subject: '', type: '', cls: '' }; render(); },
    paper(pid) { const d = new Set(store.get('downloads', [])); d.add(pid); store.set('downloads', [...d]); render(); toast('Downloads start once the portal is connected. Papers are watermarked with your student number.'); },
    resource() { toast('Materials open once the portal is connected to the school system.'); },
    download() { toast('The official PDF downloads once report cards are connected.'); },
    verify(code) { toast(`Verification code ${code}. Anyone can check it on the school website.`); }
  };

  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); location.hash = g.dataset.go; if (g.dataset.go === view) go(view); return; }
    const a = e.target.closest('[data-act]');
    if (a && !a.disabled) ACTIONS[a.dataset.act]?.(a.dataset.id);
  });
  document.addEventListener('input', (e) => { const k = e.target.dataset.filter; if (k) { ui.paper[k] = e.target.value; render(true); } });
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'targetForm') {
      e.preventDefault();
      const v = Math.min(20, Math.max(10, +new FormData(e.target).get('target') || 18));
      store.set('target', v); render(); toast(`Target set to ${v} / 20.`);
    } else if (e.target.id === 'pwForm') {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      if (f.next !== f.again) return toast('The new passwords do not match.');
      if (f.next === f.current) return toast('Choose a password different from your current one.');
      e.target.reset(); toast('Password updated (preview: not saved yet).');
    }
  });

  // ---------- Sign in / out ----------
  function enter() {
    $('#loginGate').hidden = true;
    $('#portalApp').classList.add('active');
    $('#avatarBtn').textContent = ME.initials;
    go(location.hash.slice(1) && VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'today');
  }
  $('#loginForm').addEventListener('submit', (e) => { e.preventDefault(); store.set('session', true); enter(); toast(`Welcome back, ${ME.first}.`); });
  $('#logoutBtn').addEventListener('click', () => {
    store.set('session', false);
    $('#portalApp').classList.remove('active');
    $('#loginGate').hidden = false;
    $('#loginForm').reset();
    history.replaceState(null, '', location.pathname);
  });
  if (store.get('session', false)) enter();
})();
