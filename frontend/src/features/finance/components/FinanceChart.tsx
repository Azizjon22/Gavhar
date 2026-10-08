import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatAmount } from '@/lib/money';
import { cn } from '@/lib/utils';
import { type Period, bucketLabel, bucketTitle } from '../lib/period';
import type { SeriesPoint } from '../types/finance.types';

interface FinanceChartProps {
  series: SeriesPoint[];
  period: Period;
  /** Bugungi sana — undan keyingi kunlar "hali kelmagan" deb xira ko'rsatiladi. */
  today: string;
}

/** Ustun balandligi foizda; noldan katta qiymat doim ko'rinib turadi. */
const height = (value: number, max: number): string =>
  value <= 0 ? '0%' : `${Math.max(1.5, (value / max) * 100)}%`;

/** Tushum va xarajat ustunlari: har bir kun yoki oy uchun bir juft. */
export function FinanceChart({ series, period, today }: FinanceChartProps) {
  const { t } = useTranslation();
  const max = Math.max(
    1,
    ...series.flatMap((point) => [Number(point.income), Number(point.expense)]),
  );
  // Oy ko'rinishida 31 ta yozuv sig'maydi — har beshinchisi ko'rsatiladi.
  const labelEvery = series.length > 16 ? 5 : 1;
  const currency = t('common.currency');

  return (
    <div>
      <div className="relative h-56 sm:h-72 xl:h-80">
        <div aria-hidden="true" className="absolute inset-0 flex flex-col justify-between">
          {[0, 1, 2, 3].map((line) => (
            <span key={line} className="border-t border-dashed border-border/70" />
          ))}
          <span className="border-t border-border" />
        </div>
        <ul className="relative flex h-full items-end gap-[3px] sm:gap-1.5">
          {series.map((point) => {
            const income = Number(point.income);
            const expense = Number(point.expense);
            const isFuture = point.key > (period === 'year' ? today.slice(0, 7) : today);
            return (
              <li key={point.key} className="h-full min-w-0 flex-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${bucketTitle(period, point.key)}: ${t('finance.income')} ${formatAmount(point.income)}, ${t('finance.expenses')} ${formatAmount(point.expense)}`}
                      className={cn(
                        'flex size-full cursor-default items-end justify-center gap-px rounded-md px-px outline-none hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/40',
                        isFuture && 'bg-muted/40',
                      )}
                    >
                      <span
                        className="w-full max-w-6 rounded-t-[3px] bg-primary transition-[height] duration-500"
                        style={{ height: height(income, max) }}
                      />
                      <span
                        className="w-full max-w-6 rounded-t-[3px] bg-gold transition-[height] duration-500"
                        style={{ height: height(expense, max) }}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="grid gap-1 text-xs">
                    <p className="font-semibold">{bucketTitle(period, point.key)}</p>
                    {isFuture ? (
                      <p className="opacity-80">{t('finance.chart.future')}</p>
                    ) : (
                      <>
                        <p className="tabular">
                          {t('finance.income')}: {formatAmount(point.income)} {currency}
                        </p>
                        <p className="tabular">
                          {t('finance.expenses')}: {formatAmount(point.expense)} {currency}
                        </p>
                        <p className="tabular font-semibold">
                          {t('finance.profit')}: {formatAmount(point.profit)} {currency}
                        </p>
                      </>
                    )}
                  </TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </div>
      <ul
        aria-hidden="true"
        className="mt-2 flex gap-[3px] text-[10px] font-medium text-muted-foreground sm:gap-1.5 sm:text-xs"
      >
        {series.map((point, index) => (
          <li key={point.key} className="min-w-0 flex-1 text-center whitespace-nowrap">
            {index % labelEvery === 0 ? bucketLabel(period, point.key) : ''}
          </li>
        ))}
      </ul>
      <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm bg-primary" />
          {t('finance.income')}
        </li>
        <li className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm bg-gold" />
          {t('finance.expenses')}
        </li>
        <li className="tabular ml-auto">
          {t('finance.chart.max', { amount: formatAmount(max === 1 ? 0 : max) })}
        </li>
      </ul>
    </div>
  );
}
