/* Shared shell for the staff apps (School Admin, Teacher App):
   line icons, grouped sidebar navigation, mobile menu and "/" to search.
   Load before the page script. */
const ICON_PATHS = {
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  inbox: 'M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c0-3.3 3.6-6 8-6s8 2.7 8 6',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3 2.9-5.5 6.5-5.5s6.5 2.5 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.8c2 .7 3.5 2.6 3.5 5.2',
  briefcase: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  check: 'M4 4h16v16H4zM8 12l3 3 5-6',
  chart: 'M5 20V11M12 20V5M19 20v-7M3 20h18',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  wallet: 'M3 7h18v13H3zM3 7l3-4h12l3 4M16 13h2',
  library: 'M5 4h4v16H5zM10 4h4v16h-4zM15 5l4-1 3 15-4 1z',
  bus: 'M5 4h14v12H5zM5 11h14M7 16v3M17 16v3',
  bed: 'M3 18V7M3 13h18v5M21 18v-3M7 13v-3h5v3',
  megaphone: 'M4 10v4h3l7 4V6l-7 4zM17 9a4 4 0 0 1 0 6',
  chat: 'M4 5h16v11H9l-5 4z',
  browser: 'M3 5h18v14H3zM3 9h18M6 7h.01',
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 4v6M10 14v6',
  database: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  building: 'M4 20V8l8-5 8 5v12M9 20v-6h6v6M3 20h18',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z',
  approve: 'M4 12l5 5L20 6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  phone: 'M7 3h10v18H7zM11 18h2',
  sync: 'M20 11a8 8 0 0 0-14-5L4 8M4 4v4h4M4 13a8 8 0 0 0 14 5l2-2M20 20v-4h-4',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  pulse: 'M3 12h4l3-7 4 14 3-7h4'
};
const NAV_ICONS = {
  overview: 'grid', admissions: 'inbox', students: 'user', parents: 'users', teachers: 'briefcase', academics: 'book',
  routine: 'calendar', attendance: 'check', marks: 'chart', invoices: 'receipt', finance: 'wallet', books: 'library',
  transport: 'bus', dormitories: 'bed', notices: 'megaphone', messages: 'chat', homepage: 'browser', settings: 'sliders',
  data: 'database', schools: 'building', calendar: 'calendar', users: 'users', roles: 'shield', approvals: 'approve',
  guardians: 'link', devices: 'phone', sync: 'sync', notifications: 'bell', files: 'file', config: 'sliders',
  audit: 'list', backups: 'database', model: 'layers', health: 'pulse', marksheets: 'list', corrections: 'approve'
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="${ICON_PATHS[name] || ICON_PATHS.grid}"/></svg>`;
}

/* groups: [[label, [pageKey, ...]], ...]; labels: {pageKey: 'Title'}; counts: {pageKey: n} */
function navHTML(groups, labels, active, counts = {}) {
  return groups.map(([group, keys]) => `<div class="nav-group">${group ? `<span class="nav-group-label">${group}</span>` : ''}${keys.map((k) =>
    `<button class="admin-nav-item ${k === active ? 'active' : ''}" data-page="${k}"${k === active ? ' aria-current="page"' : ''}>${icon(NAV_ICONS[k])}<span>${labels[k]}</span>${counts[k] ? `<span class="count">${counts[k]}</span>` : ''}</button>`).join('')}</div>`).join('');
}

(() => {
  const app = document.getElementById('adminApp');
  const menu = document.getElementById('menuBtn');
  if (!app) return;
  menu?.addEventListener('click', () => app.classList.toggle('nav-open'));
  // Close the mobile drawer after choosing a page or tapping the dimmed backdrop.
  document.addEventListener('click', (e) => {
    if (app.classList.contains('nav-open') && (e.target.closest('.admin-nav-item') || e.target === app)) app.classList.remove('nav-open');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') app.classList.remove('nav-open');
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
    if (e.key === '/' && !typing && app.classList.contains('active')) {
      const search = document.getElementById('globalSearch');
      if (search) { e.preventDefault(); search.focus(); }
    }
  });
})();
