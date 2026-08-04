import { useCallback, useEffect, useState } from "react";
import { BadgeDollarSign, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createPayment,
  listCoupons,
  redeemCouponForUser,
  formatMoney,
  listPayments,
  listUsers,
  updatePaymentStatus,
  type AdminUserRow,
  type PaymentRow,
} from "@/lib/admin-api";
import { PLANS, planById } from "@/lib/plans";
import { HeroStrip, Panel, Pill } from "@/components/admin/ui";
import { normalizeCouponCode, quoteCoupon, couponStatus, type Coupon } from "@/lib/resellers";

const STATUSES = ["all", "pending", "paid", "refunded", "failed"] as const;

const statusTone = (status: string): "good" | "warn" | "neutral" | "bad" =>
  status === "paid" ? "good" : status === "pending" ? "warn" : status === "refunded" ? "neutral" : "bad";

export function PaymentsTab() {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [filter, setFilter] = useState<(typeof STATUSES)[number]>("all");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const [userId, setUserId] = useState("");
  const [planSlug, setPlanSlug] = useState(PLANS[1].id);
  const [amount, setAmount] = useState("19");
  const [note, setNote] = useState("");
  // Optional reseller coupon: applying one prices the sale and grants credits.
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    setRows(await listPayments(status));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  useEffect(() => {
    void listUsers("").then(setUsers);
    void listCoupons().then(setCoupons);
  }, []);

  const coupon = coupons.find((c) => c.code === normalizeCouponCode(couponCode)) ?? null;
  const couponQuote = coupon ? quoteCoupon(coupon, coupon.planSlug ?? planSlug) : null;
  const couponUsable = coupon ? couponStatus(coupon) === "active" : false;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) {
      toast.error("Pick a user first");
      return;
    }
    setSaving(true);
    try {
      const effectivePlan = coupon?.planSlug ?? planSlug;
      const amountCents =
        couponUsable && couponQuote
          ? Math.round(couponQuote.payableUsd * 100)
          : Math.round(Number(amount || "0") * 100);
      const credits =
        couponUsable && couponQuote ? couponQuote.credits : planById(effectivePlan).credits;

      await createPayment({
        userId,
        planSlug: effectivePlan,
        amountCents,
        creditsGranted: credits,
        status: "paid",
        provider: couponUsable ? "manual+coupon" : "manual",
        note: [note.trim(), couponUsable ? `coupon ${coupon!.code}` : ""]
          .filter(Boolean)
          .join(" · ") || undefined,
      });

      // The coupon side of the sale: grants the credits and books commission.
      if (couponUsable && coupon) {
        await redeemCouponForUser({
          code: coupon.code,
          userId,
          planSlug: effectivePlan,
          credits,
          paidCents: amountCents,
        });
      }
      toast.success(couponUsable ? `Payment + coupon ${coupon!.code} applied` : "Payment recorded");
      setOpen(false);
      setNote("");
      setCouponCode("");
      await load(filter);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record payment");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (row: PaymentRow, status: string) => {
    try {
      await updatePaymentStatus(row.id, status);
      toast.success(`Marked ${status}`);
      await load(filter);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update payment");
    }
  };

  return (
    <div className="space-y-5">
      <HeroStrip
        eyebrow="Sales"
        title="Payments & refunds"
        subtitle="Record manual sales, apply a reseller coupon, and grant the package credits in one step."
        icon={BadgeDollarSign}
        stats={[{ label: "Records", value: String(rows.length) }]}
      />
      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            aria-pressed={filter === s}
            className={`rounded-full border px-3 py-1 text-xs capitalize transition ${
              filter === s
                ? "border-[color:var(--color-iris)] bg-[color:var(--color-iris)]/10 text-ink-900"
                : "border-ink-200 text-ink-600 hover:bg-ink-50"
            }`}
          >
            {s}
          </button>
        ))}
        <Button size="sm" className="ml-auto" onClick={() => setOpen((v) => !v)}>
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden /> Record payment
        </Button>
      </div>

      {open && (
        <form
          onSubmit={submit}
          className="grid gap-3 rounded-3xl border border-ink-200/80 bg-white p-4 shadow-ds-sm sm:grid-cols-4"
        >
          <label className="text-xs text-ink-600 sm:col-span-2">
            User
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-2 py-2 text-sm"
            >
              <option value="">Select a user…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email ?? u.id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-ink-600">
            Plan
            <select
              value={planSlug}
              onChange={(e) => {
                setPlanSlug(e.target.value as typeof planSlug);
                setAmount(String(Number(planById(e.target.value).price.replace(/[^0-9.]/g, "")) || 0));
              }}
              className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-2 py-2 text-sm"
            >
              {PLANS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-ink-600">
            Amount (USD)
            <Input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1"
            />
          </label>
          <label className="text-xs text-ink-600">
            Reseller coupon (optional)
            <Input
              value={couponCode}
              onChange={(e) => setCouponCode(normalizeCouponCode(e.target.value))}
              placeholder="NEXURA-PARTNER"
              className="mt-1"
            />
            {couponCode && (
              <span className="mt-1 block text-2xs text-ink-500">
                {!coupon
                  ? "No coupon with this code"
                  : !couponUsable
                    ? `Coupon is ${couponStatus(coupon)} — it will not be applied`
                    : `Reseller pays $${couponQuote!.payableUsd.toFixed(2)} → ${couponQuote!.credits} credits`}
              </span>
            )}
          </label>
          <label className="text-xs text-ink-600 sm:col-span-2">
            Note
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Bank transfer, invoice #, etc."
              className="mt-1"
            />
          </label>
          <div className="flex items-end">
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-ink-500">Loading payments…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-500">No payments recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-ink-200/80 bg-white shadow-ds-xs">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">Payments and their status</caption>
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wider text-ink-500">
                <th scope="col" className="px-4 py-2">Date</th>
                <th scope="col" className="px-4 py-2">User</th>
                <th scope="col" className="px-4 py-2">Plan</th>
                <th scope="col" className="px-4 py-2">Amount</th>
                <th scope="col" className="px-4 py-2">Status</th>
                <th scope="col" className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-ink-100 last:border-0">
                  <td className="px-4 py-2 text-xs text-ink-500">
                    {new Date(row.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-ink-800">{row.email ?? row.userId}</td>
                  <td className="px-4 py-2 capitalize text-ink-700">{row.planSlug ?? "—"}</td>
                  <td className="px-4 py-2 font-medium text-ink-900">
                    {formatMoney(row.amountCents, row.currency)}
                  </td>
                  <td className="px-4 py-2">
                    <Pill tone={statusTone(row.status)}>{row.status}</Pill>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      {row.status !== "paid" && (
                        <Button size="sm" variant="outline" onClick={() => void setStatus(row, "paid")}>
                          Mark paid
                        </Button>
                      )}
                      {row.status === "paid" && (
                        <Button size="sm" variant="outline" onClick={() => void setStatus(row, "refunded")}>
                          Refund
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
