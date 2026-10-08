import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ROUTES } from '@/app/router/paths';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { shoppingApi, shoppingKeys } from '@/features/shopping/api/shopping.api';
import { usePermissions } from '@/hooks/use-permissions';

/**
 * Qo'ng'iroqcha: foydalanuvchidan kutilayotgan bozorlik ro'yxatlari soni.
 * Super adminga — tekshirish va tasdiqlash kerak bo'lganlari, xaridchiga — unga
 * yuborilganlari. Kutilayotgan ish bo'lmasa ko'rinmaydi.
 */
export function ShoppingBell() {
  const { t } = useTranslation();
  const enabled = usePermissions().can('shopping:read');
  const query = useQuery({
    queryKey: shoppingKeys.pending,
    queryFn: shoppingApi.pending,
    enabled,
    staleTime: 0,
    refetchInterval: 30_000,
  });

  const pending = query.data;
  const total = pending ? pending.toReview + pending.toConfirm + pending.toPurchase : 0;
  if (!pending || total === 0) return null;

  const lines = (
    [
      ['review', pending.toReview],
      ['confirm', pending.toConfirm],
      ['purchase', pending.toPurchase],
    ] as const
  )
    .filter(([, count]) => count > 0)
    .map(([key, count]) => t(`shopping.tasks.${key}`, { count }));

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={ROUTES.shopping}
          aria-label={`${t('nav.shopping')}: ${lines.join(', ')}`}
          className="relative flex size-9 items-center justify-center rounded-lg text-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          <Bell className="size-[18px]" />
          <span className="tabular absolute -top-0.5 -right-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-[18px] font-bold text-destructive-foreground">
            {total > 99 ? '99+' : total}
          </span>
        </Link>
      </TooltipTrigger>
      <TooltipContent className="grid gap-0.5">
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}
