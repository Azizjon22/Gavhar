import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, UserRoundPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { MoneyInput } from '@/components/shared/MoneyInput';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ClientFormDialog } from '@/features/clients/components/ClientFormDialog';
import {
  extraServiceKeys,
  extraServicesApi,
} from '@/features/extra-services/api/extra-services.api';
import type { ExtraServiceUnit } from '@/features/extra-services/types/extra-service.types';
import { hallKeys, hallsApi } from '@/features/halls/api/halls.api';
import { menuApi, menuKeys } from '@/features/menu/api/menu.api';
import { usePermissions } from '@/hooks/use-permissions';
import { toApiError } from '@/lib/api-error';
import { errorMessage } from '@/lib/error-message';
import { formatDateTime, formatTime, inAppZone, zonedIso } from '@/lib/format';
import { amountToInput, formatAmount } from '@/lib/money';
import { cn } from '@/lib/utils';
import { bookingSettingsApi, eventKeys, eventsApi } from '../api/events.api';
import { previewPricing, toSum } from '../lib/pricing';
import { EVENT_TYPES, type EventDetail, TABLE_CAPACITIES } from '../types/event.types';
import { ClientCombobox, type ClientOption } from './ClientCombobox';

const AMOUNT = /^(0|[1-9]\d{0,12})$/;
/** Radix Select bo'sh qiymatni qabul qilmaydi — "paketsiz" uchun belgi. */
const NO_PACKAGE = 'none';

const schema = z
  .object({
    clientId: z.string().min(1, 'validation.clientRequired'),
    hallId: z.string().min(1, 'validation.hallRequired'),
    type: z.enum(EVENT_TYPES),
    title: z.string().trim().max(120, 'validation.titleMax'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.dateRequired'),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'validation.timeRequired'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'validation.timeRequired'),
    guestCount: z.string().regex(/^[1-9]\d{0,4}$/, 'validation.guestCount'),
    /** Bo'sh satr — paket tanlanmagan. */
    menuPackageId: z.string(),
    /** Bo'sh satr — stol turi ko'rsatilmagan. */
    tableCapacity: z.enum(['', '10', '12']),
    firstDish: z.string().trim().max(120, 'validation.titleMax'),
    secondDish: z.string().trim().max(120, 'validation.titleMax'),
    pricePerGuest: z.string().regex(AMOUNT, 'validation.amount'),
    discount: z.string().refine((value) => value === '' || AMOUNT.test(value), 'validation.amount'),
    note: z.string().trim().max(2000, 'validation.noteMax'),
    /** Tanlangan xizmatlar: ID → soni. */
    services: z.record(z.string(), z.number().int().min(1).max(1000)),
  })
  .refine((values) => values.startTime !== values.endTime, {
    path: ['endTime'],
    message: 'validation.timeRange',
  });
type Values = z.infer<typeof schema>;

interface ServiceOption {
  id: string;
  name: string;
  unit: ExtraServiceUnit;
  price: number;
}

interface BusyInfo {
  number?: number;
  clientName?: string;
  startAt?: string;
  endAt?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Berilsa — tahrirlash. */
  event?: EventDetail;
  /** Yangi bron uchun boshlang'ich sana (kalendardan), `YYYY-MM-DD`. */
  defaultDate?: string;
  onSaved: (event: EventDetail) => void;
}

const emptyValues = (date: string): Values => ({
  clientId: '',
  hallId: '',
  type: 'WEDDING',
  title: '',
  date,
  startTime: '18:00',
  endTime: '23:00',
  guestCount: '',
  menuPackageId: '',
  tableCapacity: '',
  firstDish: '',
  secondDish: '',
  pricePerGuest: '',
  discount: '',
  note: '',
  services: {},
});

export function EventFormDialog({ open, onOpenChange, event, defaultDate, onSaved }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { can, isSuperAdmin } = usePermissions();
  const isEdit = event !== undefined;
  const scheduleLocked = event?.status === 'HELD';
  // Pulni ko'rmaydigan rol narx va chegirma kiritmaydi: narx tanlangan menyu paketidan olinadi.
  const showMoney = can('finance:read');
  // Pulni ko'rmaydigan xodim narxni qo'lda kirita olmaydi — unga paket tanlash majburiy.
  // Istisno: bronning eski paketi katalogdan o'chirilgan bo'lsa, u shu holicha qoladi.
  const allowNoPackage = showMoney || Boolean(event?.menuPackage && !event.menuPackage.id);

  const [client, setClient] = useState<ClientOption | null>(null);
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [busy, setBusy] = useState<BusyInfo | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues(''),
  });

  useEffect(() => {
    if (!open) return;
    setBusy(null);
    setClient(event?.client ?? null);
    form.reset(
      event
        ? {
            clientId: event.client.id,
            hallId: event.hall.id,
            type: event.type,
            title: event.title ?? '',
            date: inAppZone(event.startAt).format('YYYY-MM-DD'),
            startTime: formatTime(event.startAt),
            endTime: formatTime(event.endAt),
            guestCount: String(event.guestCount),
            menuPackageId: event.menuPackage?.id ?? '',
            tableCapacity:
              event.tableCapacity === 10 ? '10' : event.tableCapacity === 12 ? '12' : '',
            firstDish: event.firstDish ?? '',
            secondDish: event.secondDish ?? '',
            pricePerGuest: event.pricePerGuest ? amountToInput(event.pricePerGuest) : '0',
            discount:
              event.discount && toSum(event.discount) > 0 ? amountToInput(event.discount) : '',
            note: event.note ?? '',
            services: Object.fromEntries(
              event.services.map((service) => [service.extraServiceId, service.quantity]),
            ),
          }
        : emptyValues(defaultDate ?? inAppZone().add(1, 'day').format('YYYY-MM-DD')),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id]);

  const hallsQuery = useQuery({ queryKey: hallKeys.list, queryFn: hallsApi.list, enabled: open });
  const servicesQuery = useQuery({
    queryKey: extraServiceKeys.list,
    queryFn: extraServicesApi.list,
    enabled: open,
  });
  const settingsQuery = useQuery({
    queryKey: eventKeys.bookingSettings,
    queryFn: bookingSettingsApi.get,
    enabled: open,
  });
  const packagesQuery = useQuery({
    queryKey: menuKeys.packages,
    queryFn: menuApi.packages,
    enabled: open && can('menu:read'),
  });

  // Faol paketlar; bronga avval biriktirilgan paket faol bo'lmasa ham ro'yxatda qoladi.
  const packageOptions = useMemo(() => {
    const active = (packagesQuery.data ?? []).filter((pkg) => pkg.isActive);
    const current = event?.menuPackage;
    if (current?.id && !active.some((pkg) => pkg.id === current.id)) {
      return [{ id: current.id, name: current.name, pricePerGuest: null }, ...active];
    }
    return active;
  }, [event?.menuPackage, packagesQuery.data]);

  // Bronga avval qo'shilgan xizmat o'sha paytdagi narxida ko'rsatiladi (katalogdan
  // o'chirilgan bo'lsa ham); qolganlari — katalogdagi faol xizmatlar.
  const serviceOptions = useMemo<ServiceOption[]>(() => {
    const attached = new Map(
      (event?.services ?? []).map((line) => [
        line.extraServiceId,
        { id: line.extraServiceId, name: line.name, unit: line.unit, price: toSum(line.unitPrice) },
      ]),
    );
    const catalog = (servicesQuery.data ?? [])
      .filter((service) => service.isActive && !attached.has(service.id))
      .map((service) => ({
        id: service.id,
        name: service.name,
        unit: service.unit,
        price: toSum(service.price),
      }));
    return [...attached.values(), ...catalog];
  }, [event?.services, servicesQuery.data]);

  const values = form.watch();
  const halls = hallsQuery.data ?? [];
  const selectedHall = halls.find((hall) => hall.id === values.hallId);
  const guestCount = Number(values.guestCount) || 0;
  const overCapacity = selectedHall !== undefined && guestCount > selectedHall.capacity;
  const endsNextDay = values.endTime !== '' && values.endTime < values.startTime;

  const preview = previewPricing({
    guestCount,
    pricePerGuest: toSum(values.pricePerGuest),
    discount: toSum(values.discount),
    services: serviceOptions
      .filter((option) => values.services[option.id] !== undefined)
      .map((option) => ({
        unit: option.unit,
        unitPrice: option.price,
        quantity: values.services[option.id] ?? 1,
      })),
    depositPercent: settingsQuery.data?.minDepositPercent ?? 0,
  });

  const mutation = useMutation({
    mutationFn: (data: Values) => {
      const endDate =
        data.endTime < data.startTime
          ? inAppZone(zonedIso(data.date, '12:00')).add(1, 'day').format('YYYY-MM-DD')
          : data.date;
      const payload = {
        clientId: data.clientId,
        hallId: data.hallId,
        type: data.type,
        title: data.title || null,
        startAt: zonedIso(data.date, data.startTime),
        endAt: zonedIso(endDate, data.endTime),
        guestCount: Number(data.guestCount),
        ...(showMoney && { pricePerGuest: data.pricePerGuest, discount: data.discount || '0' }),
        menuPackageId: data.menuPackageId || null,
        tableCapacity: data.tableCapacity ? Number(data.tableCapacity) : null,
        // 1- va 2-ovqatni faqat super admin belgilaydi — boshqalar bu maydonlarni yubormaydi.
        ...(isSuperAdmin && {
          firstDish: data.firstDish || null,
          secondDish: data.secondDish || null,
        }),
        services: Object.entries(data.services).map(([extraServiceId, quantity]) => ({
          extraServiceId,
          quantity,
        })),
        note: data.note || null,
      };
      return event ? eventsApi.update(event.id, payload) : eventsApi.create(payload);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: eventKeys.all });
      toast.success(t(isEdit ? 'events.toast.updated' : 'events.toast.created'));
      onSaved(saved);
      onOpenChange(false);
    },
    onError: (error) => {
      const apiError = toApiError(error);
      if (apiError.code === 'HALL_BUSY') {
        setBusy((apiError.details as BusyInfo | undefined) ?? {});
        return;
      }
      if (apiError.code === 'GUEST_COUNT_EXCEEDS_CAPACITY') {
        form.setError('guestCount', { message: errorMessage(error) }, { shouldFocus: true });
        return;
      }
      toast.error(errorMessage(error));
    },
  });

  const optional = (
    <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
  );
  const summaryRow = (label: string, amount: number, strong = false) => (
    <div className={strong ? 'flex justify-between gap-3 font-bold' : 'flex justify-between gap-3'}>
      <dt className={strong ? '' : 'text-muted-foreground'}>{label}</dt>
      <dd className="tabular whitespace-nowrap">{formatAmount(amount)}</dd>
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>
              {isEdit
                ? t('events.form.editTitle', { number: event.number })
                : t('events.form.createTitle')}
            </DialogTitle>
            <DialogDescription>
              {t(showMoney ? 'events.form.description' : 'events.form.descriptionByPackage')}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((formValues) => {
                setBusy(null);
                if (!showMoney && !formValues.menuPackageId && !event?.menuPackage) {
                  form.setError('menuPackageId', { message: 'validation.menuPackageRequired' });
                  return;
                }
                mutation.mutate(formValues);
              })}
              className={showMoney ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]' : 'grid gap-6'}
              noValidate
            >
              <div className="grid content-start gap-5">
                <FormField
                  control={form.control}
                  name="clientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('events.form.client')}</FormLabel>
                      <div className="flex gap-2">
                        <div className="min-w-0 flex-1">
                          <FormControl>
                            <ClientCombobox
                              value={client}
                              onChange={(selected) => {
                                setClient(selected);
                                field.onChange(selected.id);
                              }}
                            />
                          </FormControl>
                        </div>
                        {can('clients:create') && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                aria-label={t('clients.new')}
                                onClick={() => setClientDialogOpen(true)}
                              >
                                <UserRoundPlus />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('clients.new')}</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('events.form.type')}</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger ref={field.ref} onBlur={field.onBlur}>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {EVENT_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {t(`events.type.${type}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t('events.form.title')} {optional}
                        </FormLabel>
                        <FormControl>
                          <Input placeholder={t('events.form.titlePlaceholder')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="hallId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('events.form.hall')}</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={scheduleLocked}
                        >
                          <FormControl>
                            <SelectTrigger ref={field.ref} onBlur={field.onBlur}>
                              <SelectValue placeholder={t('events.form.hallPlaceholder')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {halls
                              .filter(
                                (hall) => hall.status === 'ACTIVE' || hall.id === event?.hall.id,
                              )
                              .map((hall) => (
                                <SelectItem key={hall.id} value={hall.id}>
                                  {hall.name} · {t('halls.guests', { count: hall.capacity })}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="guestCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('events.form.guestCount')}</FormLabel>
                        <FormControl>
                          <Input
                            inputMode="numeric"
                            maxLength={5}
                            placeholder="300"
                            className="tabular"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ''))}
                          />
                        </FormControl>
                        {overCapacity && (
                          <p className="text-xs font-medium text-warning">
                            {t('events.form.overCapacity', { capacity: selectedHall.capacity })}
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-5 sm:grid-cols-[minmax(0,1.3fr)_1fr_1fr]">
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('events.form.date')}</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            className="tabular"
                            disabled={scheduleLocked}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('events.form.startTime')}</FormLabel>
                        <FormControl>
                          <Input
                            type="time"
                            className="tabular"
                            disabled={scheduleLocked}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="endTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('events.form.endTime')}</FormLabel>
                        <FormControl>
                          <Input
                            type="time"
                            className="tabular"
                            disabled={scheduleLocked}
                            {...field}
                          />
                        </FormControl>
                        {endsNextDay && (
                          <p className="text-xs text-muted-foreground">
                            {t('events.form.nextDay')}
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {busy && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive"
                  >
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    <span>
                      {busy.number
                        ? t('events.form.hallBusyDetails', {
                            number: busy.number,
                            client: busy.clientName,
                            from: formatDateTime(busy.startAt),
                            to: formatTime(busy.endAt),
                          })
                        : t('errors.codes.HALL_BUSY')}
                    </span>
                  </div>
                )}

                {(packageOptions.length > 0 || event?.menuPackage || !showMoney) && (
                  <FormField
                    control={form.control}
                    name="menuPackageId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t('events.form.menuPackage')} {showMoney && optional}
                        </FormLabel>
                        <Select
                          value={field.value || (allowNoPackage ? NO_PACKAGE : '')}
                          onValueChange={(value) => {
                            const selected = packageOptions.find((pkg) => pkg.id === value);
                            field.onChange(selected?.id ?? '');
                            if (selected?.pricePerGuest) {
                              form.setValue(
                                'pricePerGuest',
                                amountToInput(selected.pricePerGuest),
                                {
                                  shouldValidate: true,
                                  shouldDirty: true,
                                },
                              );
                            }
                          }}
                        >
                          <FormControl>
                            <SelectTrigger ref={field.ref} onBlur={field.onBlur}>
                              <SelectValue placeholder={t('events.form.menuPackagePlaceholder')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {allowNoPackage && (
                              <SelectItem value={NO_PACKAGE}>
                                {event?.menuPackage && !event.menuPackage.id
                                  ? event.menuPackage.name
                                  : t('events.form.noMenuPackage')}
                              </SelectItem>
                            )}
                            {packageOptions.map((pkg) => (
                              <SelectItem key={pkg.id} value={pkg.id}>
                                {pkg.name}
                                {showMoney &&
                                  pkg.pricePerGuest &&
                                  ` · ${formatAmount(pkg.pricePerGuest)} ${t('common.currency')}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {showMoney && (
                          <p className="text-xs text-muted-foreground">
                            {t('events.form.menuPackageHint')}
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="grid gap-5 sm:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="tableCapacity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('events.form.tableCapacity')}</FormLabel>
                        <Select
                          value={field.value || NO_PACKAGE}
                          onValueChange={(value) =>
                            field.onChange(value === NO_PACKAGE ? '' : value)
                          }
                        >
                          <FormControl>
                            <SelectTrigger ref={field.ref} onBlur={field.onBlur}>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={NO_PACKAGE}>{t('events.form.tableAny')}</SelectItem>
                            {TABLE_CAPACITIES.map((seats) => (
                              <SelectItem key={seats} value={String(seats)}>
                                {t('events.tableSeats', { count: seats })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {(['firstDish', 'secondDish'] as const).map((name) => (
                    <FormField
                      key={name}
                      control={form.control}
                      name={name}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t(
                              name === 'firstDish'
                                ? 'events.form.firstDish'
                                : 'events.form.secondDish',
                            )}
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder={t('events.form.dishPlaceholder')}
                              disabled={!isSuperAdmin}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
                {!isSuperAdmin && (
                  <p className="-mt-3 text-xs text-muted-foreground">{t('events.form.dishHint')}</p>
                )}

                {showMoney && (
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="pricePerGuest"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('events.form.pricePerGuest')}</FormLabel>
                          <FormControl>
                            <MoneyInput {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="discount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t('events.form.discount')} {optional}
                          </FormLabel>
                          <FormControl>
                            <MoneyInput {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="services"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel asChild>
                        <p>{t('events.form.services')}</p>
                      </FormLabel>
                      {serviceOptions.length === 0 ? (
                        <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
                          {t('events.form.noServices')}
                        </p>
                      ) : (
                        <ul className="grid gap-1 rounded-xl border p-1.5">
                          {serviceOptions.map((option) => {
                            const quantity = field.value[option.id];
                            const selected = quantity !== undefined;
                            const setQuantity = (next: number | undefined) => {
                              const { [option.id]: _removed, ...rest } = field.value;
                              field.onChange(
                                next === undefined ? rest : { ...rest, [option.id]: next },
                              );
                            };
                            return (
                              <li
                                key={option.id}
                                className="flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-muted/50"
                              >
                                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-sm">
                                  <Checkbox
                                    checked={selected}
                                    onCheckedChange={(checked) =>
                                      setQuantity(checked === true ? 1 : undefined)
                                    }
                                  />
                                  <span className="min-w-0">
                                    <span className="block truncate font-medium">
                                      {option.name}
                                    </span>
                                    <span className="tabular block text-xs text-muted-foreground">
                                      {showMoney &&
                                        `${formatAmount(option.price)} ${t('common.currency')} · `}
                                      {t(`services.unit.${option.unit}`)}
                                    </span>
                                  </span>
                                </label>
                                {selected && (
                                  <Input
                                    inputMode="numeric"
                                    aria-label={t('events.form.quantity', { name: option.name })}
                                    value={String(quantity)}
                                    onChange={(e) => {
                                      const next = Number(
                                        e.target.value.replace(/\D/g, '').slice(0, 4),
                                      );
                                      setQuantity(Math.max(1, Math.min(1000, next || 1)));
                                    }}
                                    className="tabular h-8 w-16 text-center"
                                  />
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="note"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('events.form.note')} {optional}
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          rows={2}
                          placeholder={t('events.form.notePlaceholder')}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <aside className={cn('grid content-start gap-4', showMoney && 'lg:sticky lg:top-0')}>
                {showMoney && (
                  <div className="rounded-2xl border bg-muted/40 p-5">
                    <p className="text-xs font-bold tracking-[0.16em] text-muted-foreground uppercase">
                      {t('events.summary.title')}
                    </p>
                    <dl className="mt-4 grid gap-2.5 text-sm">
                      {summaryRow(
                        t('events.summary.guests', {
                          count: guestCount,
                          price: formatAmount(toSum(values.pricePerGuest)),
                        }),
                        preview.guestsTotal,
                      )}
                      {preview.extrasTotal > 0 &&
                        summaryRow(t('events.summary.extras'), preview.extrasTotal)}
                      {toSum(values.discount) > 0 &&
                        summaryRow(t('events.summary.discount'), -toSum(values.discount))}
                      <div className="my-1 h-px bg-border" />
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="font-semibold">{t('events.summary.total')}</dt>
                        <dd className="tabular font-display text-2xl font-semibold whitespace-nowrap text-gold-dark dark:text-gold-light">
                          {formatAmount(preview.total)}
                        </dd>
                      </div>
                      <p className="text-right text-xs text-muted-foreground">
                        {t('common.currency')}
                      </p>
                    </dl>
                  </div>
                )}
                {showMoney && !isEdit && preview.deposit > 0 && (
                  <p className="rounded-xl border border-gold/40 bg-gold/10 p-3.5 text-xs leading-relaxed">
                    {t('events.summary.depositHint', {
                      amount: formatAmount(preview.deposit),
                      percent: settingsQuery.data?.minDepositPercent,
                    })}
                  </p>
                )}
                <DialogFooter className="lg:flex-col-reverse lg:[&>button]:w-full">
                  <Button
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={mutation.isPending}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" loading={mutation.isPending}>
                    {t(isEdit ? 'common.save' : 'events.form.submit')}
                  </Button>
                </DialogFooter>
              </aside>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <ClientFormDialog
        open={clientDialogOpen}
        onOpenChange={setClientDialogOpen}
        onSaved={(created) => {
          setClient({ id: created.id, fullName: created.fullName, phone: created.phone });
          form.setValue('clientId', created.id, { shouldValidate: true });
        }}
      />
    </>
  );
}
