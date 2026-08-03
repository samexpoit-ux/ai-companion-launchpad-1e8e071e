import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BadgeDollarSign,
  Loader2,
  Palette,
  RotateCcw,
  Save,
  ShieldAlert,
  UserPlus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { listSettings, saveSetting, type SettingRow } from "@/lib/admin-api";
import { Panel, Pill } from "./ui";

/**
 * Known platform settings.
 *
 * The Settings tab used to render nothing at all when `platform_settings` had no
 * rows yet. These schemas give the console a full, editable default set: a
 * missing key is shown with its default values and is written on first save.
 */
type FieldSchema = {
  key: string;
  label: string;
  hint?: string;
  default: string | number | boolean;
};

type GroupSchema = {
  key: string;
  title: string;
  hint: string;
  icon: LucideIcon;
  accent: string;
  fields: FieldSchema[];
};

const GROUPS: GroupSchema[] = [
  {
    key: "brand",
    title: "Branding",
    hint: "Name and tagline shown across the app",
    icon: Palette,
    accent: "var(--color-iris)",
    fields: [
      { key: "name", label: "Product name", default: "Nexura AI" },
      { key: "tagline", label: "Tagline", default: "Build anything with AI" },
      { key: "support_email", label: "Support email", default: "support@nexuraai.dev" },
    ],
  },
  {
    key: "signup",
    title: "Sign-up",
    hint: "New accounts and their starting credits",
    icon: UserPlus,
    accent: "var(--color-mint)",
    fields: [
      { key: "enabled", label: "Allow new sign-ups", default: true },
      { key: "free_credits", label: "Starting free credits", hint: "Free plan ceiling", default: 5 },
      { key: "require_email_confirm", label: "Require email confirmation", default: true },
    ],
  },
  {
    key: "billing",
    title: "Billing mode",
    hint: "Paid packages and minimum top-up",
    icon: BadgeDollarSign,
    accent: "var(--color-sun)",
    fields: [
      { key: "paid_enabled", label: "Paid packages purchasable", default: true },
      { key: "min_package_credits", label: "Minimum package (credits)", default: 200 },
      { key: "min_topup_credits", label: "Minimum top-up (credits)", default: 100 },
    ],
  },
  {
    key: "maintenance",
    title: "Maintenance",
    hint: "Show a maintenance banner to everyone",
    icon: ShieldAlert,
    accent: "var(--color-flare)",
    fields: [
      { key: "enabled", label: "Maintenance mode", default: false },
      {
        key: "message",
        label: "Banner message",
        default: "We are performing scheduled maintenance.",
      },
    ],
  },
];

function Field({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  if (typeof value === "boolean") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-ink-200/80 bg-ink-100/50 px-3 py-2.5">
        <span className="min-w-0">
          <span className="block text-xs font-medium text-ink-800">{label}</span>
          {hint && <span className="block text-2xs text-ink-500">{hint}</span>}
        </span>
        <Switch checked={value} onCheckedChange={onChange} aria-label={label} />
      </div>
    );
  }
  return (
    <label className="block">
      <span className="flex items-baseline gap-2 text-xs font-medium text-ink-700">
        {label}
        {hint && <span className="text-2xs font-normal text-ink-400">{hint}</span>}
      </span>
      {typeof value === "number" ? (
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value || "0"))}
          className="mt-1.5"
        />
      ) : (
        <Input
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1.5"
        />
      )}
    </label>
  );
}

type Draft = Record<string, Record<string, unknown>>;

function seedDraft(rows: SettingRow[]): Draft {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const draft: Draft = {};
  for (const group of GROUPS) {
    const stored = byKey.get(group.key) ?? {};
    const merged: Record<string, unknown> = {};
    for (const field of group.fields) {
      merged[field.key] = field.key in stored ? stored[field.key] : field.default;
    }
    // keep any extra keys the backend already stores
    for (const [k, v] of Object.entries(stored)) if (!(k in merged)) merged[k] = v;
    draft[group.key] = merged;
  }
  // surface unknown groups the backend defines so nothing is hidden
  for (const row of rows) if (!draft[row.key]) draft[row.key] = { ...row.value };
  return draft;
}

export function SettingsTab() {
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [draft, setDraft] = useState<Draft>(() => seedDraft([]));
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const next = await listSettings();
    setRows(next);
    setDraft(seedDraft(next));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo<GroupSchema[]>(() => {
    const extra = Object.keys(draft)
      .filter((k) => !GROUPS.some((g) => g.key === k))
      .map<GroupSchema>((k) => ({
        key: k,
        title: k.replace(/_/g, " "),
        hint: "Platform setting",
        icon: Palette,
        accent: "var(--color-orchid)",
        fields: [],
      }));
    return [...GROUPS, ...extra];
  }, [draft]);

  const patch = (group: string, field: string, next: unknown) =>
    setDraft((prev) => ({ ...prev, [group]: { ...prev[group], [field]: next } }));

  const persist = async (group: GroupSchema) => {
    setSavingKey(group.key);
    try {
      await saveSetting(group.key, draft[group.key] ?? {});
      toast.success(`${group.title} saved`);
      const next = await listSettings();
      setRows(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save setting");
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {GROUPS.map((g) => (
          <div
            key={g.key}
            className="h-64 animate-pulse rounded-3xl border border-ink-200/70 bg-ink-100/70"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-ink-500">
          Defaults are shown for settings that have never been saved — press Save to store them.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => void load()}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Reload
        </Button>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {groups.map((group) => {
          const values = draft[group.key] ?? {};
          const stored = rows.some((r) => r.key === group.key);
          const fields =
            group.fields.length > 0
              ? group.fields
              : Object.keys(values).map((k) => ({
                  key: k,
                  label: k.replace(/_/g, " "),
                  default: "" as string,
                }));
          return (
            <Panel
              key={group.key}
              title={group.title}
              description={group.hint}
              icon={group.icon}
              accent={group.accent}
              actions={<Pill tone={stored ? "good" : "warn"}>{stored ? "Saved" : "Default"}</Pill>}
              bodyClassName="space-y-3"
            >
              {fields.map((field) => (
                <Field
                  key={field.key}
                  label={field.label}
                  hint={"hint" in field ? (field as FieldSchema).hint : undefined}
                  value={values[field.key]}
                  onChange={(next) => patch(group.key, field.key, next)}
                />
              ))}
              <Button
                className="w-full"
                disabled={savingKey === group.key}
                onClick={() => void persist(group)}
              >
                {savingKey === group.key ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> Saving…
                  </>
                ) : (
                  <>
                    <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Save {group.title.toLowerCase()}
                  </>
                )}
              </Button>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
