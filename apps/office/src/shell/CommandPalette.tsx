import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useDb, useSession } from '../app/context';
import { Icon, type IconName } from '../ui';
import { openSequence, sheetsForSequence } from '../data/queries';
import { visibleNav } from './nav';
import s from './shell.module.css';

interface Command {
  id: string;
  section: string;
  label: string;
  hint?: string;
  icon: IconName;
  to: string;
  keywords: string;
}

/** Matches when every typed word appears somewhere in the label or keywords. */
export function matches(query: string, text: string): boolean {
  const haystack = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

const STATE_HINT = { 'not-started': 'Not started', 'in-progress': 'In progress', submitted: 'Submitted', locked: 'Locked' } as const;

/**
 * Search and jump: pages the person may open, and every mark sheet of the open sequence.
 * Keyboard: ↑ ↓ to move, Enter to open, Escape to close.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDb();
  const { can } = useSession();
  const navigate = useNavigate();
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const commands = useMemo<Command[]>(() => {
    const pages = visibleNav(can).flatMap((g) =>
      g.items.map((i) => ({ id: `page:${i.to}`, section: 'Pages', label: i.label, icon: i.icon, to: i.to, keywords: i.keywords })),
    );
    const sheets = can('marks.view')
      ? sheetsForSequence(db, openSequence(db).id).map((sh) => ({
          id: `sheet:${sh.sheet.id}`,
          section: 'Mark sheets',
          label: `${sh.className} ${sh.subjectName}`,
          hint: STATE_HINT[sh.sheet.state],
          icon: 'file' as const,
          to: `/marks/${sh.sheet.id}`,
          keywords: `${sh.subjectCode} ${sh.teacher?.name ?? ''}`,
        }))
      : [];
    return [...pages, ...sheets];
  }, [db, can]);

  const results = useMemo(() => {
    const found = query.trim() ? commands.filter((c) => matches(query, `${c.label} ${c.keywords}`)) : commands.filter((c) => c.section === 'Pages');
    return found.slice(0, 50);
  }, [commands, query]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !open) return;
    setQuery('');
    setActive(0);
    if (typeof el.showModal === 'function') el.showModal();
    else el.setAttribute('open', '');
    inputRef.current?.focus();
    return () => {
      if (typeof el.close === 'function' && el.open) el.close();
      else el.removeAttribute('open');
    };
  }, [open]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, listId]);

  const go = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    navigate(command.to);
  };

  let lastSection = '';

  return (
    // Escape closes through onCancel; the click handler only adds "click the backdrop to close".
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      className={s.palette}
      aria-label="Search and jump"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {open && (
        <>
          <div className={s.paletteInput}>
            <Icon name="search" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a page or a mark sheet, e.g. “Form 3A maths”"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={results.length ? `${listId}-${active}` : undefined}
              aria-autocomplete="list"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(results.length - 1, a + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(0, a - 1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  go(results[active]);
                }
              }}
            />
          </div>
          <div className={s.paletteList} id={listId} role="listbox" aria-label="Results">
            {results.length === 0 && <p className={s.paletteEmpty}>Nothing matches “{query}”. Try a class, a subject or a page name.</p>}
            {results.map((c, i) => {
              const header = c.section !== lastSection ? c.section : null;
              lastSection = c.section;
              return (
                <div key={c.id} role="presentation">
                  {header && (
                    <div className={s.paletteSection} role="presentation">
                      {header}
                    </div>
                  )}
                  {/* Options stay unfocusable on purpose: focus remains in the input and arrows move aria-activedescendant. */}
                  {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus */}
                  <div
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className={s.paletteItem}
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(c)}
                  >
                    <Icon name={c.icon} />
                    {c.label}
                    {c.hint && <small>{c.hint}</small>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className={s.paletteFoot} aria-hidden="true">
            <span>
              <kbd>↑</kbd> <kbd>↓</kbd> to move
            </span>
            <span>
              <kbd>Enter</kbd> to open
            </span>
            <span>
              <kbd>Esc</kbd> to close
            </span>
          </div>
        </>
      )}
    </dialog>
  );
}
