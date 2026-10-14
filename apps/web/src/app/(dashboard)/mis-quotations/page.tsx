"use client";

import * as React from "react";
import { ClipboardCheck, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/date-format";
import { quotationApi } from "@/lib/api";

interface MisQuotationItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  discount?: number | null;
  taxAmount?: number | null;
  unit?: { number: string } | null;
}

interface MisQuotation {
  id: string;
  number: string;
  totalAmount: number;
  taxAmount?: number | null;
  discount?: number | null;
  submittedAt?: string | null;
  createdAt: string;
  opportunity?: { id: string; name: string } | null;
  lead?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
  } | null;
  submittedBy?: { firstName: string; lastName: string; email: string } | null;
  items: MisQuotationItem[];
}

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

function customerName(quotation: MisQuotation) {
  return quotation.lead?.company ||
    [quotation.lead?.firstName, quotation.lead?.lastName].filter(Boolean).join(" ") ||
    "—";
}

export default function MisQuotationsPage() {
  const { toast } = useToast();
  const [quotations, setQuotations] = React.useState<MisQuotation[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState("");
  const [rejecting, setRejecting] = React.useState<MisQuotation | null>(null);
  const [rejectionReason, setRejectionReason] = React.useState("");
  const [rejectError, setRejectError] = React.useState("");

  const loadQueue = React.useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await quotationApi.misReviewQueue();
      if (!response.data.success || !Array.isArray(response.data.data)) {
        throw new Error("The MIS quotation queue response was invalid.");
      }
      setQuotations(response.data.data);
    } catch (error: any) {
      toast({
        title: "Unable to load MIS review queue",
        description: error?.response?.data?.error || error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    void loadQueue(true);
    const interval = window.setInterval(() => void loadQueue(), 15000);
    return () => window.clearInterval(interval);
  }, [loadQueue]);

  const acceptQuotation = async (quotation: MisQuotation) => {
    try {
      setBusyId(quotation.id);
      await quotationApi.acceptMis(quotation.id);
      toast({ title: "Quotation accepted", description: `${quotation.number} was approved.` });
      await loadQueue();
    } catch (error: any) {
      toast({
        title: "Unable to accept quotation",
        description: error?.response?.data?.error || error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyId("");
    }
  };

  const rejectQuotation = async () => {
    if (!rejecting) return;
    if (!rejectionReason.trim()) {
      setRejectError("A rejection reason is required.");
      return;
    }
    try {
      setBusyId(rejecting.id);
      await quotationApi.reject(rejecting.id, rejectionReason.trim());
      toast({ title: "Quotation rejected", description: `${rejecting.number} was returned to CRM.` });
      setRejecting(null);
      setRejectionReason("");
      setRejectError("");
      await loadQueue();
    } catch (error: any) {
      setRejectError(error?.response?.data?.error || error?.message || "Unable to reject quotation.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary"><ClipboardCheck className="h-5 w-5" /></div>
        <div>
          <h1 className="text-xl font-semibold">MIS Quotation Review</h1>
          <p className="text-sm text-muted-foreground">Review quotations submitted by CRM. The queue refreshes automatically.</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-56 w-full" />)}</div>
      ) : quotations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <ClipboardCheck className="mb-3 h-10 w-10 text-muted-foreground/60" />
            <h2 className="font-medium">No quotations awaiting review</h2>
            <p className="mt-1 text-sm text-muted-foreground">Quotations pushed by the CRM Team will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {quotations.map((quotation) => {
            const submittedBy = quotation.submittedBy
              ? `${quotation.submittedBy.firstName} ${quotation.submittedBy.lastName}`.trim()
              : "Unknown user";
            return (
              <Card key={quotation.id}>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                  <div>
                    <CardTitle className="text-base">{quotation.number}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {quotation.opportunity?.name || "No linked opportunity"} · {customerName(quotation)}
                    </p>
                  </div>
                  <Badge variant="info">Submitted to MIS</Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div><p className="text-muted-foreground">Quotation amount</p><p className="font-semibold">{money(quotation.totalAmount)}</p></div>
                    <div><p className="text-muted-foreground">Submitted by</p><p className="font-medium">{submittedBy}</p><p className="text-xs text-muted-foreground">{quotation.submittedBy?.email || ""}</p></div>
                    <div><p className="text-muted-foreground">Submission date</p><p className="font-medium">{formatDateTime(quotation.submittedAt || quotation.createdAt)}</p></div>
                    <div><p className="text-muted-foreground">Status</p><p className="font-medium">Awaiting MIS decision</p></div>
                  </div>

                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full min-w-[700px] text-sm">
                      <thead className="bg-muted/50 text-left">
                        <tr>
                          <th className="px-3 py-2 font-medium">Product / line item</th>
                          <th className="px-3 py-2 text-right font-medium">Qty</th>
                          <th className="px-3 py-2 text-right font-medium">Unit price</th>
                          <th className="px-3 py-2 text-right font-medium">Discount</th>
                          <th className="px-3 py-2 text-right font-medium">Tax</th>
                          <th className="px-3 py-2 text-right font-medium">Line total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quotation.items.map((item) => (
                          <tr key={item.id} className="border-t">
                            <td className="px-3 py-2">{item.description}{item.unit?.number ? ` · Unit ${item.unit.number}` : ""}</td>
                            <td className="px-3 py-2 text-right">{item.quantity}</td>
                            <td className="px-3 py-2 text-right">{money(item.unitPrice)}</td>
                            <td className="px-3 py-2 text-right">{item.discount == null ? "—" : money(item.discount)}</td>
                            <td className="px-3 py-2 text-right">{item.taxAmount == null ? "—" : money(item.taxAmount)}</td>
                            <td className="px-3 py-2 text-right font-medium">{money(item.totalPrice)}</td>
                          </tr>
                        ))}
                        <tr className="border-t bg-muted/20">
                          <td colSpan={3} className="px-3 py-2 text-right text-muted-foreground">Quotation totals</td>
                          <td className="px-3 py-2 text-right">{quotation.discount == null ? "—" : money(quotation.discount)}</td>
                          <td className="px-3 py-2 text-right">{quotation.taxAmount == null ? "—" : money(quotation.taxAmount)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{money(quotation.totalAmount)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => { setRejecting(quotation); setRejectError(""); setRejectionReason(""); }}
                      disabled={busyId === quotation.id}
                    >
                      <XCircle className="mr-2 h-4 w-4" />Reject
                    </Button>
                    <Button onClick={() => void acceptQuotation(quotation)} disabled={busyId === quotation.id}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />{busyId === quotation.id ? "Saving…" : "Accept"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(rejecting)} onOpenChange={(open) => { if (!open && !busyId) setRejecting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {rejecting?.number || "quotation"}</DialogTitle>
            <DialogDescription>Provide a reason so the CRM Team can correct and resubmit this quotation.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectionReason}
            onChange={(event) => { setRejectionReason(event.target.value); setRejectError(""); }}
            placeholder="Enter rejection reason"
            maxLength={2000}
            aria-label="Rejection reason"
          />
          {rejectError && <p role="alert" className="text-sm text-destructive">{rejectError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)} disabled={Boolean(busyId)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void rejectQuotation()} disabled={!rejectionReason.trim() || Boolean(busyId)}>
              {busyId ? "Saving…" : "Reject quotation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
