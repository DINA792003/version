import { describe, expect, it } from 'vitest';
import { getNavigationByProfile } from './sidebar';

describe('getNavigationByProfile', () => {
  it('does not grant all CRM modules to an admin profile without matching effective permissions', () => {
    const nav = getNavigationByProfile('Sales Executive', [], () => false, false, true);

    expect(nav.some((item) => item.href === '/setup')).toBe(true);
    expect(nav.some((item) => item.href === '/leads')).toBe(false);
    expect(nav.some((item) => item.href === '/bookings')).toBe(false);
    expect(nav.some((item) => item.href === '/reports')).toBe(false);
  });

  it('grants module access only when the required effective permission exists', () => {
    const nav = getNavigationByProfile('Sales Executive', [], (perm) => perm === 'LEAD_READ' || perm === 'REPORT_VIEW', false, false);

    expect(nav.some((item) => item.href === '/leads')).toBe(true);
    expect(nav.some((item) => item.href === '/reports')).toBe(true);
    expect(nav.some((item) => item.href === '/opportunities')).toBe(false);
  });

  it('shows the MIS review queue only to the assigned MIS reviewer profile and role', () => {
    const permission = (name: string) => name === 'QUOTATION_MIS_REVIEW';
    const misNav = getNavigationByProfile('MIS Quotation Reviewer', ['MIS Team'], permission, false, false);
    const otherNav = getNavigationByProfile('Sales', ['MIS Team'], permission, false, false);
    const wrongRoleNav = getNavigationByProfile('MIS Quotation Reviewer', ['Sales'], permission, false, false);

    expect(misNav.some((item) => item.href === '/mis-quotations')).toBe(true);
    expect(misNav.some((item) => item.href === '/quotations')).toBe(false);
    expect(otherNav.some((item) => item.href === '/mis-quotations')).toBe(false);
    expect(wrongRoleNav.some((item) => item.href === '/mis-quotations')).toBe(false);
  });
});

describe('role-based sidebar matrix', () => {
  const withPerms = (...perms: string[]) => (perm: string) => perms.includes(perm);

  const presalesPerms = ['LEAD_READ', 'SITE_VISIT_READ', 'DASHBOARD_READ', 'REPORT_VIEW'];
  const salesPerms = [
    'LEAD_READ', 'SITE_VISIT_READ', 'DASHBOARD_READ',
    'OPPORTUNITY_READ', 'QUOTATION_READ', 'BOOKING_READ', 'PAYMENT_READ', 'PROJECT_READ',
    'REPORT_VIEW',
  ];
  const crmPerms = [
    'LEAD_READ', 'SITE_VISIT_READ', 'DASHBOARD_READ',
    'OPPORTUNITY_READ', 'QUOTATION_READ', 'BOOKING_READ', 'PAYMENT_READ',
    'PROJECT_READ', 'TASK_READ', 'REPORT_VIEW',
  ];
  const allPerms = [
    'LEAD_READ', 'SITE_VISIT_READ', 'OPPORTUNITY_READ', 'QUOTATION_READ',
    'BOOKING_READ', 'PAYMENT_READ', 'PROJECT_READ', 'TASK_READ', 'UNIT_READ',
    'FOLLOW_UP_READ', 'REPORT_VIEW',
  ];

  it('Presales sees Home, Leads, Site Visits, and Reports', () => {
    const nav = getNavigationByProfile('Presales', [], withPerms(...presalesPerms), false, false);
    expect(nav.map((item) => item.title)).toEqual(['Home', 'Leads', 'Site Visits', 'Reports']);
  });

  it('SVC sees Units when Unit read access is granted', () => {
    const nav = getNavigationByProfile('SVC', [], withPerms(...presalesPerms, 'UNIT_READ'), false, false);
    expect(nav.map((item) => item.title)).toEqual(['Home', 'Leads', 'Site Visits', 'Units', 'Reports']);
  });

  it('Sales sees Leads, Site Visits, Opportunities, Quotations, Bookings, Payments, and Reports', () => {
    const nav = getNavigationByProfile('Sales', [], withPerms(...salesPerms), false, false);
    expect(nav.map((item) => item.title)).toEqual([
      'Home', 'Leads', 'Site Visits', 'Opportunities', 'Quotations', 'Bookings', 'Payments', 'Reports',
    ]);
  });

  it('CRM sees the Sales modules plus Projects and Tasks, and Reports', () => {
    const nav = getNavigationByProfile('CRM', [], withPerms(...crmPerms), false, false);
    expect(nav.map((item) => item.title)).toEqual([
      'Home', 'Leads', 'Site Visits', 'Opportunities', 'Quotations', 'Bookings', 'Payments',
      'Projects', 'Tasks', 'Reports',
    ]);
  });

  it('Admin does not show Pre Sales, Sales, or SVC in the sidebar', () => {
    const nav = getNavigationByProfile('Admin', [], withPerms(...allPerms), false, true);
    expect(nav.map((item) => item.title)).toEqual([
      'Home', 'Leads', 'Site Visits', 'Opportunities', 'Quotations', 'Bookings', 'Payments',
      'Projects', 'Units', 'Tasks', 'Reports', 'Setup Home',
    ]);
    expect(nav.some((item) => item.href === '/profiles/pre-sales')).toBe(false);
    expect(nav.some((item) => item.href === '/profiles/sales')).toBe(false);
    expect(nav.some((item) => item.href === '/profiles/svc')).toBe(false);
  });

  it('shows Units to non-admin profiles when Unit read access is granted', () => {
    const nav = getNavigationByProfile('Sales', [], withPerms(...allPerms), false, false);
    expect(nav.some((item) => item.title === 'Home')).toBe(true);
    expect(nav.some((item) => item.href === '/units')).toBe(true);
    expect(nav.some((item) => item.title === 'Reports')).toBe(true);
    expect(nav.some((item) => item.title === 'Leads')).toBe(true);
    expect(nav.some((item) => item.title === 'Tasks')).toBe(true);
    expect(nav.some((item) => item.title === 'Followups')).toBe(true);
    expect(nav.some((item) => item.title === 'Setup Home')).toBe(false);
  });

  it('Superadmin sees Companies and every module plus Setup Home', () => {
    const nav = getNavigationByProfile(undefined, [], withPerms(...allPerms), true, true);
    expect(nav.map((item) => item.title)).toEqual([
      'Home', 'Companies', 'Leads', 'Site Visits', 'Opportunities', 'Quotations', 'Bookings',
      'Payments', 'Projects', 'Units', 'Tasks', 'Reports', 'Setup Home',
    ]);
  });
});