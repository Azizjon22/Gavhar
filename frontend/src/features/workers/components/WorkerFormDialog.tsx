import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PhoneInput } from '@/components/shared/PhoneInput';
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
import { toApiError } from '@/lib/api-error';
import { errorMessage } from '@/lib/error-message';
import { workerKeys, workersApi } from '../api/workers.api';
import { WORKER_POSITIONS, type Worker, type WorkerPosition } from '../types/worker.types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Berilsa — tahrirlash. */
  worker?: Worker;
}

/** Ishchi: ism, telefon, lavozim va izoh. */
export function WorkerFormDialog({ open, onOpenChange, worker }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState<WorkerPosition>('WAITER_MALE');
  const [note, setNote] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFullName(worker?.fullName ?? '');
    setPhone(worker?.phone ?? '');
    setPosition(worker?.position ?? 'WAITER_MALE');
    setNote(worker?.note ?? '');
    setPhoneError(null);
    setSubmitted(false);
  }, [open, worker]);

  const nameValid = fullName.trim().length >= 2;
  const phoneValid = /^\+998\d{9}$/.test(phone);

  const mutation = useMutation({
    mutationFn: () => {
      const body = { fullName: fullName.trim(), phone, position, note: note.trim() || null };
      return worker ? workersApi.update(worker.id, body) : workersApi.create(body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workerKeys.all });
      toast.success(t(worker ? 'workers.toast.updated' : 'workers.toast.created'));
      onOpenChange(false);
    },
    onError: (error) => {
      if (toApiError(error).code === 'WORKER_PHONE_TAKEN') {
        setPhoneError(errorMessage(error));
        return;
      }
      toast.error(errorMessage(error));
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            {t(worker ? 'workers.form.editTitle' : 'workers.form.createTitle')}
          </DialogTitle>
          <DialogDescription>{t('workers.form.description')}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
            setPhoneError(null);
            if (nameValid && phoneValid) mutation.mutate();
          }}
        >
          <div className="grid content-start gap-2">
            <Label htmlFor="worker-name">{t('workers.form.fullName')}</Label>
            <Input
              id="worker-name"
              value={fullName}
              maxLength={100}
              aria-invalid={submitted && !nameValid}
              onChange={(event) => setFullName(event.target.value)}
            />
            {submitted && !nameValid && (
              <p role="alert" className="text-xs font-medium text-destructive">
                {t('validation.fullName')}
              </p>
            )}
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="worker-phone">{t('workers.form.phone')}</Label>
              <PhoneInput
                id="worker-phone"
                value={phone}
                onChange={setPhone}
                aria-invalid={(submitted && !phoneValid) || phoneError !== null}
              />
              {(phoneError ?? (submitted && !phoneValid)) && (
                <p role="alert" className="text-xs font-medium text-destructive">
                  {phoneError ?? t('validation.phoneIncomplete')}
                </p>
              )}
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="worker-position">{t('workers.form.position')}</Label>
              <Select
                value={position}
                onValueChange={(value) => setPosition(value as WorkerPosition)}
              >
                <SelectTrigger id="worker-position">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKER_POSITIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`workers.position.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="worker-note">
              {t('workers.form.note')}{' '}
              <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
            </Label>
            <Input
              id="worker-note"
              value={note}
              maxLength={300}
              placeholder={t('workers.form.notePlaceholder')}
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
              {t(worker ? 'common.save' : 'common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
