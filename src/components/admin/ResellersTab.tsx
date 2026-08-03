import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Percent, Plus, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createCoupon,
  deleteCoupon,
  listCouponRedemptions,
  listCoupons,
  saveCoupon,
  type CouponRedemptionRow,
} from "@/lib/admin-api";
import { PAID_PLANS, planById } from "@/lib/plans";
import {
  couponStatus,
  describeCoupon,
  emptyCouponDraft,
  normalizeCouponCode,
  quoteCoupon,
  type Coupon,
  type CouponDraft,
  type CouponKind,
} from "@/lib/resellers";

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const KINDS: { id: CouponKind; label: string; hint: string }[] = [
  { id: "percent", label: "% discount", hint: "value = percent off" },
  { id: "amount", label: "Amount off", hint: "value = USD off" },
  { id: "fixed_price", label: "Reseller price", hint: "value = final USD price" },
];

const STATUS_STYLE: Record<string, string> = {
  active: "border-[color:var(--color-mint)] text-[color:var(--color-mint)]",
  expired: "border-ink-300 text-ink-500",
  exhausted: "border-ink-300 text-ink-500",
  disabled: "border-[color:var(--color-flare)] text-[color:var(--color-flare)]",
};

/** Reseller programme: coupons, discounts, commission and redemption history. */
export function ResellersTab() {
  const [rows, setRows] = useState<Coupon[]>([]);
  const [redemptions, setRedemptions] = useState<CouponRedemptionRow[]>([]);
  const [draft, setDraft] = useState<CouponDraft>(emptyCouponDraft());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [coupons, reds] = await Promise.all([listCoupons(), listCouponRedemptions()]);
    setRows(coupons);
    setRedemptions(reds);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = (id: string, changes: Partial<Coupon>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)));

  const create = async () => {
    setBusy("new");
    try {
      const created = await createCoupon(draft);
      setRows((prev) => [created, ...prev]);
      setDraft(emptyCouponDraft());
      toast.success(`Coupon ${created.code} created`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create coupon");
    } finally {
      setBusy(null);
    }
  };

  const persist = async (coupon: Coupon) => {
    setBusy(coupon.id);
    try {
      await saveCoupon(coupon);
      toast.success(`${coupon.code} saved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save coupon");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (coupon: Coupon) => {
    if (!window.confirm(`Delete coupon ${coupon.code}? Redemption history is removed too.`)) return;
    setBusy(coupon.id);
    try {
      await deleteCoupon(coupon.id, coupon.code);
      setRows((prev) => prev.filter((r) => r.id !== coupon.id));
      toast.success("Coupon deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete coupon");
    } finally {
      setBusy(null);
    }
  };

  const totals = useMemo(() => {
    const paid = redemptions.reduce((s, r) => s + r.paidCents, 0);
    const commission = redemptions.reduce((s, r) => s + r.commissionCents, 0);
    return {
      sales: redemptions.length,
      paid,
      commission,
      discount: redemptions.reduce((s, r) => s + r.discountCents, 0),
      net: paid - commission,
      resellers: new Set(rows.map((r) => r.resellerEmail).filter(Boolean)).size,
    };
  }, [redemptions, rows]);

  const draftQuote = quoteCoupon(draft, draft.planSlug ?? PAID_PLANS[0].id);

  if (loading) return <p className="text-sm text-ink-500">Loading reseller programme…</p>;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Resellers", value: String(totals.resellers), icon: Users },
          { label: "Coupon sales", value: String(totals.sales), icon: Percent },
          { label: "Gross paid", value: usd(totals.paid), icon: Percent },
          { label: "Commission owed", value: usd(totals.commission), icon: Percent },
          { label: "Net to us", value: usd(totals.net), icon: Percent },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-ink-200 bg-white/80 p-4">
            <p className="text-2xs uppercase tracking-wider text-ink-500">{card.label}</p>
            <p className="mt-1 font-display text-xl font-bold text-ink-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* -------------------------------------------------- create a coupon */}
      <section className="space-y-3 rounded-2xl border border-ink-200 bg-white/80 p-4">
        <h3 className="font-display text-sm font-bold text-ink-900">New reseller coupon</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs text-ink-600">
            Code
            <Input
              value={draft.code}
              placeholder="NEXURA-PARTNER"
              onChange={(e) => setDraft({ ...draft, code: normalizeCouponCode(e.target.value) })}
              className="mt-1"
            />
          </label>
          <label className="block text-xs text-ink-600">
            Discount type
            <select
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as CouponKind })}
              className="mt-1 h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm"
            >
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-ink-600">
            Value ({draft.kind === "percent" ? "%" : "USD"})
            <Input
              type="number"
              min={0}
              step="0.01"
              value={draft.value}
              onChange={(e) => setDraft({ ...draft, value: Number(e.target.value || "0") })}
              className="mt-1"
            />
          </label>
          <label className="block text-xs text-ink-600">
            Package
            <select
              value={draft.planSlug ?? ""}
              onChange={(e) => setDraft({ ...draft, planSlug: e.target.value || null })}
              className="mt-1 h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm"
            >
              <option value="">Any paid package</option>
              {PAID_PLANS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.credits} credits · {p.price}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-ink-600">
            Reseller name
            <Input
              value={draft.resellerName ?? ""}
              onChange={(e) => setDraft({ ...draft, resellerName: e.target.value })}
              className="mt-1"
            />
          </label>
          <label className="block text-xs text-ink-600">
            Reseller email
            <Input
              type="email"
              value={draft.resellerEmail ?? ""}
              onChange={(e) => setDraft({ ...draft, resellerEmail: e.target.value })}
              className="mt-1"
            />
          </label>
          <label className="block text-xs text-ink-600">
            Commission %
            <Input
              type="number"
              min={0}
              max={100}
              value={draft.commissionPct}
              onChange={(e) => setDraft({ ...draft, commissionPct: Number(e.target.value || "0") })}
              className="mt-1"
            />
          </label>
          <label className="block text-xs text-ink-600">
            Bonus credits
            <Input
              type="number"
              min={0}
              value={draft.bonusCredits}
              onChange={(e) => setDraft({ ...draft, bonusCredits: Number(e.target.value || "0") })}
              className="mt-1"
            />
          </label>
          <label className="block text-xs text-ink-600">
            Max redemptions
            <Input
              type="number"
              min={1}
              placeholder="Unlimited"
              value={draft.maxRedemptions ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  maxRedemptions: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="mt-1"
            />
          </label>
          <label className="block text-xs text-ink-600">
            Expires
            <Input
              type="date"
              value={draft.expiresAt ? draft.expiresAt.slice(0, 10) : ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                })
              }
              className="mt-1"
            />
          </label>
          <label className="block text-xs text-ink-600 sm:col-span-2">
            Internal note
            <Input
              value={draft.note ?? ""}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              className="mt-1"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink-50/70 px-3 py-2 text-xs text-ink-600">
          <span>
            Reseller pays <strong className="text-ink-900">${draftQuote.payableUsd.toFixed(2)}</strong>{" "}
            (list ${draftQuote.listUsd.toFixed(2)}) for {draftQuote.credits} credits · commission $
            {draftQuote.commissionUsd.toFixed(2)} · net ${draftQuote.netUsd.toFixed(2)}
          </span>
          <Button size="sm" disabled={busy === "new" || !draft.code} onClick={() => void create()}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {busy === "new" ? "Creating…" : "Create coupon"}
          </Button>
        </div>
      </section>

      {/* -------------------------------------------------------- coupon list */}
      <section className="space-y-3">
        <h3 className="font-display text-sm font-bold text-ink-900">Coupons</h3>
        {rows.length === 0 && <p className="text-sm text-ink-500">No coupons yet.</p>}
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((coupon) => {
            const status = couponStatus(coupon);
            const quote = quoteCoupon(coupon, coupon.planSlug ?? PAID_PLANS[0].id);
            return (
              <div
                key={coupon.id}
                className="space-y-3 rounded-2xl border border-ink-200 bg-white/80 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-display text-base font-bold text-ink-900">{coupon.code}</p>
                    <p className="text-xs text-ink-600">
                      {describeCoupon(coupon)} ·{" "}
                      {coupon.planSlug ? planById(coupon.planSlug).name : "any package"} ·{" "}
                      {coupon.timesRedeemed}
                      {coupon.maxRedemptions ? `/${coupon.maxRedemptions}` : ""} used
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider ${STATUS_STYLE[status]}`}
                  >
                    {status}
                  </span>
                </div>

                <p className="text-xs text-ink-600">
                  {coupon.resellerName ?? "Unassigned"}
                  {coupon.resellerEmail ? ` · ${coupon.resellerEmail}` : ""} · commission{" "}
                  {coupon.commissionPct}% · bonus {coupon.bonusCredits} credits
                </p>

                <div className="grid grid-cols-3 gap-2">
                  <label className="block text-xs text-ink-600">
                    Value
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={coupon.value}
                      onChange={(e) => patch(coupon.id, { value: Number(e.target.value || "0") })}
                      className="mt-1"
                    />
                  </label>
                  <label className="block text-xs text-ink-600">
                    Commission %
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={coupon.commissionPct}
                      onChange={(e) =>
                        patch(coupon.id, { commissionPct: Number(e.target.value || "0") })
                      }
                      className="mt-1"
                    />
                  </label>
                  <label className="block text-xs text-ink-600">
                    Bonus credits
                    <Input
                      type="number"
                      min={0}
                      value={coupon.bonusCredits}
                      onChange={(e) =>
                        patch(coupon.id, { bonusCredits: Number(e.target.value || "0") })
                      }
                      className="mt-1"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-600">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={coupon.isActive}
                      onChange={(e) => patch(coupon.id, { isActive: e.target.checked })}
                    />
                    Active
                  </label>
                  <span>
                    ${quote.payableUsd.toFixed(2)} → {quote.credits} credits
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === coupon.id}
                      onClick={() => void remove(coupon)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy === coupon.id}
                      onClick={() => void persist(coupon)}
                    >
                      {busy === coupon.id ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* --------------------------------------------------- redemption log */}
      <section className="space-y-3">
        <h3 className="font-display text-sm font-bold text-ink-900">Reseller sales</h3>
        {redemptions.length === 0 ? (
          <p className="text-sm text-ink-500">No coupon sales recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-white/80">
            <table className="w-full text-left text-xs">
              <thead className="text-2xs uppercase tracking-wider text-ink-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Package</th>
                  <th className="px-3 py-2">Credits</th>
                  <th className="px-3 py-2">Paid</th>
                  <th className="px-3 py-2">Discount</th>
                  <th className="px-3 py-2">Commission</th>
                </tr>
              </thead>
              <tbody>
                {redemptions.map((r) => (
                  <tr key={r.id} className="border-t border-ink-100 text-ink-700">
                    <td className="px-3 py-2">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td className="px-3 py-2 font-semibold text-ink-900">{r.code}</td>
                    <td className="px-3 py-2">{r.planSlug ? planById(r.planSlug).name : "—"}</td>
                    <td className="px-3 py-2">{r.creditsGranted}</td>
                    <td className="px-3 py-2">{usd(r.paidCents)}</td>
                    <td className="px-3 py-2">{usd(r.discountCents)}</td>
                    <td className="px-3 py-2">{usd(r.commissionCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
