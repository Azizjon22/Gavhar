import { Injectable } from '@nestjs/common';
import { EventStatus, ExpenseCategory, Prisma, ShoppingListStatus } from '@prisma/client';
import { Paginated } from '@/common/dto/pagination.dto';
import { AppException } from '@/common/errors/app.exception';
import { AuthUser } from '@/common/types/auth-user';
import {
  addDays,
  diffDays,
  fromDbDate,
  isValidDate,
  localDate,
  startOfLocalDay,
  toDbDate,
} from '@/common/utils/app-date.util';
import { ZERO, money, moneyString } from '@/common/utils/money.util';
import { AppConfigService } from '@/config/app-config.service';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { auditDiff } from '@/modules/audit/audit-sanitizer';
import { AuditService } from '@/modules/audit/audit.service';
import {
  CreateExpenseDto,
  ExpenseCategoryDto,
  ListExpensesQueryDto,
  SummaryQueryDto,
  UpdateExpenseDto,
} from './dto/finance.dto';
import { DatedAmount, buildSeries, sumAmounts } from './finance-summary';

/** Kunlik grafik uchun eng uzun davr; undan uzunida oylar bo'yicha so'raladi. */
const MAX_DAILY_SPAN = 62;
const MAX_SPAN = 366;
/** Javobda qaytariladigan tadbirlar ro'yxati chegarasi (jami summalar to'liq hisoblanadi). */
const EVENTS_PREVIEW = 100;

const EXPENSE_INCLUDE = {
  category: true,
  event: {
    select: { id: true, number: true, title: true, client: { select: { fullName: true } } },
  },
} satisfies Prisma.ExpenseInclude;

type ExpenseRecord = Prisma.ExpenseGetPayload<{ include: typeof EXPENSE_INCLUDE }>;

const categoryView = (category: ExpenseCategory) => ({
  id: category.id,
  name: category.name,
  /** Tizim kategoriyasi — o'chirib bo'lmaydi. */
  isSystem: category.code !== null,
});

const expenseView = (expense: ExpenseRecord) => ({
  id: expense.id,
  category: { id: expense.category.id, name: expense.category.name },
  amount: moneyString(expense.amount),
  date: fromDbDate(expense.spentOn),
  note: expense.note,
  /** To'y xarajati bo'lsa — qaysi to'yniki. */
  event: expense.event
    ? {
        id: expense.event.id,
        number: expense.event.number,
        title: expense.event.title ?? expense.event.client.fullName,
      }
    : null,
  /** Tasdiqlangan bozorlikdan yozilgan — faqat Bozorlik bo'limida o'zgartiriladi. */
  fromShopping: expense.shoppingListId !== null,
  createdByName: expense.createdByName,
  createdAt: expense.createdAt,
});

const auditFields = (expense: ExpenseRecord) => ({
  category: expense.category.name,
  event: expense.event?.number ?? null,
  amount: moneyString(expense.amount),
  date: fromDbDate(expense.spentOn),
  note: expense.note,
});

const expenseNotFound = () => AppException.notFound('EXPENSE_NOT_FOUND', 'Xarajat topilmadi');
const categoryNotFound = () =>
  AppException.notFound('EXPENSE_CATEGORY_NOT_FOUND', 'Xarajat turi topilmadi');

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
  ) {}

  private get timeZone(): string {
    return this.config.app.timezone;
  }

  // ── Hisobot ──────────────────────────────────────────────────────────────

  /**
   * Davr bo'yicha hisob-kitob. Qoida: faqat bo'lib o'tgan narsa hisoblanadi.
   *  - tushum — kuni kelgan tadbirlar uchun olingan pul, tadbir kuniga yoziladi.
   *    "Kuni kelgan" kalendar kuni bo'yicha: bugun soat 18:00 dagi to'y bugun
   *    boshlanishi bilan hisobga kiradi. Kelajakdagi bronlar zakladi kirmaydi,
   *    chunki bron bekor bo'lishi mumkin;
   *  - bekor qilingan brondan qaytarilmagan zaklad ham haqiqiy pul — u ham o'sha
   *    to'y kuniga yoziladi;
   *  - to'y xarajati (kamerachi, bozorlik…) to'y kuniga, umumiy xarajat o'z kuniga;
   *  - xarajat — bugungacha yozilgan xarajatlar; bozorlik faqat SUPER_ADMIN
   *    tasdiqlagach xarajatga aylanadi (tasdiqlanmagani `pendingShopping` da);
   *  - sof foyda = tushum − xarajat.
   */
  async summary(query: SummaryQueryDto) {
    this.assertRange(query.from, query.to);
    const span = diffDays(query.from, query.to) + 1;
    if (span > MAX_SPAN || (query.groupBy === 'day' && span > MAX_DAILY_SPAN)) {
      throw AppException.badRequest('INVALID_DATE_RANGE', 'Davr juda uzun');
    }

    const now = new Date();
    const today = localDate(now, this.timeZone);
    const start = startOfLocalDay(query.from, this.timeZone);
    const periodEnd = startOfLocalDay(addDays(query.to, 1), this.timeZone);
    // Davr bugundan keyin tugasa ham, hisob bugungi kun bilan to'xtaydi.
    const tomorrow = startOfLocalDay(addDays(today, 1), this.timeZone);
    const end = periodEnd.getTime() > tomorrow.getTime() ? tomorrow : periodEnd;
    const lastDay = query.to > today ? today : query.to;
    const hasPast = query.from <= today;

    const [held, cancelled, expenses, upcoming, pendingLists, pendingSum] = await Promise.all([
      hasPast
        ? this.prisma.event.findMany({
            where: {
              deletedAt: null,
              status: { not: EventStatus.CANCELLED },
              startAt: { gte: start, lt: end },
            },
            orderBy: { startAt: 'desc' },
            select: {
              id: true,
              number: true,
              title: true,
              type: true,
              status: true,
              startAt: true,
              guestCount: true,
              totalAmount: true,
              paidAmount: true,
              client: { select: { fullName: true } },
              hall: { select: { name: true } },
            },
          })
        : [],
      hasPast
        ? this.prisma.event.findMany({
            where: {
              deletedAt: null,
              status: EventStatus.CANCELLED,
              paidAmount: { gt: 0 },
              startAt: { gte: start, lt: end },
            },
            select: { startAt: true, paidAmount: true },
          })
        : [],
      hasPast
        ? this.prisma.expense.findMany({
            where: {
              deletedAt: null,
              spentOn: { gte: toDbDate(query.from), lte: toDbDate(lastDay) },
            },
            select: {
              amount: true,
              spentOn: true,
              eventId: true,
              category: { select: { id: true, name: true } },
            },
          })
        : [],
      this.prisma.event.aggregate({
        where: {
          deletedAt: null,
          status: { not: EventStatus.CANCELLED },
          startAt: { gte: tomorrow },
        },
        _count: true,
        _sum: { totalAmount: true, paidAmount: true },
      }),
      this.prisma.shoppingList.count({
        where: { deletedAt: null, status: ShoppingListStatus.PURCHASED },
      }),
      this.prisma.shoppingItem.aggregate({
        where: { skipped: false, list: { deletedAt: null, status: ShoppingListStatus.PURCHASED } },
        _sum: { price: true },
      }),
    ]);

    const heldIncome: DatedAmount[] = held.map((event) => ({
      day: localDate(event.startAt, this.timeZone),
      amount: event.paidAmount,
    }));
    const retained: DatedAmount[] = cancelled.map((event) => ({
      day: localDate(event.startAt, this.timeZone),
      amount: event.paidAmount,
    }));
    const spent: DatedAmount[] = expenses.map((expense) => ({
      day: fromDbDate(expense.spentOn),
      amount: expense.amount,
    }));

    const eventsIncome = sumAmounts(heldIncome);
    const retainedDeposits = sumAmounts(retained);
    const income = eventsIncome.add(retainedDeposits);
    const expensesTotal = sumAmounts(spent);
    const accrued = held.reduce((sum, event) => sum.add(event.totalAmount), ZERO);
    const debt = held.reduce((sum, event) => {
      const rest = event.totalAmount.sub(event.paidAmount);
      return rest.gt(ZERO) ? sum.add(rest) : sum;
    }, ZERO);

    // Har bir to'yning o'z xarajatlari — sof foydasini ko'rsatish uchun.
    const spentByEvent = new Map<string, Prisma.Decimal>();
    for (const expense of expenses) {
      if (!expense.eventId) continue;
      spentByEvent.set(
        expense.eventId,
        (spentByEvent.get(expense.eventId) ?? ZERO).add(expense.amount),
      );
    }

    const byCategory = new Map<string, { id: string; name: string; amount: Prisma.Decimal }>();
    for (const expense of expenses) {
      const entry = byCategory.get(expense.category.id) ?? { ...expense.category, amount: ZERO };
      entry.amount = entry.amount.add(expense.amount);
      byCategory.set(expense.category.id, entry);
    }

    return {
      range: { from: query.from, to: query.to, countedUntil: hasPast ? lastDay : null },
      totals: {
        income: moneyString(income),
        eventsIncome: moneyString(eventsIncome),
        retainedDeposits: moneyString(retainedDeposits),
        expenses: moneyString(expensesTotal),
        profit: moneyString(income.sub(expensesTotal)),
        /** O'tkazilgan tadbirlarning shartnoma summasi va ulardan hali olinmagan qism. */
        accrued: moneyString(accrued),
        debt: moneyString(debt),
        eventsCount: held.length,
        guestsCount: held.reduce((sum, event) => sum + event.guestCount, 0),
      },
      /** Hali bo'lmagan tadbirlar — hisobga kirmaydi, faqat ma'lumot uchun. */
      upcoming: {
        count: upcoming._count,
        total: moneyString(upcoming._sum.totalAmount ?? ZERO),
        paid: moneyString(upcoming._sum.paidAmount ?? ZERO),
      },
      /** Sotib olingan, lekin hali tasdiqlanmagan bozorlik — foydadan ayirilmagan. */
      pendingShopping: { count: pendingLists, total: moneyString(pendingSum._sum.price ?? ZERO) },
      series: buildSeries(query.from, query.to, query.groupBy, [...heldIncome, ...retained], spent),
      expensesByCategory: [...byCategory.values()]
        .sort((a, b) => b.amount.cmp(a.amount))
        .map((entry) => ({ id: entry.id, name: entry.name, amount: moneyString(entry.amount) })),
      events: held.slice(0, EVENTS_PREVIEW).map((event) => {
        const rest = event.totalAmount.sub(event.paidAmount);
        const spentOnEvent = spentByEvent.get(event.id) ?? ZERO;
        return {
          id: event.id,
          number: event.number,
          title: event.title,
          type: event.type,
          status: event.status,
          startAt: event.startAt,
          guestCount: event.guestCount,
          clientName: event.client.fullName,
          hallName: event.hall.name,
          totalAmount: moneyString(event.totalAmount),
          paidAmount: moneyString(event.paidAmount),
          debt: moneyString(rest.gt(ZERO) ? rest : ZERO),
          /** Shu to'yga qilingan xarajatlar va sof foyda (olingan − xarajat). */
          expenses: moneyString(spentOnEvent),
          netProfit: moneyString(event.paidAmount.sub(spentOnEvent)),
        };
      }),
    };
  }

  /**
   * Bitta to'yning hisobi: olingan pul, shu to'yga qilingan xarajatlar va sof foyda
   * (olingan pul − xarajatlar). Bekor qilingan to'yda ham haqiqatda harakat qilgan
   * pul ko'rinadi: qaytarilmagan zaklad va to'langan xarajatlar.
   */
  async eventFinance(eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: { id: true, totalAmount: true, paidAmount: true },
    });
    if (!event) throw AppException.notFound('EVENT_NOT_FOUND', 'Bron topilmadi');

    const expenses = await this.prisma.expense.findMany({
      where: { eventId, deletedAt: null },
      include: EXPENSE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    const expensesTotal = expenses.reduce((sum, expense) => sum.add(expense.amount), ZERO);
    return {
      eventId,
      totalAmount: moneyString(event.totalAmount),
      paidAmount: moneyString(event.paidAmount),
      expensesTotal: moneyString(expensesTotal),
      netProfit: moneyString(event.paidAmount.sub(expensesTotal)),
      expenses: expenses.map(expenseView),
    };
  }

  // ── Xarajatlar ───────────────────────────────────────────────────────────

  async listExpenses(query: ListExpensesQueryDto) {
    if (query.from && query.to) this.assertRange(query.from, query.to);
    const where: Prisma.ExpenseWhereInput = {
      deletedAt: null,
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.eventId && { eventId: query.eventId }),
      ...((query.from || query.to) && {
        spentOn: {
          ...(query.from && { gte: this.parseDate(query.from) }),
          ...(query.to && { lte: this.parseDate(query.to) }),
        },
      }),
      ...(query.search && { note: { contains: query.search, mode: 'insensitive' } }),
    };

    const [items, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: EXPENSE_INCLUDE,
        orderBy: [{ spentOn: 'desc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.expense.count({ where }),
    ]);
    return Paginated.of(items.map(expenseView), total, query);
  }

  async createExpense(dto: CreateExpenseDto, actor: AuthUser) {
    const amount = this.parseAmount(dto.amount);
    const spentOn = dto.eventId
      ? await this.eventDay(dto.eventId)
      : this.parseSpendDate(this.requireDate(dto.date));
    await this.findCategory(dto.categoryId);

    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          categoryId: dto.categoryId,
          amount,
          spentOn,
          eventId: dto.eventId ?? null,
          note: dto.note || null,
          createdById: actor.id,
          createdByName: actor.fullName,
        },
        include: EXPENSE_INCLUDE,
      });
      await this.audit.log(
        {
          action: 'expense.create',
          resource: 'expense',
          resourceId: expense.id,
          after: auditFields(expense),
        },
        tx,
      );
      return expenseView(expense);
    });
  }

  async updateExpense(id: string, dto: UpdateExpenseDto) {
    const before = await this.findExpense(id);
    this.assertNotLinked(before);
    if (dto.categoryId !== undefined && dto.categoryId !== before.categoryId) {
      await this.findCategory(dto.categoryId);
    }
    if (
      before.eventId !== null &&
      dto.date !== undefined &&
      dto.date !== fromDbDate(before.spentOn)
    ) {
      throw AppException.badRequest(
        'EXPENSE_EVENT_DATE_FIXED',
        "To'y xarajati to'y kuniga yoziladi — sanasini o'zgartirib bo'lmaydi",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.update({
        where: { id },
        data: {
          ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
          ...(dto.amount !== undefined && { amount: this.parseAmount(dto.amount) }),
          ...(dto.date !== undefined && { spentOn: this.parseSpendDate(dto.date) }),
          ...(dto.note !== undefined && { note: dto.note || null }),
        },
        include: EXPENSE_INCLUDE,
      });
      const diff = auditDiff(auditFields(before), auditFields(expense));
      if (diff) {
        await this.audit.log(
          { action: 'expense.update', resource: 'expense', resourceId: id, ...diff },
          tx,
        );
      }
      return expenseView(expense);
    });
  }

  async removeExpense(id: string): Promise<void> {
    const expense = await this.findExpense(id);
    this.assertNotLinked(expense);
    await this.prisma.$transaction(async (tx) => {
      await tx.expense.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.log(
        {
          action: 'expense.delete',
          resource: 'expense',
          resourceId: id,
          before: auditFields(expense),
        },
        tx,
      );
    });
  }

  // ── Xarajat turlari ──────────────────────────────────────────────────────

  async listCategories() {
    const categories = await this.prisma.expenseCategory.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return categories.map(categoryView);
  }

  async createCategory(dto: ExpenseCategoryDto) {
    await this.assertCategoryNameAvailable(dto.name);
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.expenseCategory.create({ data: { name: dto.name } });
      await this.audit.log(
        {
          action: 'expense.category_create',
          resource: 'expense_category',
          resourceId: category.id,
          after: { name: category.name },
        },
        tx,
      );
      return categoryView(category);
    });
  }

  async updateCategory(id: string, dto: ExpenseCategoryDto) {
    const before = await this.findCategory(id);
    if (dto.name.toLowerCase() !== before.name.toLowerCase()) {
      await this.assertCategoryNameAvailable(dto.name, id);
    }
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.expenseCategory.update({ where: { id }, data: { name: dto.name } });
      const diff = auditDiff({ name: before.name }, { name: category.name });
      if (diff) {
        await this.audit.log(
          {
            action: 'expense.category_update',
            resource: 'expense_category',
            resourceId: id,
            ...diff,
          },
          tx,
        );
      }
      return categoryView(category);
    });
  }

  /** Eski xarajatlar o'z kategoriyasi bilan qoladi — kategoriya faqat ro'yxatdan yashiriladi. */
  async removeCategory(id: string): Promise<void> {
    const category = await this.findCategory(id);
    if (category.code !== null) {
      throw AppException.conflict(
        'EXPENSE_CATEGORY_SYSTEM',
        "Bu tizim kategoriyasi — tasdiqlangan bozorlik shu yerga yoziladi, uni o'chirib bo'lmaydi",
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.expenseCategory.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.log(
        {
          action: 'expense.category_delete',
          resource: 'expense_category',
          resourceId: id,
          before: { name: category.name },
        },
        tx,
      );
    });
  }

  // ── Yordamchi ────────────────────────────────────────────────────────────

  private async findExpense(id: string): Promise<ExpenseRecord> {
    const expense = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null },
      include: EXPENSE_INCLUDE,
    });
    if (!expense) throw expenseNotFound();
    return expense;
  }

  /** Bozorlikdan yozilgan xarajat ro'yxat bilan birga o'zgaradi — bu yerda tegilmaydi. */
  private assertNotLinked(expense: ExpenseRecord): void {
    if (expense.shoppingListId !== null) {
      throw AppException.conflict(
        'EXPENSE_LINKED',
        "Bu xarajat bozorlik ro'yxatidan yozilgan. Uni Bozorlik bo'limida tasdiqni bekor qilib o'zgartiring",
      );
    }
  }

  private async findCategory(id: string): Promise<ExpenseCategory> {
    const category = await this.prisma.expenseCategory.findFirst({
      where: { id, deletedAt: null },
    });
    if (!category) throw categoryNotFound();
    return category;
  }

  private async assertCategoryNameAvailable(name: string, exceptId?: string): Promise<void> {
    const taken = await this.prisma.expenseCategory.findFirst({
      where: {
        deletedAt: null,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId && { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (taken) {
      throw AppException.conflict(
        'EXPENSE_CATEGORY_NAME_TAKEN',
        'Bunday nomli xarajat turi mavjud',
      );
    }
  }

  private parseAmount(value: string): Prisma.Decimal {
    const amount = money(value);
    if (amount.isZero()) {
      throw AppException.badRequest('INVALID_AMOUNT', "Summa noldan katta bo'lishi kerak");
    }
    return amount;
  }

  private parseDate(value: string): Date {
    if (!isValidDate(value)) {
      throw AppException.badRequest('INVALID_DATE_RANGE', "Sana noto'g'ri");
    }
    return toDbDate(value);
  }

  private requireDate(value: string | undefined): string {
    if (!value) throw AppException.badRequest('INVALID_DATE_RANGE', 'Xarajat sanasini kiriting');
    return value;
  }

  /** To'y xarajati yoziladigan kun — to'yning o'z kuni (Toshkent vaqti bo'yicha). */
  private async eventDay(eventId: string): Promise<Date> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: { startAt: true },
    });
    if (!event) throw AppException.notFound('EVENT_NOT_FOUND', 'Bron topilmadi');
    return toDbDate(localDate(event.startAt, this.timeZone));
  }

  /** Xarajat faqat bo'lib o'tgan kunga yoziladi — kelajak sanasi qabul qilinmaydi. */
  private parseSpendDate(value: string): Date {
    const date = this.parseDate(value);
    if (value > localDate(new Date(), this.timeZone)) {
      throw AppException.badRequest(
        'EXPENSE_DATE_IN_FUTURE',
        "Xarajat sanasi bugundan kech bo'lishi mumkin emas",
      );
    }
    return date;
  }

  private assertRange(from: string, to: string): void {
    if (!isValidDate(from) || !isValidDate(to) || from > to) {
      throw AppException.badRequest('INVALID_DATE_RANGE', "Davr noto'g'ri ko'rsatilgan");
    }
  }
}
