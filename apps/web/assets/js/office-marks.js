/* School office — Mark sheets and Corrections (Module 2, connected to the Teacher App).
   Reads the shared school data (assets/js/school-data.js) that teachers' phones sync into,
   so the office sees only what the school system accepted. Approving a correction changes
   the mark on the school system; the teacher's phone picks it up at its next sync.
   Uses the office's global modal(), close(), toast() and esc() helpers.
   Buttons use data-om attributes so they never trigger office.js handlers. */
const OfficeMarks = (() => {
  const EDIT_MS = 24 * 3600e3;
  const ui = { mode: 'sheets', seq: '', cls: 'all', status: 'all', open: null, cstatus: 'Pending' };
  let root = null;

  // ---------- Helpers ----------
  const D = () => SchoolData.load();
  const now = () => Date.now() + (D().demoOffset || 0);
  const iso = (t) => new Date(t).toISOString();
  const className = (id) => D().classes.find((c) => c.id === id)?.name || '—';
  const teacherName = (id) => { const t = D().teachers.find((x) => x.id === id); return t ? `${t.title} ${t.name}` : '—'; };
  const student = (sid) => D().students.find((s) => s.id === sid);
  const roster = (cls) => D().students.filter((s) => s.cls === cls).sort((a, b) => a.no - b.no);
  const isDone = (e) => !!(e && (e.status || e.raw != null));
  const round2 = (v) => Math.round(v * 100) / 100;
  const fmt = (v) => (v == null ? '—' : String(round2(v)));
  const signed = (v) => (v > 0 ? '+' : '') + fmt(v);
  const totalOf = (e) => (e && e.raw != null ? round2(e.raw + (e.adj || 0)) : null);
  const when = (t) => (t ? new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const day = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const today = () => new Date(now()).toISOString().slice(0, 10);
  const officeUser = () => document.getElementById('userName')?.textContent || 'School office';
  const progress = (sh) => { const r = roster(sh.cls); return { done: r.filter((s) => isDone(sh.entries[s.id])).length, total: r.length }; };

  function state(sh) {
    if (sh.status === 'locked') return 'locked';
    if (sh.status === 'submitted') return now() >= new Date(sh.submittedAt).getTime() + EDIT_MS ? 'locked' : 'submitted';
    if (sh.due < today()) return 'overdue';
    return sh.status;
  }
  const STATE = {
    not_started: ['Not started', ''], in_progress: ['In progress', 'pending'], overdue: ['Overdue', 'rejected'],
    submitted: ['Submitted · editable', 'approved'], locked: ['Locked', 'approved']
  };
  const lastActivity = (sh) => {
    const times = [...Object.values(sh.entries).map((e) => e.at), ...sh.history.map((h) => h.at)].filter(Boolean).sort();
    return times[times.length - 1] || null;
  };
  const pendingCount = () => D().corrections.filter((c) => c.status === 'Pending').length;

  const metric = (label, value, sub = '') => `<article class="metric"><span>${label}</span><strong>${value}</strong><small>${sub}</small></article>`;
  const badge = (text, cls) => `<span class="badge ${cls}">${text}</span>`;
  const bar = (p) => `<span class="om-bar" title="${p.done} of ${p.total}"><i style="width:${p.total ? Math.round((p.done / p.total) * 100) : 0}%"></i></span>`;

  // ---------- Mark sheet monitor ----------
  function sheetsView() {
    const d = D(), seqs = d.sequences;
    if (!ui.seq) ui.seq = (seqs.find((s) => s.status === 'Open') || seqs[seqs.length - 1]).id;
    const all = d.sheets.filter((s) => s.seq === ui.seq), list = all.filter((s) => (ui.cls === 'all' || s.cls === ui.cls) && (ui.status === 'all' || state(s) === ui.status));
    const count = (st) => all.filter((s) => state(s) === st).length;
    const seq = seqs.find((s) => s.id === ui.seq);
    const opt = (k, v, label) => `<option value="${v}" ${ui[k] === v ? 'selected' : ''}>${label}</option>`;
    const rows = list.sort((a, b) => a.due.localeCompare(b.due)).map((sh) => {
      const st = state(sh), [label, cls] = STATE[st], p = progress(sh);
      const due = st === 'submitted' ? `<small>editable until ${when(new Date(sh.submittedAt).getTime() + EDIT_MS)}</small>` : st === 'locked' ? `<small>submitted ${when(sh.submittedAt)}</small>` : `<small>due ${day(sh.due)}</small>`;
      return `<tr><td><b>${esc(sh.subject)}</b><small>${esc(sh.assessment)} · out of ${sh.max}</small></td><td>${esc(className(sh.cls))}</td><td>${esc(teacherName(sh.teacher))}</td>
        <td><div class="om-prog">${bar(p)}<span>${p.done}/${p.total}</span></div></td><td>${badge(label, cls)}${due}</td><td>${when(lastActivity(sh))}</td>
        <td><div class="row-actions"><button class="mini-btn primary" data-om="open" data-id="${sh.id}">Open</button>${['not_started', 'in_progress', 'overdue'].includes(st) ? `<button class="mini-btn" data-om="remind" data-id="${sh.id}">Remind</button>` : ''}</div></td></tr>`;
    }).join('');
    return `<div class="dp">${lead(`Every mark sheet for the sequence, as received from teachers' phones. Marks still on a phone (no signal yet) appear after its next sync. Submitted sheets stay editable by the teacher for 24 hours, then lock.`, '<button class="mini-btn" data-om="remindAll">Remind all unfinished</button>')}
      <div class="metric-grid">${metric('Sheets', all.length, `${esc(seq.name)} · ${seq.status === 'Open' ? `closes ${day(seq.closes)}` : 'closed'}`)}${metric('Submitted or locked', count('submitted') + count('locked'), `of ${all.length}`)}${metric('In progress', count('in_progress'), 'teachers entering marks')}${metric('Overdue or not started', count('overdue') + count('not_started'), count('overdue') ? `${count('overdue')} past the due date` : 'none overdue')}</div>
      <div class="controlbar"><label class="filter-field">Sequence<select data-om-filter="seq">${seqs.map((s) => opt('seq', s.id, `${s.name} (${s.status})`)).join('')}</select></label>
        <label class="filter-field">Class<select data-om-filter="cls">${opt('cls', 'all', 'All classes')}${d.classes.map((c) => opt('cls', c.id, c.name)).join('')}</select></label>
        <label class="filter-field">Status<select data-om-filter="status">${opt('status', 'all', 'All statuses')}${Object.entries(STATE).map(([k, [l]]) => opt('status', k, l)).join('')}</select></label></div>
      ${box(`${esc(seq.name)} mark sheets`, `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Subject</th><th>Class</th><th>Teacher</th><th>Entered</th><th>Status</th><th>Last activity</th><th></th></tr></thead><tbody>${rows || '<tr><td class="no-data" colspan="7">No mark sheets match.</td></tr>'}</tbody></table></div>`, { flush: true, sub: `${list.length} of ${all.length} shown, earliest due first` })}</div>`;
  }

  // ---------- One sheet ----------
  function sheetDetail(id) {
    const d = D(), sh = d.sheets.find((s) => s.id === id);
    if (!sh) { ui.open = null; return sheetsView(); }
    const st = state(sh), [label, cls] = STATE[st], r = roster(sh.cls), p = progress(sh);
    const totals = r.map((s) => totalOf(sh.entries[s.id])).filter((v) => v != null), to20 = (v) => (v / sh.max) * 20;
    const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null;
    const codes = (c) => r.filter((s) => sh.entries[s.id]?.status === c).length;
    const corrected = new Set(sh.history.filter((h) => h.action === 'corrected').map((h) => h.sid));
    const pending = new Set(d.corrections.filter((c) => c.sheetId === sh.id && c.status === 'Pending').map((c) => c.sid));
    const rows = r.map((s) => {
      const e = sh.entries[s.id], t = totalOf(e), flags = [];
      if (e?.status) flags.push(badge(e.status, ''));
      if (t != null && to20(t) < 10) flags.push(badge('Below pass', 'rejected'));
      if (e?.adj) flags.push(badge('Adjusted', 'pending'));
      if (corrected.has(s.id)) flags.push(badge('Corrected', 'approved'));
      if (pending.has(s.id)) flags.push(badge('Correction pending', 'pending'));
      return `<tr><td>${s.no}</td><td><b>${esc(s.name)}</b></td><td>${e?.raw != null ? fmt(e.raw) : '—'}</td><td>${e?.adj ? `${signed(e.adj)}<small>${esc(e.reason || 'no reason given')}</small>` : '—'}</td><td><b>${e?.status || fmt(t)}</b></td><td>${t == null ? '—' : fmt(to20(t))}</td><td><div class="chip-row" style="margin:0">${flags.join('') || (isDone(e) ? '' : badge('Missing', 'pending'))}</div></td></tr>`;
    }).join('');
    const partner = sh.paper ? d.sheets.find((x) => x.paper && x.paper.group === sh.paper.group && x.id !== sh.id) : null;
    let paperPanel = '';
    if (partner) {
      const both = [sh, partner].every((x) => ['submitted', 'locked'].includes(state(x)));
      const combined = both ? r.map((s) => { const a = totalOf(sh.entries[s.id]), b = totalOf(partner.entries[s.id]); return a == null || b == null ? null : (to20(a) * sh.paper.weight + (b / partner.max) * 20 * partner.paper.weight) / 100; }).filter((v) => v != null) : [];
      paperPanel = box('Multi-paper subject', `<div class="om-papers">
        ${[sh, partner].map((x) => `<div><b>${esc(x.paper.label)} · ${x.paper.weight}%</b><small>${esc(teacherName(x.teacher))} · ${progress(x).done}/${progress(x).total} entered</small>${badge(STATE[state(x)][0], STATE[state(x)][1])}</div>`).join('')}
        <div><b>Combined ${esc(sh.subject)}</b><small>${both ? `Class average ${fmt(combined.reduce((a, b) => a + b, 0) / (combined.length || 1))} / 20` : 'Calculated automatically once both papers are submitted.'}</small>${badge(both ? 'Ready' : 'Waiting', both ? 'approved' : '')}</div></div>`);
    }
    const history = [...sh.history].reverse().map((h) => `<div class="om-hist"><b>${h.action === 'submitted' ? 'Submitted by the teacher' : h.action === 'corrected' ? `Correction approved: ${esc(student(h.sid)?.name || h.sid)} ${esc(h.from)} → ${esc(h.to)}` : h.action === 'locked' ? 'Locked early by the office' : h.action === 'reopened' ? 'Reopened for the teacher' : esc(h.action)}</b><small>${when(h.at)} · ${esc(D().teachers.some((t) => t.id === h.by) ? teacherName(h.by) : h.by)}${h.note ? ` · ${esc(h.note)}` : ''}</small></div>`).join('');
    return `<div class="dp"><div class="dp-lead"><button class="mini-btn" data-om="back">← All mark sheets</button><div class="dp-actions">${st === 'submitted' ? '<button class="mini-btn" data-om="lockNow">Lock now</button>' : ''}${st === 'locked' ? '<button class="mini-btn" data-om="reopen">Reopen for the teacher</button>' : ''}${['not_started', 'in_progress', 'overdue'].includes(st) ? '<button class="mini-btn" data-om="remind" data-id="' + sh.id + '">Remind teacher</button>' : ''}</div></div>
      <div class="metric-grid">${metric('Entered', `${p.done}/${p.total}`, p.done === p.total ? 'complete' : `${p.total - p.done} missing`)}${metric('Class average', avg == null ? '—' : `${fmt(to20(avg))} / 20`, avg == null ? '' : `${fmt(avg)} out of ${sh.max}`)}${metric('Highest · lowest', totals.length ? `${fmt(to20(Math.max(...totals)))} · ${fmt(to20(Math.min(...totals)))}` : '—', 'converted to /20')}${metric('Below pass · ABS · EXC · NT', `${totals.filter((v) => to20(v) < 10).length} · ${codes('ABS')} · ${codes('EXC')} · ${codes('NT')}`, 'pass mark 10 / 20')}</div>
      ${paperPanel}
      ${box(`${esc(sh.subject)} · ${esc(className(sh.cls))}`, `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>No.</th><th>Student</th><th>Mark</th><th>Adjustment</th><th>Total</th><th>/20</th><th>Flags</th></tr></thead><tbody>${rows}</tbody></table></div>`, { flush: true, sub: `${esc(sh.assessment)} · out of ${sh.max} · ${esc(teacherName(sh.teacher))}`, actions: badge(label, cls) })}
      ${box('History', history || '<p class="om-muted">No events yet.</p>', { sub: 'Submissions, locks, reopenings and approved corrections' })}</div>`;
  }

  // ---------- Corrections ----------
  function correctionsView() {
    const d = D(), all = d.corrections, list = all.filter((c) => ui.cstatus === 'all' || c.status === ui.cstatus).sort((a, b) => (a.status === 'Pending' ? 0 : 1) - (b.status === 'Pending' ? 0 : 1) || String(b.at).localeCompare(String(a.at)));
    const count = (s) => all.filter((c) => c.status === s).length;
    const rows = list.map((c) => {
      const sh = d.sheets.find((s) => s.id === c.sheetId), s = student(c.sid);
      return `<tr><td><b>${esc(s?.name || c.sid)}</b><small>No. ${s?.no ?? '—'} · ${esc(className(sh?.cls))}</small></td><td>${esc(sh?.subject || '—')}<small>${esc(sh?.assessment || '')} · out of ${sh?.max ?? '—'}</small></td>
        <td class="om-change"><s>${esc(c.from)}</s> → <b>${esc(c.to)}</b></td><td>${esc(c.reason)}</td><td>${esc(teacherName(c.by))}<small>${when(c.at)}</small></td>
        <td>${c.status === 'Pending' ? `<div class="row-actions"><button class="mini-btn primary" data-om="approve" data-id="${c.id}">Approve</button><button class="mini-btn danger" data-om="reject" data-id="${c.id}">Reject</button></div>` : `${badge(c.status, c.status === 'Approved' ? 'approved' : 'rejected')}<small>${esc(c.decidedBy || '')} · ${when(c.decidedAt)}${c.note ? `<br>${esc(c.note)}` : ''}</small>`}</td></tr>`;
    }).join('');
    const opt = (v, l) => `<option value="${v}" ${ui.cstatus === v ? 'selected' : ''}>${l}</option>`;
    return `<div class="dp">${lead(`Requests from teachers to change a mark after their sheet locked. Approving updates the mark on the school system and is recorded in the sheet's history; the teacher's phone receives it at its next sync. If a report card was already released, it must be reissued.`)}
      <div class="metric-grid">${metric('Waiting for a decision', count('Pending'), 'oldest first')}${metric('Approved', count('Approved'), 'applied to mark sheets')}${metric('Rejected', count('Rejected'), 'teacher informed')}${metric('All requests', all.length, 'this year')}</div>
      <div class="controlbar"><label class="filter-field">Show<select data-om-filter="cstatus">${opt('Pending', 'Waiting for a decision')}${opt('Approved', 'Approved')}${opt('Rejected', 'Rejected')}${opt('all', 'All requests')}</select></label></div>
      ${box('Correction requests', `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Student</th><th>Mark sheet</th><th>Change</th><th>Teacher's reason</th><th>Requested by</th><th>Decision</th></tr></thead><tbody>${rows || `<tr><td class="no-data" colspan="6">${ui.cstatus === 'Pending' ? 'No requests are waiting. Teachers send them from the Teacher App when a locked mark needs changing.' : 'No requests match.'}</td></tr>`}</tbody></table></div>`, { flush: true, sub: `${list.length} shown` })}</div>`;
  }

  // ---------- Actions ----------
  function decide(id, approve, note) {
    const d = D(), c = d.corrections.find((x) => x.id === id);
    if (!c || c.status !== 'Pending') return toast('This request was already decided.');
    const at = iso(now()), by = officeUser();
    if (approve) {
      const sh = d.sheets.find((s) => s.id === c.sheetId), cur = sh.entries[c.sid] || {};
      const code = ['ABS', 'EXC', 'NT'].includes(c.to);
      sh.entries[c.sid] = { raw: code ? null : parseFloat(c.to), status: code ? c.to : null, adj: 0, reason: '', v: (cur.v || (isDone(cur) ? 1 : 0)) + 1, at, by: 'office', correction: c.id };
      sh.history.push({ at, by, action: 'corrected', sid: c.sid, from: c.from, to: c.to, correction: c.id, note });
    }
    Object.assign(c, { status: approve ? 'Approved' : 'Rejected', decidedBy: by, decidedAt: at, note });
    SchoolData.save();
    refresh();
    toast(approve ? `Approved. ${student(c.sid)?.name || 'The mark'} is now ${c.to}; the teacher's phone updates at its next sync.` : 'Rejected. The teacher sees the decision and your reason.');
  }

  const ACT = {
    open(b) { ui.open = b.dataset.id; refresh(); window.scrollTo(0, 0); },
    back() { ui.open = null; refresh(); },
    remind(b) { const sh = D().sheets.find((s) => s.id === (b.dataset.id || ui.open)); toast(`Reminder sent to ${teacherName(sh.teacher)} for ${sh.subject} · ${className(sh.cls)} (push and in-app).`); },
    remindAll() {
      const n = D().sheets.filter((s) => s.seq === ui.seq && ['not_started', 'in_progress', 'overdue'].includes(state(s)));
      toast(n.length ? `Reminders sent for ${n.length} unfinished sheet${n.length > 1 ? 's' : ''}.` : 'Every sheet is already submitted.');
    },
    lockNow() {
      modal('Lock this sheet now?', '<p class="modal-note">The teacher can no longer edit it from their phone. Changes after this need a correction request.</p><label class="form-label">Reason<input name="note" required placeholder="e.g. Class council meets tomorrow"></label>', (x) => {
        const d = D(), sh = d.sheets.find((s) => s.id === ui.open);
        sh.status = 'locked'; sh.history.push({ at: iso(now()), by: officeUser(), action: 'locked', note: x.note });
        SchoolData.save(); refresh(); toast('Sheet locked.');
      }, 'Lock sheet');
    },
    reopen() {
      modal('Reopen for the teacher?', '<p class="modal-note">The teacher gets a new 24-hour edit window from now. Use this instead of many separate corrections when a whole sheet needs fixing.</p><label class="form-label">Reason<input name="note" required placeholder="e.g. Wrong paper total was used"></label>', (x) => {
        const d = D(), sh = d.sheets.find((s) => s.id === ui.open);
        sh.status = 'submitted'; sh.submittedAt = iso(now()); sh.history.push({ at: iso(now()), by: officeUser(), action: 'reopened', note: x.note });
        SchoolData.save(); refresh(); toast('Reopened for 24 hours.');
      }, 'Reopen');
    },
    approve(b) {
      const c = D().corrections.find((x) => x.id === b.dataset.id), s = student(c.sid);
      modal('Approve correction?', `<p class="modal-note"><b>${esc(s?.name || '')}</b>: ${esc(c.from)} → <b>${esc(c.to)}</b><br>Reason: ${esc(c.reason)}</p><label class="form-label">Note for the record (optional)<input name="note" placeholder="e.g. Checked against the script"></label>`, (x) => decide(c.id, true, x.note), 'Approve');
    },
    reject(b) {
      const c = D().corrections.find((x) => x.id === b.dataset.id);
      modal('Reject correction?', `<p class="modal-note">${esc(c.from)} → ${esc(c.to)} · ${esc(c.reason)}</p><label class="form-label">Reason (the teacher sees this)<input name="note" required placeholder="e.g. Please bring the marked script to the office"></label>`, (x) => decide(c.id, false, x.note), 'Reject');
    }
  };

  // ---------- Mount ----------
  function refresh() {
    if (!root?.isConnected) return;
    root.innerHTML = ui.mode === 'corrections' ? correctionsView() : ui.open ? sheetDetail(ui.open) : sheetsView();
    const n = pendingCount();
    document.querySelectorAll('#appNav [data-page="corrections"] .count').forEach((c) => c.remove());
    if (n) document.querySelector('#appNav [data-page="corrections"]')?.insertAdjacentHTML('beforeend', `<span class="count">${n}</span>`);
  }

  function mount(el, mode) {
    root = el;
    if (ui.mode !== mode) ui.open = null;
    ui.mode = mode;
    root.addEventListener('click', (e) => { const b = e.target.closest('[data-om]'); if (b && !b.disabled) ACT[b.dataset.om]?.(b); });
    root.addEventListener('change', (e) => { const k = e.target.dataset.omFilter; if (k) { ui[k] = e.target.value; refresh(); } });
    refresh();
  }

  // A teacher's phone synced in another tab: show the new data straight away.
  SchoolData.onChange(() => refresh());

  return { mount, pendingCount };
})();
