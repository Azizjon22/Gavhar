import { Slot } from 'radix-ui';
import {
  type ComponentPropsWithoutRef,
  type HTMLAttributes,
  createContext,
  useContext,
  useId,
  useMemo,
} from 'react';
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
  FormProvider,
  useFormContext,
  useFormState,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Label } from './label';

/**
 * react-hook-form bilan ishlaydigan forma qismlari. Har bir maydon uchun
 * label ↔ input ↔ xato xabari bog'lanishini (id, aria-*) o'zi ta'minlaydi.
 */
export const Form = FormProvider;

const FormFieldContext = createContext<{ name: string } | null>(null);
const FormItemContext = createContext<{ id: string } | null>(null);

export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
  const value = useMemo(() => ({ name: props.name }), [props.name]);
  return (
    <FormFieldContext.Provider value={value}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

function useFormField() {
  const field = useContext(FormFieldContext);
  const item = useContext(FormItemContext);
  if (!field || !item) {
    throw new Error('Forma qismlari <FormField> va <FormItem> ichida ishlatilishi kerak');
  }

  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: field.name });
  const { error } = getFieldState(field.name, formState);

  return {
    error,
    controlId: `${item.id}-control`,
    descriptionId: `${item.id}-description`,
    messageId: `${item.id}-message`,
  };
}

export function FormItem({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const id = useId();
  const value = useMemo(() => ({ id }), [id]);
  return (
    <FormItemContext.Provider value={value}>
      <div className={cn('grid content-start gap-2', className)} {...props} />
    </FormItemContext.Provider>
  );
}

export function FormLabel({ className, ...props }: ComponentPropsWithoutRef<typeof Label>) {
  const { error, controlId } = useFormField();
  return (
    <Label htmlFor={controlId} className={cn(error && 'text-destructive', className)} {...props} />
  );
}

export function FormControl(props: ComponentPropsWithoutRef<typeof Slot.Root>) {
  const { error, controlId, descriptionId, messageId } = useFormField();
  return (
    <Slot.Root
      id={controlId}
      aria-describedby={error ? `${descriptionId} ${messageId}` : descriptionId}
      aria-invalid={error ? true : undefined}
      {...props}
    />
  );
}

export function FormDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  const { descriptionId } = useFormField();
  return (
    <p
      id={descriptionId}
      className={cn('text-xs leading-relaxed text-muted-foreground', className)}
      {...props}
    />
  );
}

/** Zod sxemalaridagi xabarlar i18n kalitlari — shu yerda tarjima qilinadi. */
export function FormMessage({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  const { t } = useTranslation();
  const { error, messageId } = useFormField();
  if (!error?.message) return null;

  return (
    <p
      id={messageId}
      role="alert"
      className={cn('text-xs font-medium text-destructive', className)}
      {...props}
    >
      {t(error.message, { defaultValue: error.message })}
    </p>
  );
}
