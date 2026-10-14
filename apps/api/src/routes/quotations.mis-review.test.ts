import express from 'express';
import type { NextFunction, Request, Response as ExpressResponse } from 'express';
import type { Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  quotationFindFirst: vi.fn(),
  quotationFindMany: vi.fn(),
  quotationUpdateMany: vi.fn(),
  approvalCreate: vi.fn(),
  auditLogCreate: vi.fn(),
  notificationCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@dct-crm/db', () => ({
  prisma: {
    user: { findFirst: database.userFindFirst },
    quotation: {
      findFirst: database.quotationFindFirst,
      findMany: database.quotationFindMany,
      updateMany: database.quotationUpdateMany,
    },
    $transaction: database.transaction,
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: Request, _res: ExpressResponse, next: NextFunction) => {
    Object.assign(req, { user: { id: 'mis-user', tenantId: 'tenant-a', isSuperAdmin: false } });
    next();
  },
}));

vi.mock('../middleware/authorization', () => ({
  authorize: () => (_req: Request, _res: ExpressResponse, next: NextFunction) => next(),
}));

vi.mock('../services/recordAccess', () => ({
  applyScope: (where: Record<string, unknown>) => where,
  canAccessLeadId: vi.fn().mockResolvedValue(true),
  canAccessOpportunity: vi.fn().mockResolvedValue(true),
  canAccessQuotation: vi.fn().mockResolvedValue(true),
  getScopeClause: vi.fn().mockResolvedValue(null),
}));

import quotationsRouter from './quotations';

const servers: Server[] = [];
const transactionClient = {
  quotation: {
    updateMany: database.quotationUpdateMany,
    findFirst: database.quotationFindFirst,
  },
  approval: { create: database.approvalCreate },
  auditLog: { create: database.auditLogCreate },
  notification: { create: database.notificationCreate },
};

async function request(path: string, method = 'GET', body?: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use('/api/quotations', quotationsRouter);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  return fetch(`http://127.0.0.1:${address.port}/api/quotations${path}`, {
    method,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
}

describe('MIS quotation review workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.userFindFirst.mockResolvedValue({ id: 'mis-user' });
    database.transaction.mockImplementation((callback) => callback(transactionClient));
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })));
  });

  it('lists only submitted quotations from the authenticated tenant with full line details', async () => {
    database.quotationFindMany.mockResolvedValue([{ id: 'quote-1', status: 'SUBMITTED', items: [] }]);

    const response = await request('/mis-review');
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(database.quotationFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-a', status: 'SUBMITTED' },
      include: expect.objectContaining({
        items: expect.any(Object),
        opportunity: expect.any(Object),
        submittedBy: expect.any(Object),
      }),
    }));
    expect(result).toMatchObject({ data: [{ id: 'quote-1', status: 'SUBMITTED' }] });
  });

  it('blocks users outside the MIS reviewer profile and role', async () => {
    database.userFindFirst.mockResolvedValue(null);

    const response = await request('/mis-review');

    expect(response.status).toBe(403);
    expect(database.quotationFindMany).not.toHaveBeenCalled();
  });

  it('pushes the existing quotation once and rejects duplicate pending submissions', async () => {
    database.quotationFindFirst
      .mockResolvedValueOnce({ id: 'quote-1', status: 'DRAFT' })
      .mockResolvedValueOnce({ id: 'quote-1', status: 'SUBMITTED' })
      .mockResolvedValueOnce({ id: 'quote-1', status: 'SUBMITTED' });
    database.quotationUpdateMany.mockResolvedValue({ count: 1 });

    const firstResponse = await request('/quote-1/push-to-mis', 'PATCH');
    expect(firstResponse.status).toBe(200);
    expect(database.quotationUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'quote-1', tenantId: 'tenant-a', status: { in: ['DRAFT', 'REJECTED'] } },
    }));

    const duplicateResponse = await request('/quote-1/push-to-mis', 'PATCH');
    expect(duplicateResponse.status).toBe(409);
    expect(database.quotationUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('accepts a submitted quotation once and notifies its CRM submitter', async () => {
    database.quotationFindFirst
      .mockResolvedValueOnce({ id: 'quote-1', number: 'QT-001', status: 'SUBMITTED', submittedById: 'crm-user' })
      .mockResolvedValueOnce({ id: 'quote-1', status: 'APPROVED' })
      .mockResolvedValueOnce({ id: 'quote-1', number: 'QT-001', status: 'SUBMITTED', submittedById: 'crm-user' });
    database.quotationUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const response = await request('/quote-1/mis-review/accept', 'PATCH');
    expect(response.status).toBe(200);
    expect(database.quotationUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'quote-1', tenantId: 'tenant-a', status: 'SUBMITTED' },
      data: expect.objectContaining({ status: 'APPROVED', reviewedById: 'mis-user' }),
    }));
    expect(database.approvalCreate).toHaveBeenCalledTimes(1);
    expect(database.approvalCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        quotationId: 'quote-1',
        approverId: 'mis-user',
        status: 'APPROVED',
      }),
    }));
    expect(database.notificationCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'crm-user',
        referenceId: 'quote-1',
        type: 'QUOTATION_MIS_ACCEPTED',
      }),
    }));

    const repeatedDecision = await request('/quote-1/mis-review/accept', 'PATCH');
    expect(repeatedDecision.status).toBe(409);
    expect(database.approvalCreate).toHaveBeenCalledTimes(1);
  });

  it('requires a rejection reason and records a single reviewer decision with a CRM notification', async () => {
    database.quotationFindFirst.mockResolvedValue({
      id: 'quote-1',
      number: 'QT-001',
      status: 'SUBMITTED',
      submittedById: 'crm-user',
    });
    database.quotationUpdateMany.mockResolvedValue({ count: 1 });
    database.quotationFindFirst.mockResolvedValueOnce({
      id: 'quote-1',
      number: 'QT-001',
      status: 'SUBMITTED',
      submittedById: 'crm-user',
    }).mockResolvedValueOnce({ id: 'quote-1', status: 'REJECTED' });

    const missingReason = await request('/quote-1/mis-review/reject', 'PATCH', { reason: '  ' });
    expect(missingReason.status).toBe(400);
    expect(database.transaction).not.toHaveBeenCalled();

    const response = await request('/quote-1/mis-review/reject', 'PATCH', { reason: 'Update the tax calculation.' });
    expect(response.status).toBe(200);
    expect(database.approvalCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        quotationId: 'quote-1',
        approverId: 'mis-user',
        status: 'REJECTED',
        comments: 'Update the tax calculation.',
      }),
    }));
    expect(database.notificationCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        userId: 'crm-user',
        referenceId: 'quote-1',
        type: 'QUOTATION_MIS_REJECTED',
      }),
    }));
  });
});
