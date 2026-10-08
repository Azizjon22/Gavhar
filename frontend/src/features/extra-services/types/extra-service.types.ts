export type ExtraServiceUnit = 'PER_EVENT' | 'PER_GUEST';

export interface ExtraService {
  id: string;
  name: string;
  /** So'mda, satr ko'rinishida. */
  price: string;
  unit: ExtraServiceUnit;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExtraServicePayload {
  name: string;
  price: string;
  unit: ExtraServiceUnit;
  isActive: boolean;
}
