import type { KeyboardEvent, ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export interface Column<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Sarlavha va katakka birdek qo'llanadi (masalan kenglik yoki `text-right`). */
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading: boolean;
  /** Ma'lumot bo'lmaganda ko'rsatiladigan kontent. */
  empty: ReactNode;
  skeletonRows?: number;
  onRowClick?: (row: T) => void;
}

/** Telefonda ham ko'rinadigan ustunlar (`hidden …:table-cell` bo'lmaganlar). */
const visibleOnPhone = <T,>(column: Column<T>) =>
  !/(^|\s)hidden(\s|$)/.test(column.className ?? '');

/**
 * Umumiy jadval: yuklanish (skeleton), bo'sh holat va qatorlar. Tor ekranda (< 640px)
 * jadval o'rniga kartalar: birinchi ustun — sarlavha, «actions» — o'ng yuqorida,
 * qolganlari «nomi — qiymati» qatorlari. Shunda hech bir ustun ekrandan chiqib ketmaydi.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  empty,
  skeletonRows = 6,
  onRowClick,
}: DataTableProps<T>) {
  if (!loading && rows?.length === 0) return <>{empty}</>;

  const phoneColumns = columns.filter(visibleOnPhone);
  const [main, ...rest] = phoneColumns.filter((column) => column.id !== 'actions');
  const actions = phoneColumns.find((column) => column.id === 'actions');
  const activate = (row: T) =>
    onRowClick && {
      tabIndex: 0,
      onClick: () => onRowClick(row),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onRowClick(row);
        }
      },
    };

  return (
    <>
      <ul aria-busy={loading} className="divide-y sm:hidden">
        {loading || !rows
          ? Array.from({ length: Math.min(skeletonRows, 4) }, (_, index) => (
              <li key={index} className="grid gap-2 p-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </li>
            ))
          : rows.map((row) => (
              <li
                key={rowKey(row)}
                {...activate(row)}
                className={cn(
                  'grid gap-2.5 p-4',
                  onRowClick &&
                    'cursor-pointer outline-none active:bg-muted/60 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">{main?.cell(row)}</div>
                  {actions && (
                    // Amal tugmasi bosilganda karta ochilib ketmasin.
                    <div
                      className="-mt-1 -mr-1 shrink-0"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {actions.cell(row)}
                    </div>
                  )}
                </div>
                {rest.length > 0 && (
                  <dl className="grid gap-1.5 text-sm">
                    {rest.map((column) => (
                      <div key={column.id} className="flex items-baseline justify-between gap-3">
                        <dt className="shrink-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                          {column.header}
                        </dt>
                        <dd className="min-w-0 text-right">{column.cell(row)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
      </ul>
      <div className="hidden sm:block">
        <Table aria-busy={loading}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => (
                <TableHead key={column.id} className={column.className}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading || !rows
              ? Array.from({ length: skeletonRows }, (_, rowIndex) => (
                  <TableRow key={rowIndex} className="hover:bg-transparent">
                    {columns.map((column, columnIndex) => (
                      <TableCell key={column.id} className={column.className}>
                        <Skeleton className={cn('h-4', columnIndex === 0 ? 'w-40' : 'w-24')} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : rows.map((row) => (
                  <TableRow
                    key={rowKey(row)}
                    // Bosiladigan qator klaviaturadan ham ochiladi (Tab → Enter).
                    {...(onRowClick && {
                      tabIndex: 0,
                      onClick: () => onRowClick(row),
                      onKeyDown: (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onRowClick(row);
                        }
                      },
                    })}
                    className={cn(
                      onRowClick &&
                        'cursor-pointer outline-none focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
                    )}
                  >
                    {columns.map((column) => (
                      <TableCell key={column.id} className={column.className}>
                        {column.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
