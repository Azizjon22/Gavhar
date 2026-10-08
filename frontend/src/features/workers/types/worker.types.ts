export const WORKER_POSITIONS = ['WAITER_MALE', 'WAITER_FEMALE', 'CHEF', 'OTHER'] as const;
export type WorkerPosition = (typeof WORKER_POSITIONS)[number];

export interface Worker {
  id: string;
  fullName: string;
  /** "+998901234567" ko'rinishida. */
  phone: string;
  position: WorkerPosition;
  note: string | null;
  /** Faol emas ishchi to'yga biriktirilmaydi. */
  isActive: boolean;
  photo: { url: string; thumbUrl: string } | null;
  createdAt: string;
  /** Oldinda nechta to'yga biriktirilgan (faqat ro'yxatda). */
  upcomingEvents?: number;
}

export interface WorkerPayload {
  fullName: string;
  phone: string;
  position: WorkerPosition;
  note: string | null;
  isActive?: boolean;
}

/** Ishchining bitta to'yga biriktirilishi. */
export interface EventWorker {
  roleAtEvent: string | null;
  assignedByName: string | null;
  assignedAt: string;
  worker: Worker;
}
