import type { IconName } from '../ui';
import type { Permission } from '../domain/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  permission: Permission;
  /** Words people might type to find this page in the command palette. */
  keywords: string;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

/**
 * Pages are listed only once they work. Each later phase adds its own group here
 * (People, School day, Finance, Platform) — see docs/office-rebuild/PLAN.md §4.
 */
export const NAV: readonly NavGroup[] = [
  { label: null, items: [{ to: '/', label: 'Overview', icon: 'grid', permission: 'overview.view', keywords: 'home today dashboard' }] },
  { label: 'Academics', items: [{ to: '/marks', label: 'Mark sheets', icon: 'chart', permission: 'marks.view', keywords: 'marks grades scores sequence exams' }] },
  { label: 'Governance', items: [{ to: '/audit', label: 'Audit log', icon: 'list', permission: 'audit.view', keywords: 'history activity log who changed' }] },
];

export function visibleNav(can: (p: Permission) => boolean): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(i.permission)) })).filter((g) => g.items.length > 0);
}
