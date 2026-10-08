import { withoutMoney } from './event-money.interceptor';

describe('withoutMoney', () => {
  const event = {
    id: 'e1',
    number: 7,
    guestCount: 300,
    firstDish: 'Osh',
    totalAmount: '60000000.00',
    paidAmount: '20000000.00',
    debt: '40000000.00',
    pricePerGuest: '200000.00',
    guestsTotal: '60000000.00',
    extrasTotal: '0.00',
    discount: '0.00',
    requiredDeposit: '12000000.00',
    minDepositPercent: 20,
    payments: [{ id: 'p1', amount: '20000000.00' }],
    services: [
      {
        extraServiceId: 's1',
        name: 'Bezak',
        quantity: 1,
        unitPrice: '3000000.00',
        total: '3000000.00',
      },
    ],
  };

  it('narx, to‘lov va qarzga oid hamma maydonni olib tashlaydi', () => {
    expect(withoutMoney(event)).toEqual({
      id: 'e1',
      number: 7,
      guestCount: 300,
      firstDish: 'Osh',
      services: [{ extraServiceId: 's1', name: 'Bezak', quantity: 1 }],
    });
    expect(JSON.stringify(withoutMoney(event))).not.toMatch(/0000\.00/);
  });

  it('asl obyektni o‘zgartirmaydi va bron bo‘lmagan qiymatga tegmaydi', () => {
    withoutMoney(event);
    expect(event.totalAmount).toBe('60000000.00');
    expect(withoutMoney(undefined)).toBeUndefined();
    expect(withoutMoney({ success: true })).toEqual({ success: true });
  });
});
