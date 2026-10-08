import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestActor {
  id: string;
  email: string;
}

export interface RequestContextStore {
  requestId?: string;
  ip?: string;
  userAgent?: string;
  actor?: RequestActor;
}

/**
 * So'rov davomida mavjud bo'lgan kontekst (IP, qurilma, kim). Audit log
 * kabi servislar parametr tashimasdan shu yerdan o'qiydi.
 */
export const requestContext = new AsyncLocalStorage<RequestContextStore>();

export const getRequestContext = (): RequestContextStore => requestContext.getStore() ?? {};

export const setRequestActor = (actor: RequestActor): void => {
  const store = requestContext.getStore();
  if (store) store.actor = actor;
};
