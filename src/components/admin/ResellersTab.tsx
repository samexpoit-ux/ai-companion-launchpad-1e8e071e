import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Coins,
  Percent,
  Plus,
  Save,
  ShieldCheck,
  Ticket,
  Trash2,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createCoupon,
  deleteCoupon,
  fetchResellerPrices,
  saveResellerPrices,
  listCouponRedemptions,
  listCoupons,
  saveCoupon,
  type CouponRedemptionRow,
} from "@/lib/admin-api";
import {
  PAID_PLANS,
  planById,
  resellerPriceBdt,
  type PlanId,
  type ResellerPriceOverrides,
} from "@/lib/plans";
import { EmptyState, HeroStrip, Panel, Pill, StatCard } from "@/components/admin/ui";
import { useCurrency } from "@/components/admin/currency";
import { bdtToUsd, formatBdt, usdToBdt } from "@/lib/currency";
import { DEFAULT_ECONOMICS } from "@/lib/package-economics";
import {
  couponStatus,
  describeCoupon,
  emptyCouponDraft,
  normalizeCouponCode,
  priceFloor,
  quoteCoupon,
  type Coupon,
  type CouponDraft,
  type CouponKind,
} from "@/lib/resellers";

const KINDS: { id: CouponKind; label: string; hint: string }[] = [
  { id: "fixed_price", label: "Flat wholesale price", hint: "value = what the reseller pays" },
  { id: "percent", label: "% discount", hint: "value = percent off list" },
  { id: "amount", label: "Amount off", hint: "value = money off list" },
];

const FLOOR_STYLE: Record<string, string> = {
  loss: "border-[color:var(--color-flare)] bg-[color:var(--color-flare)]/10 text-[color:var(--color-flare)]",
  thin: "border-[color:var(--color-sun)] bg-[color:var(--color-sun)]/10 text-ink-800",
  safe: "border-[color:var(--color-mint)] bg-[color:var(--color-mint)]/10 text-ink-800",
};

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
  const { money, currency } = useCurrency();
  const [costPerCredit, setCostPerCredit] = useState(String(DEFAULT_ECONOMICS.costPerCredit));
  // Admin-entered wholesale price list (BDT per package), persisted in settings.
  const [prices, setPrices] = useState<ResellerPriceOverrides>({});
  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({});
  const [savingPrices, setSavingPrices] = useState(false);
  const wholesaleBdtFor = (id: string) => resellerPriceBdt(id, prices);
  const usd = (cents: number) => money(cents / 100);
  const cost = Number(costPerCredit) > 0 ? Number(costPerCredit) : DEFAULT_ECONOMICS.costPerCredit;

  const load = useCallback(async () => {
    setLoading(true);
    const [coupons, reds, priceList] = await Promise.all([
      listCoupons(),
      listCouponRedemptions(),
      fetchResellerPrices(),
    ]);
    setRows(coupons);
    setRedemptions(reds);
    setPrices(priceList);
    setPriceDraft(
      Object.fromEntries(
        PAID_PLANS.map((plan) => [plan.id, String(resellerPriceBdt(plan.id, priceList))]),
      ),
    );
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

  const savePrices = async () => {
    const next: ResellerPriceOverrides = {};
    for (const plan of PAID_PLANS) {
      const value = Number(priceDraft[plan.id] ?? "0");
      if (!Number.isFinite(value) || value <= 0) {
        toast.error(`Enter a valid BDT price for ${plan.name}`);
        return;
      }
      next[plan.id as PlanId] = Math.round(value);
    }
    const losing = PAID_PLANS.find(
      (plan) => priceFloor(plan.id, cost, bdtToUsd(next[plan.id as PlanId]!)).verdict === "loss",
    );
    if (
      losing &&
      !window.confirm(
        `${losing.name} is priced below our engine cost — save anyway? This sells at a loss.`,
      )
    )
      return;
    setSavingPrices(true);
    try {
      await saveResellerPrices(next);
      setPrices(next);
      toast.success("Reseller price list saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save prices");
    } finally {
      setSavingPrices(false);
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

  const draftPlan = draft.planSlug ?? PAID_PLANS[0].id;
  const draftQuote = quoteCoupon(draft, draftPlan);
  const draftFloor = priceFloor(draftPlan, cost, draftQuote.payableUsd);

  if (loading) return <p className="text-sm text-ink-500">Loading reseller programme…</p>;

  return (
    <div className="space-y-6">
      <HeroStrip
        eyebrow="Reseller programme"
        title={`${totals.sales} reseller sales · ${usd(totals.net)} net`}
        subtitle="Flat wholesale prices in BDT, zero commission — resellers keep whatever they charge their own customers."
        icon={Ticket}
        stats={[
          { label: "Resellers", value: String(totals.resellers) },
          { label: "Gross paid", value: usd(totals.paid) },
          { label: "Commission", value: usd(totals.commission) },
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Resellers", value: String(totals.resellers), icon: Users, accent: "var(--color-iris)" },
          { label: "Coupon sales", value: String(totals.sales), icon: Ticket, accent: "var(--color-orchid)" },
          { label: "Gross paid", value: usd(totals.paid), icon: Coins, accent: "var(--color-mint)" },
          { label: "Commission owed", value: usd(totals.commission), icon: Percent, accent: "var(--color-sun)" },
          { label: "Net to us", value: usd(totals.net), icon: Coins, accent: "var(--color-iris-cyan)" },
        ].map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            accent={card.accent}
          />
        ))}
      </div>

      {/* ------------------------------------------- wholesale price list */}
      <Panel
        title="Reseller wholesale price list"
        description="What a reseller pays us per package — editable, saved for every admin"
        icon={Coins}
        accent="var(--color-mint)"
        actions={
          <>
            <label className="hidden items-center gap-2 text-xs text-ink-600 sm:flex">
              Engine cost / credit
              <Input
                value={costPerCredit}
                onChange={(e) => setCostPerCredit(e.target.value)}
                inputMode="decimal"
                className="h-9 w-24 font-mono text-sm"
                aria-label="Engine cost per credit in USD"
              />
            </label>
            <Button size="sm" disabled={savingPrices} onClick={() => void savePrices()}>
              <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {savingPrices ? "Saving…" : "Save prices"}
            </Button>
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="text-2xs uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-3 py-2">Package</th>
                <th className="px-3 py-2">Retail</th>
                <th className="px-3 py-2">Reseller pays (৳ editable)</th>
                <th className="px-3 py-2">Our engine cost</th>
                <th className="px-3 py-2">We keep</th>
                <th className="px-3 py-2">Cost floor (never below)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200/70">
              {PAID_PLANS.map((plan) => {
                const typed = Number(priceDraft[plan.id] ?? "");
                const wholesaleBdt = typed > 0 ? typed : wholesaleBdtFor(plan.id);
                const wholesaleUsd = bdtToUsd(wholesaleBdt);
                const floor = priceFloor(plan.id, cost, wholesaleUsd);
                return (
                  <tr key={plan.id} className="text-ink-800">
                    <td className="px-3 py-2">
                      <span className="font-semibold text-ink-900">{plan.name}</span>
                      <span className="ml-1.5 text-ink-500">{plan.credits} cr</span>
                    </td>
                    <td className="px-3 py-2 font-mono">{money(Number(plan.price.slice(1)))}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-ink-500">৳</span>
                        <Input
                          type="number"
                          min={0}
                          step="10"
                          value={priceDraft[plan.id] ?? ""}
                          onChange={(e) =>
                            setPriceDraft({ ...priceDraft, [plan.id]: e.target.value })
                          }
                          className="h-9 w-28 font-mono text-sm"
                          aria-label={`Reseller price for ${plan.name} in BDT`}
                        />
                        <span className="font-mono text-ink-500">${wholesaleUsd.toFixed(2)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {formatBdt(floor.breakEvenBdt)}
                      <span className="ml-1 text-ink-500">{money(floor.breakEvenUsd)}</span>
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold">
                      {formatBdt(wholesaleBdt - floor.breakEvenBdt)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-2xs font-semibold ${FLOOR_STYLE[floor.verdict]}`}
                      >
                        {floor.verdict === "loss"
                          ? `Loss — min ${formatBdt(floor.breakEvenBdt)}`
                          : `${floor.multiple}× cost · safe ${formatBdt(floor.safeBdt)}`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>


      {/* -------------------------------------------------- create a coupon */}
      <Panel
        title="New reseller coupon"
        description="A coupon sets the price a reseller (or their customer) pays at checkout"
        icon={Ticket}
        accent="var(--color-orchid)"
        bodyClassName="space-y-3 p-4"
      >
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
            {draft.kind === "percent"
              ? "Value (%)"
              : `Reseller pays (${currency === "BDT" ? "৳ BDT" : "$ USD"})`}
            <Input
              type="number"
              min={0}
              step="0.01"
              value={
                draft.kind === "percent" || currency === "USD" ? draft.value : usdToBdt(draft.value)
              }
              onChange={(e) => {
                const raw = Number(e.target.value || "0");
                const next = draft.kind === "percent" || currency === "USD" ? raw : bdtToUsd(raw);
                setDraft({ ...draft, value: next });
              }}
              className="mt-1"
            />
            {draft.kind !== "percent" && (
              <span className="mt-1 block text-2xs text-ink-500">
                {currency === "BDT"
                  ? `= $${draft.value.toFixed(2)} USD`
                  : `= ${formatBdt(usdToBdt(draft.value))}`}{" "}
                · suggested {formatBdt(wholesaleBdtFor(draftPlan))}
              </span>
            )}
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
            Commission % (0 = reseller keeps all upside)
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

        <div
          className={`space-y-2 rounded-xl border px-3 py-2.5 text-xs ${FLOOR_STYLE[draftFloor.verdict]}`}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {draftFloor.verdict === "safe" ? (
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            <span>
              Reseller pays <strong>{money(draftQuote.payableUsd)}</strong> (list{" "}
              {money(draftQuote.listUsd)}) for {draftQuote.credits} credits · commission{" "}
              {money(draftQuote.commissionUsd)} · net to us{" "}
              <strong>{money(draftQuote.netUsd)}</strong>
            </span>
            <Button
              size="sm"
              className="ml-auto"
              disabled={busy === "new" || !draft.code}
              onClick={() => void create()}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {busy === "new" ? "Creating…" : "Create coupon"}
            </Button>
          </div>
          <p className="text-2xs">
            {draftFloor.verdict === "loss"
              ? `LOSS — our engine cost for ${draftFloor.credits} credits is ${money(draftFloor.breakEvenUsd)} (${formatBdt(draftFloor.breakEvenBdt)}). Never sell under this.`
              : draftFloor.verdict === "thin"
                ? `Thin — covers cost (${money(draftFloor.breakEvenUsd)} / ${formatBdt(draftFloor.breakEvenBdt)}) at ${draftFloor.multiple}×, but the safe floor is ${money(draftFloor.safeUsd)} (${formatBdt(draftFloor.safeBdt)}).`
                : `Safe — ${draftFloor.multiple}× our ${money(draftFloor.breakEvenUsd)} (${formatBdt(draftFloor.breakEvenBdt)}) engine cost for ${draftFloor.credits} credits.`}
          </p>
        </div>
      </Panel>

      {/* -------------------------------------------------------- coupon list */}
      <section className="space-y-3">
        <h3 className="font-display text-sm font-semibold tracking-tight text-ink-900">Coupons</h3>
        {rows.length === 0 && (
          <EmptyState
            icon={Ticket}
            title="No reseller coupons yet"
            description="Create a coupon above to give a reseller their wholesale price."
          />
        )}
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((coupon) => {
            const status = couponStatus(coupon);
            const quote = quoteCoupon(coupon, coupon.planSlug ?? PAID_PLANS[0].id);
            return (
              <div
                key={coupon.id}
                className="space-y-3 rounded-3xl border border-ink-200/80 bg-white p-4 shadow-ds-xs transition hover:shadow-ds-md"
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
                    {money(quote.payableUsd)} → {quote.credits} credits ·{" "}
                    {(() => {
                      const floor = priceFloor(
                        coupon.planSlug ?? PAID_PLANS[0].id,
                        cost,
                        quote.payableUsd,
                      );
                      return floor.verdict === "loss" ? (
                        <strong className="text-[color:var(--color-flare)]">
                          below cost {money(floor.breakEvenUsd)}
                        </strong>
                      ) : (
                        <span className="text-ink-500">{floor.multiple}× cost</span>
                      );
                    })()}
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
        <h3 className="font-display text-sm font-semibold tracking-tight text-ink-900">
          Reseller sales
        </h3>
        {redemptions.length === 0 ? (
          <p className="text-sm text-ink-500">No coupon sales recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-ink-200/80 bg-white shadow-ds-xs">
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
