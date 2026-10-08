import { motion } from 'framer-motion';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigation } from 'react-router-dom';
import { MobileNav } from './MobileNav';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/** Sahifa kodi yuklanayotganda tepada yuguradigan oltin chiziq. */
function NavigationProgress() {
  const { state } = useNavigation();
  if (state === 'idle') return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden" aria-hidden="true">
      <div className="bg-gold-gradient h-full w-1/3 animate-[progress_1s_ease-in-out_infinite]" />
    </div>
  );
}

/** Tizimning asosiy qobig'i: yon menyu, yuqori panel va sahifa kontenti. */
export function AppLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-dvh bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        {t('nav.skipToContent')}
      </a>
      <NavigationProgress />
      <Sidebar />
      <MobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-4 py-6 outline-none lg:px-8 lg:py-9"
        >
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto w-full max-w-7xl"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
