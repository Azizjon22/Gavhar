import type { EventStatus, EventType } from '@/features/events/types/event.types';
import type { WarehouseSection, WarehouseUnit } from '@/features/warehouse/types/warehouse.types';
import type { WorkerPosition } from '@/features/workers/types/worker.types';

export interface DashboardEventCard {
  id: string;
  number: number;
  title: string | null;
  type: EventType;
  status: EventStatus;
  startAt: string;
  endAt: string;
  guestCount: number;
  tableCapacity: number | null;
  clientName: string;
  hallName: string;
  menuName: string | null;
  firstDish: string | null;
  secondDish: string | null;
  workers: {
    id: string;
    fullName: string;
    position: WorkerPosition;
    roleAtEvent: string | null;
    photo: { url: string; thumbUrl: string } | null;
  }[];
  shoppingListCount: number;
  /** Faqat moliya ruxsati borlarga keladi. */
  totalAmount?: string;
  debt?: string;
}

export interface DashboardOverview {
  /** Toshkent bo'yicha bugungi sana, `YYYY-MM-DD`. */
  today: string;
  counts: {
    active: number;
    thisMonth: number;
    week: number;
    weekGuests: number;
    today: number;
    tomorrow: number;
  };
  todayEvents: DashboardEventCard[];
  tomorrowEvents: DashboardEventCard[];
  week: {
    date: string;
    events: {
      id: string;
      title: string;
      startAt: string;
      guestCount: number;
      status: EventStatus;
    }[];
  }[];
  /** `null` — foydalanuvchida tegishli ruxsat yo'q. */
  lowStock:
    | {
        id: string;
        name: string;
        section: WarehouseSection;
        unit: WarehouseUnit;
        quantity: string;
        minQuantity: string;
      }[]
    | null;
  pendingShopping: { toReview: number; toConfirm: number; toPurchase: number } | null;
  monthlyFinancials: {
    eventCount: number;
    totalExpected: string;
    totalCollected: string;
    totalOutstanding: string;
    totalExpenses: string;
    netProfit: string;
  } | null;
}
