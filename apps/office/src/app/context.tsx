import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Actor, Mutation, Repository } from '../data/repository';
import type { Database, Staff } from '../data/schema';
import { can, type Permission } from '../domain/permissions';
import { schoolDay } from '../domain/dates';

/* ---------- Data ---------- */

const RepositoryContext = createContext<Repository | null>(null);

export function useRepository(): Repository {
  const repo = useContext(RepositoryContext);
  if (!repo) throw new Error('useRepository must be used inside <AppProviders>');
  return repo;
}

/** The current database. Re-renders when anything changes, in this tab or another. */
export function useDb(): Database {
  const repo = useRepository();
  return useSyncExternalStore(repo.subscribe, repo.snapshot, repo.snapshot);
}

/* ---------- Clock ---------- */

const ClockContext = createContext<() => Date>(() => new Date());

/** "Now", refreshed every minute so relative dates and greetings stay right on a screen left open. */
export function useNow(): Date {
  const clock = useContext(ClockContext);
  const [now, setNow] = useState(clock);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(clock()), 60_000);
    return () => window.clearInterval(timer);
  }, [clock]);
  return now;
}

export function useToday(): string {
  return schoolDay(useNow());
}

/* ---------- Session ---------- */

const SESSION_KEY = 'bchs-admin-session';
/** A demo session ends after eight hours, like a school day. */
export const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;

interface StoredSession {
  staffId: string;
  signedInAt: string;
}

function readSession(storage: Storage, now: Date): StoredSession | null {
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed.staffId !== 'string' || typeof parsed.signedInAt !== 'string') return null;
    const age = now.getTime() - new Date(parsed.signedInAt).getTime();
    if (!(age >= 0 && age < SESSION_LIFETIME_MS)) return null;
    return { staffId: parsed.staffId, signedInAt: parsed.signedInAt };
  } catch {
    return null;
  }
}

export interface SessionValue {
  /** The signed-in person. Their role is always read from the staff record, never from the stored session. */
  user: Staff | null;
  actor: Actor | null;
  signIn: (staffId: string) => void;
  signOut: () => void;
  can: (permission: Permission) => boolean;
  /** Commits a change as the signed-in person. */
  commit: (mutation: Mutation) => Database;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <AppProviders>');
  return value;
}

/** The signed-in person, for pages that only render once someone is signed in. */
export function useUser(): { user: Staff; actor: Actor } {
  const { user, actor } = useSession();
  if (!user || !actor) throw new Error('No one is signed in');
  return { user, actor };
}

function SessionProvider({ storage, clock, children }: { storage: Storage; clock: () => Date; children: ReactNode }) {
  const repo = useRepository();
  const db = useDb();
  const [stored, setStored] = useState(() => readSession(storage, clock()));

  const user = (stored && db.staff.find((s) => s.id === stored.staffId)) || null;
  const actor = useMemo<Actor | null>(() => (user ? { staffId: user.id, role: user.role } : null), [user]);

  const signIn = useCallback(
    (staffId: string) => {
      const staff = repo.snapshot().staff.find((s) => s.id === staffId);
      if (!staff) return;
      const session = { staffId, signedInAt: clock().toISOString() };
      storage.setItem(SESSION_KEY, JSON.stringify(session));
      repo.commit({ staffId, role: staff.role }, { permission: null, action: 'session.signIn', entity: 'session', entityId: null, summary: 'Signed in (demo)', audit: true });
      setStored(session);
    },
    [repo, storage, clock],
  );

  const signOut = useCallback(() => {
    if (actor) repo.commit(actor, { permission: null, action: 'session.signOut', entity: 'session', entityId: null, summary: 'Signed out', audit: true });
    storage.removeItem(SESSION_KEY);
    setStored(null);
  }, [actor, repo, storage]);

  const value = useMemo<SessionValue>(
    () => ({
      user,
      actor,
      signIn,
      signOut,
      can: (permission) => !!user && can(user.role, permission),
      commit: (mutation) => {
        if (!actor) throw new Error('Sign in first');
        return repo.commit(actor, mutation);
      },
    }),
    [user, actor, signIn, signOut, repo],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function AppProviders({
  repository,
  sessionStorage: storage = window.sessionStorage,
  clock = () => new Date(),
  children,
}: {
  repository: Repository;
  sessionStorage?: Storage;
  clock?: () => Date;
  children: ReactNode;
}) {
  return (
    <RepositoryContext.Provider value={repository}>
      <ClockContext.Provider value={clock}>
        <SessionProvider storage={storage} clock={clock}>
          {children}
        </SessionProvider>
      </ClockContext.Provider>
    </RepositoryContext.Provider>
  );
}
