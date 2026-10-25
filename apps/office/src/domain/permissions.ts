/**
 * Roles and what each may do. The rows marked "spec" come from docs/spec/02 §5 (Roles & Permission Matrix);
 * the view permissions decide which pages appear in School Admin for each role.
 *
 * This table is the single source for the client. The server enforces the same table in Phase 6; until then
 * a check here keeps honest people on the right path but is not a security boundary.
 */

export const ROLES = [
  'principal',
  'vicePrincipal',
  'registrar',
  'bursar',
  'hod',
  'classMaster',
  'disciplineMaster',
  'teacher',
  'systemAdmin',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  principal: 'Principal',
  vicePrincipal: 'Vice Principal',
  registrar: 'Registrar',
  bursar: 'Bursar',
  hod: 'Head of Department',
  classMaster: 'Class Master',
  disciplineMaster: 'Discipline Master',
  teacher: 'Teacher',
  systemAdmin: 'System Admin',
};

/** Roles that must use two-step sign-in (spec 02 §5, enforced from Phase 6). */
export const TWO_STEP_ROLES: ReadonlySet<Role> = new Set(['principal', 'vicePrincipal', 'registrar', 'bursar', 'systemAdmin']);

const MATRIX = {
  // Pages
  'overview.view': ['principal', 'vicePrincipal', 'registrar', 'bursar', 'hod', 'classMaster', 'disciplineMaster', 'systemAdmin'],
  'marks.view': ['principal', 'vicePrincipal', 'registrar', 'hod', 'classMaster'],
  'attendance.view': ['principal', 'vicePrincipal', 'registrar', 'disciplineMaster', 'classMaster'],
  'admissions.view': ['principal', 'vicePrincipal', 'registrar'],
  'fees.view': ['principal', 'bursar'],
  'audit.view': ['principal', 'systemAdmin'],
  // Mark sheets
  'marks.enter': ['vicePrincipal', 'registrar'],
  'marks.submit': ['vicePrincipal', 'registrar'],
  'marks.lock': ['vicePrincipal', 'hod'],
  'marks.editLocked': ['vicePrincipal'], // spec: "Edit locked marks — Vice Principal (with reason)"
  'marks.approve': ['vicePrincipal', 'hod'], // spec
  'marks.requestCorrection': ['classMaster', 'teacher', 'hod'], // spec
  // Other rows from the spec, used by later phases
  'admissions.approve': ['principal', 'vicePrincipal', 'registrar'],
  'reportCards.release': ['principal', 'vicePrincipal'],
  'payments.record': ['bursar'],
  'waivers.approve': ['principal'],
  'waivers.propose': ['bursar'],
  'discipline.log': ['vicePrincipal', 'classMaster', 'disciplineMaster', 'teacher'],
  'users.manage': ['systemAdmin'],
  'production.support': ['systemAdmin'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof MATRIX;

const index = new Map<Permission, ReadonlySet<Role>>(
  (Object.entries(MATRIX) as [Permission, readonly Role[]][]).map(([permission, roles]) => [permission, new Set(roles)]),
);

export function can(role: Role, permission: Permission): boolean {
  return index.get(permission)?.has(role) ?? false;
}

export function permissionsOf(role: Role): Permission[] {
  return [...index.entries()].filter(([, roles]) => roles.has(role)).map(([permission]) => permission);
}

export class ForbiddenError extends Error {
  override readonly name = 'ForbiddenError';
  constructor(
    readonly role: Role,
    readonly permission: Permission,
  ) {
    super(`${ROLE_LABELS[role]} may not ${permission}`);
  }
}
