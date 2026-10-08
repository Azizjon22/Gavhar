import { Injectable } from '@nestjs/common';
import { EventStatus, Prisma } from '@prisma/client';
import { SYSTEM_ROLES } from '@/common/permissions/permission-catalog';
import { AuthUser } from '@/common/types/auth-user';
import { addDays, localDate, startOfLocalDay, toDbDate } from '@/common/utils/app-date.util';
import { ZERO, moneyString } from '@/common/utils/money.util';
import { quantityString } from '@/common/utils/quantity.util';
import { AppConfigService } from '@/config/app-config.service';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { PhotoService } from '@/infrastructure/storage/photo.service';
import { canSeeMoney } from '@/modules/events/event-money.interceptor';
import { ShoppingService } from '@/modules/shopping/shopping.service';

const WEEK_DAYS = 7;

const CARD_INCLUDE = {
  client: { select: { fullName: true } },
  hall: { select: { name: true } },
  workers: { include: { worker: true }, orderBy: { createdAt: 'asc' } },
  _count: { select: { shoppingLists: { where: { deletedAt: null } } } },
} satisfies Prisma.EventInclude;
type CardEvent = Prisma.EventGetPayload<{ include: typeof CARD_INCLUDE }>;

/**
 * Bosh sahifa: bugungi va ertangi to'ylar, haftalik ko'rinish va diqqat talab
 * qiladigan narsalar. Har bir blok faqat tegishli ruxsati bor foydalanuvchiga beriladi;
 * pul — faqat moliya ruxsati borlarga.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photos: PhotoService,
    private readonly config: AppConfigService,
    private readonly shopping: ShoppingService,
  ) {}

  async overview(actor: AuthUser) {
    const timeZone = this.config.app.timezone;
    const today = localDate(new Date(), timeZone);
    const dayStart = (offset: number) => startOfLocalDay(addDays(today, offset), timeZone);
    const monthFirst = `${today.slice(0, 7)}-01`;
    const nextMonthFirst = addDays(monthFirst, 32).slice(0, 7) + '-01';
    const monthStart = startOfLocalDay(monthFirst, timeZone);
    const monthEnd = startOfLocalDay(nextMonthFirst, timeZone);

    const live = { deletedAt: null, status: { not: EventStatus.CANCELLED } } as const;
    const has = (permission: string) =>
      actor.roleKey === SYSTEM_ROLES.SUPER_ADMIN || actor.permissions.includes(permission);
    const showMoney = canSeeMoney(actor);

    const [active, thisMonth, weekEvents] = await Promise.all([
      this.prisma.event.count({ where: { ...live, startAt: { gte: dayStart(0) } } }),
      this.prisma.event.count({ where: { ...live, startAt: { gte: monthStart, lt: monthEnd } } }),
      this.prisma.event.findMany({
        where: { ...live, startAt: { gte: dayStart(0), lt: dayStart(WEEK_DAYS) } },
        include: CARD_INCLUDE,
        orderBy: { startAt: 'asc' },
      }),
    ]);

    const onDay = (offset: number) => {
      const day = addDays(today, offset);
      return weekEvents.filter((event) => localDate(event.startAt, timeZone) === day);
    };
    const card = async (event: CardEvent) => ({
      id: event.id,
      number: event.number,
      title: event.title,
      type: event.type,
      status: event.status,
      startAt: event.startAt,
      endAt: event.endAt,
      guestCount: event.guestCount,
      tableCapacity: event.tableCapacity,
      clientName: event.client.fullName,
      hallName: event.hall.name,
      menuName: event.menuPackageName,
      firstDish: event.firstDish,
      secondDish: event.secondDish,
      workers: await Promise.all(
        event.workers.map(async ({ worker, roleAtEvent }) => ({
          id: worker.id,
          fullName: worker.fullName,
          position: worker.position,
          roleAtEvent,
          photo: await this.photos.urls(worker.photoKey, worker.photoThumbKey),
        })),
      ),
      shoppingListCount: event._count.shoppingLists,
      ...(showMoney && {
        totalAmount: moneyString(event.totalAmount),
        debt: moneyString(
          event.totalAmount.gt(event.paidAmount) ? event.totalAmount.sub(event.paidAmount) : ZERO,
        ),
      }),
    });

    const [todayEvents, tomorrowEvents, lowStock, pendingShopping, monthlyFinancials] =
      await Promise.all([
        Promise.all(onDay(0).map(card)),
        Promise.all(onDay(1).map(card)),
        has('warehouse:read') ? this.lowStock() : null,
        has('shopping:read') ? this.shopping.pending(actor) : null,
        showMoney ? this.monthlyFinancials(monthStart, monthEnd, monthFirst, nextMonthFirst) : null,
      ]);

    return {
      today,
      counts: {
        active,
        thisMonth,
        week: weekEvents.length,
        weekGuests: weekEvents.reduce((sum, event) => sum + event.guestCount, 0),
        today: todayEvents.length,
        tomorrow: tomorrowEvents.length,
      },
      todayEvents,
      tomorrowEvents,
      week: Array.from({ length: WEEK_DAYS }, (_, offset) => ({
        date: addDays(today, offset),
        events: onDay(offset).map((event) => ({
          id: event.id,
          title: event.title ?? event.client.fullName,
          startAt: event.startAt,
          guestCount: event.guestCount,
          status: event.status,
        })),
      })),
      lowStock,
      pendingShopping,
      monthlyFinancials,
    };
  }

  /** Qoldig'i belgilangan chegaraga tushgan mahsulotlar. */
  private async lowStock() {
    const items = await this.prisma.warehouseItem.findMany({
      where: { deletedAt: null, minQuantity: { gt: 0 } },
      orderBy: { name: 'asc' },
    });
    return items
      .filter((item) => item.quantity.lte(item.minQuantity))
      .map((item) => ({
        id: item.id,
        name: item.name,
        section: item.section,
        unit: item.unit,
        quantity: quantityString(item.quantity),
        minQuantity: quantityString(item.minQuantity),
      }));
  }

  /**
   * Joriy oy: shu oydagi to'ylar bo'yicha kutilayotgan summa, olingan pul va qarz;
   * xarajatlar va sof foyda. Bekor qilingan to'y kutilayotgan summaga kirmaydi, lekin
   * undan qolgan zaklad — haqiqatda olingan pul.
   */
  private async monthlyFinancials(
    monthStart: Date,
    monthEnd: Date,
    monthFirst: string,
    nextMonthFirst: string,
  ) {
    const [events, expenses] = await Promise.all([
      this.prisma.event.findMany({
        where: { deletedAt: null, startAt: { gte: monthStart, lt: monthEnd } },
        select: { status: true, totalAmount: true, paidAmount: true },
      }),
      this.prisma.expense.aggregate({
        where: {
          deletedAt: null,
          spentOn: { gte: toDbDate(monthFirst), lt: toDbDate(nextMonthFirst) },
        },
        _sum: { amount: true },
      }),
    ]);
    const liveEvents = events.filter((event) => event.status !== EventStatus.CANCELLED);
    const expected = liveEvents.reduce((sum, event) => sum.add(event.totalAmount), ZERO);
    const liveCollected = liveEvents.reduce((sum, event) => sum.add(event.paidAmount), ZERO);
    const collected = events.reduce((sum, event) => sum.add(event.paidAmount), ZERO);
    const spent = expenses._sum.amount ?? ZERO;
    return {
      eventCount: liveEvents.length,
      totalExpected: moneyString(expected),
      totalCollected: moneyString(collected),
      totalOutstanding: moneyString(expected.sub(liveCollected)),
      totalExpenses: moneyString(spent),
      netProfit: moneyString(collected.sub(spent)),
    };
  }
}
