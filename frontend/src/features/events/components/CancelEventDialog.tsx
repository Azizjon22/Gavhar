import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/error-message';
import { eventsApi } from '../api/events.api';
import type { EventDetail } from '../types/event.types';

interface Props {
  event: EventDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (event: EventDetail) => void;
}

export function CancelEventDialog({ event, open, onOpenChange, onDone }: Props) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => eventsApi.cancel(event.id, reason.trim()),
    onSuccess: (updated) => {
      toast.success(t('events.toast.cancelled'));
      onDone(updated);
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const valid = reason.trim().length >= 3;

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t('events.cancel.title')}</DialogTitle>
          <DialogDescription>
            {t(
              Number(event.paidAmount) > 0
                ? 'events.cancel.textWithPayments'
                : 'events.cancel.text',
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            if (valid) mutation.mutate();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="cancel-reason">{t('events.cancel.reason')}</Label>
            <Textarea
              id="cancel-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(changeEvent) => setReason(changeEvent.target.value)}
              placeholder={t('events.cancel.reasonPlaceholder')}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              {t('common.close')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              loading={mutation.isPending}
              disabled={!valid}
            >
              {t('events.actions.cancel')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
