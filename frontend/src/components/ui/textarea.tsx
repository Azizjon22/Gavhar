import { type TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { inputClasses } from './input';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 3, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(inputClasses, 'h-auto min-h-20 resize-y py-2.5 leading-relaxed', className)}
      {...props}
    />
  );
});
