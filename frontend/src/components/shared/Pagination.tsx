import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { PaginationMeta } from '@/types/api';

interface PaginationProps {
  meta: PaginationMeta | undefined;
  onPageChange: (page: number) => void;
}

export function Pagination({ meta, onPageChange }: PaginationProps) {
  const { t } = useTranslation();
  if (!meta || meta.total === 0) return null;

  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);

  return (
    <nav
      aria-label={t('common.pagination.label')}
      className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 sm:flex-row"
    >
      <p className="tabular text-sm text-muted-foreground">
        {t('common.pagination.range', { from, to, total: meta.total })}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!meta.hasPrev}
          onClick={() => onPageChange(meta.page - 1)}
        >
          <ChevronLeft />
          {t('common.pagination.prev')}
        </Button>
        <span className="tabular min-w-16 text-center text-sm font-medium">
          {meta.page} / {meta.totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!meta.hasNext}
          onClick={() => onPageChange(meta.page + 1)}
        >
          {t('common.pagination.next')}
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
