import express from 'express';
import type { NextFunction, Request, Response as ExpressResponse } from 'express';
import type { Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  paymentFindFirst: vi.fn(),
  paymentFindFirstTransactional: vi.fn(),
  paymentCreate: vi.fn(),
  paymentAggregate: vi.fn(),
  bookingFindFirst: vi.fn(),
  receiptFindMany: vi.fn(),
  receiptCount: vi.fn(),
  receiptFindFirst: vi.fn(),
  receiptCreate: vi.fn(),
  paymentFindMany: vi.fn(),
  paymentUpdate: vi.fn(),
  installmentFindMany: vi.fn(),
  installmentCreate: vi.fn(),
  paymentAllocationCreate: vi.fn(),
  unitFindFirst: vi.fn(),
  unitUpdateMany: vi.fn(),
  auditLogCreate: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    payment: { findFirst: database.paymentFindFirst },
    booking: { findFirst: database.bookingFindFirst },
    receipt: {
      findMany: database.receiptFindMany,
      count: database.receiptCount,
      findFirst: database.receiptFindFirst,
    },
    $transaction: database.transaction,
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: Request, _res: ExpressResponse, next: NextFunction) => {
    Object.assign(req, { user: { id: 'finance-a', tenantId: 'tenant-a', isSuperAdmin: false } });
    next();
  },
}));

vi.mock('../middleware/authorization', () => ({
  authorize: () => (_req: Request, _res: ExpressResponse, next: NextFunction) => next(),
  authorizeEffectivePermission: () => (_req: Request, _res: ExpressResponse, next: NextFunction) => next(),
}));

vi.mock('../services/recordAccess', () => ({
  canAccessBooking: vi.fn().mockResolvedValue(true),
  getScopeClause: vi.fn().mockResolvedValue(null),
  applyScope: (where: unknown) => where,
}));

import receiptsRouter from './receipts';

const servers: Server[] = [];
const transactionClient = {
  $queryRaw: database.queryRaw,
  payment: {
    findFirst: database.paymentFindFirst,
    findMany: database.paymentFindMany,
    update: database.paymentUpdate,
    create: database.paymentCreate,
    aggregate: database.paymentAggregate,
  },
  booking: { findFirst: database.bookingFindFirst },
  quotationInstallment: {
    findMany: database.installmentFindMany,
    create: database.installmentCreate,
  },
  paymentAllocation: { create: database.paymentAllocationCreate },
  unit: { findFirst: database.unitFindFirst, updateMany: database.unitUpdateMany },
  receipt: { create: database.receiptCreate },
  auditLog: { create: database.auditLogCreate },
};

async function issueReceipt() {
  const app = express();
  app.use(express.json());
  app.use('/api/receipts', receiptsRouter);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/receipts/payments/payment-a/issue`, {
    method: 'POST',
  });
}

async function requestReceiptApproval(body: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use('/api/receipts', receiptsRouter);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/receipts/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function listReceipts(query: string) {
  const app = express();
  app.use(express.json());
  app.use('/api/receipts', receiptsRouter);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/receipts${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  database.bookingFindFirst.mockResolvedValue({
    id: 'booking-a',
    tenantId: 'tenant-a',
    status: 'CONFIRMED',
    totalAmount: 100000,
    lead: { firstName: 'Customer', lastName: 'A' },
    project: { name: 'Project A', address: null, city: null, state: null },
    unit: { id: 'unit-a', number: 'U020', area: 1000, price: 100, status: 'AVAILABLE' },
    quotation: { id: 'quotation-a', status: 'APPROVED' },
    tenant: { name: 'Company A' },
  });
  database.receiptFindMany.mockResolvedValue([]);
  database.receiptCount.mockResolvedValue(0);
  database.paymentAggregate.mockResolvedValue({ _sum: { amount: 0 } });
  database.paymentCreate.mockResolvedValue({
    id: 'payment-request-a',
    amount: 100,
    status: 'PENDING',
    reference: 'BANK-001',
  });
  database.paymentFindFirst.mockResolvedValue({
    id: 'payment-a',
    tenantId: 'tenant-a',
    status: 'COMPLETED',
    amount: 100,
    paymentDate: new Date('2026-10-12T00:00:00.000Z'),
    reference: 'PAY-001',
    notes: 'Payer: Customer A\nPayment mode: Bank Transfer',
    booking: {
      id: 'booking-a',
      projectId: 'project-a',
      status: 'PENDING',
      totalAmount: 100000,
      lead: { firstName: 'Customer', lastName: 'A' },
      project: { name: 'Project A', address: null, city: null, state: null },
      unit: { id: 'unit-a', number: 'U020', area: 1000, price: 100, status: 'AVAILABLE' },
      quotation: { id: 'quotation-a', status: 'APPROVED' },
    },
    tenant: { name: 'Company A' },
  });
  database.receiptFindFirst.mockResolvedValue(null);
  database.paymentFindMany.mockResolvedValue([{ id: 'payment-a', amount: 100, receipt: null }]);
  database.paymentUpdate.mockResolvedValue({ id: 'payment-a', status: 'COMPLETED' });
  database.installmentFindMany.mockResolvedValue([]);
  database.installmentCreate.mockResolvedValue({
    id: 'installment-default',
    name: 'Full booking amount',
    scheduledAmount: 100000,
  });
  database.paymentAllocationCreate.mockResolvedValue({
    id: 'allocation-a',
    amount: { toNumber: () => 100 },
  });
  database.receiptCreate.mockResolvedValue({
    id: 'receipt-a',
    receiptNumber: 'RCP-PAYMENT-A',
    amount: { toNumber: () => 100 },
  });
  database.unitFindFirst.mockResolvedValue({ status: 'AVAILABLE' });
  database.unitUpdateMany.mockResolvedValue({ count: 1 });
  database.auditLogCreate.mockResolvedValue({});
  database.queryRaw.mockResolvedValue([]);
  database.transaction.mockImplementation((callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient));
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('official receipt unit reservation', () => {
  it('submits receipt details as a pending payment for Finance approval', async () => {
    const response = await requestReceiptApproval({
      bookingId: 'booking-a',
      amount: 100,
      payerName: 'Customer A',
      paymentDate: '2026-10-12T00:00:00.000Z',
      paymentMode: 'Bank Transfer',
      reference: 'BANK-001',
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ success: true, data: { id: 'payment-request-a', status: 'PENDING' } });
    expect(database.paymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        bookingId: 'booking-a',
        amount: 100,
        status: 'PENDING',
        reference: 'BANK-001',
        notes: 'Payer: Customer A\nPayment mode: Bank Transfer\nReceipt approval requested',
      }),
    });
    expect(database.receiptCreate).not.toHaveBeenCalled();
    expect(database.unitUpdateMany).not.toHaveBeenCalled();
  });

  it('rejects receipt requests unless the booking is linked to an MIS-approved quotation', async () => {
    database.bookingFindFirst.mockResolvedValue({
      id: 'booking-a',
      tenantId: 'tenant-a',
      status: 'CONFIRMED',
      quotation: { id: 'quotation-a', status: 'REJECTED' },
    });

    const response = await requestReceiptApproval({
      bookingId: 'booking-a',
      amount: 100,
      payerName: 'Customer A',
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ error: expect.stringContaining('MIS-approved quotation') });
    expect(database.transaction).not.toHaveBeenCalled();
    expect(database.paymentCreate).not.toHaveBeenCalled();
  });

  it('rejects issuing a receipt when its booking quotation is not MIS-approved', async () => {
    database.paymentFindFirst.mockResolvedValue({
      id: 'payment-a',
      tenantId: 'tenant-a',
      status: 'COMPLETED',
      booking: {
        id: 'booking-a',
        status: 'CONFIRMED',
        quotation: { id: 'quotation-a', status: 'SUBMITTED' },
      },
    });

    const response = await issueReceipt();
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ error: expect.stringContaining('MIS-approved quotation') });
    expect(database.transaction).not.toHaveBeenCalled();
    expect(database.receiptCreate).not.toHaveBeenCalled();
  });

  it('marks the receipt booking unit BOOKED when issuing the official receipt', async () => {
    const response = await issueReceipt();
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ success: true, data: { id: 'receipt-a' } });
    expect(database.unitUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'unit-a',
        tenantId: 'tenant-a',
        status: 'AVAILABLE',
      },
      data: { status: 'BOOKED' },
    });

    expect(database.receiptCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        detailsSnapshot: expect.objectContaining({ balanceAfterReceipt: 99900 }),
      }),
    }));
    expect(database.installmentCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        bookingId: 'booking-a',
        quotationId: null,
        scheduledAmount: expect.anything(),
      }),
    }));
    expect(database.paymentAllocationCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        paymentId: 'payment-a',
        installmentId: 'installment-default',
      }),
    }));
    expect(database.paymentUpdate).toHaveBeenCalledWith({
      where: { id: 'payment-a' },
      data: { status: 'COMPLETED' },
    });
  });

  it('marks the unit booked and issues the receipt without checking competing bookings', async () => {
    const response = await issueReceipt();
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ success: true, data: { id: 'receipt-a' } });
    expect(database.unitUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'BOOKED' },
    }));
    expect(database.receiptCreate).toHaveBeenCalled();
  });

  it('reuses an already-booked unit status when a page has stale unit data', async () => {
    database.unitFindFirst.mockResolvedValue({ status: 'BOOKED' });
    database.paymentFindFirst
      .mockResolvedValueOnce({
        id: 'payment-a',
        tenantId: 'tenant-a',
        status: 'COMPLETED',
        amount: 100,
        paymentDate: new Date('2026-10-12T00:00:00.000Z'),
        reference: 'PAY-001',
        notes: null,
        booking: {
          id: 'booking-a',
          projectId: 'project-a',
          status: 'PENDING',
          totalAmount: 100000,
          lead: { firstName: 'Customer', lastName: 'A' },
          project: { name: 'Project A', address: null, city: null, state: null },
          unit: { id: 'unit-a', number: 'U020', area: 1000, price: 100, status: 'AVAILABLE' },
          quotation: { id: 'quotation-a', status: 'APPROVED' },
        },
        tenant: { name: 'Company A' },
      })
      .mockResolvedValueOnce({
        id: 'payment-a',
        status: 'COMPLETED',
        receipt: null,
      });

    const response = await issueReceipt();
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ success: true, data: { id: 'receipt-a' } });
    expect(database.unitUpdateMany).not.toHaveBeenCalled();
    expect(database.receiptCreate).toHaveBeenCalled();
  });

  it('issues a receipt and keeps payment allocation when the linked unit record is missing', async () => {
    database.unitFindFirst.mockResolvedValue(null);

    const response = await issueReceipt();
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      success: true,
      warning: expect.stringContaining('unit record was not found'),
      data: { id: 'receipt-a' },
    });
    expect(database.receiptCreate).toHaveBeenCalled();
    expect(database.paymentAllocationCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        paymentId: 'payment-a',
        installmentId: 'installment-default',
      }),
    }));
  });
});

describe('receipt opportunity filter', () => {
  it('limits the receipt register query to the requested opportunity', async () => {
    const response = await listReceipts('?opportunityId=opportunity-a');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: [] });
    expect(database.receiptFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId: 'tenant-a',
        booking: { is: { opportunityId: 'opportunity-a' } },
      },
    }));
    expect(database.receiptCount).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        booking: { is: { opportunityId: 'opportunity-a' } },
      },
    });
  });
});
