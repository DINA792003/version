import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OpportunityDetailPage from "./page";

const mocks = vi.hoisted(() => ({
  getOpportunity: vi.fn(),
  getFinancialSummary: vi.fn(),
  listProjects: vi.fn(),
  listUnits: vi.fn(),
  listQuotations: vi.fn(),
  listReceipts: vi.fn(),
  getCompanySettings: vi.fn(),
  createQuotation: vi.fn(),
  downloadQuotation: vi.fn(),
  createPayment: vi.fn(),
  canCreatePayment: false,
  canCreateQuotation: false,
  canCreateReceipt: false,
  push: vi.fn(),
  router: { push: vi.fn() },
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "opportunity-a" }),
  useRouter: () => mocks.router,
}));

vi.mock("@/lib/api", () => ({
  opportunityApi: { get: mocks.getOpportunity, financialSummary: mocks.getFinancialSummary },
  projectApi: { list: mocks.listProjects },
  unitApi: { list: mocks.listUnits },
  companySettingsApi: { get: mocks.getCompanySettings },
  paymentApi: { create: mocks.createPayment },
  receiptApi: { list: mocks.listReceipts, issueForPayment: vi.fn() },
  quotationApi: { list: mocks.listQuotations, create: mocks.createQuotation, downloadPdf: mocks.downloadQuotation },
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    hasEffectivePermission: (permission: string) =>
      (permission === "PAYMENT_CREATE" && mocks.canCreatePayment)
      || (permission === "QUOTATION_CREATE" && mocks.canCreateQuotation)
      || (permission === "RECEIPT_CREATE" && mocks.canCreateReceipt),
    tenant: null,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

describe("OpportunityDetailPage GRE snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canCreatePayment = false;
    mocks.canCreateQuotation = false;
    mocks.canCreateReceipt = false;
    window.history.replaceState({}, "", "/opportunities/opportunity-a");
    mocks.listProjects.mockResolvedValue({ data: { success: true, data: [] } });
    mocks.listUnits.mockResolvedValue({ data: { success: true, data: [] } });
    mocks.listQuotations.mockResolvedValue({ data: { success: true, data: [] } });
    mocks.listReceipts.mockResolvedValue({ data: { success: true, data: [] } });
    mocks.getFinancialSummary.mockResolvedValue({
      data: {
        success: true,
        data: {
          approvedQuotation: null,
          bookingAmount: 0,
          scheduledAmount: 0,
          verifiedPaymentAmount: 0,
          allocatedAmount: 0,
          unallocatedPaymentAmount: 0,
          outstandingAmount: 0,
          installmentOutstandingAmount: 0,
          overdueAmount: 0,
          upcomingAmount: 0,
          installments: [],
          payments: [],
        },
      },
    });
    mocks.getCompanySettings.mockResolvedValue({ data: { success: true, data: null } });
    mocks.getOpportunity.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: "opportunity-a",
          name: "Legacy opportunity title",
          amount: 100000,
          stage: "PROSPECTING",
          probability: 10,
          expectedCloseDate: null,
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-02T00:00:00.000Z",
          lead: {
            id: "lead-a",
            leadNumber: "LD-001",
            firstName: "Old",
            lastName: "Lead",
            email: "old@example.com",
            phone: "1111111111",
            mobile: null,
            company: "Old company",
            budget: 100000,
            preferredLocation: "Old area",
            project: { id: "project-a", name: "Old project" },
          },
          greRegistration: {
            referenceNumber: "GRE-2026-000002",
            submittedAt: "2026-10-07T10:00:00.000Z",
            lead: {
              firstName: "Updated",
              lastName: "Customer",
              email: "updated@example.com",
              phone: "+919876543210",
              company: "Updated company",
              budget: 500000,
              preferredLocation: "New area",
            },
            siteVisit: {
              date: "2026-10-07",
              time: "15:30",
              project: "New project",
              scheduledAt: "2026-10-07T10:00:00.000Z",
              visitType: "Revisit",
              visitorCount: 2,
            },
            company: { name: "Updated company", type: "Builder", industry: "REAL_ESTATE" },
          },
        },
      },
    });
  });

  it("opens on the Details tab and separates lead details", async () => {
    render(<OpportunityDetailPage />);

    expect(await screen.findByRole("heading", { name: "Opportunity Details" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Details" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("heading", { name: "Lead Details" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Payments & Installments" })).not.toBeInTheDocument();
    expect(screen.getByText("Sticky Notes")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Activity & Tasks" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Legacy opportunity title" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Opportunity related lists" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stage 1: prospecting" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate Quotation" })).toHaveClass("h-8", "text-xs");
    expect(screen.getByRole("navigation", { name: "Opportunity related lists" }).querySelector("button")).toHaveClass("text-xs");

    fireEvent.click(screen.getByRole("button", { name: "Lead Details" }));
    expect(await screen.findByRole("heading", { name: "Lead Details" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Opportunity Details" })).not.toBeInTheDocument();
    expect(await screen.findByText("Latest GRE Registration")).toBeInTheDocument();
    expect(screen.getByText("GRE-2026-000002")).toBeInTheDocument();
    expect(screen.getByText("Updated Customer")).toBeInTheDocument();
    expect(screen.getByText("updated@example.com")).toBeInTheDocument();
    expect(screen.getByText("New project")).toBeInTheDocument();
    expect(screen.queryByText("Sticky Notes")).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.getOpportunity).toHaveBeenCalledWith("opportunity-a"));
  });

  it("shows quotations linked to this opportunity in the one-page quotation section", async () => {
    mocks.listQuotations.mockImplementation(async (filters: Record<string, string | number>) => ({
      data: {
        success: true,
        data: filters.opportunityId === "opportunity-a"
          ? Number(filters.page) === 1
            ? [{
              id: "opportunity-quotation",
              number: "QT-OPP-001",
              status: "APPROVED",
              totalAmount: 250000,
              project: { name: "DCT Heights" },
              unit: { number: "A-101" },
              createdAt: "2026-10-10T00:00:00.000Z",
            }]
            : [{
              id: "second-opportunity-quotation",
              number: "QT-OPP-002",
              status: "DRAFT",
              totalAmount: 150000,
            }]
          : [{
            id: "unrelated-quotation",
            number: "QT-OTHER-001",
            status: "DRAFT",
            totalAmount: 100000,
          }],
        pagination: { totalPages: filters.opportunityId === "opportunity-a" ? 2 : 1 },
      },
    }));
    render(<OpportunityDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: /^Quotations/ }));

    await waitFor(() => expect(mocks.listQuotations).toHaveBeenCalledWith(expect.objectContaining({
      opportunityId: "opportunity-a",
      page: 1,
      limit: 100,
    })));
    expect(document.getElementById("opportunity-quotations")).toBeInTheDocument();
    const quotationLink = await screen.findByRole("link", { name: "QT-OPP-001" });
    expect(quotationLink).toHaveAttribute("href", "/quotations/opportunity-quotation");
    expect(quotationLink.parentElement?.parentElement).toHaveTextContent(/DCT Heights · Unit A-101/);
    expect(await screen.findByRole("link", { name: "QT-OPP-002" })).toHaveAttribute("href", "/quotations/second-opportunity-quotation");
    expect(screen.queryByRole("link", { name: "QT-OTHER-001" })).not.toBeInTheDocument();
    expect(mocks.listQuotations).toHaveBeenCalledWith(expect.objectContaining({
      opportunityId: "opportunity-a",
      page: 2,
      limit: 100,
    }));
    expect(screen.queryByLabelText("Customer Name *")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Select Project *")).not.toBeInTheDocument();
  });

  it("offers correction of the rejected quotation before creating another one", async () => {
    mocks.listQuotations.mockResolvedValue({
      data: {
        success: true,
        data: [{
          id: "rejected-quotation",
          number: "QT-REJECTED-001",
          status: "REJECTED",
          totalAmount: 250000,
        }],
        pagination: { totalPages: 1 },
      },
    });

    render(<OpportunityDetailPage />);

    const correctionLink = await screen.findByRole("link", { name: "Correct & Resubmit" });
    expect(correctionLink).toHaveAttribute("href", "/quotations/rejected-quotation");
    expect(screen.getByRole("button", { name: "Generate Another Quotation" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: /^Quotations/ }));
    expect(await screen.findByText(/This quotation was rejected/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "QT-REJECTED-001" }))
      .toHaveAttribute("href", "/quotations/rejected-quotation");
  });

  it("shows only the selected related section", async () => {
    render(<OpportunityDetailPage />);

    expect(await screen.findByRole("heading", { name: "Opportunity Details" })).toBeInTheDocument();
    expect(document.getElementById("opportunity-details")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /^Receipts/ }));

    expect(document.getElementById("opportunity-receipts")).toBeInTheDocument();
    expect(document.getElementById("opportunity-payments")).not.toBeInTheDocument();
    expect(document.getElementById("opportunity-details")).not.toBeInTheDocument();
    expect(document.getElementById("opportunity-quotations")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(document.getElementById("opportunity-details")).toBeInTheDocument();
    expect(document.getElementById("opportunity-receipts")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Opportunity Details" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Lead Details" })).not.toBeInTheDocument();
    expect(screen.getByText("Sticky Notes")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Activity & Tasks" })).toBeInTheDocument();
  });

  it("opens the receipt details from the top-level Generate Receipt button", async () => {
    mocks.canCreateReceipt = true;
    mocks.listQuotations.mockResolvedValue({
      data: {
        success: true,
        data: [{ id: "approved-quotation", number: "QT-APPROVED-001", status: "APPROVED", totalAmount: 100000 }],
        pagination: { totalPages: 1 },
      },
    });
    mocks.getOpportunity.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          id: "opportunity-a",
          name: "Approved opportunity",
          amount: 100000,
          stage: "PROPOSAL",
          probability: 50,
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-02T00:00:00.000Z",
          lead: { id: "lead-a", firstName: "Customer", lastName: "A" },
          quotations: [{ id: "approved-quotation", status: "APPROVED" }],
          bookings: [{
            id: "booking-a",
            number: "BK-001",
            status: "CONFIRMED",
            totalAmount: 100000,
            quotationId: "approved-quotation",
          }],
        },
      },
    });
    render(<OpportunityDetailPage />);

    const generateReceiptButton = await screen.findByRole("button", { name: "Generate Receipt" });
    await waitFor(() => expect(generateReceiptButton).toBeEnabled());
    fireEvent.click(generateReceiptButton);

    expect(await screen.findByText("Generate receipt")).toBeInTheDocument();
    expect(await screen.findByLabelText("Booking *")).toBeInTheDocument();
    expect(screen.queryByText("Create a booking before generating a receipt.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Submit Payment" })).not.toBeInTheDocument();
  });

  it("keeps receipt generation disabled without an MIS-approved quotation booking", async () => {
    mocks.canCreateReceipt = true;
    render(<OpportunityDetailPage />);

    const receiptButton = await screen.findByRole("button", { name: "Generate Receipt" });
    await waitFor(() => expect(receiptButton).toBeDisabled());
    expect(receiptButton).toHaveAttribute("title", expect.stringContaining("MIS-approved quotation"));
    fireEvent.click(receiptButton);
    expect(screen.queryByText("Generate receipt")).not.toBeInTheDocument();
  });

  it("opens the existing quotation layout from the top-level Generate Quotation button", async () => {
    mocks.canCreateQuotation = true;
    render(<OpportunityDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Generate Quotation" }));

    expect(await screen.findByLabelText("Customer Name *")).toBeInTheDocument();
    expect(screen.getByLabelText("Select Project *")).toBeInTheDocument();
    const submitButton = screen.getByRole("button", { name: "Submit Quotation" });
    expect(submitButton).toBeInTheDocument();
    expect(submitButton.closest('[role="dialog"]')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.getElementById("opportunity-quotations")).toBeInTheDocument();
  });

  it("confirms successful quotation creation separately from PDF download", async () => {
    mocks.canCreateQuotation = true;
    mocks.listProjects.mockResolvedValue({
      data: { success: true, data: [{ id: "project-a", name: "DCT Heights" }] },
    });
    mocks.listUnits.mockResolvedValue({
      data: { success: true, data: [{ id: "unit-a", number: "A-101", area: 1000, price: 250000, status: "AVAILABLE" }] },
    });
    mocks.createQuotation.mockResolvedValue({
      data: { success: true, data: { id: "quotation-new", number: "QT-NEW-001", totalAmount: 250000, status: "DRAFT" } },
    });
    mocks.downloadQuotation.mockRejectedValue({ response: { data: { error: "PDF service unavailable" } } });
    render(<OpportunityDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Generate Quotation" }));
    fireEvent.change(await screen.findByLabelText("Select Project *"), { target: { value: "project-a" } });
    fireEvent.click(await screen.findByRole("button", { name: /A-101/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit Quotation" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm Quotation" }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Quotation created successfully",
      description: expect.stringContaining("QT-NEW-001"),
    })));
    expect(await screen.findByRole("link", { name: "QT-NEW-001" })).toHaveAttribute("href", "/quotations/quotation-new");
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Quotation created; PDF download failed",
      description: "PDF service unavailable",
    }));
  });

  it("shows only created receipts for this opportunity in the one-page receipt section", async () => {
    mocks.listReceipts.mockImplementation(async (filters: Record<string, string | number>) => ({
      data: {
        success: true,
        data: filters.opportunityId === "opportunity-a"
          ? [{
            id: "receipt-a",
            receiptNumber: "RCP-001",
            receiptDate: "2026-10-10T00:00:00.000Z",
            amount: 25000,
            status: "ISSUED",
            customerNameSnapshot: "Customer A",
            projectNameSnapshot: "DCT Heights",
            unitNumberSnapshot: "A-101",
            booking: { id: "booking-a", number: "BK-001" },
            quotation: { id: "quotation-a", number: "QT-001" },
            payment: { id: "payment-a", reference: "PAY-001" },
          }]
          : [{
            id: "unrelated-receipt",
            receiptNumber: "RCP-OTHER-001",
            amount: 100,
            status: "ISSUED",
            booking: { id: "booking-other", number: "BK-OTHER" },
            payment: { id: "payment-other", reference: null },
          }],
        pagination: { totalPages: 1 },
      },
    }));
    render(<OpportunityDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: /^Receipts/ }));

    const receiptLink = await screen.findByRole("link", { name: "RCP-001" });
    expect(document.getElementById("opportunity-receipts")).toBeInTheDocument();
    expect(receiptLink).toHaveAttribute("href", "/receipts/receipt-a");
    expect(screen.getByText(/Customer A · DCT Heights · Unit A-101 · Booking BK-001 · Quotation QT-001/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record Payment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview Receipt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "RCP-OTHER-001" })).not.toBeInTheDocument();
    expect(mocks.listReceipts).toHaveBeenCalledWith({
      opportunityId: "opportunity-a",
      page: 1,
      limit: 100,
    });
  });

});
