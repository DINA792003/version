import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OpportunityFinancialWorkspace from "./opportunity-financial-workspace";

const mocks = vi.hoisted(() => ({
  financialSummary: vi.fn(),
  requestReceipt: vi.fn(),
  verifyPayment: vi.fn(),
  issueReceipt: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  opportunityApi: { financialSummary: mocks.financialSummary },
  paymentApi: { verify: mocks.verifyPayment, reject: vi.fn(), allocate: vi.fn() },
  receiptApi: { requestForApproval: mocks.requestReceipt, issueForPayment: mocks.issueReceipt },
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    hasEffectivePermission: (permission: string) =>
      ["PAYMENT_CREATE", "PAYMENT_VERIFY", "RECEIPT_CREATE"].includes(permission),
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

const bookings = [{ id: "booking-a", number: "BK-001", totalAmount: 100000, status: "CONFIRMED", quotationId: "quotation-a" }];

function financialSummary(payments: unknown[] = []) {
  return {
    data: {
      success: true,
      data: {
        approvedQuotation: null,
        bookingAmount: 100000,
        scheduledAmount: 100000,
        verifiedPaymentAmount: 0,
        allocatedAmount: 0,
        unallocatedPaymentAmount: 0,
        outstandingAmount: 100000,
        installmentOutstandingAmount: 100000,
        overdueAmount: 0,
        upcomingAmount: 100000,
        installments: [],
        payments,
      },
    },
  };
}

describe("OpportunityFinancialWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.financialSummary.mockResolvedValue(financialSummary());
    mocks.requestReceipt.mockResolvedValue({
      data: { success: true, data: { id: "payment-request-a" } },
    });
    mocks.issueReceipt.mockResolvedValue({
      data: { success: true, data: { id: "receipt-a", receiptNumber: "RCP-001" } },
    });
  });

  it("submits receipt details for Finance approval without a separate payment form in the tab", async () => {
    render(
      <OpportunityFinancialWorkspace
        opportunityId="opportunity-a"
        customerName="Customer A"
        approvedQuotationId="quotation-a"
        bookings={bookings}
        bookingCreateHref="/bookings/new?opportunityId=opportunity-a"
        receiptRequest={1}
      />,
    );

    expect(await screen.findByLabelText("Booking *")).toBeInTheDocument();
    expect(screen.getByLabelText("Received from *")).toHaveValue("Customer A");
    expect(screen.getByLabelText("Amount received (INR) *")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit Payment" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Amount received (INR) *"), { target: { value: "25000" } });
    fireEvent.change(screen.getByLabelText("Payment mode"), { target: { value: "Bank Transfer" } });
    fireEvent.change(screen.getByLabelText("Transaction reference"), { target: { value: "BANK-001" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit for Approval" }));

    await waitFor(() => expect(mocks.requestReceipt).toHaveBeenCalledWith(expect.objectContaining({
      bookingId: "booking-a",
      amount: 25000,
      payerName: "Customer A",
      paymentMode: "Bank Transfer",
      reference: "BANK-001",
    })));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Receipt request submitted",
      description: expect.stringContaining("pending Finance approval"),
    }));
  });

  it("does not offer receipt submission without an MIS-approved quotation", async () => {
    render(
      <OpportunityFinancialWorkspace
        opportunityId="opportunity-a"
        customerName="Customer A"
        approvedQuotationId={null}
        bookings={bookings}
        receiptRequest={1}
      />,
    );

    expect(await screen.findByText("Receipt generation is available only after MIS accepts a quotation.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Amount received (INR) *")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit for Approval" })).toBeDisabled();
  });

  it("shows total, received, and balance amounts in the installment plan", async () => {
    mocks.financialSummary.mockResolvedValue({
      data: {
        success: true,
        data: {
          ...financialSummary().data.data,
          bookingAmount: 100000,
          verifiedPaymentAmount: 25000,
          outstandingAmount: 75000,
          scheduledAmount: 100000,
          allocatedAmount: 25000,
          installmentOutstandingAmount: 75000,
          installments: [{
            id: "installment-a",
            bookingId: "booking-a",
            sequenceNumber: 1,
            name: "Booking installment",
            dueDate: "2026-11-01T00:00:00.000Z",
            scheduledAmount: 100000,
            receivedAmount: 25000,
            outstandingAmount: 75000,
            status: "PARTIALLY_PAID",
          }],
        },
      },
    });

    render(
      <OpportunityFinancialWorkspace
        opportunityId="opportunity-a"
        customerName="Customer A"
        approvedQuotationId="quotation-a"
        bookings={bookings}
      />,
    );

    expect(await screen.findByText("Total amount")).toBeInTheDocument();
    expect(screen.getByText("Received amount")).toBeInTheDocument();
    expect(screen.getByText("Balance amount")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Total/ })).toBeInTheDocument();
    expect(screen.getAllByText("₹1,00,000.00")).toHaveLength(3);
    expect(screen.getAllByText("₹25,000.00")).toHaveLength(3);
    expect(screen.getAllByText("₹75,000.00")).toHaveLength(4);
  });

  it("confirms approval, applies the payment to installments, and names the next installment", async () => {
    mocks.financialSummary.mockResolvedValue(financialSummary([{
      id: "payment-a",
      bookingId: "booking-a",
      bookingNumber: "BK-001",
      amount: 25000,
      status: "PENDING",
      paymentDate: "2026-10-13T00:00:00.000Z",
      reference: null,
      allocatedAmount: 0,
      unallocatedAmount: 25000,
      receipt: null,
    }]));
    mocks.verifyPayment.mockResolvedValue({
      data: {
        success: true,
        data: {
          autoAllocated: [{ installmentName: "Installment 1", amount: 25000, completed: true }],
          nextInstallmentName: "Installment 2",
        },
      },
    });
    render(
      <OpportunityFinancialWorkspace
        opportunityId="opportunity-a"
        customerName="Customer A"
        approvedQuotationId="quotation-a"
        bookings={bookings}
        bookingCreateHref="/bookings/new?opportunityId=opportunity-a"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Verify" }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Finance approval completed",
      description: expect.stringContaining("Installment 1 completed. Next: Installment 2."),
    })));
  });

  it("shows an existing official receipt in the payment list", async () => {
    mocks.financialSummary.mockResolvedValue(financialSummary([{
      id: "payment-a",
      bookingId: "booking-a",
      bookingNumber: "BK-001",
      amount: 25000,
      status: "COMPLETED",
      paymentDate: "2026-10-13T00:00:00.000Z",
      reference: "PAY-001",
      allocatedAmount: 25000,
      unallocatedAmount: 0,
      receipt: { id: "receipt-a", receiptNumber: "RCP-001", status: "ISSUED" },
    }]));
    render(
      <OpportunityFinancialWorkspace
        opportunityId="opportunity-a"
        customerName="Customer A"
        approvedQuotationId="quotation-a"
        bookings={bookings}
        bookingCreateHref="/bookings/new?opportunityId=opportunity-a"
      />,
    );

    expect(screen.queryByRole("button", { name: "Issue receipt" })).not.toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Receipt RCP-001" })).toHaveAttribute("href", "/receipts/receipt-a");
  });

  it("issues an approved receipt from the Generate Receipt dialog", async () => {
    const inventoryUpdated = vi.fn();
    window.addEventListener("dct-crm:unit-inventory-updated", inventoryUpdated);
    mocks.financialSummary.mockResolvedValue(financialSummary([{
      id: "payment-a",
      bookingId: "booking-a",
      bookingNumber: "BK-001",
      amount: 25000,
      status: "VERIFIED",
      paymentDate: "2026-10-13T00:00:00.000Z",
      reference: "PAY-001",
      allocatedAmount: 25000,
      unallocatedAmount: 0,
      receipt: null,
    }]));
    mocks.issueReceipt.mockResolvedValue({
      data: {
        success: true,
        warning: "Receipt issued, but the linked unit record was not found.",
        data: { id: "receipt-a", receiptNumber: "RCP-001" },
      },
    });
    render(
      <OpportunityFinancialWorkspace
        opportunityId="opportunity-a"
        customerName="Customer A"
        approvedQuotationId="quotation-a"
        bookings={bookings}
        receiptRequest={1}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Issue approved receipt" }));
    fireEvent.click(await screen.findByRole("button", { name: "Issue Receipt" }));

    await waitFor(() => expect(mocks.issueReceipt).toHaveBeenCalledWith("payment-a"));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Payment completed and receipt issued",
      description: expect.stringContaining("unit record was not found"),
      variant: "success",
    })));
    expect(inventoryUpdated).toHaveBeenCalledOnce();
    window.removeEventListener("dct-crm:unit-inventory-updated", inventoryUpdated);
  });

  it("confirms when approval completes all scheduled installments", async () => {
    mocks.financialSummary.mockResolvedValue(financialSummary([{
      id: "payment-a",
      bookingId: "booking-a",
      bookingNumber: "BK-001",
      amount: 100000,
      status: "PENDING",
      paymentDate: "2026-10-13T00:00:00.000Z",
      reference: null,
      allocatedAmount: 0,
      unallocatedAmount: 100000,
      receipt: null,
    }]));
    mocks.verifyPayment.mockResolvedValue({
      data: {
        success: true,
        data: {
          autoAllocated: [{ installmentName: "Final Installment", amount: 100000, completed: true }],
          nextInstallmentName: null,
        },
      },
    });
    render(
      <OpportunityFinancialWorkspace
        opportunityId="opportunity-a"
        customerName="Customer A"
        approvedQuotationId="quotation-a"
        bookings={bookings}
        bookingCreateHref="/bookings/new?opportunityId=opportunity-a"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Verify" }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Finance approval completed",
      description: expect.stringContaining("All installments are completed."),
    })));
  });
});
