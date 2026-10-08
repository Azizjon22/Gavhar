import { House, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useRouteError } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { GemMark } from './Logo';

interface StatusPageProps {
  code: string;
  title: string;
  text: string;
  action: ReactNode;
  fullScreen?: boolean;
}

function StatusPage({ code, title, text, action, fullScreen = false }: StatusPageProps) {
  return (
    <div
      className={
        fullScreen
          ? 'flex min-h-dvh items-center justify-center bg-background px-6'
          : 'flex min-h-[60dvh] items-center justify-center px-6'
      }
    >
      <div className="flex max-w-md flex-col items-center gap-5 text-center">
        <GemMark className="size-12 opacity-80" />
        <p className="text-gold-gradient font-display text-7xl leading-none font-semibold">
          {code}
        </p>
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-semibold">{title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
        </div>
        {action}
      </div>
    </div>
  );
}

function HomeLink() {
  const { t } = useTranslation();
  return (
    <Button asChild>
      <Link to="/">
        <House />
        {t('pages.backHome')}
      </Link>
    </Button>
  );
}

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <StatusPage
      code="404"
      title={t('pages.notFound.title')}
      text={t('pages.notFound.text')}
      action={<HomeLink />}
    />
  );
}

export function ForbiddenPage() {
  const { t } = useTranslation();
  return (
    <StatusPage
      code="403"
      title={t('pages.forbidden.title')}
      text={t('pages.forbidden.text')}
      action={<HomeLink />}
    />
  );
}

/** Router `errorElement`: kutilmagan xatoda oq ekran o'rniga. */
export function RouteErrorPage() {
  const { t } = useTranslation();
  const error = useRouteError();
  console.error(error);

  return (
    <StatusPage
      fullScreen
      code="!"
      title={t('pages.error.title')}
      text={t('pages.error.text')}
      action={
        <Button onClick={() => window.location.reload()}>
          <RefreshCw />
          {t('pages.error.reload')}
        </Button>
      }
    />
  );
}
