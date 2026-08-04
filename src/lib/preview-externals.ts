/**
 * Extra modules the live preview can resolve.
 *
 * Generated projects import far more than react + lucide: charts, toasts,
 * forms, dates, carousels, Radix primitives. The sandbox has no bundler, so
 * every unresolved import used to abort the whole build ("Module … is not
 * available in the live preview") and hand a fake failure to the auto-fixer.
 * We hand out the real packages that already ship with this app, and a
 * forgiving stub for anything else, so a preview never dies over an import.
 */
import * as React from "react";
import * as Recharts from "recharts";
import * as Sonner from "sonner";
import * as DateFns from "date-fns";
import * as Cva from "class-variance-authority";
import * as HookForm from "react-hook-form";
import * as HookFormResolvers from "@hookform/resolvers/zod";
import * as Zod from "zod";
import * as Cmdk from "cmdk";
import * as Embla from "embla-carousel-react";
import * as DayPicker from "react-day-picker";
import * as InputOtp from "input-otp";
import * as Vaul from "vaul";
import * as ResizablePanels from "react-resizable-panels";
import * as ReactQuery from "@tanstack/react-query";
import * as Markdown from "react-markdown";

import * as Accordion from "@radix-ui/react-accordion";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as AspectRatio from "@radix-ui/react-aspect-ratio";
import * as Avatar from "@radix-ui/react-avatar";
import * as Checkbox from "@radix-ui/react-checkbox";
import * as Collapsible from "@radix-ui/react-collapsible";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as RDialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as HoverCard from "@radix-ui/react-hover-card";
import * as RLabel from "@radix-ui/react-label";
import * as Menubar from "@radix-ui/react-menubar";
import * as NavigationMenu from "@radix-ui/react-navigation-menu";
import * as Popover from "@radix-ui/react-popover";
import * as Progress from "@radix-ui/react-progress";
import * as RadioGroup from "@radix-ui/react-radio-group";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as RSelect from "@radix-ui/react-select";
import * as Separator from "@radix-ui/react-separator";
import * as Slider from "@radix-ui/react-slider";
import * as Slot from "@radix-ui/react-slot";
import * as Switch from "@radix-ui/react-switch";
import * as RTabs from "@radix-ui/react-tabs";
import * as Toggle from "@radix-ui/react-toggle";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import * as Tooltip from "@radix-ui/react-tooltip";

/** Real packages, keyed by the id a generated project would import. */
export const REAL_MODULES: Record<string, unknown> = {
  recharts: Recharts,
  sonner: Sonner,
  "date-fns": DateFns,
  "class-variance-authority": Cva,
  "react-hook-form": HookForm,
  "@hookform/resolvers/zod": HookFormResolvers,
  "@hookform/resolvers": HookFormResolvers,
  zod: Zod,
  "zod/v4": Zod,
  cmdk: Cmdk,
  "embla-carousel-react": Embla,
  "react-day-picker": DayPicker,
  "input-otp": InputOtp,
  vaul: Vaul,
  "react-resizable-panels": ResizablePanels,
  "@tanstack/react-query": ReactQuery,
  "react-markdown": Markdown,

  "@radix-ui/react-accordion": Accordion,
  "@radix-ui/react-alert-dialog": AlertDialog,
  "@radix-ui/react-aspect-ratio": AspectRatio,
  "@radix-ui/react-avatar": Avatar,
  "@radix-ui/react-checkbox": Checkbox,
  "@radix-ui/react-collapsible": Collapsible,
  "@radix-ui/react-context-menu": ContextMenu,
  "@radix-ui/react-dialog": RDialog,
  "@radix-ui/react-dropdown-menu": DropdownMenu,
  "@radix-ui/react-hover-card": HoverCard,
  "@radix-ui/react-label": RLabel,
  "@radix-ui/react-menubar": Menubar,
  "@radix-ui/react-navigation-menu": NavigationMenu,
  "@radix-ui/react-popover": Popover,
  "@radix-ui/react-progress": Progress,
  "@radix-ui/react-radio-group": RadioGroup,
  "@radix-ui/react-scroll-area": ScrollArea,
  "@radix-ui/react-select": RSelect,
  "@radix-ui/react-separator": Separator,
  "@radix-ui/react-slider": Slider,
  "@radix-ui/react-slot": Slot,
  "@radix-ui/react-switch": Switch,
  "@radix-ui/react-tabs": RTabs,
  "@radix-ui/react-toggle": Toggle,
  "@radix-ui/react-toggle-group": ToggleGroup,
  "@radix-ui/react-tooltip": Tooltip,
};

/**
 * Last-resort module stub.
 *
 * Any property reads as a passthrough component (renders its children) and is
 * also callable as a hook/util returning an empty object, which is enough for
 * an unknown import to render instead of blowing up the whole tree.
 */
export function stubModule(id: string): unknown {
  const cache = new Map<string, unknown>();

  const makeMember = (name: string): unknown => {
    const Component = (props: Record<string, unknown> = {}) =>
      React.createElement(
        "div",
        { "data-preview-stub": `${id}.${name}` },
        (props["children"] ?? null) as React.ReactNode,
      );
    (Component as React.ComponentType).displayName = `Stub(${id}.${name})`;
    // Callable as a hook/helper too: hooks get an empty object, not a crash.
    return new Proxy(Component as unknown as object, {
      apply: (_t, _this, args: unknown[]) => {
        const first = args[0];
        if (first && typeof first === "object" && "children" in (first as object)) {
          return Component(first as Record<string, unknown>);
        }
        return {};
      },
      get: (target, prop: string) => {
        if (prop === "displayName" || prop === "name") {
          return (target as Record<string, unknown>)[prop];
        }
        return makeMember(`${name}.${prop}`);
      },
    });
  };

  return new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (prop === "__esModule") return true;
        if (prop === "default") return makeMember("default");
        const hit = cache.get(prop);
        if (hit) return hit;
        const member = makeMember(prop);
        cache.set(prop, member);
        return member;
      },
    },
  );
}
