import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventStatus, Prisma, ShoppingListStatus, UserStatus } from '@prisma/client';
import { Redis } from 'ioredis';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { randomToken, sha256Hex } from '@/common/crypto/token.util';
import { AppException } from '@/common/errors/app.exception';
import { SYSTEM_ROLES } from '@/common/permissions/permission-catalog';
import { AuthUser } from '@/common/types/auth-user';
import { addDays, localDate, startOfLocalDay } from '@/common/utils/app-date.util';
import { UNIT_LABELS, quantityString } from '@/common/utils/quantity.util';
import { AppConfigService } from '@/config/app-config.service';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { REDIS_CLIENT } from '@/infrastructure/redis/redis.constants';
import { AuditService } from '@/modules/audit/audit.service';
import { monthlyFinancials } from '@/modules/dashboard/monthly-financials';
import { TelegramApi } from './telegram.api';

interface TgMessage {
  message_id: number;
  chat: { id: number; type: string };
  text?: string;
}

interface LinkButton {
  text: string;
  url: string;
  /** Telegram ichida Mini App bo'lib ochiladi (faqat https manzilda). */
  webApp?: boolean;
}

/** Yuborilgan xabar — ro'yxat o'zgarganda tahrirlash uchun saqlanadi. */
export interface MessageRef {
  chatId: string;
  messageId: number;
}

/** Ro'yxatda saqlanadi: super adminlarga yuborilgan e'lonlar nusxalari. */
interface ListMessages {
  submitted?: MessageRef[];
  purchased?: MessageRef[];
}

/** Bog'langan hisob: kim va qaysi buyruqlar unga ochiq. */
interface LinkedAccount {
  id: string;
  fullName: string;
  isSuperAdmin: boolean;
  can: (permission: string) => boolean;
}

/** Profil sahifasidagi havola qancha vaqt amal qiladi. */
const LINK_TTL_SECONDS = 15 * 60;
/** Mini App ma'lumoti shundan eski bo'lsa qabul qilinmaydi. */
const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;
const linkKey = (token: string) => `telegram:link:${sha256Hex(token)}`;

const MONTHS = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
];

const fmtSom = (value: Prisma.Decimal | number | null | undefined): string =>
  `${Math.round(Number(value ?? 0))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm`;

const fmtQuantity = (value: Prisma.Decimal, unit: keyof typeof UNIT_LABELS): string =>
  `${quantityString(value).replace('.', ',')} ${UNIT_LABELS[unit]}`;

const LIST_INCLUDE = {
  items: { orderBy: { sortOrder: 'asc' } },
  event: {
    select: {
      id: true,
      number: true,
      title: true,
      startAt: true,
      guestCount: true,
      client: { select: { fullName: true } },
    },
  },
} satisfies Prisma.ShoppingListInclude;
type ListRecord = Prisma.ShoppingListGetPayload<{ include: typeof LIST_INCLUDE }>;

/**
 * Telegram bot — API ichida long polling bilan ishlaydi (webhook shart emas, shuning
 * uchun lokal kompyuterda ham ishlaydi).
 *
 * - Foydalanuvchi Profil sahifasidagi bir martalik havola orqali o'z hisobini ulaydi
 *   (login Gavhar'niki: email + parol; bot faqat xabar va Mini App uchun).
 * - Bozorlik va ombor voqealari darhol tegishli odamga boradi; ro'yxat o'zgarsa,
 *   super admindagi xabar ham tahrirlanadi.
 * - TELEGRAM_REMINDER_TIMES da oshpazlarga ertangi to'yning yozilmagan bozorligi,
 *   super adminlarga ko'rilmagan ro'yxatlar eslatiladi.
 *
 * TELEGRAM_BOT_TOKEN bo'lmasa — butunlay o'chiq; bildirishnomalar hech qachon so'rovni
 * buzmaydi.
 */
@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private readonly sentSlots = new Set<string>();
  private botUsername: string | null = null;
  private abort?: AbortController;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly api: TelegramApi,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  get enabled(): boolean {
    return this.config.telegram.token.length > 0;
  }

  private get timeZone(): string {
    return this.config.app.timezone;
  }

  private get webUrl(): string {
    return this.config.telegram.webUrl;
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.warn("TELEGRAM_BOT_TOKEN yo'q — Telegram bot o'chiq.");
      return;
    }
    await this.loadBotName();
    // Testlarda soxta API bilan ishlanadi — haqiqiy so'rov va taymerlar yo'q.
    if (this.config.app.isTest) return;
    this.running = true;
    this.logger.log(
      `Telegram bot yoqildi (@${this.botUsername ?? '?'}). Eslatmalar: ${
        this.config.telegram.reminderTimes.join(', ') || "yo'q"
      } (${this.timeZone})`,
    );
    void this.poll();
    this.timer = setInterval(() => void this.tick(), 30_000);
    void this.syncMenuButtons();
  }

  /**
   * Sayt manzili (TELEGRAM_WEB_URL) o'zgargan bo'lishi mumkin — masalan, yangi tunnel.
   * Ulangan har bir chatning menyu tugmasi joriy manzilga yangilanadi.
   */
  private async syncMenuButtons(): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null, status: UserStatus.ACTIVE, telegramChatId: { not: null } },
      select: { telegramChatId: true },
    });
    for (const { telegramChatId } of users) {
      const linked = telegramChatId ? await this.linkedAccount(Number(telegramChatId)) : null;
      if (linked) await this.setMenuButton(Number(telegramChatId), linked);
    }
  }

  private async setMenuButton(chatId: number, linked: LinkedAccount): Promise<void> {
    const home = this.homeButton(linked);
    await this.api
      .call('setChatMenuButton', {
        chat_id: chatId,
        menu_button: home.webApp
          ? { type: 'web_app', text: home.text, web_app: { url: home.url } }
          : { type: 'commands' },
      })
      .catch(() => undefined);
  }

  onModuleDestroy(): void {
    this.running = false;
    this.abort?.abort();
    if (this.timer) clearInterval(this.timer);
  }

  private async loadBotName(): Promise<string | null> {
    if (this.botUsername) return this.botUsername;
    try {
      const me = await this.api.call<{ username?: string }>('getMe', {});
      this.botUsername = me.username ?? null;
    } catch (error) {
      this.logger.warn(`Bot ma'lumotini olib bo'lmadi: ${(error as Error).message}`);
    }
    return this.botUsername;
  }

  // ── Profil: ulash va uzish ──────────────────────────────────────────────

  async status(actor: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: { telegramChatId: true, telegramLinkedAt: true },
    });
    return {
      enabled: this.enabled,
      botUsername: this.enabled ? await this.loadBotName() : null,
      linked: user.telegramChatId !== null,
      linkedAt: user.telegramLinkedAt,
    };
  }

  /** Bir martalik havola: `t.me/<bot>?start=<token>` — bot uni olgach hisob ulanadi. */
  async createLink(actor: AuthUser) {
    const username = this.enabled ? await this.loadBotName() : null;
    if (!username) {
      throw AppException.conflict('TELEGRAM_DISABLED', 'Telegram bot sozlanmagan');
    }
    const token = randomToken(24);
    await this.redis.set(linkKey(token), actor.id, 'EX', LINK_TTL_SECONDS);
    return {
      url: `https://t.me/${username}?start=${token}`,
      expiresAt: new Date(Date.now() + LINK_TTL_SECONDS * 1000),
    };
  }

  async unlinkUser(actor: AuthUser): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (!user.telegramChatId) return;
    await this.prisma.user.update({
      where: { id: actor.id },
      data: { telegramChatId: null, telegramLinkedAt: null },
    });
    await this.audit.log({ action: 'telegram.unlink', resource: 'user', resourceId: actor.id });
    await this.send(
      user.telegramChatId,
      'Bot hisobingizdan uzildi. Qayta ulash uchun Gavhar tizimidagi Profil sahifasiga kiring.',
    );
  }

  // ── Mini App ────────────────────────────────────────────────────────────

  /**
   * Mini App initData'sini Telegram hujjatidagi usulda tekshiradi: saralangan
   * maydonlar ustidan bot tokeni kalitli ikki qavat HMAC-SHA256. Imzo to'g'ri va
   * yangi bo'lsa — Telegram foydalanuvchi id'si (shaxsiy chat id'si) qaytadi.
   */
  verifyInitData(initData: string): string | null {
    if (!this.enabled) return null;
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
    params.delete('hash');

    const authDate = Number(params.get('auth_date') ?? 0);
    if (!authDate || Date.now() / 1000 - authDate > INIT_DATA_MAX_AGE_SECONDS) return null;

    const checkString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(this.config.telegram.token).digest();
    const expected = createHmac('sha256', secret).update(checkString).digest();
    if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return null;

    try {
      const user = JSON.parse(params.get('user') ?? '{}') as { id?: number };
      return user.id ? String(user.id) : null;
    } catch {
      return null;
    }
  }

  /** Mini App orqali kirish: imzolangan chat qaysi faol hisobga ulangan. */
  async userForInitData(initData: string) {
    const chatId = this.verifyInitData(initData);
    if (!chatId) {
      throw AppException.unauthorized(
        'TELEGRAM_AUTH_INVALID',
        "Telegram ma'lumotlari tasdiqlanmadi",
      );
    }
    const user = await this.prisma.user.findFirst({
      where: { telegramChatId: chatId, deletedAt: null, status: UserStatus.ACTIVE },
      select: { id: true, email: true },
    });
    if (!user) {
      throw AppException.unauthorized(
        'TELEGRAM_NOT_LINKED',
        'Bu Telegram hisobi tizimga ulanmagan — avval Profil sahifasidan ulang',
      );
    }
    return user;
  }

  // ── Bot API ─────────────────────────────────────────────────────────────

  /**
   * Xabar (tugmalari bilan). Telegram localhost'ga tugmani qabul qilmaydi — unda
   * havola matn bo'lib yuboriladi, lokal sinov ham ishlayveradi.
   */
  private async deliver(
    method: 'sendMessage' | 'editMessageText',
    target: Record<string, unknown>,
    text: string,
    buttons: LinkButton[],
  ): Promise<number | null> {
    try {
      if (buttons.length > 0) {
        try {
          const sent = await this.api.call<{ message_id: number }>(method, {
            ...target,
            text,
            reply_markup: {
              inline_keyboard: buttons.map((button) => [
                button.webApp
                  ? { text: button.text, web_app: { url: button.url } }
                  : { text: button.text, url: button.url },
              ]),
            },
          });
          return sent.message_id;
        } catch (error) {
          if (/not modified/i.test((error as Error).message)) return null;
          const links = buttons.map((button) => `${button.text}: ${button.url}`).join('\n');
          const sent = await this.api.call<{ message_id: number }>(method, {
            ...target,
            text: `${text}\n\n${links}`,
            link_preview_options: { is_disabled: true },
          });
          return sent.message_id;
        }
      }
      const sent = await this.api.call<{ message_id: number }>(method, { ...target, text });
      return sent.message_id;
    } catch (error) {
      if (!/not modified/i.test((error as Error).message)) {
        this.logger.warn(
          `Xabar yuborilmadi (${String(target.chat_id)}): ${(error as Error).message}`,
        );
      }
      return null;
    }
  }

  private send(chatId: string | number, text: string, buttons: LinkButton | LinkButton[] = []) {
    return this.deliver('sendMessage', { chat_id: chatId }, text, [buttons].flat());
  }

  private async edit(refs: MessageRef[], text: string, buttons: LinkButton[]): Promise<void> {
    for (const ref of refs) {
      await this.deliver(
        'editMessageText',
        { chat_id: ref.chatId, message_id: ref.messageId },
        text,
        buttons,
      );
    }
  }

  private async poll(): Promise<void> {
    let offset = 0;
    while (this.running) {
      this.abort = new AbortController();
      try {
        const updates = await this.api.call<{ update_id: number; message?: TgMessage }[]>(
          'getUpdates',
          { offset, timeout: 25, allowed_updates: ['message'] },
          this.abort.signal,
        );
        for (const update of updates) {
          offset = update.update_id + 1;
          if (update.message?.chat.type === 'private') {
            await this.handleMessage(update.message).catch((error: Error) =>
              this.logger.error(`Xabarni qayta ishlashda xato: ${error.message}`),
            );
          }
        }
      } catch (error) {
        if (!this.running) return;
        this.logger.warn(`getUpdates: ${(error as Error).message}`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  // ── Suhbat ──────────────────────────────────────────────────────────────

  /** Botga kelgan bitta xabar (testlarda to'g'ridan-to'g'ri chaqiriladi). */
  async handleMessage(message: TgMessage): Promise<void> {
    const chatId = message.chat.id;
    const text = (message.text ?? '').trim();
    const [command = '', argument = ''] = text.split(/\s+/, 2);

    if (command === '/start') {
      if (argument) {
        await this.linkByToken(chatId, argument);
        return;
      }
      const linked = await this.linkedAccount(chatId);
      if (linked) {
        await this.greet(chatId, linked, `${linked.fullName}, siz ulangansiz.`);
        return;
      }
      await this.send(
        chatId,
        "Assalomu alaykum! Bu — Gavhar to'yxonasining ichki boti.\n\n" +
          "Ulash uchun Gavhar tizimiga kiring → Profil → «Telegram'ni ulash» tugmasini bosing.",
      );
      return;
    }

    const linked = await this.linkedAccount(chatId);
    if (!linked) {
      await this.send(chatId, 'Avval Gavhar tizimidagi Profil sahifasidan botni ulang.');
      return;
    }

    switch (command) {
      case '/chiqish':
        await this.prisma.user.update({
          where: { id: linked.id },
          data: { telegramChatId: null, telegramLinkedAt: null },
        });
        await this.audit.log({
          action: 'telegram.unlink',
          resource: 'user',
          resourceId: linked.id,
          actor: { id: linked.id },
        });
        await this.send(chatId, 'Bot hisobingizdan uzildi. Qayta ulash — Profil sahifasidan.');
        return;
      case '/toylar':
        if (this.allowed(linked, 'toylar'))
          await this.send(chatId, await this.upcomingEventsText());
        else await this.send(chatId, 'Bu buyruq sizga ochiq emas.');
        return;
      case '/ombor':
        if (this.allowed(linked, 'ombor')) await this.send(chatId, await this.lowStockText());
        else await this.send(chatId, 'Bu buyruq faqat omborga ruxsati borlar uchun.');
        return;
      case '/hisobot':
        if (this.allowed(linked, 'hisobot')) await this.send(chatId, await this.monthlyText());
        else await this.send(chatId, 'Bu buyruq faqat moliyaga ruxsati borlar uchun.');
        return;
      case '/tekshir':
        await this.check(chatId, linked);
        return;
      default:
        await this.send(chatId, this.commandsHint(linked));
    }
  }

  private async linkByToken(chatId: number, token: string): Promise<void> {
    const userId = await this.redis.getdel(linkKey(token));
    const user = userId
      ? await this.prisma.user.findFirst({
          where: { id: userId, deletedAt: null, status: UserStatus.ACTIVE },
        })
      : null;
    if (!user) {
      await this.send(
        chatId,
        'Havola eskirgan yoki allaqachon ishlatilgan. Profil sahifasidan yangisini oling.',
      );
      return;
    }
    const id = String(chatId);
    await this.prisma.$transaction(async (tx) => {
      // Bir chat — bitta hisob: avvalgi egasidan uziladi.
      await tx.user.updateMany({
        where: { telegramChatId: id, NOT: { id: user.id } },
        data: { telegramChatId: null, telegramLinkedAt: null },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { telegramChatId: id, telegramLinkedAt: new Date() },
      });
      await this.audit.log(
        {
          action: 'telegram.link',
          resource: 'user',
          resourceId: user.id,
          actor: { id: user.id, email: user.email },
        },
        tx,
      );
    });
    const linked = await this.linkedAccount(chatId);
    if (linked) await this.greet(chatId, linked, `✅ ${linked.fullName}, bot hisobingizga ulandi.`);
  }

  private async greet(chatId: number, linked: LinkedAccount, title: string): Promise<void> {
    await this.api
      .call('setMyCommands', {
        commands: this.commandsFor(linked),
        scope: { type: 'chat', chat_id: chatId },
      })
      .catch(() => undefined);
    await this.setMenuButton(chatId, linked);
    await this.send(chatId, `${title}\n\n${this.commandsHint(linked)}`, this.homeButton(linked));
  }

  private async linkedAccount(chatId: number): Promise<LinkedAccount | null> {
    const user = await this.prisma.user.findFirst({
      where: { telegramChatId: String(chatId), deletedAt: null, status: UserStatus.ACTIVE },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user) return null;
    const isSuperAdmin = user.role.key === SYSTEM_ROLES.SUPER_ADMIN;
    const keys = new Set(user.role.permissions.map(({ permission }) => permission.key));
    return {
      id: user.id,
      fullName: user.fullName,
      isSuperAdmin,
      can: (permission) => isSuperAdmin || keys.has(permission),
    };
  }

  /** Oshpaz — ro'yxat yozadi, lekin xarid qilmaydi. */
  private isCook(linked: LinkedAccount): boolean {
    return (
      !linked.isSuperAdmin && linked.can('shopping:create') && !linked.can('shopping:purchase')
    );
  }

  private allowed(linked: LinkedAccount, command: 'toylar' | 'ombor' | 'hisobot'): boolean {
    if (command === 'toylar') return linked.can('events:read') || linked.can('shopping:read');
    if (command === 'ombor') return linked.can('warehouse:read');
    return linked.can('finance:read');
  }

  private commandsFor(linked: LinkedAccount) {
    return [
      ...(this.allowed(linked, 'toylar')
        ? [{ command: 'toylar', description: "Yaqin kunlardagi to'ylar" }]
        : []),
      { command: 'tekshir', description: 'Eslatmalarni hozir tekshirish' },
      ...(this.allowed(linked, 'ombor')
        ? [{ command: 'ombor', description: 'Kam qolgan mahsulotlar' }]
        : []),
      ...(this.allowed(linked, 'hisobot')
        ? [{ command: 'hisobot', description: 'Shu oy tushum va foyda' }]
        : []),
      { command: 'chiqish', description: 'Botdan uzish' },
    ];
  }

  private commandsHint(linked: LinkedAccount): string {
    return this.commandsFor(linked)
      .map(({ command, description }) => `/${command} — ${description}`)
      .join('\n');
  }

  /** Oshpazga — oshpaz ilovasi, qolganlarga — bozorlik bo'limi. https bo'lsa Mini App. */
  private homeButton(linked: LinkedAccount): LinkButton {
    const cook = this.isCook(linked);
    return this.link(cook ? '/kitchen' : '/shopping', cook ? 'Oshpaz ilovasi' : "Bozorlik bo'limi");
  }

  private link(path: string, text: string): LinkButton {
    if (this.webUrl.startsWith('https://')) {
      return { text, url: `${this.webUrl}/tg?next=${encodeURIComponent(path)}`, webApp: true };
    }
    return { text, url: `${this.webUrl}${path}` };
  }

  // ── Kimga yuboriladi ────────────────────────────────────────────────────

  private async chats(where: Prisma.UserWhereInput): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        ...where,
        deletedAt: null,
        status: UserStatus.ACTIVE,
        telegramChatId: { not: null },
      },
      select: { telegramChatId: true },
    });
    return users.flatMap((user) => (user.telegramChatId ? [user.telegramChatId] : []));
  }

  private superAdminChats() {
    return this.chats({ role: { key: SYSTEM_ROLES.SUPER_ADMIN } });
  }

  private withPermission(key: string): Prisma.RoleWhereInput {
    return { permissions: { some: { permission: { key } } } };
  }

  private purchaserChats() {
    return this.chats({
      role: { key: { not: SYSTEM_ROLES.SUPER_ADMIN }, ...this.withPermission('shopping:purchase') },
    });
  }

  private cookChats() {
    return this.chats({
      role: {
        key: { not: SYSTEM_ROLES.SUPER_ADMIN },
        AND: [
          this.withPermission('shopping:create'),
          { permissions: { none: { permission: { key: 'shopping:purchase' } } } },
        ],
      },
    });
  }

  private async toChats(chats: string[], text: string, buttons: LinkButton[] = []) {
    const refs: MessageRef[] = [];
    for (const chatId of chats) {
      const messageId = await this.send(chatId, text, buttons);
      if (messageId) refs.push({ chatId, messageId });
    }
    return refs;
  }

  // ── Eslatmalar ──────────────────────────────────────────────────────────

  private clock(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: this.timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date);
    return parts;
  }

  private dayLabel(instant: Date): string {
    const [, month = '1', day = '1'] = localDate(instant, this.timeZone).split('-');
    return `${Number(day)}-${MONTHS[Number(month) - 1]}`;
  }

  private eventLabel(event: {
    number: number;
    title: string | null;
    client: { fullName: string };
  }) {
    return `№ ${event.number} ${event.title ?? event.client.fullName}`;
  }

  /** Har 30 soniyada: eslatma vaqti kelganmi (har vaqt kuniga bir marta). */
  private async tick(): Promise<void> {
    const time = this.clock();
    if (!this.config.telegram.reminderTimes.includes(time)) return;
    const slot = `${localDate(new Date(), this.timeZone)} ${time}`;
    if (this.sentSlots.has(slot)) return;
    this.sentSlots.add(slot);
    try {
      const cooks = await this.remindCooks();
      const admins = await this.remindSuperAdmins();
      this.logger.log(
        `Eslatma ${time}: oshpazlarga ${cooks} ta, super adminlarga ${admins} ta xabar.`,
      );
    } catch (error) {
      this.logger.error(`Eslatma yuborishda xato: ${(error as Error).message}`);
    }
  }

  private async check(chatId: number, linked: LinkedAccount): Promise<void> {
    const id = String(chatId);
    let sent = 0;
    if (linked.isSuperAdmin) sent = await this.remindSuperAdmins(id);
    else if (linked.can('shopping:purchase')) sent = await this.remindPurchasers(id);
    else if (linked.can('shopping:create')) sent = await this.remindCooks(id);
    if (sent === 0) await this.send(chatId, "Hozircha sizdan kutilayotgan ish yo'q. ✅");
  }

  /** Ertangi to'ylardan bozorligi yozilmaganlari — har bir ulangan oshpazga. */
  async remindCooks(onlyChatId?: string): Promise<number> {
    const tomorrow = addDays(localDate(new Date(), this.timeZone), 1);
    const events = await this.prisma.event.findMany({
      where: {
        deletedAt: null,
        status: { not: EventStatus.CANCELLED },
        startAt: {
          gte: startOfLocalDay(tomorrow, this.timeZone),
          lt: startOfLocalDay(addDays(tomorrow, 1), this.timeZone),
        },
        shoppingLists: { none: { deletedAt: null } },
      },
      include: { client: { select: { fullName: true } } },
      orderBy: { startAt: 'asc' },
    });
    if (events.length === 0) return 0;
    const chats = onlyChatId ? [onlyChatId] : await this.cookChats();

    let sent = 0;
    for (const event of events) {
      const dishes = [event.firstDish, event.secondDish].filter(Boolean).join(', ');
      const text =
        `🛒 Ertaga to'y bor — ${this.dayLabel(event.startAt)}, soat ${this.clock(event.startAt)}\n\n` +
        `${this.eventLabel(event)}\n${event.guestCount} mehmon` +
        (dishes ? `\nTaomlar: ${dishes}` : '') +
        `\n\nShu to'y uchun bozorlik yozishingiz kerak.`;
      const button = this.link(`/kitchen/shopping?event=${event.id}`, 'Bozorlik yozish');
      sent += (await this.toChats(chats, text, [button])).length;
    }
    return sent;
  }

  /** Super admin hali ochmagan ro'yxatlar. */
  async remindSuperAdmins(onlyChatId?: string): Promise<number> {
    const lists = await this.prisma.shoppingList.findMany({
      where: { deletedAt: null, status: ShoppingListStatus.SUBMITTED },
      include: { ...LIST_INCLUDE, _count: { select: { items: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (lists.length === 0) return 0;
    const rows = lists.slice(0, 10).map((list) => {
      const what = list.event
        ? `${this.eventLabel(list.event)} (${this.dayLabel(list.event.startAt)})`
        : 'Umumiy bozorlik';
      return `• ${what} — ${list._count.items} ta mahsulot, ${list.createdByName}`;
    });
    const text =
      `📋 ${lists.length} ta bozorlik ro'yxati hali ko'rilmagan:\n\n${rows.join('\n')}` +
      (lists.length > rows.length ? `\n… va yana ${lists.length - rows.length} ta` : '');
    const chats = onlyChatId ? [onlyChatId] : await this.superAdminChats();
    return (await this.toChats(chats, text, [this.listsButton()])).length;
  }

  /** Xaridchiga yuborilgan, hali to'liq olinmagan ro'yxatlar. */
  private async remindPurchasers(onlyChatId: string): Promise<number> {
    const lists = await this.prisma.shoppingList.findMany({
      where: { deletedAt: null, status: ShoppingListStatus.APPROVED },
      include: { ...LIST_INCLUDE, _count: { select: { items: true } } },
      orderBy: { approvedAt: 'asc' },
    });
    if (lists.length === 0) return 0;
    const rows = lists
      .slice(0, 10)
      .map(
        (list) =>
          `• ${list.event ? this.eventLabel(list.event) : 'Umumiy bozorlik'} — ${list._count.items} ta mahsulot`,
      );
    await this.send(
      onlyChatId,
      `🛍 ${lists.length} ta ro'yxat xarid qilinishi kerak:\n\n${rows.join('\n')}`,
      this.listsButton(),
    );
    return 1;
  }

  // ── Buyruqlar ───────────────────────────────────────────────────────────

  private async upcomingEventsText(): Promise<string> {
    const events = await this.prisma.event.findMany({
      where: {
        deletedAt: null,
        status: { not: EventStatus.CANCELLED },
        startAt: { gte: startOfLocalDay(localDate(new Date(), this.timeZone), this.timeZone) },
      },
      include: { client: { select: { fullName: true } } },
      orderBy: { startAt: 'asc' },
      take: 10,
    });
    if (events.length === 0) return "Yaqin kunlarda rejadagi to'y yo'q.";
    const rows = events.map((event) => {
      const mark = event.status === EventStatus.REQUEST ? ' (kutilmoqda)' : '';
      return `• ${this.dayLabel(event.startAt)}, ${this.clock(event.startAt)} — ${this.eventLabel(event)}, ${event.guestCount} mehmon${mark}`;
    });
    return `📅 Yaqin to'ylar:\n\n${rows.join('\n')}`;
  }

  private async lowStockText(): Promise<string> {
    const items = await this.prisma.$queryRaw<
      {
        name: string;
        quantity: Prisma.Decimal;
        min_quantity: Prisma.Decimal;
        unit: keyof typeof UNIT_LABELS;
      }[]
    >`SELECT name, quantity, min_quantity, unit FROM warehouse_items
      WHERE deleted_at IS NULL AND min_quantity > 0 AND quantity <= min_quantity
      ORDER BY name LIMIT 30`;
    if (items.length === 0) return "Omborda kam qolgan mahsulot yo'q. ✅";
    const rows = items.map(
      (item) =>
        `• ${item.name} — ${fmtQuantity(new Prisma.Decimal(item.quantity), item.unit)} qoldi (chegara: ${fmtQuantity(new Prisma.Decimal(item.min_quantity), item.unit)})`,
    );
    return `📦 Kam qolgan mahsulotlar:\n\n${rows.join('\n')}`;
  }

  private async monthlyText(): Promise<string> {
    const summary = await monthlyFinancials(this.prisma, this.timeZone);
    const [year = '', month = '1'] = localDate(new Date(), this.timeZone).split('-');
    return (
      `💰 ${MONTHS[Number(month) - 1]} ${year}:\n\n` +
      `To'ylar: ${summary.eventCount} ta\n` +
      `Kutilayotgan tushum: ${fmtSom(Number(summary.totalExpected))}\n` +
      `Olingan pul: ${fmtSom(Number(summary.totalCollected))}\n` +
      `Qarzdorlik: ${fmtSom(Number(summary.totalOutstanding))}\n` +
      `Xarajatlar: ${fmtSom(Number(summary.totalExpenses))}\n` +
      `Sof foyda: ${fmtSom(Number(summary.netProfit))}`
    );
  }

  // ── Bozorlik e'lonlari ──────────────────────────────────────────────────

  private listsButton(): LinkButton {
    return this.link('/shopping', 'Bozorlikni ochish');
  }

  private loadList(id: string) {
    return this.prisma.shoppingList.findUnique({ where: { id }, include: LIST_INCLUDE });
  }

  private listHead(list: ListRecord): string {
    const event = list.event
      ? `${this.eventLabel(list.event)} — ${this.dayLabel(list.event.startAt)}, ${list.event.guestCount} mehmon`
      : 'Umumiy bozorlik (to‘yga bog‘lanmagan)';
    return `${event}\nYozgan: ${list.createdByName}`;
  }

  /** Nima olinadi; super admin o'zgartirgan miqdorlar belgilanadi. */
  private itemRows(list: ListRecord): string {
    const rows = list.items.slice(0, 40).map((item) => {
      let mark = '';
      if (item.requestedQuantity === null) mark = " (qo'shildi)";
      else if (!item.requestedQuantity.eq(item.quantity)) {
        mark = ` (oshpaz: ${fmtQuantity(item.requestedQuantity, item.unit)})`;
      }
      return `• ${item.name} — ${fmtQuantity(item.quantity, item.unit)}${mark}`;
    });
    if (list.items.length > rows.length)
      rows.push(`… va yana ${list.items.length - rows.length} ta`);
    return rows.join('\n');
  }

  private submittedText(list: ListRecord): string {
    if (list.deletedAt) {
      return `❌ Bozorlik ro'yxati bekor qilindi\n\n${this.listHead(list)}`;
    }
    const sent =
      list.status !== ShoppingListStatus.SUBMITTED && list.status !== ShoppingListStatus.REVIEWED;
    const edited = list.items.some(
      (item) => item.requestedQuantity === null || !item.requestedQuantity.eq(item.quantity),
    );
    const title = sent
      ? "✅ Bozorlik ro'yxati adminga yuborildi"
      : `🛒 Yangi bozorlik ro'yxati${edited ? '\n✏️ Tahrirlangan' : ''}`;
    return `${title}\n\n${this.listHead(list)}\n\n${this.itemRows(list)}`;
  }

  private purchasedText(list: ListRecord): string {
    const rows = list.items.slice(0, 40).map((item) => {
      if (item.skipped) return `• ${item.name} — olinmadi`;
      const unit =
        item.price && !item.quantity.isZero()
          ? ` (1 ${UNIT_LABELS[item.unit]} — ${fmtSom(item.price.div(item.quantity))})`
          : '';
      return `• ${item.name} — ${fmtQuantity(item.quantity, item.unit)} = ${fmtSom(item.price)}${unit}`;
    });
    const total = list.items.reduce(
      (sum, item) => (item.skipped || !item.price ? sum : sum.add(item.price)),
      new Prisma.Decimal(0),
    );
    return (
      `💰 Bozorlik xarid qilindi${list.purchasedByName ? ` (${list.purchasedByName})` : ''}\n\n` +
      `${this.listHead(list)}\n\n${rows.join('\n')}\n\nJami: ${fmtSom(total)}\n` +
      'Tasdiqlasangiz, summa xarajatlarga yoziladi.'
    );
  }

  private purchasedButtons(list: ListRecord): LinkButton[] {
    return [
      ...(list.event ? [this.link(`/events/${list.event.id}`, "To'y kartasi")] : []),
      this.listsButton(),
    ];
  }

  private refsOf(list: ListRecord): ListMessages {
    return (list.telegramMessages ?? {}) as ListMessages;
  }

  private async saveRefs(id: string, patch: ListMessages): Promise<void> {
    const row = await this.prisma.shoppingList.findUnique({
      where: { id },
      select: { telegramMessages: true },
    });
    const current = (row?.telegramMessages ?? {}) as ListMessages;
    await this.prisma.shoppingList.update({
      where: { id },
      data: { telegramMessages: { ...current, ...patch } as Prisma.InputJsonValue },
    });
  }

  /** Bildirishnoma hech qachon uni chaqirgan so'rovni buzmaydi. */
  private async safely(what: string, job: () => Promise<void>): Promise<void> {
    if (!this.enabled) return;
    try {
      await job();
    } catch (error) {
      this.logger.warn(`${what}: ${(error as Error).message}`);
    }
  }

  /** Yangi ro'yxat — super adminlarga. */
  notifyListSubmitted(id: string): Promise<void> {
    return this.safely("Yangi ro'yxat xabari yuborilmadi", async () => {
      const list = await this.loadList(id);
      if (!list) return;
      const refs = await this.toChats(await this.superAdminChats(), this.submittedText(list), [
        this.listsButton(),
      ]);
      await this.saveRefs(id, { submitted: refs });
    });
  }

  /** Ro'yxat tahrirlandi yoki bekor qilindi — super admindagi xabar ham yangilanadi. */
  notifyListEdited(id: string): Promise<void> {
    return this.safely('Xabar tahrirlanmadi', async () => {
      const list = await this.loadList(id);
      if (!list) return;
      await this.edit(this.refsOf(list).submitted ?? [], this.submittedText(list), [
        this.listsButton(),
      ]);
    });
  }

  /** Super admin yubordi: uning nusxasi belgilanadi, xaridchilarga topshiriladi. */
  notifyListApproved(id: string): Promise<void> {
    return this.safely('Adminga xabar yuborilmadi', async () => {
      const list = await this.loadList(id);
      if (!list) return;
      await this.edit(this.refsOf(list).submitted ?? [], this.submittedText(list), [
        this.listsButton(),
      ]);
      await this.toChats(
        await this.purchaserChats(),
        `🛍 Yangi bozorlik — xarid qilish kerak\n\n${this.listHead(list)}\n\n${this.itemRows(list)}`,
        [this.listsButton()],
      );
    });
  }

  /** Hammasi olindi: miqdor va narxlar hisoboti — super adminlarga. */
  notifyListPurchased(id: string): Promise<void> {
    return this.safely('Xarid hisoboti yuborilmadi', async () => {
      const list = await this.loadList(id);
      if (!list) return;
      const refs = await this.toChats(
        await this.superAdminChats(),
        this.purchasedText(list),
        this.purchasedButtons(list),
      );
      await this.saveRefs(id, { purchased: refs });
    });
  }

  /** Xariddan keyin narx tuzatildi — Telegram'dagi hisobot ham to'g'rilanadi. */
  notifyPriceFixed(id: string): Promise<void> {
    return this.safely('Xarid hisoboti tahrirlanmadi', async () => {
      const list = await this.loadList(id);
      if (!list || list.status !== ShoppingListStatus.PURCHASED) return;
      await this.edit(
        this.refsOf(list).purchased ?? [],
        this.purchasedText(list),
        this.purchasedButtons(list),
      );
    });
  }

  // ── Ombordan olinganlar ─────────────────────────────────────────────────

  /** Oshpaz to'y uchun ombordan oldi — super adminlarga (narxi bilan). */
  notifyStockUsage(id: string): Promise<void> {
    return this.safely('Ombor xabari yuborilmadi', async () => {
      const usage = await this.prisma.stockUsage.findUnique({
        where: { id },
        include: {
          items: { orderBy: { name: 'asc' } },
          event: {
            select: {
              id: true,
              number: true,
              title: true,
              startAt: true,
              guestCount: true,
              client: { select: { fullName: true } },
            },
          },
        },
      });
      if (!usage) return;
      const rows = usage.items.map(
        (item) => `• ${item.name} — ${fmtQuantity(item.quantity, item.unit)}`,
      );
      // Faqat super adminlarga boradi — qiymatini ko'rsatsa bo'ladi.
      const unpriced = usage.items.filter((item) => item.totalCost === null).length;
      const total = usage.items.reduce(
        (sum, item) => (item.totalCost ? sum.add(item.totalCost) : sum),
        new Prisma.Decimal(0),
      );
      const cost =
        unpriced === usage.items.length
          ? 'Qiymati: omborda bu mahsulotlarga narx kiritilmagan'
          : `Qiymati: ${fmtSom(total)}${unpriced > 0 ? ` (${unpriced} ta mahsulot narxsiz)` : ''}`;
      const refs = await this.toChats(
        await this.superAdminChats(),
        `📦 Ombordan to'yga olindi\n\n` +
          `${this.eventLabel(usage.event)} — ${this.dayLabel(usage.event.startAt)}, ${usage.event.guestCount} mehmon\n` +
          `Oldi: ${usage.takenByName}\n\n${rows.join('\n')}\n\n${cost}`,
        [this.link(`/events/${usage.event.id}`, "To'y kartasi"), this.link('/warehouse', 'Ombor')],
      );
      await this.prisma.stockUsage.update({
        where: { id },
        data: { telegramMessages: refs as unknown as Prisma.InputJsonValue },
      });
    });
  }

  /** Mahsulot omborga qaytdi — asl xabarga javob qilib yoziladi. */
  notifyStockReturned(stored: unknown, byName: string): Promise<void> {
    return this.safely('Qaytarish xabari yuborilmadi', async () => {
      const refs = (Array.isArray(stored) ? stored : []) as MessageRef[];
      for (const ref of refs) {
        await this.api
          .call('sendMessage', {
            chat_id: ref.chatId,
            text: `↩️ Bu mahsulotlar omborga qaytarildi (${byName}).`,
            reply_parameters: { message_id: ref.messageId, allow_sending_without_reply: true },
          })
          .catch((error: Error) => this.logger.warn(`Qaytarish xabari: ${error.message}`));
      }
    });
  }
}
