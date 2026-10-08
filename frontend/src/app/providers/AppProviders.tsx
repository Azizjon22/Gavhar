import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { type ReactNode, useEffect } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { queryClient } from '@/lib/query-client';
import { useAuthStore } from '@/stores/auth.store';
import { applyTheme, useThemeStore, watchSystemTheme } from '@/stores/theme.store';

// Sessiya tugaganda keshdagi ma'lumotlar ham o'chadi — keyingi foydalanuvchi
// oldingisining ma'lumotini ko'rib qolmasligi uchun.
useAuthStore.subscribe((state, previous) => {
  if (previous.status === 'authenticated' && state.status === 'unauthenticated') {
    queryClient.clear();
  }
});

function ThemeEffect() {
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    return watchSystemTheme(() => applyTheme('system'));
  }, [theme]);

  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Tizimda "harakatni kamaytirish" yoqilgan bo'lsa, animatsiyalar o'chadi. */}
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={250}>
          <ThemeEffect />
          {children}
          <Toaster />
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
