import { Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { ROUTES } from '@/app/router/paths';
import { FullPageLoader } from '@/components/shared/FullPageLoader';
import { Logo } from '@/components/shared/Logo';
import { Button } from '@/components/ui/button';
import { toApiError } from '@/lib/api-error';
import { useAuthStore } from '@/stores/auth.store';
import { telegramApi } from '../api/telegram.api';

interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
}
declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js';

/** Telegram'ning Mini App kutubxonasi — faqat shu sahifada yuklanadi. */
function loadSdk(): Promise<TelegramWebApp | null> {
  if (window.Telegram?.WebApp) return Promise.resolve(window.Telegram.WebApp);
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve(window.Telegram?.WebApp ?? null);
    script.onerror = () => resolve(null);
    document.head.append(script);
  });
}

/** Faqat ichki, nisbiy manzil. */
const safeNext = (value: string | null): string =>
  value?.startsWith('/') && !value.startsWith('//') ? value : ROUTES.home;

type State = { kind: 'loading' } | { kind: 'done' } | { kind: 'error'; reason: string };

/**
 * Mini App kirish nuqtasi (`/tg?next=/kitchen`): bot tugmasi shu yerni Telegram ichida
 * ochadi. Telegram imzolagan ma'lumot bilan parolsiz kiriladi va `next` ga o'tiladi.
 */
export function TelegramAppPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const status = useAuthStore((state) => state.status);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const started = useRef(false);

  useEffect(() => {
    if (status !== 'unauthenticated' || started.current) return;
    started.current = true;
    void (async () => {
      const webApp = await loadSdk();
      webApp?.ready();
      webApp?.expand();
      if (!webApp?.initData) {
        setState({ kind: 'error', reason: 'outside' });
        return;
      }
      try {
        useAuthStore.getState().setSession(await telegramApi.login(webApp.initData));
        setState({ kind: 'done' });
      } catch (error) {
        setState({
          kind: 'error',
          reason: toApiError(error).code === 'TELEGRAM_NOT_LINKED' ? 'notLinked' : 'failed',
        });
      }
    })();
  }, [status]);

  if (status === 'authenticated') return <Navigate to={next} replace />;
  if (state.kind !== 'error') return <FullPageLoader />;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <Logo />
      <span className="flex size-14 items-center justify-center rounded-2xl bg-[#229ED9]/12 text-[#229ED9]">
        <Send className="size-7" />
      </span>
      <div className="grid max-w-sm gap-2">
        <h1 className="font-display text-2xl font-semibold">
          {t(`telegram.app.${state.reason}.title`)}
        </h1>
        <p className="text-sm text-muted-foreground">{t(`telegram.app.${state.reason}.text`)}</p>
      </div>
      <Button asChild>
        <Link to={ROUTES.login}>{t('telegram.app.login')}</Link>
      </Button>
    </main>
  );
}
