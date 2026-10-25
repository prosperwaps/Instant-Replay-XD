import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useDb, useRepository, useSession, useToday, useUser } from '../app/context';
import { Button, Dialog, Icon, IconButton, useToast } from '../ui';
import { ROLE_LABELS, type Permission } from '../domain/permissions';
import { daysBetween, formatShortDay } from '../domain/dates';
import { initials } from '../domain/text';
import { openSequence } from '../data/queries';
import { sequenceName } from '../data/schema';
import { visibleNav } from './nav';
import { CommandPalette } from './CommandPalette';
import s from './shell.module.css';

/** The school's mark: the same solid geometry as the public site, at icon size. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg className={s.brandMark} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" fill="#fff" />
      <rect x="4" y="4" width="10" height="24" fill="#000" />
      <circle cx="22" cy="10" r="6" fill="#3dba3d" />
      <rect x="16" y="18" width="12" height="10" fill="#3dba3d" />
    </svg>
  );
}

export function Shell() {
  const db = useDb();
  const { can } = useSession();
  const today = useToday();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const contentRef = useRef<HTMLElement>(null);
  const groups = visibleNav(can);
  const seq = openSequence(db);
  const daysLeft = daysBetween(today, seq.closesOn);

  // Close the drawer and move focus to the new page on navigation, so screen readers start at its content.
  useEffect(() => {
    setNavOpen(false);
    contentRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === '/' && !isTyping(e.target)) {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === 'Escape') {
        setNavOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`${s.app} ${navOpen ? s.navOpen : ''}`}>
      <a className={s.skip} href="#content">
        Skip to content
      </a>
      <aside className={s.sidebar} aria-label="School Admin">
        <Link to="/" className={s.brand}>
          <BrandMark />
          <span className={s.brandText}>
            <b>{db.school.shortName}</b>
            <span>School Admin</span>
          </span>
        </Link>
        <nav className={s.nav} aria-label="Main">
          {groups.map((g) => (
            <div key={g.label ?? 'top'} className={s.navGroup}>
              {g.label && <span className={s.navGroupLabel}>{g.label}</span>}
              {g.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === '/'} className={s.navLink}>
                  <Icon name={item.icon} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className={s.sideFoot}>
          <b>Demonstration</b>
          Records live in this browser only. More of the office arrives phase by phase.
        </div>
      </aside>
      <button type="button" className={s.scrim} aria-label="Close navigation" onClick={() => setNavOpen(false)} tabIndex={-1} />

      <div className={s.main}>
        <header className={s.topbar}>
          <span className={s.menuButton}>
            <IconButton icon="menu" label="Open navigation" aria-expanded={navOpen} onClick={() => setNavOpen(true)} />
          </span>
          <p className={s.context}>
            <span className={s.contextDot} aria-hidden="true" />
            <b>
              Term {seq.term}, {sequenceName(seq)}
            </b>
            <span>
              {daysLeft >= 0 ? `closes ${formatShortDay(seq.closesOn)}, ${daysLeft === 0 ? 'today' : `in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`}` : 'closed'}
            </span>
          </p>
          <div className={s.topActions}>
            <button type="button" className={s.searchTrigger} onClick={() => setPaletteOpen(true)} aria-label="Search and jump">
              <Icon name="search" size={16} />
              <span>Search and jump to…</span>
              <kbd>{isMac() ? '⌘' : 'Ctrl'} K</kbd>
            </button>
            <AccountMenu />
          </div>
        </header>
        <main id="content" className={s.content} ref={contentRef} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
}

function AccountMenu() {
  const { user, actor } = useUser();
  const { signOut, signIn } = useSession();
  const repo = useRepository();
  const db = useDb();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [switching, setSwitching] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const officeStaff = useMemo(() => db.staff.filter((st) => st.role !== 'teacher' && st.id !== user.id), [db.staff, user.id]);

  return (
    <div className={s.account} ref={wrapRef}>
      <button ref={buttonRef} type="button" className={s.accountButton} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        <span className={s.avatar} aria-hidden="true">
          {initials(user.name)}
        </span>
        <span className={s.accountText}>
          <b>{user.name}</b>
          <span>{ROLE_LABELS[user.role]}</span>
        </span>
      </button>
      {open && (
        <div className={s.menu}>
          <div className={s.menuHead}>
            <b>
              {user.title} {user.name}
            </b>
            <span>
              {ROLE_LABELS[user.role]} · {user.email}
            </span>
          </div>
          <p className={s.demoNote}>Demo sign-in. Real accounts and two-step verification come with the school server.</p>
          <button type="button" className={s.menuItem} onClick={() => (setOpen(false), setSwitching(true))}>
            <Icon name="users" /> Switch demo account
          </button>
          <button type="button" className={s.menuItem} onClick={() => (setOpen(false), setConfirmReset(true))}>
            <Icon name="refresh" /> Restore the sample school
          </button>
          <div className={s.menuDivider} />
          <button
            type="button"
            className={s.menuItem}
            onClick={() => {
              signOut();
              navigate('/');
            }}
          >
            <Icon name="signOut" /> Sign out
          </button>
        </div>
      )}

      <Dialog
        open={confirmReset}
        title="Restore the sample school?"
        description="Every change made in this browser is replaced with the original sample records, including marks and the audit log."
        onClose={() => setConfirmReset(false)}
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Keep my changes</Button>
            <Button
              variant="danger"
              onClick={() => {
                repo.reset(actor);
                setConfirmReset(false);
                toast('Sample school restored.');
                navigate('/');
              }}
            >
              Restore sample school
            </Button>
          </>
        }
      />

      <Dialog open={switching} title="Switch demo account" description="See School Admin with another person's permissions." onClose={() => setSwitching(false)}>
        <AccountList
          staff={officeStaff}
          onPick={(id) => {
            signOut();
            signIn(id);
            setSwitching(false);
            navigate('/');
          }}
        />
      </Dialog>
    </div>
  );
}

export function AccountList({ staff, onPick }: { staff: { id: string; name: string; title: string; role: keyof typeof ROLE_LABELS }[]; onPick: (id: string) => void }) {
  return (
    <ul className={s.accountList}>
      {staff.map((st) => (
        <li key={st.id}>
          <button type="button" className={s.accountPick} onClick={() => onPick(st.id)}>
            <span className={s.avatar} aria-hidden="true">
              {initials(st.name)}
            </span>
            <span className={s.accountPickText}>
              <b>
                {st.title} {st.name}
              </b>
              <span>{ROLE_LABELS[st.role]}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function PageHeader({
  title,
  description,
  meta,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
}) {
  return (
    <header className={s.pageHeader}>
      <div>
        {back && (
          <Link to={back.to} className={s.back}>
            <Icon name="chevronLeft" size={16} />
            {back.label}
          </Link>
        )}
        <h1 className={s.pageTitle}>{title}</h1>
        {description && <p className={s.pageDescription}>{description}</p>}
        {meta && <div className={s.pageMeta}>{meta}</div>}
      </div>
      {actions && <div className={s.pageActions}>{actions}</div>}
    </header>
  );
}

/** Renders the page only for roles that may see it; everyone else gets a clear explanation, not a blank screen. */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can, user } = useSession();
  const navigate = useNavigate();
  const goHome = useCallback(() => navigate('/'), [navigate]);
  if (can(permission)) return <>{children}</>;
  return (
    <>
      <PageHeader title="This page isn’t part of your role" description={`As ${user ? ROLE_LABELS[user.role] : 'a guest'}, you don’t have access to it. If you need it for your work, ask the System Admin to request the change.`} />
      <Button variant="primary" onClick={goHome}>
        Go to the overview
      </Button>
    </>
  );
}
