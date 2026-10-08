import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/error-message';
import { bookingSettingsApi, eventKeys } from '../api/events.api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Bron qoidalari: tasdiqlash uchun minimal zaklad foizi. */
export function BookingSettingsDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [percent, setPercent] = useState('');

  const query = useQuery({
    queryKey: eventKeys.bookingSettings,
    queryFn: bookingSettingsApi.get,
    enabled: open,
  });
  useEffect(() => {
    if (open && query.data) setPercent(String(query.data.minDepositPercent));
  }, [open, query.data]);

  const mutation = useMutation({
    mutationFn: () => bookingSettingsApi.update({ minDepositPercent: Number(percent) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: eventKeys.bookingSettings });
      await queryClient.invalidateQueries({ queryKey: eventKeys.all });
      toast.success(t('events.settings.saved'));
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const valid = /^(100|[1-9]?\d)$/.test(percent);

  return (
    <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t('events.settings.title')}</DialogTitle>
          <DialogDescription>{t('events.settings.description')}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) mutation.mutate();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="min-deposit">{t('events.settings.minDeposit')}</Label>
            <div className="relative max-w-36">
              <Input
                id="min-deposit"
                inputMode="numeric"
                maxLength={3}
                value={percent}
                disabled={query.isLoading}
                aria-invalid={percent !== '' && !valid}
                onChange={(event) => setPercent(event.target.value.replace(/\D/g, ''))}
                className="tabular pr-9"
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('events.settings.hint')}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={!valid}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
