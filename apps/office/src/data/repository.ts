/**
 * The only way School Admin reads or changes data.
 *
 * Every change goes through `commit()`, which, in order:
 *   1. checks the actor's permission (and records a refusal in the audit log),
 *   2. re-reads the stored copy, so a change made in another tab is never overwritten,
 *   3. refuses the change if the record it targets moved on since the page loaded it (revision check),
 *   4. applies the change to a copy, validates the whole result against the schema,
 *   5. appends an audit entry for sensitive actions, saves, and notifies the pages.
 *
 * The storage behind it is an adapter: browser storage for the demo, the backend in Phase 6.
 */
import { DatabaseSchema, type AuditEntry, type Database } from './schema';
import { ForbiddenError, can, type Permission, type Role } from '../domain/permissions';

export interface StorageAdapter {
  read(): string | null;
  write(value: string): void;
  /** Calls `listener` when the stored copy was changed somewhere else (another tab). */
  onExternalChange(listener: () => void): () => void;
}

export interface Actor {
  staffId: string;
  role: Role;
}

export interface Mutation {
  /** `null` for events any signed-in person may cause, such as signing in. */
  permission: Permission | null;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  reason?: string | null;
  /** Sensitive actions are written to the audit log. */
  audit: boolean;
  /** For a record that carries a revision: the revision this change was made against. */
  expect?: { collection: 'markSheets'; id: string; rev: number };
  apply?: (draft: Database) => void;
}

export class ConflictError extends Error {
  override readonly name = 'ConflictError';
}

export class NotFoundError extends Error {
  override readonly name = 'NotFoundError';
}

export interface RepositoryOptions {
  seed: (now: Date) => Database;
  now?: () => Date;
  newId?: () => string;
}

export type LoadOutcome = 'loaded' | 'seeded' | 'recovered';

export class Repository {
  readonly #adapter: StorageAdapter;
  readonly #seed: (now: Date) => Database;
  readonly #now: () => Date;
  readonly #newId: () => string;
  readonly #listeners = new Set<() => void>();
  #db: Database;
  /** How the data was obtained when the app started: read back, freshly seeded, or re-seeded because the stored copy was unreadable. */
  readonly loadOutcome: LoadOutcome;

  constructor(adapter: StorageAdapter, options: RepositoryOptions) {
    this.#adapter = adapter;
    this.#seed = options.seed;
    this.#now = options.now ?? (() => new Date());
    this.#newId = options.newId ?? (() => crypto.randomUUID());

    const stored = this.#readStored();
    if (stored.kind === 'ok') {
      this.#db = stored.db;
      this.loadOutcome = 'loaded';
    } else {
      this.#db = this.#seed(this.#now());
      this.#adapter.write(JSON.stringify(this.#db));
      this.loadOutcome = stored.kind === 'empty' ? 'seeded' : 'recovered';
    }

    adapter.onExternalChange(() => {
      const fresh = this.#readStored();
      if (fresh.kind === 'ok') {
        this.#db = fresh.db;
        this.#emit();
      }
    });
  }

  /** The current data. The same object is returned until something changes, so React can compare by reference. */
  snapshot = (): Database => this.#db;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  commit(actor: Actor, mutation: Mutation): Database {
    if (mutation.permission && !can(actor.role, mutation.permission)) {
      this.#write(this.#withAudit(this.#latest(), actor, mutation, 'denied'));
      throw new ForbiddenError(actor.role, mutation.permission);
    }

    const draft = structuredClone(this.#latest());

    if (mutation.expect) {
      const record = draft[mutation.expect.collection].find((r) => r.id === mutation.expect!.id);
      if (!record) throw new NotFoundError(`${mutation.expect.collection} ${mutation.expect.id} does not exist`);
      if (record.rev !== mutation.expect.rev) {
        throw new ConflictError('Someone else saved this while you were working. Your view has been refreshed.');
      }
      record.rev += 1;
    }

    mutation.apply?.(draft);
    const next = mutation.audit ? this.#withAudit(draft, actor, mutation, 'done') : draft;

    const checked = DatabaseSchema.safeParse(next);
    if (!checked.success) {
      throw new Error(`Refused to save invalid data: ${checked.error.issues[0]?.path.join('.')} ${checked.error.issues[0]?.message}`);
    }
    this.#write(checked.data);
    return checked.data;
  }

  /** Replaces everything with fresh sample data. Recorded in the new audit log. */
  reset(actor: Actor): void {
    const fresh = this.#seed(this.#now());
    this.#write(
      this.#withAudit(fresh, actor, { permission: null, action: 'demo.reset', entity: 'database', entityId: null, summary: 'Restored the sample school', audit: true }, 'done'),
    );
  }

  #withAudit(db: Database, actor: Actor, mutation: Mutation, outcome: AuditEntry['outcome']): Database {
    const entry: AuditEntry = {
      id: this.#newId(),
      at: this.#now().toISOString(),
      actorId: actor.staffId,
      role: actor.role,
      action: mutation.action,
      entity: mutation.entity,
      entityId: mutation.entityId,
      summary: mutation.summary.slice(0, 400),
      reason: mutation.reason?.trim().slice(0, 500) || null,
      outcome,
    };
    return { ...db, audit: [...db.audit, entry] };
  }

  /** The freshest copy: what is stored now (another tab may have saved), else what we hold. */
  #latest(): Database {
    const stored = this.#readStored();
    return stored.kind === 'ok' ? stored.db : this.#db;
  }

  #readStored(): { kind: 'ok'; db: Database } | { kind: 'empty' } | { kind: 'invalid' } {
    let raw: string | null;
    try {
      raw = this.#adapter.read();
    } catch {
      return { kind: 'invalid' };
    }
    if (raw === null) return { kind: 'empty' };
    try {
      const parsed = DatabaseSchema.safeParse(JSON.parse(raw));
      return parsed.success ? { kind: 'ok', db: parsed.data } : { kind: 'invalid' };
    } catch {
      return { kind: 'invalid' };
    }
  }

  #write(db: Database): void {
    this.#adapter.write(JSON.stringify(db));
    this.#db = db;
    this.#emit();
  }

  #emit(): void {
    this.#listeners.forEach((listener) => listener());
  }
}

/** Browser storage for the demonstration. One key; other tabs are heard through the `storage` event. */
export function browserStorageAdapter(key: string, storage: Storage = window.localStorage): StorageAdapter {
  return {
    read: () => storage.getItem(key),
    write: (value) => storage.setItem(key, value),
    onExternalChange(listener) {
      const handler = (event: StorageEvent) => {
        if (event.key === key) listener();
      };
      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    },
  };
}

/** In-memory storage for tests. `external()` simulates another tab saving. */
export function memoryAdapter(initial: string | null = null) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    read: () => value,
    write: (next: string) => {
      value = next;
    },
    onExternalChange(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    external(next: string) {
      value = next;
      listeners.forEach((l) => l());
    },
  } satisfies StorageAdapter & { external(next: string): void };
}
