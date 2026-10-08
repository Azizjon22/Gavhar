import { create } from 'zustand';

export const MIN_GUESTS = 50;
export const MAX_GUESTS = 2000;
export const GUEST_STEP = 10;
export const GUEST_PRESETS = [200, 300, 400, 500] as const;
const DEFAULT_GUESTS = 300;

export const clampGuests = (value: number): number =>
  Number.isFinite(value)
    ? Math.min(MAX_GUESTS, Math.max(MIN_GUESTS, Math.round(value)))
    : DEFAULT_GUESTS;

interface GuestsState {
  guests: number;
  setGuests: (value: number) => void;
}

/**
 * Taqdimotdagi "mehmonlar soni": paketlar ro'yxatida ham, paket sahifasida ham
 * bir xil turadi — mijoz bir marta aytadi, jami summa hamma joyda shunga qarab chiqadi.
 */
export const useGuests = create<GuestsState>((set) => ({
  guests: DEFAULT_GUESTS,
  setGuests: (value) => set({ guests: clampGuests(value) }),
}));
