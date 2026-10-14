import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { bootstrapTenant } from './tenantBootstrap';

describe('bootstrapTenant', () => {
  const adminProfile = { id: 'admin-profile' };
  const standardProfile = { id: 'standard-profile' };
  const misProfile = { id: 'mis-profile' };
  const adminRole = { id: 'admin-role' };
  const misRole = { id: 'mis-role' };
  const definitions: Array<{ id: string; label: string }> = [];
  const tx = {
    profile: {
      upsert: vi.fn()
        .mockResolvedValueOnce(adminProfile)
        .mockResolvedValueOnce(standardProfile)
        .mockResolvedValueOnce(misProfile),
    },
    role: {
      upsert: vi.fn()
        .mockResolvedValueOnce(adminRole)
        .mockResolvedValueOnce(misRole),
    },
    permission: {
      createMany: vi.fn().mockResolvedValue({ count: 20 }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn(async ({ where }: { where: { name: { in: string[] } } }) =>
        where.name.in.map((name) => ({ id: `permission-${name}`, name })),
      ),
    },
    userProfilePermission: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    objectDefinition: {
      createMany: vi.fn().mockResolvedValue({ count: 15 }),
      findMany: vi.fn(async () => {
        const seeded = [
          'Activity', 'Booking', 'CallDetail', 'Company', 'Enquiry', 'FollowUp', 'Lead',
          'Opportunity', 'Payment', 'Project', 'Quotation', 'Receipt', 'SiteVisit', 'Task', 'Unit',
        ].map((name, index) => ({ id: `object-${index}`, name, label: name }));
        definitions.push(...seeded);
        return seeded;
      }),
      findFirst: vi.fn().mockResolvedValue({ id: 'object-10' }),
    },
    pageLayout: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 15 }),
    },
    profileObjectPermission: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 15 }),
    },
    profileFieldPermission: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    permissionSetRole: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    objectPermission: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 15 }),
    },
    fieldPermission: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    sequence: { createMany: vi.fn().mockResolvedValue({ count: 4 }) },
  } as unknown as Prisma.TransactionClient;

  beforeEach(() => {
    vi.clearAllMocks();
    definitions.length = 0;
    vi.mocked(tx.profile.upsert)
      .mockResolvedValueOnce(adminProfile as never)
      .mockResolvedValueOnce(standardProfile as never)
      .mockResolvedValueOnce(misProfile as never);
    vi.mocked(tx.role.upsert)
      .mockResolvedValueOnce(adminRole as never)
      .mockResolvedValueOnce(misRole as never);
  });

  it('creates tenant-local CRM metadata, administrator access, and empty sequences', async () => {
    const result = await bootstrapTenant(tx, 'new-tenant', 'creator');

    expect(result).toEqual({
      adminProfileId: 'admin-profile',
      adminRoleId: 'admin-role',
      misProfileId: 'mis-profile',
      misRoleId: 'mis-role',
    });
    expect(tx.profile.upsert).toHaveBeenCalledTimes(3);
    expect(tx.role.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_name: { tenantId: 'new-tenant', name: 'Admin' } },
    }));
    expect(tx.permission.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({ name: 'FULL_SYSTEM_ACCESS' })]),
      skipDuplicates: true,
    }));
    expect(vi.mocked(tx.permission.createMany).mock.calls[0]?.[0]?.data)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'QUOTATION_MIS_REVIEW' })]));
    expect(tx.userProfilePermission.createMany).toHaveBeenCalledTimes(3);
    expect(tx.userProfilePermission.deleteMany).toHaveBeenCalledWith({ where: { profileId: 'mis-profile' } });
    expect(vi.mocked(tx.userProfilePermission.createMany).mock.calls[1]?.[0]?.data)
      .toEqual([{ profileId: 'mis-profile', permissionId: 'permission-QUOTATION_MIS_REVIEW' }]);
    expect(tx.role.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_name: { tenantId: 'new-tenant', name: 'MIS Team' } },
    }));
    expect(tx.permissionSetRole.deleteMany).toHaveBeenCalledWith({ where: { roleId: 'mis-role' } });
    expect(tx.profileObjectPermission.deleteMany).toHaveBeenCalledWith({ where: { profileId: 'mis-profile' } });
    expect(tx.profileFieldPermission.deleteMany).toHaveBeenCalledWith({ where: { profileId: 'mis-profile' } });
    expect(tx.objectPermission.deleteMany).toHaveBeenCalledWith({ where: { roleId: 'mis-role' } });
    expect(tx.fieldPermission.deleteMany).toHaveBeenCalledWith({ where: { roleId: 'mis-role' } });

    const objectCreateCall = vi.mocked(tx.objectDefinition.createMany).mock.calls[0];
    const objectCreateData = objectCreateCall?.[0]?.data;
    const createdObjects = Array.isArray(objectCreateData)
      ? objectCreateData
      : objectCreateData
        ? [objectCreateData]
        : [];
    expect(createdObjects.map(({ name }) => name).sort()).toEqual([
      'Activity',
      'Booking',
      'CallDetail',
      'Company',
      'Enquiry',
      'FollowUp',
      'Lead',
      'Opportunity',
      'Payment',
      'Project',
      'Quotation',
      'Receipt',
      'SiteVisit',
      'Task',
      'Unit',
    ].sort());
    expect(createdObjects.every((object) => object.tenantId === 'new-tenant' && object.objectType === 'standard')).toBe(true);
    expect(tx.permission.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { name: { in: expect.arrayContaining([
        'LEAD_READ',
        'SITE_VISIT_READ',
        'OPPORTUNITY_READ',
        'QUOTATION_READ',
        'BOOKING_READ',
        'PAYMENT_READ',
        'RECEIPT_READ',
        'PROJECT_READ',
        'TASK_READ',
        'REPORT_VIEW',
        'DASHBOARD_READ',
        'FULL_SYSTEM_ACCESS',
      ]) } },
    }));
    expect(vi.mocked(tx.permission.findMany).mock.calls[1]?.[0])
      .toMatchObject({ where: { name: { in: ['QUOTATION_MIS_REVIEW'] } } });
    expect(tx.pageLayout.createMany).toHaveBeenCalledTimes(1);
    expect(tx.profileObjectPermission.createMany).toHaveBeenCalledTimes(1);
    expect(vi.mocked(tx.objectDefinition.createMany).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(tx.profileObjectPermission.createMany).mock.invocationCallOrder[0]);
    expect(tx.objectPermission.createMany).toHaveBeenCalledTimes(1);
    expect(tx.sequence.createMany).toHaveBeenCalledWith({
      data: ['LEAD', 'SITE_VISIT', 'FOLLOW_UP', 'ENQUIRY'].map((type) => ({
        tenantId: 'new-tenant',
        type,
        nextValue: 1,
      })),
      skipDuplicates: true,
    });
    expect(tx.lead).toBeUndefined();
    expect(tx.booking).toBeUndefined();
    expect(tx.payment).toBeUndefined();
    expect(tx.project).toBeUndefined();
  });
});
