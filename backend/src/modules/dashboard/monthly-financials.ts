import { EventStatus } from '@prisma/client';
import { addDays, localDate, startOfLocalDay, toDbDate } from '@/common/utils/app-date.util';
import { ZERO, moneyString } from '@/common/utils/money.util';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';

/** `today` (YYYY-MM-DD) tushgan oyning chegaralari: sana va lahza ko'rinishida. */
export function monthBounds(today: string, timeZone: string) {
  const monthFirst = `${today.slice(0, 7)}-01`;
  const nextMonthFirst = addDays(monthFirst, 32).slice(0, 7) + '-01';
  return {
    monthFirst,
    nextMonthFirst,
    monthStart: startOfLocalDay(monthFirst, timeZone),
    monthEnd: startOfLocalDay(nextMonthFirst, timeZone),
  };
}

/**
 * Joriy oy: shu oydagi to'ylar bo'yicha kutilayotgan summa, olingan pul va qarz;
 * xarajatlar va sof foyda. Bekor qilingan to'y kutilayotgan summaga kirmaydi, lekin
 * undan qolgan zaklad — haqiqatda olingan pul. Bosh sahifa va Telegram /hisobot uchun.
 */
export async function monthlyFinancials(prisma: PrismaService, timeZone: string) {
  const { monthFirst, nextMonthFirst, monthStart, monthEnd } = monthBounds(
    localDate(new Date(), timeZone),
    timeZone,
  );
  const [events, expenses] = await Promise.all([
    prisma.event.findMany({
      where: { deletedAt: null, startAt: { gte: monthStart, lt: monthEnd } },
      select: { status: true, totalAmount: true, paidAmount: true },
    }),
    prisma.expense.aggregate({
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
