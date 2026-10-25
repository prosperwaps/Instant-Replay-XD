import { createBrowserRouter, createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { useSession } from './context';
import { Shell, PageHeader, RequirePermission } from '../shell/Shell';
import { SignIn } from '../features/signin/SignIn';
import { Overview } from '../features/overview/Overview';
import { MarkSheets } from '../features/marks/MarkSheets';
import { SheetPage } from '../features/marks/SheetPage';
import { AuditLog } from '../features/audit/AuditLog';
import { useState } from 'react';
import { LinkButton } from '../ui';

function NotFound() {
  return (
    <>
      <PageHeader title="There’s no page here" description="The link may be mistyped, or the page may belong to a part of School Admin that hasn’t been built yet." />
      <LinkButton to="/" variant="primary">
        Go to the overview
      </LinkButton>
    </>
  );
}

/** Signed out: the sign-in page at every address. Signed in: the shell and its pages. */
function Gate() {
  const { user } = useSession();
  return user ? <Shell /> : <SignIn />;
}

export const routes: RouteObject[] = [
  {
    element: <Gate />,
    children: [
      { index: true, element: <RequirePermission permission="overview.view"><Overview /></RequirePermission> },
      { path: 'marks', element: <RequirePermission permission="marks.view"><MarkSheets /></RequirePermission> },
      { path: 'marks/:sheetId', element: <RequirePermission permission="marks.view"><SheetPage /></RequirePermission> },
      { path: 'audit', element: <RequirePermission permission="audit.view"><AuditLog /></RequirePermission> },
      { path: '*', element: <NotFound /> },
    ],
  },
];

export function App({ initialPath }: { initialPath?: string }) {
  const [router] = useState(() => (initialPath ? createMemoryRouter(routes, { initialEntries: [initialPath] }) : createBrowserRouter(routes)));
  return <RouterProvider router={router} />;
}
