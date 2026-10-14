"use client";

import { formatDate, formatDateTime } from "@/lib/date-format";

import * as React from "react";

import { useParams, useRouter } from "next/navigation";

import Link from "next/link";

import { quotationApi } from "@/lib/api";
import { RecordPageHeader } from "@/components/crm/record-page-header";
import { RecordSummary } from "@/components/crm/record-summary";

import { useToast } from "@/hooks/use-toast";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Separator } from "@/components/ui/separator";

import { Skeleton } from "@/components/ui/skeleton";

import {
  ArrowLeft,
  Calendar,
  Send,
  FileText,
  History,
  StickyNote,
  Receipt,
  Pencil,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

interface QuotationData {
  id: string;
  quotationNumber: string;
  leadName: string;
  projectName: string;
  amount: number;
  receivedAmount: number;
  balanceAmount: number;
  status: string;
  validUntil: string;
  createdAt: string;
  updatedAt: string;
  opportunityId?: string | null;
  taxAmount?: number | null;
  discount?: number | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  createdBy?: { id: string; firstName: string; lastName: string; email: string } | null;
  submittedBy?: { id: string; firstName: string; lastName: string; email: string } | null;
  reviewedBy?: { id: string; firstName: string; lastName: string; email: string } | null;
  approvals?: Array<{ id: string; status: string; comments?: string | null; createdAt: string; approver?: { firstName: string; lastName: string; email: string } | null }>;
  lead?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  opportunity?: { id: string; name: string } | null;
  project?: { id: string; name: string } | null;
  items?: Array<{ id: string; unitId?: string | null; description: string; quantity: number; unitPrice: number; totalPrice: number; unit?: { id: string; number: string; area?: number | null; price?: number | null; status?: string | null } | null }>;
  bookings?: Array<{ id: string; number: string; status: string; totalAmount: number }>;
  receipts?: Array<{ id: string; receiptNumber: string; amount: number; status: string; receiptDate: string; bookingId: string }>;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info"> = {
  draft: "secondary",
  submitted: "info",
  approved: "success",
  rejected: "destructive",
  expired: "warning",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Accepted",
  rejected: "Rejected",
  expired: "Expired",
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
};

export default function QuotationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { hasEffectivePermission } = useAuth();
  const [quotation, setQuotation] = React.useState<QuotationData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState("details");
  const [editOpen, setEditOpen] = React.useState(false);
  const [editSaving, setEditSaving] = React.useState(false);
  const [editItems, setEditItems] = React.useState<Array<{ description: string; quantity: string; unitPrice: string; unitId?: string }>>([]);
  const [editTaxAmount, setEditTaxAmount] = React.useState("");
  const [editDiscount, setEditDiscount] = React.useState("");
  const canEditQuotation = hasEffectivePermission("QUOTATION_UPDATE");

  const loadQuotation = React.useCallback(async (showError = true) => {
      try {
        const res = await quotationApi.get(params.id as string);
        if (res.data.success && res.data.data) {
          const record = res.data.data;
          setQuotation({
            ...record,
            quotationNumber: record.number || record.quotationNumber,
            leadName: record.lead ? `${record.lead.firstName || ""} ${record.lead.lastName || ""}`.trim() : "—",
            projectName: record.project?.name || "—",
            amount: Number(record.totalAmount ?? record.amount ?? 0),
            receivedAmount: Number(record.receivedAmount || 0),
            balanceAmount: Number(record.balanceAmount ?? record.totalAmount ?? 0),
            status: String(record.status || "draft").toLowerCase(),
          });
        } else {
          if (showError) {
            toast({ title: "Error", description: "Quotation not found", variant: "destructive" as any });
            router.push("/quotations");
          }
        }
      } catch {
        if (showError) toast({ title: "Error", description: "Failed to load quotation", variant: "destructive" as any });
      } finally {
        setIsLoading(false);
      }
  }, [params.id, router, toast]);

  React.useEffect(() => { void loadQuotation(); }, [loadQuotation]);

  React.useEffect(() => {
    if (quotation?.status !== "submitted") return;
    const interval = window.setInterval(() => void loadQuotation(false), 10000);
    return () => window.clearInterval(interval);
  }, [loadQuotation, quotation?.status]);

  const handlePushToMis = async () => {
    try {
      const res = await quotationApi.pushToMis(params.id as string);
      if (res.data.success) {
        toast({ title: "Pushed to MIS", description: "The quotation is awaiting MIS review." });
        await loadQuotation(false);
      }
    } catch (error: any) {
      toast({ title: "Unable to push quotation", description: error?.response?.data?.error || error?.message || "Please try again.", variant: "destructive" as any });
    }
  };

  const openEditDialog = () => {
    if (!quotation) return;
    setEditItems((quotation.items || []).map((item) => ({
      description: item.description,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      unitId: item.unitId || undefined,
    })));
    setEditTaxAmount(String(quotation.taxAmount ?? 0));
    setEditDiscount(String(quotation.discount ?? 0));
    setEditOpen(true);
  };

  const saveRejectedCorrections = async () => {
    if (!editItems.length || editItems.some((item) => !item.description.trim() || Number(item.quantity) < 1 || Number(item.unitPrice) < 0)) {
      toast({ title: "Check quotation line items", description: "Each line needs a description, positive quantity, and non-negative price.", variant: "destructive" as any });
      return;
    }
    try {
      setEditSaving(true);
      await quotationApi.update(params.id as string, {
        items: editItems.map((item) => ({
          description: item.description.trim(),
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          ...(item.unitId ? { unitId: item.unitId } : {}),
        })),
        taxAmount: Number(editTaxAmount || 0),
        discount: Number(editDiscount || 0),
      });
      setEditOpen(false);
      await loadQuotation(false);
      toast({ title: "Corrections saved", description: "The quotation is ready to be pushed to MIS again." });
    } catch (error: any) {
      toast({ title: "Unable to save corrections", description: error?.response?.data?.error || error?.message || "Please try again.", variant: "destructive" as any });
    } finally {
      setEditSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!quotation) return null;

  return (
    <div className="space-y-6">
      <RecordPageHeader
        objectLabel="Quotation"
        title={quotation.quotationNumber}
        subtitle={`For ${quotation.leadName}`}
        backHref="/quotations"
        icon={<FileText className="h-5 w-5" aria-hidden="true" />}
        badges={<Badge variant={STATUS_VARIANT[quotation.status] || "default"}>{STATUS_LABEL[quotation.status] || quotation.status}</Badge>}
        actions={
          <>
            {canEditQuotation && ["draft", "rejected"].includes(quotation.status) && (
              <Button onClick={() => void handlePushToMis()}>
                <Send className="mr-2 h-4 w-4" />
                Push to MIS
              </Button>
            )}
            {canEditQuotation && quotation.status === "rejected" && (
              <Button variant="outline" onClick={openEditDialog}>
                <Pencil className="mr-2 h-4 w-4" />
                Correct quotation
              </Button>
            )}
          </>
        }
      />

      <RecordSummary items={[
        { label: "Amount", value: formatCurrency(quotation.amount) },
        { label: "Received", value: formatCurrency(quotation.receivedAmount) },
        { label: "Balance", value: formatCurrency(quotation.balanceAmount) },
        { label: "Status", value: STATUS_LABEL[quotation.status] || quotation.status },
        { label: "Valid Until", value: formatDate(quotation.validUntil) },
        { label: "Created", value: formatDate(quotation.createdAt) },
      ]} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="details" className="gap-2">
            <FileText className="h-4 w-4" />
            Details
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <History className="h-4 w-4" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="notes" className="gap-2">
            <StickyNote className="h-4 w-4" />
            Notes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Quotation Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Quotation Number</span>
                  <span className="text-sm font-medium">{quotation.quotationNumber}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Lead</span>
                  <span className="text-sm font-medium">{quotation.leadName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Project</span>
                  <span className="text-sm font-medium">{quotation.projectName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Amount</span>
                  <span className="text-sm font-bold">{formatCurrency(quotation.amount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={STATUS_VARIANT[quotation.status] || "default"}>
                    {STATUS_LABEL[quotation.status] || quotation.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Created</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(quotation.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Valid Until</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(quotation.validUntil)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Last Updated</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(quotation.updatedAt)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-medium"><Receipt className="h-4 w-4" />Receipts linked to this quotation</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!quotation.receipts?.length ? (
                <p className="text-sm text-muted-foreground">No receipts have been issued for this quotation yet. Receipts are available after a linked payment is verified.</p>
              ) : quotation.receipts.map((receipt) => (
                <div key={receipt.id} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0">
                  <div>
                    <Link href={`/receipts/${receipt.id}`} className="font-medium text-primary hover:underline">{receipt.receiptNumber}</Link>
                    <p className="text-xs text-muted-foreground">{formatDate(receipt.receiptDate)} · {receipt.status}</p>
                  </div>
                  <span className="font-semibold">{formatCurrency(Number(receipt.amount))}</span>
                  <Button variant="outline" size="sm" asChild><Link href={`/receipts/${receipt.id}`}>View Receipt</Link></Button>
                </div>
              ))}
            </CardContent>
          </Card>
          {(quotation.submittedAt || quotation.reviewedAt || quotation.approvals?.length) && (
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">MIS approval history</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {quotation.submittedAt && (
                  <div className="text-sm">
                    <span className="font-medium">Submitted to MIS</span>
                    <span className="text-muted-foreground"> · {formatDateTime(quotation.submittedAt)} by {quotation.submittedBy ? `${quotation.submittedBy.firstName} ${quotation.submittedBy.lastName}`.trim() : "Unknown user"}</span>
                  </div>
                )}
                {quotation.reviewedAt && (
                  <div className="text-sm">
                    <span className="font-medium">{quotation.status === "approved" ? "Accepted" : "Reviewed"}</span>
                    <span className="text-muted-foreground"> · {formatDateTime(quotation.reviewedAt)} by {quotation.reviewedBy ? `${quotation.reviewedBy.firstName} ${quotation.reviewedBy.lastName}`.trim() : "Unknown reviewer"}</span>
                  </div>
                )}
                {quotation.rejectionReason && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                    <p className="font-medium text-destructive">Rejection reason</p>
                    <p className="mt-1 whitespace-pre-wrap">{quotation.rejectionReason}</p>
                  </div>
                )}
                {quotation.approvals?.map((approval) => (
                  <div key={approval.id} className="border-t pt-3 text-sm">
                    <p className="font-medium">{approval.status === "APPROVED" ? "Accepted" : "Rejected"} · {approval.approver ? `${approval.approver.firstName} ${approval.approver.lastName}`.trim() : "MIS reviewer"}</p>
                    <p className="text-muted-foreground">{formatDateTime(approval.createdAt)}{approval.comments ? ` · ${approval.comments}` : ""}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No activity recorded</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <StickyNote className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No notes added</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={editOpen} onOpenChange={(open) => !editSaving && setEditOpen(open)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Correct rejected quotation</DialogTitle>
            <DialogDescription>Update the line items, prices, discount, or tax, then save before pushing the same quotation back to MIS.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {editItems.map((item, index) => (
              <div key={`${index}-${item.unitId || "line"}`} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_100px_140px_auto]">
                <div className="space-y-1">
                  <Label htmlFor={`mis-edit-description-${index}`}>Product / description</Label>
                  <Input id={`mis-edit-description-${index}`} value={item.description} onChange={(event) => setEditItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, description: event.target.value } : entry))} maxLength={500} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`mis-edit-quantity-${index}`}>Quantity</Label>
                  <Input id={`mis-edit-quantity-${index}`} type="number" min="1" step="1" value={item.quantity} onChange={(event) => setEditItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantity: event.target.value } : entry))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`mis-edit-price-${index}`}>Unit price</Label>
                  <Input id={`mis-edit-price-${index}`} type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => setEditItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, unitPrice: event.target.value } : entry))} />
                </div>
                <Button variant="ghost" size="sm" className="self-end" disabled={editItems.length <= 1} onClick={() => setEditItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setEditItems((current) => [...current, { description: "", quantity: "1", unitPrice: "" }])}>Add line item</Button>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label htmlFor="mis-edit-discount">Discount amount</Label><Input id="mis-edit-discount" type="number" min="0" step="0.01" value={editDiscount} onChange={(event) => setEditDiscount(event.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="mis-edit-tax">Tax amount</Label><Input id="mis-edit-tax" type="number" min="0" step="0.01" value={editTaxAmount} onChange={(event) => setEditTaxAmount(event.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>Cancel</Button>
            <Button onClick={() => void saveRejectedCorrections()} disabled={editSaving}>{editSaving ? "Saving…" : "Save corrections"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}