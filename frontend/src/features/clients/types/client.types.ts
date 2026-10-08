export interface Client {
  id: string;
  fullName: string;
  phone: string;
  phoneExtra: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientPayload {
  fullName: string;
  phone: string;
  phoneExtra: string | null;
  note: string | null;
}
