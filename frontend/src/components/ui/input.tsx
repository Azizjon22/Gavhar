import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const inputClasses = cn(
  'flex h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm shadow-xs',
  'transition-[border-color,box-shadow] duration-200 outline-none',
  'placeholder:text-muted-foreground/70',
  'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/20',
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, type = 'text', ...props }, ref) {
    return <input ref={ref} type={type} className={cn(inputClasses, className)} {...props} />;
  },
);
