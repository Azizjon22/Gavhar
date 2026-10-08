import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { STATUS_VARIANT } from '../lib/status';
import type { EventStatus } from '../types/event.types';

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const { t } = useTranslation();
  return <Badge variant={STATUS_VARIANT[status]}>{t(`events.status.${status}`)}</Badge>;
}
