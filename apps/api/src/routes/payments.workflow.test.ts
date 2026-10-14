import express from 'express';
import type { Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  bookingFindFirst: vi.fn(),
  paymentFindFirst: vi.fn(),
  paymentAggregate: vi.fn(),
  paymentCreate: vi.fn(),
  paymentUpdate: vi.fn(),
  paymentFindMany: vi.fn(),
  installmentFindMany: vi.fn(),
  installmentCreate: vi.fn(),
  paymentAllocationCreate: vi.fn(),
  paymentAllocationCount: vi.fn(),
  receiptFindUnique: vi.fn(),
  auditLogCreate: vi.fn(),
  transaction: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    booking: { findFirst: database.bookingFindFirst },
    payment: {
      findFirst: database.paymentFindFirst,
      findMany: database.paymentFindMany,
      aggregate: database.paymentAggregate,
      create: database.paymentCreate,
      update: database.paymentUpdate,
    },
    quotationInstallment: {
      findMany: database.installmentFindMany,
      create: database.installmentCreate,
    },
    paymentAllocation: {
      create: database.paymentAllocationCreate,
      count: database.paymentAllocationCount,
    },
    receipt: { findUnique: database.receiptFindUnique },
    auditLog: { create: database.auditLogCreate },
    $transaction: database.transaction,
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'finance-a', tenantId: 'tenant-a', isSuperAdmin: false };
    next();
  },
}));

vi.mock('../middleware/authorization', () => ({
  authorize: () => (_req: any, _res: any, next: any) => next(),
  authorizeEffectivePermission: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../middleware/audit', () => ({ auditLog: vi.fn() }));
vi.mock('../services/recordAccess', () => ({
  applyScope: (where: unknown) => where,
  canAccessBooking: vi.fn().mockResolvedValue(true),
  getScopeClause: vi.fn().mockResolvedValue(null),
}));

import paymentsRouter from './payments';

const servers: Server[] = [];
const transactionClient = {
  $queryRaw: database.queryRaw,
  booking: { findFirst: database.bookingFindFirst },
  payment: {
    aggregate: database.paymentAggregate,
    create: database.paymentCreate,
    findFirst: database.paymentFindFirst,
    findMany: database.paymentFindMany,
    update: database.paymentUpdate,
  },
  quotationInstallment: {
    findMany: database.installmentFindMany,
    create: database.installmentCreate,
  },
  paymentAllocation: { create: database.paymentAllocationCreate },
  auditLog: { create: database.auditLogCreate },
};

async function requestPayment(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) {
  const app = express();
  app.use(express.json());
  app.use('/api/payments', paymentsRouter);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/payments${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  database.bookingFindFirst.mockResolvedValue({
    id: 'booking-a',
    tenantId: 'tenant-a',
    ownerId: 'finance-a',
    creatorId: 'finance-a',
    leadId: 'lead-a',
    status: 'CONFIRMED',
    totalAmount: 100,
  });
  database.paymentAggregate.mockResolvedValue({ _sum: { amount: 0 } });
  database.paymentCreate.mockResolvedValue({
    id: 'payment-a',
    amount: 25,
    status: 'PENDING',
    booking: { id: 'booking-a', number: 'BK-001' },
  });
  database.paymentUpdate.mockResolvedValue({
    id: 'payment-a',
    amount: 40,
    status: 'VERIFIED',
    bookingId: 'booking-a',
    verifiedAt: new Date('2026-10-13T00:00:00.000Z'),
  });
  database.installmentFindMany.mockResolvedValue([]);
  database.installmentCreate.mockResolvedValue({
    id: 'installment-default',
    name: 'Full booking amount',
    scheduledAmount: 100,
  });
  database.paymentFindMany.mockResolvedValue([]);
  database.paymentAllocationCreate.mockImplementation(async ({ data }: { data: { id?: string; amount: { toNumber(): number } } }) => ({
    id: `allocation-${database.paymentAllocationCreate.mock.calls.length}`,
    ...data,
    amount: { toNumber: () => Number(data.amount) },
  }));
  database.auditLogCreate.mockResolvedValue({});
  database.queryRaw.mockResolvedValue([]);
  database.transaction.mockImplementation((callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient));
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('payment financial safeguards', () => {
  it('records a new payment as pending', async () => {
    const response = await requestPayment('POST', '/', { bookingId: 'booking-a', amount: 25 });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ success: true, data: { status: 'PENDING' } });
    expect(database.paymentCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant-a', amount: 25, status: 'PENDING' }),
    }));
  });

  it('rejects a payment that would exceed the remaining booking amount', async () => {
    database.paymentAggregate.mockResolvedValue({ _sum: { amount: 90 } });

    const response = await requestPayment('POST', '/', { bookingId: 'booking-a', amount: 15 });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: 'Payment exceeds the remaining booking amount' });
    expect(database.paymentCreate).not.toHaveBeenCalled();
  });

  it('does not allow a verified payment to be deleted', async () => {
    database.paymentFindFirst.mockResolvedValue({ id: 'payment-a', status: 'VERIFIED' });

    const response = await requestPayment('DELETE', '/payment-a');
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: 'Cannot delete a verified payment' });
    expect(database.paymentAllocationCount).not.toHaveBeenCalled();
  });

  it('automatically applies an approved payment to installments in order', async () => {
    database.paymentFindFirst
      .mockResolvedValueOnce({
        id: 'payment-a',
        amount: 40,
        status: 'PENDING',
        bookingId: 'booking-a',
        booking: { id: 'booking-a', ownerId: 'finance-a', creatorId: 'finance-a' },
      })
      .mockResolvedValueOnce({
        id: 'payment-a',
        amount: 40,
        status: 'PENDING',
        bookingId: 'booking-a',
      });
    database.installmentFindMany.mockResolvedValue([
      {
        id: 'installment-a',
        name: 'Installment 1',
        scheduledAmount: 25,
        allocations: [],
      },
      {
        id: 'installment-b',
        name: 'Installment 2',
        scheduledAmount: 50,
        allocations: [],
      },
    ]);
    database.paymentAllocationCreate
      .mockResolvedValueOnce({ id: 'allocation-a', amount: { toNumber: () => 25 } })
      .mockResolvedValueOnce({ id: 'allocation-b', amount: { toNumber: () => 15 } });

    const response = await requestPayment('PATCH', '/payment-a/verify');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        status: 'VERIFIED',
        autoAllocated: [
          { installmentId: 'installment-a', installmentName: 'Installment 1', amount: 25, completed: true },
          { installmentId: 'installment-b', installmentName: 'Installment 2', amount: 15, completed: false },
        ],
        nextInstallmentName: 'Installment 2',
      },
    });
    expect(database.paymentAllocationCreate).toHaveBeenNthCalledWith(1, {
      data: {
        tenantId: 'tenant-a',
        paymentId: 'payment-a',
        installmentId: 'installment-a',
        amount: expect.anything(),
        createdById: 'finance-a',
      },
    });
    expect(database.paymentAllocationCreate).toHaveBeenNthCalledWith(2, {
      data: {
        tenantId: 'tenant-a',
        paymentId: 'payment-a',
        installmentId: 'installment-b',
        amount: expect.anything(),
        createdById: 'finance-a',
      },
    });
  });

  it('creates a full-booking installment and allocates prior and current verified payments', async () => {
    database.paymentFindFirst
      .mockResolvedValueOnce({
        id: 'payment-a',
        amount: 40,
        status: 'PENDING',
        bookingId: 'booking-a',
        booking: { id: 'booking-a', ownerId: 'finance-a', creatorId: 'finance-a', totalAmount: 100 },
      })
      .mockResolvedValueOnce({
        id: 'payment-a',
        amount: 40,
        status: 'PENDING',
        bookingId: 'booking-a',
      });
    database.installmentFindMany.mockResolvedValue([]);
    database.installmentCreate.mockResolvedValue({
      id: 'installment-default',
      name: 'Full booking amount',
      scheduledAmount: 100,
    });
    database.paymentFindMany.mockResolvedValue([
      { id: 'payment-old', amount: 25 },
      { id: 'payment-a', amount: 40 },
    ]);

    const response = await requestPayment('PATCH', '/payment-a/verify');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        autoAllocated: [{
          installmentId: 'installment-default',
          installmentName: 'Full booking amount',
          amount: 40,
          completed: false,
        }],
        nextInstallmentName: 'Full booking amount',
      },
    });
    expect(database.installmentCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        bookingId: 'booking-a',
        quotationId: null,
        scheduledAmount: expect.anything(),
      }),
    }));
    expect(database.paymentAllocationCreate).toHaveBeenCalledTimes(2);
    expect(database.paymentAllocationCreate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ paymentId: 'payment-old', installmentId: 'installment-default' }),
    }));
    expect(database.paymentAllocationCreate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ paymentId: 'payment-a', installmentId: 'installment-default' }),
    }));
  });
});
