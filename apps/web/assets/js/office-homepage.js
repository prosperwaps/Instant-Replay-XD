/* Homepage editor — School office › Communication › Homepage editor.
   Staff edit a DRAFT of the homepage content that changes often, see it rendered with the
   real site stylesheets (desktop or mobile, draft or live), then review every change and
   publish or schedule it. Earlier versions can be loaded back as a draft to roll back.
   Demo only: "publishing" updates the stored live copy in this browser. Wiring the public
   homepage to this content comes with the backend (Module 0). */
const HomepageEditor = (() => {
  const KEY = 'bchs-homepage-v1';
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const id = () => Math.random().toString(36).slice(2, 8);
  const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Content model (what the school changes often) ----------
  const DEFAULT = {
    announcement: { on: true, text: 'Admissions for the 2026/2027 academic year are open.', linkLabel: 'Apply online', link: 'admissions.html' },
    hero: {
      eyebrow: 'Baptist Comprehensive High School · Nkwen', title: 'Where character meets', highlight: 'academic excellence.',
      sub: 'A Cameroon Baptist Convention secondary and high school in Bamenda, preparing students for the GCE and for life through rigorous teaching, discipline and Christian values.',
      primaryLabel: 'Apply for 2026/2027', primaryLink: 'admissions.html#apply', secondaryLabel: 'Explore Academics', secondaryLink: '#academics',
      points: 'Form 1 to Upper Sixth\nGCE O & A Level\nDay and boarding', image: '',
      noticeOn: true, noticeLabel: 'Upcoming', noticeTitle: 'Open Day · 10 Oct 2026', noticeText: 'Tour the campus and meet our teachers', noticeLink: '#events'
    },
    facts: [
      { id: 'f1', label: 'Founded', value: '1978' }, { id: 'f2', label: 'Students', value: '1,200+' },
      { id: 'f3', label: 'Teachers', value: '85+' }, { id: 'f4', label: 'GCE pass rate', value: '98%' }
    ],
    principal: {
      quote: 'Every learner who passes through our gates leaves better equipped for life — in mind, character, and faith.',
      p1: 'At Baptist Comprehensive High School Nkwen, we believe education is more than passing examinations. It is the shaping of character, the sharpening of minds, and the nurturing of faith that will carry our students through every season of life.',
      p2: 'Our dedicated staff work daily to build a community where academic rigour, Christian values, and genuine care for every student walk hand in hand. I invite you to visit our campus and see for yourself the excellence we strive for every day.',
      name: 'The Principal', image: ''
    },
    news: [
      { id: 'n1', featured: true, date: '2026-07-22', title: 'BCHS Nkwen celebrates outstanding GCE results', summary: 'Our Class of 2026 recorded a 98% pass rate, with several students earning regional distinctions across science and arts subjects.', image: '' },
      { id: 'n2', featured: false, date: '2026-07-14', title: 'New science laboratory officially opened', summary: '', image: '' },
      { id: 'n3', featured: false, date: '2026-06-30', title: 'Debate team wins regional championship', summary: '', image: '' },
      { id: 'n4', featured: false, date: '2026-06-18', title: 'Enrolment opens for the 2026/2027 academic year', summary: '', image: '' },
      { id: 'n5', featured: false, date: '2026-06-02', title: 'Choir wins best ensemble at cultural festival', summary: '', image: '' }
    ],
    events: [
      { id: 'e1', date: '2026-08-15', title: 'Entrance examination', text: 'Admission assessment for new applicants to all levels.', tag: 'Admissions' },
      { id: 'e2', date: '2026-09-26', title: 'Sports day', text: 'Inter-house athletics, football finals and a full day of school spirit.', tag: 'Student life' },
      { id: 'e3', date: '2026-10-10', title: 'Open day', text: 'Prospective families tour the campus and meet our teaching staff.', tag: 'Visitors' },
      { id: 'e4', date: '2027-06-12', title: 'Graduation', text: 'Commencement ceremony honouring our graduating class.', tag: 'Ceremony' },
      { id: 'e5', date: '2027-06-26', title: 'Prize giving', text: 'Celebrating academic, sporting and creative achievement.', tag: 'Ceremony' }
    ],
    testimonials: [
      { id: 't1', quote: 'BCHS pushed me to work harder than I thought possible, while always feeling like family.', name: 'Ngwa Precious', role: 'Current student' },
      { id: 't2', quote: 'The teachers genuinely know each child. My daughter has grown so much in confidence and character.', name: 'Mrs. Ashu Beatrice', role: 'Parent' },
      { id: 't3', quote: 'Everything I needed to succeed at university started with the discipline BCHS instilled in me.', name: 'Fonyuy Elvis', role: 'Alumnus, Class of 2018' }
    ],
    gallery: Array.from({ length: 8 }, (_, i) => ({ id: 'g' + (i + 1), image: '', caption: '' })),
    cta: {
      open: true, eyebrow: '2026/2027 Enrolment Open', title: 'Ready to join BCHS Nkwen?',
      text: 'Take the first step toward an education that shapes character as much as it sharpens the mind. The online application takes about 15 minutes.',
      button: 'Apply Today', closedText: 'Admissions for this year are closed. Contact the school office to join the waiting list for next year.'
    },
    contact: { phone: '+237 6XX XXX XXX', email: 'info@bchsnkwen.edu.cm', address: 'Nkwen, Bamenda, North West Region, Cameroon', hours: 'Monday–Friday, 7:30–15:30' }
  };

  const SECTIONS = [
    ['announcement', 'Announcement bar', 'Message above the menu'],
    ['hero', 'Hero', 'Headline, buttons, photo, notice'],
    ['facts', 'Key figures', 'Four numbers under the hero'],
    ['principal', "Principal's message", 'Quote, letter, portrait'],
    ['news', 'News', 'Featured story and headlines'],
    ['events', 'Events', 'Upcoming dates'],
    ['testimonials', 'Testimonials', 'Quotes from the community'],
    ['gallery', 'Photo gallery', 'Campus photographs'],
    ['cta', 'Admissions banner', 'Enrolment call to action'],
    ['contact', 'Contact details', 'Phone, email, address, hours']
  ];
  const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date');

  // Field lists: [name, label, type]. type: text | area | toggle | date | image | group
  const SCHEMA = {
    announcement: [['on', 'Show announcement bar', 'toggle'], ['text', 'Message', 'area'], ['linkLabel', 'Link text', 'text'], ['link', 'Link address', 'text']],
    hero: [
      ['_t', 'Text', 'group'], ['eyebrow', 'Small heading', 'text'], ['title', 'Headline', 'text'], ['highlight', 'Underlined words', 'text'], ['sub', 'Introduction', 'area'], ['points', 'Short facts (one per line)', 'area'],
      ['_b', 'Buttons', 'group'], ['primaryLabel', 'Main button text', 'text'], ['primaryLink', 'Main button link', 'text'], ['secondaryLabel', 'Second button text', 'text'], ['secondaryLink', 'Second button link', 'text'],
      ['_p', 'Photograph', 'group'], ['image', 'Campus photograph', 'image'],
      ['_n', 'Notice card', 'group'], ['noticeOn', 'Show notice card', 'toggle'], ['noticeLabel', 'Label', 'text'], ['noticeTitle', 'Title', 'text'], ['noticeText', 'Text', 'text'], ['noticeLink', 'Link', 'text']
    ],
    facts: { fixed: true, noun: 'figure', fields: [['label', 'Label', 'text'], ['value', 'Figure', 'text']], name: (i) => i.value + ' · ' + i.label },
    principal: [['quote', 'Pull quote', 'area'], ['p1', 'First paragraph', 'area'], ['p2', 'Second paragraph', 'area'], ['name', 'Caption under portrait', 'text'], ['image', 'Portrait', 'image']],
    news: {
      noun: 'story', fields: [['featured', 'Featured story (shown large)', 'toggle'], ['date', 'Date', 'date'], ['title', 'Headline', 'text'], ['summary', 'Summary (featured story only)', 'area'], ['image', 'Photo', 'image']],
      name: (i) => i.title, meta: (i) => (i.featured ? 'Featured · ' : '') + fmtDate(i.date),
      add: () => ({ id: id(), featured: false, date: new Date().toISOString().slice(0, 10), title: 'New story', summary: '', image: '' })
    },
    events: {
      noun: 'event', fields: [['date', 'Date', 'date'], ['title', 'Title', 'text'], ['text', 'Description', 'area'], ['tag', 'Tag', 'text']],
      name: (i) => i.title, meta: (i) => fmtDate(i.date) + (i.tag ? ' · ' + i.tag : ''),
      add: () => ({ id: id(), date: '', title: 'New event', text: '', tag: '' })
    },
    testimonials: {
      noun: 'testimonial', fields: [['quote', 'Quote', 'area'], ['name', 'Name', 'text'], ['role', 'Role', 'text']],
      name: (i) => i.name || 'Unnamed', meta: (i) => i.role,
      add: () => ({ id: id(), quote: '', name: '', role: '' })
    },
    gallery: {
      noun: 'photo', fields: [['image', 'Photo', 'image'], ['caption', 'Description (read aloud by screen readers)', 'text']],
      name: (i) => i.caption || 'Untitled photo', meta: (i) => (i.image ? 'Photo added' : 'Empty slot'),
      add: () => ({ id: id(), image: '', caption: '' })
    },
    cta: [['open', 'Admissions are open', 'toggle'], ['eyebrow', 'Small heading', 'text'], ['title', 'Heading', 'text'], ['text', 'Text (when open)', 'area'], ['button', 'Button text', 'text'], ['closedText', 'Text when admissions are closed', 'area']],
    contact: [['phone', 'Phone', 'text'], ['email', 'Email', 'text'], ['address', 'Address', 'text'], ['hours', 'Office hours', 'text']]
  };

  // ---------- State ----------
  let st = load();
  let ui = { section: 'hero', scope: 'section', show: 'draft', device: 'desktop', open: {} };
  let root = null;
  let previewTimer = 0;

  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.live && s.draft) return s; } catch { /* fall through */ }
    const d = clone(DEFAULT);
    return { live: d, draft: clone(d), version: 1, scheduled: null, history: [{ v: 1, at: '2026-07-31T10:00:00.000Z', by: 'School office', note: 'New homepage launched', count: 0, snapshot: clone(d) }] };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(st)); return true; }
    catch { toast('Browser storage is full. Remove a photo or publish to free space.'); return false; }
  }
  const who = () => document.getElementById('userName')?.textContent || 'School office';

  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : Array.isArray(o) ? o.find((x) => x.id === k) : o[k]), obj);
  }
  function setPath(obj, path, value) {
    const parts = path.split('.'), last = parts.pop();
    getPath(obj, parts.join('.'))[last] = value;
  }

  // ---------- Change tracking ----------
  function flat(obj, prefix = '', out = {}) {
    Object.entries(obj).forEach(([k, v]) => {
      if (k === 'id') return;
      const p = prefix ? prefix + '.' + k : k;
      if (Array.isArray(v)) { out[p + '.#order'] = v.map((i) => i.id).join(','); v.forEach((it) => flat(it, p + '.' + it.id, out)); }
      else if (v && typeof v === 'object') flat(v, p, out);
      else out[p] = v;
    });
    return out;
  }
  const fieldLabel = (section, field) => {
    const s = SCHEMA[section], list = Array.isArray(s) ? s : s.fields;
    return (list.find((f) => f[0] === field) || [field, field])[1];
  };
  const show = (v) => (v === undefined || v === '' ? '(empty)' : v === true ? 'On' : v === false ? 'Off' : String(v).startsWith('data:image') ? 'New photo' : String(v).length > 90 ? String(v).slice(0, 87) + '…' : String(v));

  /* Human-readable list: one entry per changed field, or one per added/removed list item. */
  function changes(from = st.live, to = st.draft) {
    const a = flat(from), b = flat(to), out = [];
    SECTIONS.forEach(([sec, secLabel]) => {
      const s = SCHEMA[sec];
      if (Array.isArray(s)) {
        s.filter((f) => f[2] !== 'group').forEach(([f]) => {
          const k = sec + '.' + f;
          if (String(a[k] ?? '') !== String(b[k] ?? '')) out.push({ sec, secLabel, label: fieldLabel(sec, f), before: show(a[k]), after: show(b[k]), path: k });
        });
        return;
      }
      const oldItems = from[sec], newItems = to[sec];
      newItems.forEach((it) => {
        const prev = oldItems.find((x) => x.id === it.id);
        if (!prev) { out.push({ sec, secLabel, label: 'Added ' + s.noun, before: '', after: s.name(it), kind: 'add' }); return; }
        s.fields.forEach(([f]) => {
          if (String(prev[f] ?? '') !== String(it[f] ?? '')) out.push({ sec, secLabel, label: s.name(it) + ' › ' + fieldLabel(sec, f), before: show(prev[f]), after: show(it[f]), path: sec + '.' + it.id + '.' + f });
        });
      });
      oldItems.filter((x) => !newItems.some((n) => n.id === x.id)).forEach((x) => out.push({ sec, secLabel, label: 'Removed ' + s.noun, before: s.name(x), after: '', kind: 'remove' }));
      const keptOld = oldItems.filter((x) => newItems.some((n) => n.id === x.id)).map((x) => x.id).join();
      const keptNew = newItems.filter((x) => oldItems.some((o) => o.id === x.id)).map((x) => x.id).join();
      if (keptOld !== keptNew) out.push({ sec, secLabel, label: 'Order changed', before: '', after: '', kind: 'order' });
    });
    return out;
  }
  const sectionCount = (sec, list = changes()) => list.filter((c) => c.sec === sec).length;
  const isEdited = (path) => String(getPath(st.live, path) ?? '') !== String(getPath(st.draft, path) ?? '');

  // ---------- Preview rendering (same markup and classes as index.html) ----------
  const ph = (src, label, alt = '') => (src ? `<img src="${src}" alt="${h(alt)}">` : `<div class="ph" data-label="${h(label)}"></div>`);
  const brand = '<a class="brand" href="#"><span class="brand-mark"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3l8 4-8 4-8-4 8-4z" stroke="#3DBA3D" stroke-width="1.6" stroke-linejoin="round"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" stroke="#3DBA3D" stroke-width="1.6"/></svg></span><span class="brand-word">BCHS<small>Nkwen</small></span></a>';
  const head = (eyebrow, title, lead = '', art = '') => `<div class="sec-head"><div><span class="eyebrow">${h(eyebrow)}</span><h2 class="sec-title">${h(title)}</h2></div>${art}${lead ? `<p class="sec-lead">${h(lead)}</p>` : ''}</div>`;

  const PARTS = {
    chrome: (c) => `${c.announcement.on ? `<div class="topbar"><div class="topbar-inner"><span class="tb-note">${h(c.announcement.text)} ${c.announcement.linkLabel ? `<a href="#">${h(c.announcement.linkLabel)} &rarr;</a>` : ''}</span><span class="topbar-links"><a href="#">${h(c.contact.phone)}</a><a href="#">${h(c.contact.email)}</a></span></div></div>` : ''}
      <header class="nav nav-sticky"><div class="nav-inner">${brand}<nav class="nav-links"><a href="#">About</a><a href="#">Academics</a><a href="#">Admissions</a><a href="#">Student Life</a><a href="#">Facilities</a><a href="#">News</a><a href="#">Contact</a></nav><div class="nav-actions"><a class="nav-portal" href="#">Student Portal</a><a class="btn btn-primary btn-sm" href="#">Apply Now</a><button class="burger"><span></span><span></span><span></span></button></div></div></header>`,
    hero: (c) => { const x = c.hero; return `<section class="home-hero"><div class="container home-hero-grid"><div><span class="eyebrow">${h(x.eyebrow)}</span><h1 class="home-hero-title">${h(x.title)} <span>${h(x.highlight)}</span></h1><p class="home-hero-sub">${h(x.sub)}</p><div class="home-hero-actions">${x.primaryLabel ? `<a class="btn btn-primary" href="#">${h(x.primaryLabel)}</a>` : ''}${x.secondaryLabel ? `<a class="btn btn-outline" href="#">${h(x.secondaryLabel)}</a>` : ''}</div><ul class="home-hero-points">${x.points.split('\n').filter((p) => p.trim()).map((p) => `<li>${h(p)}</li>`).join('')}</ul></div><figure class="home-hero-media">${ART.hero}${ph(x.image, 'Campus photograph', 'BCHS Nkwen campus')}${x.noticeOn ? `<a class="home-hero-notice" href="#"><span>${h(x.noticeLabel)}</span><b>${h(x.noticeTitle)}</b><em>${h(x.noticeText)} &rarr;</em></a>` : ''}</figure></div><div class="container"><dl class="home-facts">${c.facts.map((f) => `<div><dt>${h(f.label)}</dt><dd>${h(f.value)}</dd></div>`).join('')}</dl></div></section>`; },
    principal: (c) => { const x = c.principal; return `<section class="section"><div class="container about-grid"><figure class="about-portrait">${ART.about}${ph(x.image, "Principal's portrait", 'The Principal')}<figcaption><b>${h(x.name)}</b><span>BCHS Nkwen</span></figcaption></figure><div class="about-copy"><span class="eyebrow">About the School</span><h2 class="sec-title">A message from the Principal</h2><blockquote class="about-quote">&ldquo;${h(x.quote)}&rdquo;</blockquote><p>${h(x.p1)}</p>${x.p2 ? `<p>${h(x.p2)}</p>` : ''}<div class="about-actions"><a class="btn btn-outline" href="#">Plan a Visit</a></div></div></div></section>`; },
    news: (c) => {
      const feat = c.news.find((n) => n.featured) || c.news[0], rest = c.news.filter((n) => n !== feat).slice(0, 4);
      return `<section class="section" id="news"><div class="container">${head('Latest News', 'From around campus', '', ART.news)}${feat ? `<div class="news-grid"><article class="news-feat">${ph(feat.image, 'Featured Story')}<div class="news-feat-body"><span class="news-date">${fmtDate(feat.date)}</span><h3>${h(feat.title)}</h3><p>${h(feat.summary)}</p><a class="link-arrow" href="#">Read story <span class="arrow">&rarr;</span></a></div></article><div class="news-list">${rest.map((n) => `<article class="news-item">${ph(n.image, 'News')}<div class="news-item-body"><span class="news-date">${fmtDate(n.date)}</span><h4>${h(n.title)}</h4></div></article>`).join('')}</div></div>` : '<p>No news stories.</p>'}</div></section>`;
    },
    events: (c) => {
      const today = new Date().toISOString().slice(0, 10), sorted = [...c.events].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')), next = sorted.find((e) => e.date >= today);
      return `<section class="section" id="events"><div class="container">${head('Mark Your Calendar', 'Upcoming events', 'Key dates for students, families and visitors this academic year.', ART.events)}<ol class="event-list">${sorted.map((e) => { const d = e.date ? new Date(e.date + 'T00:00:00') : null, past = e.date && e.date < today; return `<li class="event ${past ? 'is-past' : ''} ${e === next ? 'is-next' : ''}"><time class="event-date"><b>${d ? d.getDate() : '—'}</b><span>${d ? d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : 'Date to be set'}</span></time><div class="event-body"><h3>${h(e.title)}</h3><p>${h(e.text)}</p></div><span class="event-tag">${e === next ? 'Next event' : h(e.tag)}</span></li>`; }).join('')}</ol></div></section>`;
    },
    testimonials: (c) => `<section class="section"><div class="container">${head('Voices of BCHS', 'What our community says', '', ART.testimonials)}<div class="quote-grid">${c.testimonials.map((t) => `<figure class="quote"><blockquote>&ldquo;${h(t.quote)}&rdquo;</blockquote><figcaption><b>${h(t.name)}</b><span>${h(t.role)}</span></figcaption></figure>`).join('')}</div></div></section>`,
    gallery: (c) => `<section class="section"><div class="container">${head('Campus Gallery', 'Life at BCHS in pictures', '', ART.gallery)}<div class="gallery-masonry">${c.gallery.map((g, i) => `<div class="gal-tile gal-h${(i % 4) + 1}">${g.image ? `<img src="${g.image}" alt="${h(g.caption)}" style="width:100%;height:100%;object-fit:cover;display:block">` : '<div class="ph" data-label="Gallery"></div>'}</div>`).join('')}</div></div></section>`,
    cta: (c) => { const x = c.cta; return `<section class="cta-band">${ART.cta}<div class="container cta-grid"><div><span class="eyebrow">${h(x.open ? x.eyebrow : 'Admissions closed')}</span><h2 class="sec-title">${h(x.title)}</h2><p class="sec-lead">${h(x.open ? x.text : x.closedText)}</p></div><div class="cta-actions"><a class="btn btn-primary" href="#">${h(x.open ? x.button : 'Contact Admissions')}</a><a class="btn btn-outline" href="#">Request a Prospectus</a></div></div></section>`; },
    contact: (c) => { const x = c.contact; return `<section class="section" id="contact"><div class="container">${head('Get In Touch', 'Contact and visits', 'The school office is happy to answer questions about admissions, fees and campus visits.', ART.contact)}<div class="contact-grid"><div class="manifest"><div class="manifest-row"><span class="k">Phone</span><a href="#">${h(x.phone)}</a></div><div class="manifest-row"><span class="k">Email</span><a href="#">${h(x.email)}</a></div><div class="manifest-row"><span class="k">Address</span><span>${h(x.address)}</span></div><div class="manifest-row"><span class="k">Office hours</span><span>${h(x.hours)}</span></div></div><div class="map-ph ph" data-label="Map"></div></div></div></section>`; },
    static: (label) => `<div class="hp-static">${label}<small>Not edited here: changes to these sections go through the web team.</small></div>`
  };
  /* Geometric design elements, copied from index.html so the preview matches the live page.
     Keep in sync when the homepage art changes. */
  const ART = {
    hero: '<svg class="art art-hero" viewBox="0 0 300 300" aria-hidden="true" focusable="false"><path d="M64 36 C124 -2 222 8 262 58 C302 108 292 186 242 228 C202 262 152 248 122 278 C82 312 20 272 26 212 C30 162 72 152 52 112 C38 82 32 58 64 36 Z" fill="#000"/><circle cx="250" cy="250" r="44" fill="#3dba3d"/><circle cx="88" cy="230" r="12" fill="#fff"/><circle cx="112" cy="254" r="7" fill="#fff"/><circle cx="276" cy="22" r="16" fill="#3dba3d"/><circle cx="196" cy="70" r="9" fill="#fff"/></svg>',
    about: '<svg class="art art-about" viewBox="0 0 160 160" aria-hidden="true" focusable="false"><rect x="0" y="0" width="160" height="160" fill="#3dba3d"/><path d="M0 160 V40 A120 120 0 0 1 120 160 Z" fill="#000"/><rect x="14" y="96" width="52" height="12" fill="#fff"/><rect x="14" y="120" width="36" height="12" fill="#fff"/><circle cx="128" cy="30" r="14" fill="#fff"/></svg>',
    news: '<svg class="art art-strip" viewBox="0 0 420 72" aria-hidden="true" focusable="false"><path d="M16 72 A56 56 0 0 1 128 72 Z" fill="#000"/><path d="M42 72 A30 30 0 0 1 102 72 Z" fill="#3dba3d"/><path d="M60 72 A12 12 0 0 1 84 72 Z" fill="#fff"/><rect x="152" y="30" width="150" height="12" fill="#000"/><circle cx="334" cy="36" r="22" fill="#3dba3d"/><circle cx="392" cy="36" r="22" fill="#000"/><circle cx="392" cy="36" r="8" fill="#fff"/></svg>',
    events: '<svg class="art art-strip" viewBox="0 0 316 72" aria-hidden="true" focusable="false"><g fill="#000"><rect x="0" y="0" width="30" height="30"/><rect x="52" y="0" width="30" height="30"/><rect x="156" y="0" width="30" height="30"/><rect x="208" y="0" width="30" height="30"/><rect x="0" y="42" width="30" height="30"/><rect x="104" y="42" width="30" height="30"/><rect x="156" y="42" width="30" height="30"/><rect x="286" y="42" width="30" height="30"/><circle cx="275" cy="15" r="15"/></g><rect x="104" y="0" width="30" height="30" fill="#3dba3d"/><circle cx="67" cy="57" r="15" fill="#3dba3d"/><rect x="234" y="42" width="30" height="30" fill="#3dba3d"/><circle cx="119" cy="57" r="6" fill="#fff"/><circle cx="275" cy="15" r="6" fill="#fff"/></svg>',
    testimonials: '<svg class="art art-tag art-quote" viewBox="0 0 210 92" aria-hidden="true" focusable="false"><circle cx="40" cy="34" r="30" fill="#000"/><path d="M70 34 C70 70 42 86 16 90 C38 74 44 62 42 52 Z" fill="#000"/><circle cx="40" cy="34" r="11" fill="#fff"/><circle cx="122" cy="34" r="30" fill="#3dba3d"/><path d="M152 34 C152 70 124 86 98 90 C120 74 126 62 124 52 Z" fill="#3dba3d"/><circle cx="122" cy="34" r="11" fill="#000"/><rect x="176" y="72" width="34" height="14" fill="#000"/></svg>',
    gallery: '<svg class="art art-tag" viewBox="0 0 260 80" aria-hidden="true" focusable="false"><rect x="0" y="14" width="110" height="64" fill="#000"/><rect x="70" y="0" width="110" height="64" fill="#3dba3d"/><rect x="84" y="12" width="82" height="40" fill="#fff"/><polygon points="92,52 114,26 136,52" fill="#000"/><circle cx="150" cy="26" r="7" fill="#3dba3d"/><circle cx="226" cy="40" r="28" fill="#000"/><circle cx="226" cy="40" r="10" fill="#fff"/></svg>',
    cta: '<svg class="art art-cta" viewBox="0 0 320 320" aria-hidden="true" focusable="false"><circle cx="160" cy="160" r="150" fill="#3dba3d"/><circle cx="160" cy="160" r="100" fill="none" stroke="#fff" stroke-width="26"/><circle cx="160" cy="160" r="44" fill="#000"/><circle cx="38" cy="300" r="14" fill="#fff"/></svg>',
    contact: '<svg class="art art-strip" viewBox="0 0 420 72" aria-hidden="true" focusable="false"><path d="M30 54 H140 V18 H260 V54 H330" fill="none" stroke="#000" stroke-width="10"/><rect x="8" y="42" width="26" height="26" fill="#000"/><rect x="15" y="49" width="12" height="12" fill="#fff"/><circle cx="200" cy="18" r="11" fill="#3dba3d"/><circle cx="372" cy="36" r="28" fill="#3dba3d"/><circle cx="372" cy="36" r="11" fill="#fff"/></svg>'
  };
  const SECTION_PARTS = { announcement: ['chrome', 'hero'], hero: ['chrome', 'hero'], facts: ['hero'], principal: ['principal'], news: ['news'], events: ['events'], testimonials: ['testimonials'], gallery: ['gallery'], cta: ['cta'], contact: ['contact'] };
  const PART_OWNER = { chrome: ['announcement', 'contact'], hero: ['hero', 'facts'], principal: ['principal'], news: ['news'], events: ['events'], testimonials: ['testimonials'], gallery: ['gallery'], cta: ['cta'], contact: ['contact'] };
  const PAGE = ['chrome', 'hero', 'principal', '#Academics · Why BCHS · Facilities · Student life', 'news', 'events', 'testimonials', 'gallery', 'cta', 'contact'];

  function previewDoc() {
    const content = ui.show === 'live' ? st.live : st.draft, list = changes();
    const parts = ui.scope === 'page' ? PAGE : SECTION_PARTS[ui.section];
    const body = parts.map((p) => {
      if (p.startsWith('#')) return PARTS.static(p.slice(1));
      const changed = ui.show === 'draft' && PART_OWNER[p].some((s) => sectionCount(s, list));
      return `<div data-part="${p}" ${changed ? 'data-changed' : ''}>${PARTS[p](content)}</div>`;
    }).join('');
    const css = (f) => new URL('../assets/css/' + f, location.href).href;
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${css('styles.css')}"><link rel="stylesheet" href="${css('home.css')}"><style>
      body{overflow:hidden} a,button{pointer-events:none} .nav{position:relative!important}
      [data-changed]{position:relative} [data-changed]::after{content:"Edited";position:absolute;top:0;right:0;z-index:9;background:#3dba3d;color:#000;font:700 11px "JetBrains Mono",monospace;padding:4px 8px}
      [data-changed]::before{content:"";position:absolute;inset:0;z-index:8;outline:3px solid #3dba3d;outline-offset:-3px;pointer-events:none}
      .hp-static{padding:2.4rem 1rem;border-top:1px solid #000;background:#f4f4f2;text-align:center;font:700 .85rem "JetBrains Mono",monospace;color:#555}.hp-static small{display:block;font-weight:400;margin-top:.4rem;color:#888}
    </style></head><body>${body}</body></html>`;
  }

  function fit() {
    const vp = root?.querySelector('.hp-viewport'), canvas = vp?.querySelector('.hp-canvas'), frame = canvas?.querySelector('iframe');
    if (!frame) return;
    const w = ui.device === 'mobile' ? 390 : 1280, scale = Math.min(1, (vp.clientWidth - 32) / w);
    const docH = frame.contentDocument?.documentElement?.scrollHeight || 900;
    frame.style.width = w + 'px';
    frame.style.height = docH + 'px';
    frame.style.transform = `scale(${scale})`;
    canvas.style.width = w * scale + 'px';
    canvas.style.height = docH * scale + 'px';
    if (ui.scope === 'page' && fit.scrollToSection) {
      const target = ui.section === 'announcement' ? 'chrome' : SECTION_PARTS[ui.section][SECTION_PARTS[ui.section].length - 1];
      const part = frame.contentDocument.querySelector(`[data-part="${target}"]`);
      if (part) vp.scrollTop = part.offsetTop * scale;
      fit.scrollToSection = false;
    }
  }

  function renderPreview(scrollToSection = false) {
    const vp = root.querySelector('.hp-viewport'), frame = vp.querySelector('iframe'), keep = vp.scrollTop;
    fit.scrollToSection = scrollToSection;
    frame.onload = () => {
      fit();
      if (!scrollToSection) vp.scrollTop = keep;
      else if (ui.scope !== 'page') vp.scrollTop = 0;
    };
    frame.srcdoc = previewDoc();
    root.querySelector('.hp-mode').textContent = ui.show === 'live' ? 'Live version' : 'Draft preview';
    root.querySelector('.hp-mode').className = 'hp-mode ' + ui.show;
  }
  const schedulePreview = () => { clearTimeout(previewTimer); previewTimer = setTimeout(() => renderPreview(), 350); };

  // ---------- Editor panels ----------
  function field([name, label, type], path, value) {
    if (type === 'group') return `<h4 class="hp-group">${label}</h4>`;
    const edited = isEdited(path) ? ' is-edited' : '';
    if (type === 'toggle') return `<label class="hp-toggle${edited}"><input type="checkbox" data-hp-field="${path}" ${value ? 'checked' : ''}><span>${label}</span></label>`;
    if (type === 'image') return `<div class="hp-field${edited}"><span>${label}</span><div class="hp-image">${value ? `<img src="${value}" alt="">` : '<div class="hp-image-empty">No photo yet</div>'}</div><div class="hp-image-actions"><label class="mini-btn">${value ? 'Replace photo' : 'Upload photo'}<input type="file" accept="image/jpeg,image/png,image/webp" hidden data-hp-image="${path}"></label>${value ? `<button type="button" class="mini-btn danger" data-hp-act="clearImage" data-hp-path="${path}">Remove</button>` : ''}</div><small>JPG, PNG or WebP. Resized automatically for fast loading.</small></div>`;
    const input = type === 'area'
      ? `<textarea rows="${name === 'p1' || name === 'p2' ? 5 : 3}" data-hp-field="${path}">${h(value)}</textarea>`
      : `<input type="${type === 'date' ? 'date' : 'text'}" value="${h(value)}" data-hp-field="${path}">`;
    return `<label class="hp-field${edited}"><span>${label}</span>${input}</label>`;
  }

  function listEditor(sec) {
    const s = SCHEMA[sec], items = st.draft[sec];
    return `<div class="hp-list">${items.map((it, i) => {
      const prev = st.live[sec].find((x) => x.id === it.id), state = !prev ? 'New' : s.fields.some(([f]) => String(prev[f] ?? '') !== String(it[f] ?? '')) ? 'Edited' : '';
      const open = ui.open[it.id];
      return `<div class="hp-item${open ? ' open' : ''}"><div class="hp-item-head"><button type="button" class="hp-item-toggle" data-hp-act="toggleItem" data-hp-id="${it.id}" aria-expanded="${!!open}"><b>${h(s.name(it))}</b>${s.meta ? `<small>${h(s.meta(it))}</small>` : ''}</button>${state ? `<em class="hp-state ${state.toLowerCase()}">${state}</em>` : ''}${s.fixed ? '' : `<div class="hp-item-tools"><button type="button" data-hp-act="up" data-hp-id="${it.id}" title="Move up" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>&uarr;</button><button type="button" data-hp-act="down" data-hp-id="${it.id}" title="Move down" aria-label="Move down" ${i === items.length - 1 ? 'disabled' : ''}>&darr;</button><button type="button" data-hp-act="remove" data-hp-id="${it.id}" title="Remove" aria-label="Remove">&times;</button></div>`}</div>${open ? `<div class="hp-item-body">${s.fields.map((f) => field(f, `${sec}.${it.id}.${f[0]}`, it[f[0]])).join('')}</div>` : ''}</div>`;
    }).join('')}</div>${s.fixed ? '' : `<button type="button" class="mini-btn hp-add" data-hp-act="add">+ Add ${s.noun}</button>`}`;
  }

  function renderInspector() {
    const [sec, label, desc] = SECTIONS.find((x) => x[0] === ui.section), s = SCHEMA[sec], n = sectionCount(sec);
    const body = Array.isArray(s) ? s.map((f) => (f[2] === 'group' ? field(f) : field(f, sec + '.' + f[0], st.draft[sec][f[0]]))).join('') : listEditor(sec);
    root.querySelector('.hp-inspector').innerHTML = `<div class="hp-ins-head"><div><h3>${label}</h3><p>${desc}</p></div>${n ? `<button type="button" class="mini-btn" data-hp-act="revertSection">Undo ${n} change${n > 1 ? 's' : ''}</button>` : '<span class="hp-ok">No changes</span>'}</div><div class="hp-ins-body">${body}</div>`;
  }

  function renderSections() {
    const list = changes();
    root.querySelector('.hp-sections').innerHTML = `<h3>Sections</h3>${SECTIONS.map(([k, label, desc]) => { const n = sectionCount(k, list); return `<button type="button" class="hp-sec${k === ui.section ? ' active' : ''}" data-hp-act="pick" data-hp-id="${k}"><span><b>${label}</b><small>${desc}</small></span>${n ? `<em title="${n} unpublished change${n > 1 ? 's' : ''}">${n}</em>` : ''}</button>`; }).join('')}`;
  }

  function renderStatus() {
    const n = changes().length, last = st.history[0], sch = st.scheduled;
    root.querySelector('.hp-top').innerHTML = `<div class="hp-top-main"><b>Homepage</b><small>Live: version ${st.version} · published ${new Date(last.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} by ${h(last.by)}</small></div>
      ${sch ? `<div class="hp-sched"><span>Scheduled: ${new Date(sch.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span><button type="button" data-hp-act="publishScheduled">Publish now</button><button type="button" data-hp-act="cancelSchedule">Cancel</button></div>` : ''}
      <span class="hp-pending${n ? '' : ' none'}">${n ? `${n} unpublished change${n > 1 ? 's' : ''}` : 'Draft matches live'}</span>
      <div class="hp-actions"><button type="button" class="mini-btn" data-hp-act="history">History</button><button type="button" class="mini-btn" data-hp-act="openTab">Open full preview</button><button type="button" class="mini-btn danger" data-hp-act="discard" ${n ? '' : 'disabled'}>Discard</button><button type="button" class="mini-btn primary" data-hp-act="review" ${n ? '' : 'disabled'}>Review &amp; publish</button></div>`;
  }

  const seg = (k, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" class="${ui[k] === v ? 'on' : ''}" data-hp-act="view" data-hp-k="${k}" data-hp-v="${v}" aria-pressed="${ui[k] === v}">${l}</button>`).join('')}</div>`;
  function renderToolbar() {
    root.querySelector('.hp-ptools').innerHTML = `${seg('scope', [['section', 'This section'], ['page', 'Whole page']])}${seg('show', [['draft', 'Draft'], ['live', 'Live']])}${seg('device', [['desktop', 'Desktop'], ['mobile', 'Mobile']])}`;
  }

  function refreshAll(scroll) { renderStatus(); renderSections(); renderToolbar(); renderInspector(); renderPreview(scroll); }
  const afterEdit = () => { save(); renderStatus(); renderSections(); schedulePreview(); };

  // ---------- Publishing ----------
  function publish(snapshot, note, count) {
    st.version += 1;
    st.live = clone(snapshot);
    st.history.unshift({ v: st.version, at: new Date().toISOString(), by: who(), note: note || 'Homepage update', count, snapshot: clone(snapshot) });
    st.history = st.history.slice(0, 5); // snapshots include photos; keep browser storage small
    save();
  }

  function reviewModal() {
    const list = changes();
    const groups = SECTIONS.filter(([k]) => list.some((c) => c.sec === k));
    const body = `<p class="modal-note">${list.length} change${list.length > 1 ? 's' : ''} will go live on the public homepage. Check each one below.</p>
      <div class="hp-review">${groups.map(([k, label]) => `<div class="hp-review-sec"><h4>${label}</h4>${list.filter((c) => c.sec === k).map((c) => `<div class="hp-change"><b>${h(c.label)}</b>${c.kind === 'order' ? '<span>Items were reordered</span>' : `<span>${c.before ? `<s>${h(c.before)}</s>` : ''}${c.before && c.after ? ' → ' : ''}${c.after ? `<ins>${h(c.after)}</ins>` : ''}</span>`}</div>`).join('')}</div>`).join('')}</div>
      <label class="form-label">Note for the history log<input name="note" placeholder="e.g. Open Day photos and new event dates"></label>
      <div class="hp-when"><label><input type="radio" name="when" value="now" checked> Publish now</label><label><input type="radio" name="when" value="later"> Schedule for</label><input type="datetime-local" name="at"></div>`;
    modal('Review and publish', body, (x) => {
      if (x.when === 'later') {
        if (!x.at || new Date(x.at) <= new Date()) { toast('Choose a future date and time.'); return false; }
        st.scheduled = { at: x.at, note: x.note, by: who(), count: list.length, snapshot: clone(st.draft) };
        save(); refreshAll(); toast('Scheduled. The draft stays editable; the scheduled copy will not change.');
        return;
      }
      publish(st.draft, x.note, list.length); refreshAll();
      toast(`Published as version ${st.version}. The public site updates once it is connected to the backend.`);
    }, 'Publish');
  }

  function historyModal() {
    const rows = st.history.map((v) => `<tr><td><b>v${v.v}</b>${v.v === st.version ? '<small>Live now</small>' : ''}</td><td>${new Date(v.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}<small>${h(v.by)}</small></td><td>${h(v.note)}<small>${v.count ? v.count + ' change' + (v.count > 1 ? 's' : '') : ''}</small></td><td>${v.v === st.version ? '' : `<button type="button" class="mini-btn" data-hp-restore="${v.v}">Load as draft</button>`}</td></tr>`).join('');
    modal('Publishing history', `<p class="modal-note">To roll back, load an earlier version as a draft, check it in the preview, then publish it.</p><div class="admin-table-wrap"><table class="admin-table" style="min-width:0"><thead><tr><th>Version</th><th>Published</th><th>Note</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`, () => {}, '');
  }

  function openTab() {
    const prev = { ...ui };
    ui.scope = 'page'; ui.show = 'draft';
    const html = previewDoc().replace('body{overflow:hidden}', '');
    Object.assign(ui, prev);
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const s = Math.min(1, 1400 / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.78));
        };
        img.onerror = reject; img.src = reader.result;
      };
      reader.onerror = reject; reader.readAsDataURL(file);
    });
  }

  // ---------- Events ----------
  const ACTIONS = {
    pick(k) { ui.section = k; ui.open = {}; renderSections(); renderInspector(); renderPreview(true); },
    view(_, b) { ui[b.dataset.hpK] = b.dataset.hpV; renderToolbar(); renderPreview(b.dataset.hpK === 'scope'); },
    toggleItem(itemId) { ui.open[itemId] = !ui.open[itemId]; renderInspector(); },
    up(itemId) { move(itemId, -1); },
    down(itemId) { move(itemId, 1); },
    remove(itemId) {
      const list = st.draft[ui.section], item = list.find((x) => x.id === itemId);
      if (!confirm(`Remove “${SCHEMA[ui.section].name(item)}” from the draft?`)) return;
      st.draft[ui.section] = list.filter((x) => x.id !== itemId); afterEdit(); renderInspector();
    },
    add() { const item = SCHEMA[ui.section].add(); st.draft[ui.section].unshift(item); ui.open = { [item.id]: true }; afterEdit(); renderInspector(); },
    clearImage(_, b) { setPath(st.draft, b.dataset.hpPath, ''); afterEdit(); renderInspector(); },
    revertSection() { st.draft[ui.section] = clone(st.live[ui.section]); afterEdit(); renderInspector(); toast('Section restored to the live version.'); },
    discard() { if (!confirm('Discard every unpublished change and return to the live version?')) return; st.draft = clone(st.live); save(); refreshAll(); toast('Draft discarded.'); },
    review: reviewModal,
    history: historyModal,
    openTab,
    publishScheduled() { const s = st.scheduled; st.scheduled = null; publish(s.snapshot, s.note, s.count); refreshAll(); toast(`Scheduled update published as version ${st.version}.`); },
    cancelSchedule() { st.scheduled = null; save(); renderStatus(); toast('Schedule cancelled.'); }
  };
  function move(itemId, dir) {
    const list = st.draft[ui.section], i = list.findIndex((x) => x.id === itemId), j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]]; afterEdit(); renderInspector();
  }

  function onInput(e) {
    const path = e.target.dataset.hpField;
    if (!path || e.target.type === 'checkbox') return;
    setPath(st.draft, path, e.target.value);
    e.target.closest('.hp-field')?.classList.toggle('is-edited', isEdited(path));
    afterEdit();
  }
  async function onChange(e) {
    const t = e.target;
    if (t.dataset.hpField && t.type === 'checkbox') {
      const path = t.dataset.hpField;
      if (path.endsWith('.featured') && t.checked) st.draft.news.forEach((n) => { n.featured = false; });
      setPath(st.draft, path, t.checked); afterEdit(); renderInspector();
    } else if (t.dataset.hpImage && t.files[0]) {
      const f = t.files[0];
      if (!/^image\//.test(f.type)) return toast('Please choose a JPG, PNG or WebP image.');
      if (f.size > 15 * 1024 * 1024) return toast('That photo is over 15 MB. Please choose a smaller one.');
      try { setPath(st.draft, t.dataset.hpImage, await resizeImage(f)); afterEdit(); renderInspector(); toast('Photo added to the draft.'); }
      catch { toast('That image could not be read.'); }
    }
  }
  function onClick(e) {
    const b = e.target.closest('[data-hp-act]');
    if (b && !b.disabled) ACTIONS[b.dataset.hpAct]?.(b.dataset.hpId, b);
  }

  // History "Load as draft" buttons live in the shared modal, outside the editor root.
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-hp-restore]');
    if (!b) return;
    const v = st.history.find((x) => x.v === +b.dataset.hpRestore);
    if (changes().length && !confirm('This replaces your current unpublished changes. Continue?')) return;
    st.draft = clone(v.snapshot); save(); close(); refreshAll();
    toast(`Version ${v.v} loaded as a draft. Review it, then publish to roll back.`);
  });
  window.addEventListener('resize', () => { if (root?.isConnected) fit(); });

  // ---------- Mount ----------
  function mount(el) {
    root = el;
    if (st.scheduled && new Date(st.scheduled.at) <= new Date()) { const s = st.scheduled; st.scheduled = null; publish(s.snapshot, s.note, s.count); }
    root.innerHTML = `<div class="hp-top"></div>
      <div class="hp-layout">
        <nav class="hp-sections" aria-label="Homepage sections"></nav>
        <section class="hp-preview" aria-label="Preview">
          <div class="hp-ptools"></div>
          <div class="hp-browser"><i></i><i></i><i></i><span class="hp-url">bchsnkwen.edu.cm</span><span class="hp-mode draft">Draft preview</span></div>
          <div class="hp-viewport"><div class="hp-canvas"><iframe title="Homepage preview" sandbox="allow-same-origin"></iframe></div></div>
        </section>
        <aside class="hp-inspector" aria-label="Edit section"></aside>
      </div>`;
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('click', onClick);
    refreshAll(true);
  }

  return { mount };
})();
