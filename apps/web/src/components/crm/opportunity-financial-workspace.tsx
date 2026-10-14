"use client";

import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { opportunityApi, paymentApi, receiptApi } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/date-format";
import { notifyUnitInventoryUpdated } from "@/lib/unit-inventory-events";

interface BookingOption {
  id: string;
  number: string;
  totalAmount: number;
  status: string;
  quotationId?: string | null;
}

interface Installment {
  id: string;
  bookingId: string;
  sequenceNumber: number;
  name: string;
  dueDate: string;
  scheduledAmount: number;
  receivedAmount: number;
  outstandingAmount: number;
  status: string;
}

interface PaymentRecord {
  id: string;
  bookingId: string;
  bookingNumber: string;
  amount: number;
  status: string;
  paymentDate: string;
  reference: string | null;
  allocatedAmount: number;
  unallocatedAmount: number;
  receipt: { id: string; receiptNumber: string; status: string } | null;
}

interface FinancialSummary {
  approvedQuotation: { id: string; number: string; totalAmount: number } | null;
  bookingAmount: number;
  scheduledAmount: number;
  verifiedPaymentAmount: number;
  allocatedAmount: number;
  unallocatedPaymentAmount: number;
  outstandingAmount: number;
  installmentOutstandingAmount: number;
  overdueAmount: number;
  upcomingAmount: number;
  installments: Installment[];
  payments: PaymentRecord[];
}

interface OpportunityFinancialWorkspaceProps {
  opportunityId: string;
  customerName: string;
  bookings: BookingOption[];
  approvedQuotationId: string | null;
  bookingCreateHref?: string;
  receiptRequest?: number;
}

const currency = (amount: number) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(amount);

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "response" in error) {
    const response = error.response;
    if (response && typeof response === "object" && "data" in response) {
      const data = response.data;
      if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
        return data.error;
      }
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function OpportunityFinancialWorkspace({
  opportunityId,
  customerName,
  bookings,
  approvedQuotationId,
  bookingCreateHref,
  receiptRequest = 0,
}: OpportunityFinancialWorkspaceProps) {
  const { toast } = useToast();
  const { hasEffectivePermission } = useAuth();
  const activeBookings = React.useMemo(
    () => bookings.filter(
      (booking) => booking.status !== "CANCELLED"
        && Boolean(approvedQuotationId)
        && booking.quotationId === approvedQuotationId,
    ),
    [bookings, approvedQuotationId],
  );
  const [summary, setSummary] = React.useState<FinancialSummary | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [bookingId, setBookingId] = React.useState(activeBookings[0]?.id || "");
  const [amount, setAmount] = React.useState("");
  const [payer, setPayer] = React.useState(customerName);
  const [paymentMode, setPaymentMode] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [paymentDate, setPaymentDate] = React.useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });
  const [isCreatingReceipt, setIsCreatingReceipt] = React.useState(false);
  const [allocatingPaymentId, setAllocatingPaymentId] = React.useState("");
  const [allocationTargets, setAllocationTargets] = React.useState<Record<string, string>>({});
  const [allocationAmounts, setAllocationAmounts] = React.useState<Record<string, string>>({});
  const [rejectingPayment, setRejectingPayment] = React.useState<PaymentRecord | null>(null);
  const [rejectionReason, setRejectionReason] = React.useState("");
  const [isRejecting, setIsRejecting] = React.useState(false);
  const [busyAction, setBusyAction] = React.useState("");
  const [receiptPickerOpen, setReceiptPickerOpen] = React.useState(false);
  const [receiptActionMode, setReceiptActionMode] = React.useState<"request" | "issue">("request");
  const [selectedReceiptPaymentId, setSelectedReceiptPaymentId] = React.useState("");
  const lastReceiptRequest = React.useRef(0);

  React.useEffect(() => {
    if (!activeBookings.some((booking) => booking.id === bookingId)) {
      setBookingId(activeBookings[0]?.id || "");
    }
  }, [activeBookings, bookingId]);

  React.useEffect(() => {
    setPayer(customerName);
  }, [customerName]);

  const loadSummary = React.useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await opportunityApi.financialSummary(opportunityId);
      if (!response.data?.success || !response.data.data) {
        throw new Error(response.data?.error || "Could not load the opportunity financial summary.");
      }
      setSummary(response.data.data);
    } catch (error) {
      setLoadError(errorMessage(error, "Could not load the opportunity financial summary."));
    } finally {
      setIsLoading(false);
    }
  }, [opportunityId]);

  React.useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const approvedPaymentsWithoutReceipt = React.useMemo(
    () => (summary?.payments || []).filter(
      (payment) => activeBookings.some((booking) => booking.id === payment.bookingId)
        && payment.status === "VERIFIED"
        && !payment.receipt,
    ),
    [activeBookings, summary],
  );

  React.useEffect(() => {
    if (!receiptRequest || receiptRequest <= lastReceiptRequest.current || isLoading || !summary) return;
    lastReceiptRequest.current = receiptRequest;
    const firstApprovedPayment = approvedPaymentsWithoutReceipt[0];
    setReceiptActionMode(firstApprovedPayment ? "issue" : "request");
    setSelectedReceiptPaymentId(firstApprovedPayment?.id || "");
    setReceiptPickerOpen(true);
  }, [receiptRequest, isLoading, summary, approvedPaymentsWithoutReceipt]);

  const createReceipt = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!bookingId || !payer.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast({ title: "Receipt details required", description: "Select a booking, enter the payer, and provide a valid amount.", variant: "destructive" });
      return;
    }
    setIsCreatingReceipt(true);
    try {
      const response = await receiptApi.requestForApproval({
        bookingId,
        amount: numericAmount,
        paymentDate: paymentDate ? new Date(`${paymentDate}T00:00:00`).toISOString() : undefined,
        payerName: payer.trim(),
        paymentMode: paymentMode || undefined,
        reference: reference.trim() || undefined,
      });
      if (!response.data?.success || !response.data.data?.id) {
        throw new Error(response.data?.error || "Receipt request was not submitted.");
      }
      setAmount("");
      setReference("");
      setReceiptPickerOpen(false);
      toast({
        title: "Receipt request submitted",
        description: "The payment is pending Finance approval. The official receipt will be created after approval.",
      });
      await loadSummary();
    } catch (error) {
      toast({ title: "Receipt request failed", description: errorMessage(error, "Could not submit the receipt request."), variant: "destructive" });
    } finally {
      setIsCreatingReceipt(false);
    }
  };

  const verifyPayment = async (payment: PaymentRecord) => {
    setBusyAction(payment.id);
    try {
      const response = await paymentApi.verify(payment.id);
      if (!response.data?.success) throw new Error(response.data?.error || "Payment verification failed.");
      const verification = response.data.data;
      const completedInstallments = Array.isArray(verification?.autoAllocated)
        ? verification.autoAllocated.filter((allocation: { completed: boolean }) => allocation.completed)
        : [];
      const allocatedDescription = Array.isArray(verification?.autoAllocated) && verification.autoAllocated.length
        ? `${verification.autoAllocated.map((allocation: { installmentName: string; amount: number }) =>
          `${allocation.installmentName}: ${currency(allocation.amount)}`,
        ).join(", ")}.`
        : "No installment schedule was available to allocate this payment.";
      const progressDescription = completedInstallments.length
        ? verification.nextInstallmentName
          ? `${completedInstallments.map((allocation: { installmentName: string }) => allocation.installmentName).join(", ")} completed. Next: ${verification.nextInstallmentName}.`
          : "All installments are completed."
        : verification?.nextInstallmentName
          ? `Continue with ${verification.nextInstallmentName}.`
          : "";
      toast({
        title: "Finance approval completed",
        description: [allocatedDescription, progressDescription, "Issue the receipt to complete this payment."].filter(Boolean).join(" "),
      });
      await loadSummary();
    } catch (error) {
      toast({ title: "Verification failed", description: errorMessage(error, "Could not verify payment."), variant: "destructive" });
    } finally {
      setBusyAction("");
    }
  };

  const rejectPayment = async () => {
    if (!rejectingPayment || !rejectionReason.trim()) return;
    setIsRejecting(true);
    try {
      const response = await paymentApi.reject(rejectingPayment.id, rejectionReason.trim());
      if (!response.data?.success) throw new Error(response.data?.error || "Payment rejection failed.");
      toast({ title: "Payment rejected", description: "The rejection reason was recorded." });
      setRejectingPayment(null);
      setRejectionReason("");
      await loadSummary();
    } catch (error) {
      toast({ title: "Rejection failed", description: errorMessage(error, "Could not reject payment."), variant: "destructive" });
    } finally {
      setIsRejecting(false);
    }
  };

  const issueReceipt = async (payment: PaymentRecord) => {
    setBusyAction(payment.id);
    try {
      const response = await receiptApi.issueForPayment(payment.id);
      if (!response.data?.success || !response.data.data?.id) {
        throw new Error(response.data?.error || "Receipt issuance failed.");
      }
      notifyUnitInventoryUpdated();
      const inventoryWarning = typeof response.data.warning === "string" ? ` ${response.data.warning}` : "";
      toast({
        title: "Payment completed and receipt issued",
        description: `${response.data.data.receiptNumber || "The receipt"} is now in the receipt register.${inventoryWarning}`,
        variant: "success",
      });
      await loadSummary();
    } catch (error) {
      toast({ title: "Receipt issuance failed", description: errorMessage(error, "Could not issue receipt."), variant: "destructive" });
    } finally {
      setBusyAction("");
    }
  };

  const issueSelectedReceipt = () => {
    const payment = approvedPaymentsWithoutReceipt.find((item) => item.id === selectedReceiptPaymentId);
    if (!payment) {
      toast({ title: "Approved payment required", description: "Select a Finance-approved payment before issuing its receipt.", variant: "destructive" });
      return;
    }
    void issueReceipt(payment);
  };

  const allocatePayment = async (payment: PaymentRecord) => {
    const targetInstallmentId = allocationTargets[payment.id];
    const allocationAmount = Number(allocationAmounts[payment.id]);
    if (!targetInstallmentId || !Number.isFinite(allocationAmount) || allocationAmount <= 0) {
      toast({ title: "Allocation details required", description: "Choose an outstanding installment and enter an amount.", variant: "destructive" });
      return;
    }
    setAllocatingPaymentId(payment.id);
    try {
      const response = await paymentApi.allocate(payment.id, targetInstallmentId, allocationAmount);
      if (!response.data?.success) throw new Error(response.data?.error || "Allocation failed.");
      toast({ title: "Payment allocated", description: "The installment balance has been updated." });
      setAllocationAmounts((current) => ({ ...current, [payment.id]: "" }));
      await loadSummary();
    } catch (error) {
      toast({ title: "Allocation failed", description: errorMessage(error, "Could not allocate payment."), variant: "destructive" });
    } finally {
      setAllocatingPaymentId("");
    }
  };

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-56 w-full" /><Skeleton className="h-48 w-full" /></div>;
  }

  if (loadError || !summary) {
    return (
      <Card role="alert" className="border-destructive">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
          <p className="text-sm text-destructive">{loadError || "Financial summary is unavailable."}</p>
          <Button variant="outline" onClick={() => void loadSummary()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Opportunity financial summary">
        {[
          ["Total amount", currency(summary.bookingAmount)],
          ["Received amount", currency(summary.verifiedPaymentAmount)],
          ["Balance amount", currency(summary.outstandingAmount)],
          ["Installment balance", currency(summary.installmentOutstandingAmount)],
          ["Overdue / upcoming", `${currency(summary.overdueAmount)} / ${currency(summary.upcomingAmount)}`],
        ].map(([label, value]) => (
          <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></CardContent></Card>
        ))}
      </section>

      <Card>
        <CardHeader><CardTitle className="text-base">Quotation installments</CardTitle></CardHeader>
        <CardContent>
          {summary.installments.length === 0 ? (
            <p className="text-sm text-muted-foreground">A full-booking installment is created automatically when a verified payment or receipt is processed. Verified payments are applied to its balance.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead><tr className="border-b text-xs text-muted-foreground"><th className="p-2">Installment</th><th className="p-2">Due date</th><th className="p-2 text-right">Amount due</th><th className="p-2 text-right">Received</th><th className="p-2 text-right">Outstanding</th><th className="p-2">Status</th></tr></thead>
                <tbody>
                  {summary.installments.map((installment) => (
                    <tr key={installment.id} className="border-b last:border-0">
                      <td className="p-2"><Link className="hover:underline" href={`/bookings/${installment.bookingId}`}>{installment.name}</Link><span className="block text-xs text-muted-foreground">#{installment.sequenceNumber}</span></td>
                      <td className="p-2">{formatDate(installment.dueDate)}</td>
                      <td className="p-2 text-right">{currency(installment.scheduledAmount)}</td>
                      <td className="p-2 text-right">{currency(installment.receivedAmount)}</td>
                      <td className="p-2 text-right">{currency(installment.outstandingAmount)}</td>
                      <td className="p-2"><Badge variant={installment.status === "PAID" ? "success" : installment.status === "OVERDUE" ? "destructive" : "secondary"}>{installment.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="p-2" colSpan={2}>Total</td>
                    <td className="p-2 text-right">{currency(summary.scheduledAmount)}</td>
                    <td className="p-2 text-right">{currency(summary.allocatedAmount)}</td>
                    <td className="p-2 text-right">{currency(summary.installmentOutstandingAmount)}</td>
                    <td className="p-2" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Payments and receipts</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {summary.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded for this opportunity.</p>
          ) : summary.payments.map((payment) => {
            const eligibleInstallments = summary.installments.filter((installment) =>
              installment.bookingId === payment.bookingId && installment.outstandingAmount > 0,
            );
            const canAllocate = hasEffectivePermission("PAYMENT_ALLOCATE")
              && ["VERIFIED", "COMPLETED"].includes(payment.status)
              && payment.unallocatedAmount > 0
              && eligibleInstallments.length > 0;
            return (
              <div key={payment.id} className="space-y-3 rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 text-sm">
                    <div className="font-semibold">{currency(payment.amount)} · <Badge variant={payment.status === "VERIFIED" || payment.status === "COMPLETED" ? "success" : payment.status === "REJECTED" ? "destructive" : "secondary"}>{payment.status}</Badge></div>
                    <p className="text-muted-foreground">{payment.bookingNumber} · {formatDateTime(payment.paymentDate)}{payment.reference ? ` · Ref ${payment.reference}` : ""}</p>
                    <p className="text-xs text-muted-foreground">Allocated {currency(payment.allocatedAmount)} · Unallocated {currency(payment.unallocatedAmount)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {payment.status === "PENDING" && hasEffectivePermission("PAYMENT_VERIFY") && (
                      <>
                        <Button size="sm" disabled={busyAction === payment.id} onClick={() => void verifyPayment(payment)}>Verify</Button>
                        <Button size="sm" variant="outline" disabled={busyAction === payment.id} onClick={() => { setRejectingPayment(payment); setRejectionReason(""); }}>Reject</Button>
                      </>
                    )}
                    {["VERIFIED", "COMPLETED"].includes(payment.status) && (
                      payment.receipt ? (
                        <Button size="sm" variant="outline" asChild><Link href={`/receipts/${payment.receipt.id}`}>Receipt {payment.receipt.receiptNumber}</Link></Button>
                      ) : <span className="self-center text-xs text-muted-foreground">{payment.status === "VERIFIED" ? "Finance approved · issue from Generate Receipt" : "Receipt not issued"}</span>
                    )}
                  </div>
                </div>
                {canAllocate && (
                  <div className="grid gap-2 border-t pt-3 sm:grid-cols-[minmax(0,1fr)_160px_auto]">
                    <div className="space-y-1"><Label htmlFor={`allocation-target-${payment.id}`}>Allocate to installment</Label>
                      <select id={`allocation-target-${payment.id}`} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={allocationTargets[payment.id] || ""} onChange={(event) => setAllocationTargets((current) => ({ ...current, [payment.id]: event.target.value }))}>
                        <option value="">Select installment</option>
                        {eligibleInstallments.map((installment) => <option key={installment.id} value={installment.id}>{installment.name} · outstanding {currency(installment.outstandingAmount)}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1"><Label htmlFor={`allocation-amount-${payment.id}`}>Amount</Label><Input id={`allocation-amount-${payment.id}`} type="number" min="0.01" step="0.01" max={payment.unallocatedAmount} value={allocationAmounts[payment.id] || ""} onChange={(event) => setAllocationAmounts((current) => ({ ...current, [payment.id]: event.target.value }))} /></div>
                    <Button className="self-end" disabled={allocatingPaymentId === payment.id} onClick={() => void allocatePayment(payment)}>{allocatingPaymentId === payment.id ? "Allocating..." : "Allocate"}</Button>
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex justify-end"><Button variant="outline" asChild><Link href="/receipts">Open receipt register</Link></Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Related records</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {summary.approvedQuotation && <Button size="sm" variant="outline" asChild><Link href={`/quotations/${summary.approvedQuotation.id}`}>Quotation {summary.approvedQuotation.number}</Link></Button>}
          {activeBookings.map((booking) => <Button key={booking.id} size="sm" variant="outline" asChild><Link href={`/bookings/${booking.id}`}>Booking {booking.number}</Link></Button>)}
        </CardContent>
      </Card>

      <Dialog open={receiptPickerOpen} onOpenChange={(open) => { if (!isCreatingReceipt) setReceiptPickerOpen(open); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Generate receipt</DialogTitle>
            <DialogDescription>Enter the payment details and submit them for Finance approval. The payment is completed only after the approved receipt is issued.</DialogDescription>
          </DialogHeader>
          {!hasEffectivePermission("RECEIPT_CREATE") ? (
            <p className="text-sm text-destructive">You do not have permission to generate receipts.</p>
          ) : !approvedQuotationId ? (
            <p className="text-sm text-muted-foreground">Receipt generation is available only after MIS accepts a quotation.</p>
          ) : activeBookings.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Create a booking linked to the MIS-approved quotation before generating a receipt.</p>
              {bookingCreateHref && <Button variant="outline" asChild><Link href={bookingCreateHref}>Create a booking</Link></Button>}
            </div>
          ) : (
            <>
              {approvedPaymentsWithoutReceipt.length > 0 && (
                <div className="flex gap-2 border-b pb-3">
                  <Button type="button" size="sm" variant={receiptActionMode === "request" ? "default" : "outline"} onClick={() => setReceiptActionMode("request")}>Request new receipt</Button>
                  <Button type="button" size="sm" variant={receiptActionMode === "issue" ? "default" : "outline"} onClick={() => setReceiptActionMode("issue")}>Issue approved receipt</Button>
                </div>
              )}
              {receiptActionMode === "issue" && approvedPaymentsWithoutReceipt.length > 0 ? (
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {approvedPaymentsWithoutReceipt.map((payment) => (
                    <label key={payment.id} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm hover:bg-muted/50">
                      <input
                        type="radio"
                        name="approved-receipt-payment"
                        value={payment.id}
                        checked={selectedReceiptPaymentId === payment.id}
                        onChange={() => setSelectedReceiptPaymentId(payment.id)}
                        className="mt-1"
                      />
                      <span>
                        <span className="block font-medium">{currency(payment.amount)} · {payment.bookingNumber}</span>
                        <span className="block text-xs text-muted-foreground">{formatDateTime(payment.paymentDate)} · Finance approved{payment.reference ? ` · Ref ${payment.reference}` : ""}</span>
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <form id="direct-receipt-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void createReceipt(event)}>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="receipt-booking">Booking *</Label>
                    <select id="receipt-booking" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={bookingId} onChange={(event) => setBookingId(event.target.value)} required>
                      {activeBookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.number} · {currency(booking.totalAmount)}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2"><Label htmlFor="receipt-payer">Received from *</Label><Input id="receipt-payer" value={payer} onChange={(event) => setPayer(event.target.value)} maxLength={200} required /></div>
                  <div className="space-y-2"><Label htmlFor="receipt-amount">Amount received (INR) *</Label><Input id="receipt-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div>
                  <div className="space-y-2"><Label htmlFor="receipt-date">Payment date *</Label><Input id="receipt-date" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required /></div>
                  <div className="space-y-2">
                    <Label htmlFor="receipt-mode">Payment mode</Label>
                    <select id="receipt-mode" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)}>
                      <option value="">Select mode</option>
                      {["Cash", "Cheque", "Bank Transfer", "UPI", "Online"].map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2 sm:col-span-2"><Label htmlFor="receipt-reference">Transaction reference</Label><Input id="receipt-reference" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={200} /></div>
                </form>
              )}
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReceiptPickerOpen(false)} disabled={isCreatingReceipt}>Cancel</Button>
            <Button
              type={receiptActionMode === "request" ? "submit" : "button"}
              form={receiptActionMode === "request" ? "direct-receipt-form" : undefined}
              onClick={receiptActionMode === "issue" ? issueSelectedReceipt : undefined}
              disabled={!hasEffectivePermission("RECEIPT_CREATE") || activeBookings.length === 0 || isCreatingReceipt || (receiptActionMode === "issue" && !selectedReceiptPaymentId)}
            >
              {isCreatingReceipt ? "Submitting..." : receiptActionMode === "issue" ? "Issue Receipt" : "Submit for Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rejectingPayment)} onOpenChange={(open) => { if (!open && !isRejecting) setRejectingPayment(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject payment?</DialogTitle>
            <DialogDescription>The payment will remain in the ledger with its rejection reason and audit details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2"><Label htmlFor="payment-rejection-reason">Reason *</Label><Input id="payment-rejection-reason" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={500} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingPayment(null)} disabled={isRejecting}>Keep pending</Button>
            <Button variant="destructive" onClick={() => void rejectPayment()} disabled={isRejecting || !rejectionReason.trim()}>{isRejecting ? "Rejecting..." : "Reject payment"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
