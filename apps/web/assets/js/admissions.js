/* Admissions application — four steps inside one section of the page.
   Text answers are kept as a draft on this device until submission (files cannot be kept).
   Submission is simulated: replace the timeout in submit() with a call to the admissions API. */
(() => {
  const form = document.getElementById('appForm');
  if (!form) return;

  const DRAFT_KEY = 'bchs-admission-draft';
  const MAX_FILE = 5 * 1024 * 1024;
  const steps = [...form.querySelectorAll('.form-step')];
  const markers = [...document.querySelectorAll('#appSteps [data-dot]')];
  const total = steps.length;
  const $ = (id) => document.getElementById(id);
  const toast = (msg) => (window.showToast ? window.showToast(msg) : null);
  let current = 1;

  // ---------- Draft (this device only) ----------
  const readDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || null; } catch { return null; } };
  const writeDraft = (data) => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); return true; } catch { return false; } };
  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ } };

  const draft = readDraft();
  const ref = draft?.ref || 'AP-' + Math.random().toString(36).slice(2, 7).toUpperCase();
  $('sessionId').textContent = ref;

  function saveDraft() {
    const fields = {};
    [...form.elements].forEach((el) => {
      if (!el.name || el.type === 'file' || el.type === 'checkbox') return;
      if (el.type === 'radio') { if (el.checked) fields[el.name] = el.value; return; }
      fields[el.name] = el.value;
    });
    const ok = writeDraft({ ref, step: current, fields, saved: Date.now() });
    $('draftStatus').textContent = ok
      ? 'Draft saved on this device at ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + '. Documents must be attached again if you leave.'
      : 'This browser cannot save drafts. Please finish in one sitting.';
  }

  function restoreDraft() {
    if (!draft?.fields) return;
    Object.entries(draft.fields).forEach(([name, value]) => {
      const el = form.elements[name];
      if (!el) return;
      if (el instanceof RadioNodeList) { [...el].forEach((r) => { r.checked = r.value === value; }); } else { el.value = value; }
    });
    $('draftStatus').textContent = 'Draft restored from this device. Please attach documents again in step 3.';
  }

  // ---------- Steps ----------
  function showStep(n, scroll = true) {
    current = n;
    steps.forEach((s) => s.classList.toggle('active', +s.dataset.step === n));
    markers.forEach((m) => {
      const i = +m.dataset.dot;
      m.classList.toggle('on', i === n);
      m.classList.toggle('done', i < n);
      m.querySelector('.n').textContent = i < n ? '✓' : i;
      if (i === n) m.setAttribute('aria-current', 'step'); else m.removeAttribute('aria-current');
    });
    $('progressFill').style.width = (n / total) * 100 + '%';
    $('stepCount').textContent = 'Step ' + n + ' of ' + total;
    if (n === total) buildReview();
    if (scroll) $('app').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function fileProblem(input) {
    const f = input.files && input.files[0];
    if (!f) return input.required ? 'missing' : '';
    const ext = f.name.split('.').pop().toLowerCase();
    const allowed = input.accept.split(',').map((a) => a.trim().replace('.', ''));
    if (!allowed.includes(ext)) return 'type';
    if (f.size > MAX_FILE) return 'size';
    return '';
  }

  function validateStep(stepEl) {
    let first = null;
    stepEl.querySelectorAll('input, select, textarea').forEach((el) => {
      const bad = el.type === 'file' ? !!fileProblem(el) : !el.checkValidity();
      el.classList.toggle('is-invalid', bad);
      el.closest('.upload-box')?.classList.toggle('is-invalid', bad);
      if (bad && !first) first = el;
    });
    if (first) {
      if (first.type === 'file') toast('Please attach the required documents (PDF, JPG or PNG, up to 5 MB).');
      else { first.reportValidity(); first.focus(); toast('Please complete the highlighted fields.'); }
      return false;
    }
    return true;
  }

  form.addEventListener('click', (e) => {
    if (e.target.closest('[data-next]')) {
      const stepEl = steps[current - 1];
      if (validateStep(stepEl)) { showStep(Math.min(total, current + 1)); saveDraft(); }
    } else if (e.target.closest('[data-back]')) {
      showStep(Math.max(1, current - 1));
    } else if (e.target.closest('[data-goto]')) {
      showStep(+e.target.closest('[data-goto]').dataset.goto);
    }
  });

  form.addEventListener('input', (e) => { if (e.target.type !== 'file') { e.target.classList.remove('is-invalid'); saveDraft(); } });
  form.addEventListener('change', (e) => { if (e.target.type === 'radio' || e.target.tagName === 'SELECT') saveDraft(); });

  $('clearDraft').addEventListener('click', () => {
    if (!confirm('Clear this application and start again?')) return;
    clearDraft();
    window.location.hash = 'apply';
    window.location.reload();
  });

  // ---------- Uploads ----------
  form.querySelectorAll('.upload-box input[type=file]').forEach((input) => {
    const box = input.closest('.upload-box');
    const nameEl = box.querySelector('.upload-name');
    const metaEl = box.querySelector('.upload-meta');
    const original = [nameEl.textContent, metaEl.textContent];
    input.addEventListener('change', () => {
      const problem = fileProblem(input);
      const f = input.files[0];
      box.classList.remove('is-invalid');
      if (!f) { box.classList.remove('has-file'); [nameEl.textContent, metaEl.textContent] = original; return; }
      if (problem) {
        toast(problem === 'size' ? 'That file is larger than 5 MB.' : 'Please use a PDF, JPG or PNG file.');
        input.value = '';
        box.classList.remove('has-file');
        [nameEl.textContent, metaEl.textContent] = original;
        return;
      }
      box.classList.add('has-file');
      nameEl.textContent = f.name;
      metaEl.textContent = 'Attached · ' + Math.max(1, Math.round(f.size / 1024)) + ' KB';
      box.querySelector('.upload-ico').textContent = '✓';
    });
  });

  // ---------- Review ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const value = (name) => {
    const el = form.elements[name];
    if (!el) return '';
    if (el instanceof RadioNodeList) return [...el].find((r) => r.checked)?.value || '';
    if (el.type === 'date' && el.value) return new Date(el.value).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    return el.value;
  };
  const groups = [
    { title: 'Student', step: 1, fields: [['fullName', 'Legal name'], ['dob', 'Date of birth'], ['pob', 'Place of birth'], ['gender', 'Gender'], ['nationality', 'Nationality'], ['classFor', 'Class applying for'], ['stayType', 'Day / boarding']] },
    { title: 'Academic background', step: 2, fields: [['prevSchool', 'Previous school'], ['lastClass', 'Last class completed'], ['track', 'Preferred track'], ['support', 'Learning support']] },
    { title: 'Parent / guardian', step: 3, fields: [['gName', 'Name'], ['gRelation', 'Relationship'], ['gPhone', 'Phone'], ['gEmail', 'Email'], ['gAddress', 'Home address']] }
  ];
  const docs = [['docBirth', 'Birth certificate'], ['docReport', 'Last report card'], ['docPhoto', 'Passport photograph'], ['docTransfer', 'Transfer certificate']];

  function block(title, step, rows) {
    return '<div class="review-block"><div class="review-head"><h4>' + title + '</h4><button type="button" data-goto="' + step + '">Edit</button></div><dl class="review-grid">' +
      rows.map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + esc(v || '—') + '</dd></div>').join('') + '</dl></div>';
  }

  function buildReview() {
    $('reviewOutput').innerHTML =
      groups.map((g) => block(g.title, g.step, g.fields.map(([n, label]) => [label, value(n)]))).join('') +
      block('Documents', 3, docs.map(([n, label]) => {
        const f = form.elements[n]?.files?.[0];
        return [label, f ? '✓ ' + f.name : 'Not attached'];
      }));
  }

  // ---------- Submit ----------
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateStep(steps[total - 1])) return;
    const btn = $('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Submitting…';
    setTimeout(() => {
      const number = 'BCHS-' + new Date().getFullYear() + '-' + Math.floor(10000 + Math.random() * 89999);
      $('refNumber').textContent = number;
      $('refPhone').textContent = value('gPhone') || 'your phone';
      form.style.display = 'none';
      $('successPanel').classList.add('active');
      markers.forEach((m) => { m.classList.remove('on'); m.classList.add('done'); m.querySelector('.n').textContent = '✓'; });
      $('progressFill').style.width = '100%';
      $('stepCount').textContent = 'Submitted';
      $('draftStatus').textContent = 'Application submitted. The draft on this device has been cleared.';
      clearDraft();
      toast('Application submitted.');
      $('app').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 700);
  });

  $('printBtn').addEventListener('click', () => window.print());

  restoreDraft();
  showStep(Math.min(draft?.step || 1, total - 1) || 1, false);
})();
