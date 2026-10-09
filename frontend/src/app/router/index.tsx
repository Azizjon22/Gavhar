import { type RouteObject, createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { FullPageLoader } from '@/components/shared/FullPageLoader';
import { NotFoundPage, RouteErrorPage } from '@/components/shared/StatusPages';
import {
  GuestOnly,
  RequireAuth,
  RequirePermission,
  RequireSuperAdmin,
  RequireUnrestricted,
  SetupOnly,
} from './guards';
import { ROUTES } from './paths';

/**
 * Sahifalar alohida bo'laklarga (chunk) ajratiladi — foydalanuvchi faqat
 * ochgan bo'limining kodini yuklaydi.
 */
const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    HydrateFallback: FullPageLoader,
    children: [
      {
        element: <GuestOnly />,
        children: [
          {
            path: ROUTES.login,
            lazy: async () => ({
              Component: (await import('@/features/auth/pages/LoginPage')).LoginPage,
            }),
          },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <SetupOnly path={ROUTES.setupPassword} />,
            children: [
              {
                path: ROUTES.setupPassword,
                lazy: async () => ({
                  Component: (await import('@/features/auth/pages/SetupPasswordPage'))
                    .SetupPasswordPage,
                }),
              },
            ],
          },
          {
            element: <SetupOnly path={ROUTES.setupTwoFactor} />,
            children: [
              {
                path: ROUTES.setupTwoFactor,
                lazy: async () => ({
                  Component: (await import('@/features/auth/pages/SetupTwoFactorPage'))
                    .SetupTwoFactorPage,
                }),
              },
            ],
          },
          {
            element: <RequireUnrestricted />,
            children: [
              {
                // Mijozga ko'rsatiladigan taqdimot — yon menyusiz, to'liq ekranda.
                path: ROUTES.showcase,
                lazy: async () => ({
                  Component: (await import('@/features/showcase/pages/ShowcasePage')).ShowcasePage,
                }),
              },
              {
                path: `${ROUTES.showcaseMenu}/:id`,
                lazy: async () => ({
                  Component: (await import('@/features/showcase/pages/ShowcasePackagePage'))
                    .ShowcasePackagePage,
                }),
              },
              {
                element: <AppLayout />,
                children: [
                  {
                    index: true,
                    lazy: async () => ({
                      Component: (await import('@/features/home/pages/HomePage')).HomePage,
                    }),
                  },
                  {
                    path: ROUTES.profile,
                    lazy: async () => ({
                      Component: (await import('@/features/profile/pages/ProfilePage')).ProfilePage,
                    }),
                  },
                  {
                    element: <RequirePermission permission="events:read" />,
                    children: [
                      {
                        path: ROUTES.events,
                        lazy: async () => ({
                          Component: (await import('@/features/events/pages/EventsPage'))
                            .EventsPage,
                        }),
                      },
                      {
                        path: `${ROUTES.events}/:id`,
                        lazy: async () => ({
                          Component: (await import('@/features/events/pages/EventDetailPage'))
                            .EventDetailPage,
                        }),
                      },
                      {
                        path: ROUTES.extraServices,
                        lazy: async () => ({
                          Component: (
                            await import('@/features/extra-services/pages/ExtraServicesPage')
                          ).ExtraServicesPage,
                        }),
                      },
                    ],
                  },
                  {
                    element: <RequirePermission permission="clients:read" />,
                    children: [
                      {
                        path: ROUTES.clients,
                        lazy: async () => ({
                          Component: (await import('@/features/clients/pages/ClientsPage'))
                            .ClientsPage,
                        }),
                      },
                    ],
                  },
                  {
                    element: <RequirePermission permission="menu:read" />,
                    children: [
                      {
                        path: ROUTES.menu,
                        lazy: async () => ({
                          Component: (await import('@/features/menu/pages/MenuPage')).MenuPage,
                        }),
                      },
                    ],
                  },
                  {
                    element: <RequirePermission permission="media:read" />,
                    children: [
                      {
                        path: ROUTES.gallery,
                        lazy: async () => ({
                          Component: (await import('@/features/gallery/pages/GalleryPage'))
                            .GalleryPage,
                        }),
                      },
                    ],
                  },
                  {
                    element: <RequirePermission permission="shopping:read" />,
                    children: [
                      {
                        path: ROUTES.shopping,
                        lazy: async () => ({
                          Component: (await import('@/features/shopping/pages/ShoppingPage'))
                            .ShoppingPage,
                        }),
                      },
                    ],
                  },
                  {
                    element: <RequirePermission permission="staff:read" />,
                    children: [
                      {
                        path: ROUTES.workers,
                        lazy: async () => ({
                          Component: (await import('@/features/workers/pages/WorkersPage'))
                            .WorkersPage,
                        }),
                      },
                    ],
                  },
                  {
                    element: <RequirePermission permission="finance:read" />,
                    children: [
                      {
                        path: ROUTES.finance,
                        lazy: async () => ({
                          Component: (await import('@/features/finance/pages/FinancePage'))
                            .FinancePage,
                        }),
                      },
                    ],
                  },
                  {
                    element: <RequirePermission permission="warehouse:read" />,
                    children: [
                      {
                        path: ROUTES.warehouse,
                        lazy: async () => ({
                          Component: (await import('@/features/warehouse/pages/WarehousePage'))
                            .WarehousePage,
                        }),
                      },
                    ],
                  },
                  {
                    element: <RequireSuperAdmin />,
                    children: [
                      {
                        path: ROUTES.users,
                        lazy: async () => ({
                          Component: (await import('@/features/users/pages/UsersPage')).UsersPage,
                        }),
                      },
                      {
                        path: ROUTES.roles,
                        lazy: async () => ({
                          Component: (await import('@/features/roles/pages/RolesPage')).RolesPage,
                        }),
                      },
                      {
                        path: ROUTES.auditLogs,
                        lazy: async () => ({
                          Component: (await import('@/features/audit/pages/AuditLogPage'))
                            .AuditLogPage,
                        }),
                      },
                    ],
                  },
                  { path: '*', element: <NotFoundPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes, {
  future: {
    v7_relativeSplatPath: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true,
  },
});
