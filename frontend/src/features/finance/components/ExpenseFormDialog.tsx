import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MoneyInput } from '@/components/shared/MoneyInput';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/error-message';
import { amountToInput } from '@/lib/money';
import { financeApi, financeKeys } from '../api/finance.api';
import { todayDate } from '../lib/period';
import type { Expense, ExpenseCategory } from '../types/finance.types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ExpenseCategory[];
  /** Berilsa — tahrirlash. */
  expense?: Expense;
  /** Berilsa — shu to'yning xarajati: sana so'ralmaydi, to'y kuniga yoziladi. */
  event?: { id: string; label: string };
}

/** Xarajat: turi, summasi, kuni va izoh. Kelajak sanasi qabul qilinmaydi. */
export function ExpenseFormDialog({ open, onOpenChange, categories, expense, event }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const today = todayDate();

  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategoryId(expense?.category.id ?? '');
    setAmount(expense ? amountToInput(expense.amount) : '');
    setDate(expense?.date ?? todayDate());
    setNote(expense?.note ?? '');
    setSubmitted(false);
  }, [open, expense]);

  // Tahrirlanayotgan xarajatning turi o'chirilgan bo'lsa ham ro'yxatda ko'rinadi.
  const options =
    expense && !categories.some((category) => category.id === expense.category.id)
      ? [{ ...expense.category, isSystem: false }, ...categories]
      : categories;

  const amountValid = /^[1-9]\d{0,12}$/.test(amount);
  // To'y xarajatining sanasi — to'y kuni; uni foydalanuvchi kiritmaydi.
  const forEvent = event !== undefined || (expense?.event ?? null) !== null;
  const dateValid = forEvent || (/^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today);
  const valid = categoryId !== '' && amountValid && dateValid;

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        categoryId,
        amount,
        note: note.trim() || null,
        ...(!forEvent && { date }),
      };
      return expense
        ? financeApi.updateExpense(expense.id, body)
        : financeApi.createExpense({ ...body, ...(event && { eventId: event.id }) });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: financeKeys.all });
      toast.success(t(expense ? 'finance.toast.expenseUpdated' : 'finance.toast.expenseCreated'));
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const fieldError = (show: boolean, key: string) =>
    submitted &&
    show && (
      <p role="alert" className="text-xs font-medium text-destructive">
        {t(key)}
      </p>
    );

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            {t(expense ? 'finance.expenseForm.editTitle' : 'finance.expenseForm.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {forEvent
              ? t('finance.expenseForm.eventDescription', {
                  event: event?.label ?? `№ ${expense?.event?.number} · ${expense?.event?.title}`,
                })
              : t('finance.expenseForm.description')}
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
            if (valid) mutation.mutate();
          }}
        >
          <div className="grid content-start gap-2">
            <Label htmlFor="expense-category">{t('finance.expenseForm.category')}</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="expense-category" aria-invalid={submitted && categoryId === ''}>
                <SelectValue placeholder={t('finance.expenseForm.categoryPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {options.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldError(categoryId === '', 'validation.expenseCategory')}
          </div>

          <div className={forEvent ? 'grid gap-5' : 'grid gap-5 sm:grid-cols-2'}>
            <div className="grid content-start gap-2">
              <Label htmlFor="expense-amount">{t('finance.expenseForm.amount')}</Label>
              <MoneyInput
                id="expense-amount"
                value={amount}
                onChange={setAmount}
                aria-invalid={submitted && !amountValid}
              />
              {fieldError(!amountValid, 'validation.amount')}
            </div>
            {!forEvent && (
              <div className="grid content-start gap-2">
                <Label htmlFor="expense-date">{t('finance.expenseForm.date')}</Label>
                <Input
                  id="expense-date"
                  type="date"
                  className="tabular"
                  max={today}
                  value={date}
                  aria-invalid={submitted && !dateValid}
                  onChange={(event) => setDate(event.target.value)}
                />
                {fieldError(!dateValid, 'validation.expenseDate')}
              </div>
            )}
          </div>

          <div className="grid content-start gap-2">
            <Label htmlFor="expense-note">
              {t('finance.expenseForm.note')}{' '}
              <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
            </Label>
            <Textarea
              id="expense-note"
              rows={2}
              maxLength={500}
              value={note}
              placeholder={t('finance.expenseForm.notePlaceholder')}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
