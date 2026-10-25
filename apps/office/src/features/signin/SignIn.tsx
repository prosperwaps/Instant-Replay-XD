import { useMemo } from 'react';
import { useDb, useSession } from '../../app/context';
import { AccountList, BrandMark } from '../../shell/Shell';
import { ROLES } from '../../domain/permissions';
import s from './signin.module.css';

/** One account per office role, in the order of the school's hierarchy. */
const ROLE_ORDER = ROLES.filter((r) => r !== 'teacher');

export function SignIn() {
  const db = useDb();
  const { signIn } = useSession();

  const accounts = useMemo(
    () => ROLE_ORDER.map((role) => db.staff.find((st) => st.role === role)).filter((st): st is NonNullable<typeof st> => !!st),
    [db.staff],
  );

  return (
    <div className={s.page}>
      <section className={s.art} aria-label={db.school.name}>
        <div className={s.brand}>
          <BrandMark size={32} />
          <span>
            {db.school.shortName}
            <small>School Admin</small>
          </span>
        </div>
        <GeometricPiece />
        <div className={s.statement}>
          <p className={s.headline}>The school day, kept in order.</p>
          <ul className={s.points}>
            <li>Mark sheets from first entry to lock, with every locked change explained.</li>
            <li>Each person sees the pages their role needs, and nothing more.</li>
            <li>A record of who changed what, and when.</li>
          </ul>
        </div>
      </section>

      <main className={s.panel}>
        <div className={s.card}>
          <h1 className={s.title}>Sign in to School Admin</h1>
          <p className={s.lead}>
            This is a demonstration with sample records stored in this browser. Choose a staff account to explore School Admin with that person’s permissions.
          </p>
          <AccountList staff={accounts} onPick={signIn} />
          <p className={s.note}>Real sign-in, with two-step verification for leadership, the bursar and the System Admin, arrives with the school’s server.</p>
        </div>
      </main>
    </div>
  );
}

/** Solid shapes in the three school colours, after the public site's section pieces. */
function GeometricPiece() {
  return (
    <svg className={s.piece} viewBox="0 0 420 260" aria-hidden="true" focusable="false">
      <rect x="0" y="40" width="160" height="220" fill="#fff" />
      <circle cx="80" cy="130" r="50" fill="#000" />
      <circle cx="80" cy="130" r="20" fill="#3dba3d" />
      <rect x="196" y="0" width="104" height="18" fill="#fff" />
      <rect x="196" y="36" width="64" height="18" fill="#fff" />
      <path d="M180 260 A120 120 0 0 1 300 140 L300 260 Z" fill="#3dba3d" />
      <circle cx="372" cy="40" r="26" fill="#3dba3d" />
      <rect x="324" y="130" width="72" height="130" fill="#fff" />
      <rect x="342" y="150" width="34" height="34" fill="#000" />
    </svg>
  );
}
