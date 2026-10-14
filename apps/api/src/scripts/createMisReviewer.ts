import 'dotenv/config';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@dct-crm/db';
import { ensureMisQuotationTeam } from '../services/tenantBootstrap';

async function main() {
  const tenantSlug = process.env.MIS_TENANT_SLUG?.trim();
  const email = process.env.MIS_USER_EMAIL?.trim().toLowerCase();
  const firstName = process.env.MIS_USER_FIRST_NAME?.trim();
  if (!tenantSlug || !email || !firstName) {
    throw new Error('Set MIS_TENANT_SLUG, MIS_USER_EMAIL, and MIS_USER_FIRST_NAME before running this setup.');
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true, maxTotalUsers: true },
  });
  if (!tenant) throw new Error(`No company was found for tenant slug "${tenantSlug}".`);

  const existingUser = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email },
    select: { id: true },
  });
  if (existingUser) throw new Error(`A user with ${email} already exists in ${tenant.name}; no account changes were made.`);

  const existingUserCount = await prisma.user.count({
    where: { tenantId: tenant.id, isActive: true, isSuperAdmin: false },
  });
  if (existingUserCount >= tenant.maxTotalUsers) {
    throw new Error(`The active user limit for ${tenant.name} has been reached.`);
  }

  const quotationObject = await prisma.objectDefinition.findFirst({
    where: { tenantId: tenant.id, name: 'Quotation' },
    select: { id: true },
  });
  if (!quotationObject) {
    throw new Error(`The tenant ${tenant.name} has no tenant-local Quotation object; setup stopped without creating an account.`);
  }

  const temporaryPassword = randomBytes(24).toString('base64url');
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const createdUser = await prisma.$transaction(async (tx) => {
    const { misProfileId, misRoleId } = await ensureMisQuotationTeam(tx, tenant.id);
    const actor = await tx.user.findFirst({
      where: { tenantId: tenant.id, isActive: true, profile: { isAdmin: true } },
      select: { id: true },
    });
    if (!actor) throw new Error(`No active tenant administrator was found in ${tenant.name}; no account was created.`);
    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email,
        firstName,
        lastName: '',
        passwordHash,
        profileId: misProfileId,
        roleId: misRoleId,
        roles: { create: { roleId: misRoleId } },
      },
      select: { id: true, email: true, firstName: true },
    });
    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        userId: actor.id,
        action: 'CREATE',
        objectType: 'User',
        objectId: user.id,
        newValues: { email: user.email, profile: 'MIS Quotation Reviewer', role: 'MIS Team' },
      },
    });
    return user;
  });

  console.log(JSON.stringify({
    company: tenant.name,
    user: createdUser,
    temporaryPassword,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error('MIS reviewer setup failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
