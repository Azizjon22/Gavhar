import { Dialog as SheetPrimitive } from 'radix-ui';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';
import { overlayClasses } from './dialog';

export const Sheet = SheetPrimitive.Root;
export const SheetTitle = SheetPrimitive.Title;
export const SheetDescription = SheetPrimitive.Description;

/** Chapdan chiqadigan panel — telefonda yon menyu uchun. */
export function SheetContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof SheetPrimitive.Content>) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className={overlayClasses} />
      <SheetPrimitive.Content
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-dvh w-[86vw] max-w-[300px] flex-col shadow-lifted outline-none',
          'duration-300 data-[state=open]:animate-in data-[state=open]:slide-in-from-left',
          'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left',
          className,
        )}
        {...props}
      />
    </SheetPrimitive.Portal>
  );
}
