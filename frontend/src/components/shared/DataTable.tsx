import type { ReactNode } from 'react';
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

/** Umumiy jadval: yuklanish (skeleton), bo'sh holat va qatorlar. */
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

  return (
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
  );
}
