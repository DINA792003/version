import type { Prisma } from '@prisma/client';

const STANDARD_OBJECTS = [
  { name: 'Lead', label: 'Lead', pluralLabel: 'Leads', icon: 'user', description: 'Manage sales leads' },
  { name: 'Enquiry', label: 'Enquiry', pluralLabel: 'Enquiries', icon: 'inbox', description: 'Manage lead enquiries' },
  { name: 'Opportunity', label: 'Opportunity', pluralLabel: 'Opportunities', icon: 'trending-up', description: 'Sales pipeline' },
  { name: 'SiteVisit', label: 'Site Visit', pluralLabel: 'Site Visits', icon: 'map-pin', description: 'Site visit scheduling' },
  { name: 'Quotation', label: 'Quotation', pluralLabel: 'Quotations', icon: 'file-text', description: 'Quotation management' },
  { name: 'Booking', label: 'Booking', pluralLabel: 'Bookings', icon: 'calendar-check', description: 'Booking management' },
  { name: 'Payment', label: 'Payment', pluralLabel: 'Payments', icon: 'credit-card', description: 'Payment tracking' },
  { name: 'Receipt', label: 'Receipt', pluralLabel: 'Receipts', icon: 'receipt', description: 'Receipt management' },
  { name: 'Project', label: 'Project', pluralLabel: 'Projects', icon: 'folder-kanban', description: 'Project management' },
  { name: 'Unit', label: 'Unit', pluralLabel: 'Units', icon: 'building', description: 'Manage project units' },
  { name: 'Task', label: 'Task', pluralLabel: 'Tasks', icon: 'check-square', description: 'Task management' },
  { name: 'Company', label: 'Company', pluralLabel: 'Companies', icon: 'building', description: 'Manage companies' },
  { name: 'FollowUp', label: 'Follow-up', pluralLabel: 'Follow-ups', icon: 'phone', description: 'Manage lead follow-ups' },
  { name: 'Activity', label: 'Activity', pluralLabel: 'Activities', icon: 'activity', description: 'Track CRM activities' },
  { name: 'CallDetail', label: 'Call Detail', pluralLabel: 'Call Details', icon: 'phone', description: 'Track inbound and outbound calls', isAvailableInNavigation: false },
] as const;

const MODULE_READ_PERMISSIONS = [
  'LEAD_READ',
  'SITE_VISIT_READ',
  'OPPORTUNITY_READ',
  'QUOTATION_READ',
  'BOOKING_READ',
  'PAYMENT_READ',
  'RECEIPT_READ',
  'PROJECT_READ',
  'UNIT_READ',
  'TASK_READ',
  'REPORT_READ',
  'REPORT_VIEW',
  'DASHBOARD_READ',
  'USER_READ',
  'ROLE_READ',
  'PROFILE_READ',
];

const DEFAULT_ADMIN_PERMISSIONS = [
  'FULL_SYSTEM_ACCESS',
  ...MODULE_READ_PERMISSIONS,
  'LEAD_CREATE',
  'SITE_VISIT_CREATE',
  'OPPORTUNITY_CREATE',
  'QUOTATION_CREATE',
  'BOOKING_CREATE',
  'PAYMENT_CREATE',
  'RECEIPT_CREATE',
  'PROJECT_CREATE',
  'UNIT_CREATE',
  'TASK_CREATE',
  'REPORT_CREATE',
  'DASHBOARD_CREATE',
];

export interface TenantBootstrapResult {
  adminProfileId: string;
  adminRoleId: string;
  misProfileId: string;
  misRoleId: string;
}

export async function ensureMisQuotationTeam(tx: Prisma.TransactionClient, tenantId: string) {
  const misProfile = await tx.profile.upsert({
    where: { tenantId_name: { tenantId, name: 'MIS Quotation Reviewer' } },
    update: {
      isDefault: false,
      isAdmin: false,
      description: 'Review submitted quotations only',
    },
    create: {
      tenantId,
      name: 'MIS Quotation Reviewer',
      description: 'Review submitted quotations only',
      isAdmin: false,
    },
    select: { id: true },
  });
  const misRole = await tx.role.upsert({
    where: { tenantId_name: { tenantId, name: 'MIS Team' } },
    update: { isSystem: true, description: 'Review submitted quotations only' },
    create: {
      tenantId,
      name: 'MIS Team',
      description: 'Review submitted quotations only',
      isSystem: true,
    },
    select: { id: true },
  });
  const permissionNames = ['QUOTATION_MIS_REVIEW'];
  await tx.permission.createMany({
    data: permissionNames.map((name) => ({
      name,
      label: name.replace(/_/g, ' '),
      module: 'QUOTATION',
      action: 'REVIEW',
      isActive: true,
    })),
    skipDuplicates: true,
  });
  await tx.permission.updateMany({
    where: { name: { in: permissionNames }, isActive: false },
    data: { isActive: true },
  });
  const permissions = await tx.permission.findMany({
    where: { name: { in: permissionNames } },
    select: { id: true, name: true },
  });
  const permissionIdsByName = new Map(permissions.map(({ id, name }) => [name, id]));
  await tx.userProfilePermission.deleteMany({ where: { profileId: misProfile.id } });
  await tx.userProfilePermission.createMany({
    data: permissionNames.flatMap((name) => {
      const permissionId = permissionIdsByName.get(name);
      return permissionId ? [{ profileId: misProfile.id, permissionId }] : [];
    }),
    skipDuplicates: true,
  });
  await tx.profileObjectPermission.deleteMany({ where: { profileId: misProfile.id } });
  await tx.profileFieldPermission.deleteMany({ where: { profileId: misProfile.id } });
  await tx.permissionSetRole.deleteMany({ where: { roleId: misRole.id } });
  await tx.objectPermission.deleteMany({ where: { roleId: misRole.id } });
  await tx.fieldPermission.deleteMany({ where: { roleId: misRole.id } });
  return { misProfileId: misProfile.id, misRoleId: misRole.id };
}

function permissionParts(name: string) {
  const action = name.slice(name.lastIndexOf('_') + 1);
  return {
    module: name.slice(0, -(action.length + 1)),
    action,
  };
}

export async function bootstrapTenant(
  tx: Prisma.TransactionClient,
  tenantId: string,
  actorId: string,
): Promise<TenantBootstrapResult> {
  const adminProfile = await tx.profile.upsert({
    where: { tenantId_name: { tenantId, name: 'System Administrator' } },
    update: { isAdmin: true, isDefault: false },
    create: {
      tenantId,
      name: 'System Administrator',
      description: 'Full administrative access to this company CRM',
      isAdmin: true,
    },
    select: { id: true },
  });
  const standardProfile = await tx.profile.upsert({
    where: { tenantId_name: { tenantId, name: 'Standard User' } },
    update: { isDefault: true, isAdmin: false },
    create: {
      tenantId,
      name: 'Standard User',
      description: 'Default profile for company users',
      isDefault: true,
    },
    select: { id: true },
  });
  const adminRole = await tx.role.upsert({
    where: { tenantId_name: { tenantId, name: 'Admin' } },
    update: { isSystem: true },
    create: { tenantId, name: 'Admin', description: 'Full company administration', isSystem: true },
    select: { id: true },
  });
  const allPermissionNames = DEFAULT_ADMIN_PERMISSIONS;
  await tx.permission.createMany({
    data: allPermissionNames.map((name) => {
      const { module, action } = permissionParts(name);
      return {
        name,
        label: name.replace(/_/g, ' '),
        module,
        action,
        isActive: true,
      };
    }),
    skipDuplicates: true,
  });
  await tx.permission.updateMany({
    where: { name: { in: allPermissionNames }, isActive: false },
    data: { isActive: true },
  });

  const permissions = await tx.permission.findMany({
    where: { name: { in: allPermissionNames } },
    select: { id: true, name: true },
  });
  const permissionIdsByName = new Map(permissions.map(({ id, name }) => [name, id]));
  await tx.userProfilePermission.createMany({
    data: allPermissionNames.flatMap((name) => {
      const permissionId = permissionIdsByName.get(name);
      return permissionId ? [{ profileId: adminProfile.id, permissionId }] : [];
    }),
    skipDuplicates: true,
  });
  const { misProfileId, misRoleId } = await ensureMisQuotationTeam(tx, tenantId);
  await tx.userProfilePermission.createMany({
    data: MODULE_READ_PERMISSIONS.flatMap((name) => {
      const permissionId = permissionIdsByName.get(name);
      return permissionId ? [{ profileId: standardProfile.id, permissionId }] : [];
    }),
    skipDuplicates: true,
  });

  await tx.objectDefinition.createMany({
    data: STANDARD_OBJECTS.map((object) => ({
        tenantId,
        ...object,
        objectType: 'standard',
        createdBy: actorId,
        updatedBy: actorId,
    })),
    skipDuplicates: true,
  });
  const definitions = await tx.objectDefinition.findMany({
    where: { tenantId, name: { in: STANDARD_OBJECTS.map(({ name }) => name) } },
    select: { id: true, label: true },
  });
  const objectIds = definitions.map(({ id }) => id);
  const existingLayouts = await tx.pageLayout.findMany({
    where: { objectId: { in: objectIds }, isDefault: true },
    select: { objectId: true },
  });
  const objectsWithDefaultLayouts = new Set(existingLayouts.map(({ objectId }) => objectId));
  await tx.pageLayout.createMany({
    data: definitions
      .filter(({ id }) => !objectsWithDefaultLayouts.has(id))
      .map((definition) => ({
        tenantId,
        objectId: definition.id,
        name: 'Default Layout',
        isDefault: true,
        sections: [{ name: `${definition.label} Information`, fields: [] }, { name: 'Details', fields: [] }],
        createdBy: actorId,
      })),
    skipDuplicates: true,
  });

  const fullObjectAccess = {
    canCreate: true,
    canRead: true,
    canUpdate: true,
    canDelete: true,
    viewAll: true,
    modifyAll: true,
  };
  await tx.profileObjectPermission.updateMany({
    where: { profileId: adminProfile.id, objectId: { in: objectIds } },
    data: fullObjectAccess,
  });
  await tx.profileObjectPermission.createMany({
    data: definitions.map(({ id }) => ({
        tenantId,
        profileId: adminProfile.id,
        objectId: id,
        ...fullObjectAccess,
      })),
    skipDuplicates: true,
  });
  await tx.objectPermission.updateMany({
    where: { tenantId, roleId: adminRole.id, objectId: { in: objectIds } },
    data: fullObjectAccess,
  });
  await tx.objectPermission.createMany({
    data: definitions.map(({ id }) => ({
      tenantId,
      roleId: adminRole.id,
      objectId: id,
      ...fullObjectAccess,
    })),
    skipDuplicates: true,
  });

  await tx.sequence.createMany({
    data: ['LEAD', 'SITE_VISIT', 'FOLLOW_UP', 'ENQUIRY'].map((type) => ({ tenantId, type, nextValue: 1 })),
    skipDuplicates: true,
  });

  return {
    adminProfileId: adminProfile.id,
    adminRoleId: adminRole.id,
    misProfileId,
    misRoleId,
  };
}
