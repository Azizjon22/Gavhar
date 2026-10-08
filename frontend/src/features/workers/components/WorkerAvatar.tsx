import { cn } from '@/lib/utils';
import type { Worker } from '../types/worker.types';

const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

/** Ishchi rasmi; rasm bo'lmasa — ismining bosh harflari. */
export function WorkerAvatar({
  worker,
  className,
}: {
  worker: Pick<Worker, 'fullName' | 'photo'>;
  className?: string;
}) {
  return worker.photo ? (
    <img
      src={worker.photo.thumbUrl}
      alt=""
      loading="lazy"
      className={cn('size-10 shrink-0 rounded-full object-cover', className)}
    />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        'bg-gold-gradient flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-[#1b1407]',
        className,
      )}
    >
      {initials(worker.fullName)}
    </span>
  );
}
