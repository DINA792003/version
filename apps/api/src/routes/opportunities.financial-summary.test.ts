import express from 'express';
import type { NextFunction, Request, Response as ExpressResponse } from 'express';
import type { Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  opportunityFindFirst: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: { opportunity: { findFirst: database.opportunityFindFirst } },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: Request, _res: ExpressResponse, next: NextFunction) => {
    Object.assign(req, { user: { id: 'finance-a', tenantId: 'tenant-a', isSuperAdmin: false } });
    next();
  },
}));

vi.mock('../middleware/authorization', () => ({
  authorize: () => (_req: Request, _res: ExpressResponse, next: NextFunction) => next(),
}));

vi.mock('../middleware/audit', () => ({ auditLog: vi.fn() }));

vi.mock('../services/recordAccess', () => ({
  getOpportunityVisibilityFilter: vi.fn().mockResolvedValue({ tenantId: 'tenant-a' }),
}));

import opportunitiesRouter from './opportunities';

const servers: Server[] = [];

async function getFinancialSummary() {
  const app = express();
  app.use('/api/opportunities', opportunitiesRouter);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/opportunities/opportunity-a/financial-summary`);
}

beforeEach(() => {
  vi.clearAllMocks();
  database.opportunityFindFirst.mockResolvedValue({
    quotations: [],
    bookings: [{
      id: 'booking-a',
      totalAmount: 1000,
      payments: [{
        id: 'payment-a',
        bookingId: 'booking-a',
        amount: 250,
        status: 'COMPLETED',
        paymentDate: new Date('2026-10-13T00:00:00.000Z'),
        reference: 'PAY-001',
        receipt: { id: 'receipt-a', receiptNumber: 'RCP-001', status: 'CANCELLED' },
        allocations: [{ amount: 250 }],
      }],
      installments: [{
        id: 'installment-a',
        sequenceNumber: 1,
        name: 'Full booking amount',
        description: null,
        dueDate: new Date('2026-10-14T00:00:00.000Z'),
        scheduledAmount: 1000,
        allocations: [{
          amount: 250,
          payment: {
            id: 'payment-a',
            status: 'COMPLETED',
            paymentDate: new Date('2026-10-13T00:00:00.000Z'),
            receipt: { status: 'CANCELLED' },
          },
        }],
      }],
    }],
  });
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('opportunity financial summary', () => {
  it('subtracts verified payments from booking and installment balances regardless of receipt status', async () => {
    const response = await getFinancialSummary();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        bookingAmount: 1000,
        verifiedPaymentAmount: 250,
        outstandingAmount: 750,
        scheduledAmount: 1000,
        allocatedAmount: 250,
        installmentOutstandingAmount: 750,
        installments: [{
          scheduledAmount: 1000,
          receivedAmount: 250,
          outstandingAmount: 750,
        }],
        payments: [{
          amount: 250,
          allocatedAmount: 250,
          unallocatedAmount: 0,
        }],
      },
    });
  });
});
