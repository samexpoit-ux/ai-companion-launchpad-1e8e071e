/**
 * Dependency shims for the live preview sandbox.
 *
 * Generated projects routinely reach for a router, a class-name helper or an
 * animation library. The sandbox has no bundler, so instead of failing the build
 * we provide small, API-compatible implementations that behave well enough for a
 * preview. Shipped/exported projects install the real packages.
 */
import * as React from "react";

/* ------------------------------------------------------------------ router */

interface RouterCtx {
  path: string;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
  params: Record<string, string>;
  outlet?: React.ReactNode;
}

type PathListener = () => void;
let previewPath = "/";
const pathListeners = new Set<PathListener>();

/** Shared address state used by generated routers and the preview path bar. */
export const previewRouter = {
  getPath: () => previewPath,
  subscribe: (listener: PathListener) => {
    pathListeners.add(listener);
    return () => pathListeners.delete(listener);
  },
  navigate: (to: string) => {
    const raw = String(to || "/").trim();
    const next = raw.startsWith("/") ? raw : `/${raw}`;
    if (next === previewPath) return;
    previewPath = next;
    pathListeners.forEach((listener) => listener());
  },
  reset: () => {
    previewPath = "/";
    pathListeners.forEach((listener) => listener());
  },
};

const RouterContext = React.createContext<RouterCtx | null>(null);

function useRouter(): RouterCtx {
  const ctx = React.useContext(RouterContext);
  if (!ctx) {
    // Rendering a <Link> outside a router shouldn't crash the whole preview.
    return { path: "/", navigate: () => {}, params: {} };
  }
  return ctx;
}

/** In-memory router: the sandbox iframe has no real history to own. */
function MemoryRouter({
  children,
  initialEntries,
}: {
  children?: React.ReactNode;
  initialEntries?: string[];
}) {
  const initial = initialEntries?.[0];
  React.useEffect(() => {
    if (initial && previewRouter.getPath() === "/") previewRouter.navigate(initial);
  }, [initial]);
  const path = React.useSyncExternalStore(
    previewRouter.subscribe,
    previewRouter.getPath,
    previewRouter.getPath,
  );
  const value = React.useMemo<RouterCtx>(
    () => ({
      path,
      params: {},
      navigate: previewRouter.navigate,
    }),
    [path],
  );
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

/** Match a route pattern like `/users/:id` against the current path. */
function matchPath(pattern: string, path: string): Record<string, string> | null {
  if (pattern === "*") return {};
  const p = pattern.replace(/\/+$/, "") || "/";
  const target = path.replace(/\/+$/, "") || "/";
  const pSeg = p.split("/").filter(Boolean);
  const tSeg = target.split("/").filter(Boolean);
  const splat = pSeg[pSeg.length - 1] === "*";
  if (!splat && pSeg.length !== tSeg.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pSeg.length; i += 1) {
    const seg = pSeg[i]!;
    if (seg === "*") return params;
    const value = tSeg[i];
    if (value == null) return null;
    if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(value);
    else if (seg !== value) return null;
  }
  return params;
}

interface RouteProps {
  path?: string;
  index?: boolean;
  element?: React.ReactNode;
  children?: React.ReactNode;
}

function Route(_props: RouteProps) {
  // <Route> is descriptive only — <Routes> reads it from its children.
  return null;
}

function Routes({ children }: { children?: React.ReactNode }) {
  const { path, navigate } = useRouter();
  const routes = React.Children.toArray(children).filter(
    (child): child is React.ReactElement<RouteProps> => React.isValidElement(child),
  );

  let fallback: React.ReactElement<RouteProps> | null = null;
  for (const route of routes) {
    const pattern = route.props.index ? "/" : (route.props.path ?? "*");
    if (pattern === "*") {
      fallback = route;
      continue;
    }
    const params = matchPath(pattern, path);
    if (params) {
      return (
        <RouterContext.Provider value={{ path, navigate, params }}>
          {route.props.element ?? route.props.children ?? null}
        </RouterContext.Provider>
      );
    }
  }
  return <>{fallback?.props.element ?? fallback?.props.children ?? null}</>;
}

type AnchorProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  to?: string;
  replace?: boolean;
  className?: string | ((state: { isActive: boolean }) => string);
  style?: React.CSSProperties | ((state: { isActive: boolean }) => React.CSSProperties);
  children?: React.ReactNode | ((state: { isActive: boolean }) => React.ReactNode);
  end?: boolean;
};

/** react-router supports render-prop children on Link/NavLink. */
function renderChildren(children: AnchorProps["children"], isActive: boolean): React.ReactNode {
  if (typeof children === "function") {
    return (children as (state: { isActive: boolean }) => React.ReactNode)({ isActive });
  }
  return children;
}

function renderClass(className: AnchorProps["className"], isActive: boolean) {
  if (typeof className === "function") {
    return (className as (s: { isActive: boolean }) => string)({ isActive });
  }
  return className;
}

function renderStyle(style: AnchorProps["style"], isActive: boolean) {
  if (typeof style === "function") {
    return (style as (s: { isActive: boolean }) => React.CSSProperties)({ isActive });
  }
  return style;
}

function Link({ to = "/", replace, onClick, children, className, style, ...rest }: AnchorProps) {
  const { navigate } = useRouter();
  return (
    <a
      {...rest}
      href={to}
      className={renderClass(className, false)}
      style={renderStyle(style, false)}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
        navigate(to, { replace });
      }}
    >
      {renderChildren(children, false)}
    </a>
  );
}

function NavLink({ to = "/", className, style, children, end, ...rest }: AnchorProps) {
  const { path } = useRouter();
  const isActive = end ? path === to : path === to || path.startsWith(`${to}/`);
  return (
    <Link
      {...rest}
      to={to}
      className={renderClass(className, isActive)}
      style={renderStyle(style, isActive)}
      aria-current={isActive ? "page" : undefined}
    >
      {renderChildren(children, isActive)}
    </Link>
  );
}

function Navigate({ to = "/", replace }: { to?: string; replace?: boolean }) {
  const { navigate } = useRouter();
  React.useEffect(() => {
    navigate(to, { replace });
  }, [navigate, to, replace]);
  return null;
}

function Outlet() {
  return useRouter().outlet ?? null;
}

interface DataRoute {
  path?: string;
  index?: boolean;
  element?: React.ReactNode;
  Component?: React.ComponentType;
  children?: DataRoute[];
  errorElement?: React.ReactNode;
}

interface PreviewDataRouter {
  routes: DataRoute[];
  navigate: typeof previewRouter.navigate;
}

function routeElement(route: DataRoute): React.ReactNode {
  return route.element ?? (route.Component ? React.createElement(route.Component) : null);
}

function joinRoute(parent: string, child: string) {
  if (child.startsWith("/")) return child;
  return `${parent.replace(/\/$/, "")}/${child}`.replace(/\/+/g, "/") || "/";
}

function renderDataRoutes(
  routes: DataRoute[],
  path: string,
  navigate: RouterCtx["navigate"],
  parentPath = "",
): React.ReactNode {
  for (const route of routes) {
    const pattern = route.index ? (parentPath || "/") : joinRoute(parentPath || "/", route.path ?? "");
    const child = route.children
      ? renderDataRoutes(route.children, path, navigate, pattern === "*" ? parentPath : pattern)
      : null;
    const params = matchPath(pattern, path);
    if (!params && child == null) continue;
    const element = routeElement(route);
    if (element == null) return child;
    return (
      <RouterContext.Provider value={{ path, navigate, params: params ?? {}, outlet: child }}>
        {element}
      </RouterContext.Provider>
    );
  }
  return null;
}

function createBrowserRouter(routes: DataRoute[]): PreviewDataRouter {
  return { routes: Array.isArray(routes) ? routes : [], navigate: previewRouter.navigate };
}

function RouterProvider({ router }: { router?: PreviewDataRouter }) {
  const path = React.useSyncExternalStore(
    previewRouter.subscribe,
    previewRouter.getPath,
    previewRouter.getPath,
  );
  const navigate = router?.navigate ?? previewRouter.navigate;
  return (
    <RouterContext.Provider value={{ path, navigate, params: {} }}>
      {renderDataRoutes(router?.routes ?? [], path, navigate)}
    </RouterContext.Provider>
  );
}

export const reactRouterDom = {
  BrowserRouter: MemoryRouter,
  HashRouter: MemoryRouter,
  MemoryRouter,
  Router: MemoryRouter,
  Routes,
  Route,
  Switch: Routes,
  Link,
  NavLink,
  Navigate,
  Outlet,
  useNavigate: () => useRouter().navigate,
  useParams: () => useRouter().params,
  useLocation: () => {
    const { path } = useRouter();
    const [pathname, search = ""] = path.split("?");
    return { pathname: pathname || "/", search: search ? `?${search}` : "", hash: "", state: null };
  },
  useSearchParams: () => {
    const { path, navigate } = useRouter();
    const params = new URLSearchParams(path.split("?")[1] ?? "");
    return [
      params,
      (next: URLSearchParams) => navigate(`${path.split("?")[0]}?${next.toString()}`),
    ] as const;
  },
  useRouteError: () => null,
  useNavigation: () => ({ state: "idle", location: undefined, formData: undefined }),
  useMatch: (pattern: string) => {
    const { path } = useRouter();
    const params = matchPath(pattern, path);
    return params ? { params, pathname: path, pathnameBase: path, pattern: { path: pattern } } : null;
  },
  createBrowserRouter,
  createHashRouter: createBrowserRouter,
  createMemoryRouter: createBrowserRouter,
  RouterProvider,
};

/* -------------------------------------------------- class-name + animation */

function clsx(...args: unknown[]): string {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (!value) return;
    if (typeof value === "string" || typeof value === "number") out.push(String(value));
    else if (Array.isArray(value)) value.forEach(walk);
    else if (typeof value === "object") {
      for (const [key, active] of Object.entries(value as Record<string, unknown>)) {
        if (active) out.push(key);
      }
    }
  };
  args.forEach(walk);
  return out.join(" ");
}

/* ---------------------------------------------------- framer-motion / motion

   Generated projects use far more of the motion API than `motion.div`:
   scroll-linked values, springs, transforms, imperative animate() calls. A
   missing named export used to surface in the preview as
   `(0, _framerMotion.useScroll) is not a function`, which auto-fix cannot
   repair because the fault is in the sandbox, not the generated code. So the
   shim implements the real surface and falls back to harmless stubs for
   anything we have not modelled yet. */

type Listener = (v: number) => void;

class MotionValue<T = number> {
  private current: T;
  private listeners = new Set<Listener>();
  constructor(initial: T) {
    this.current = initial;
  }
  get() {
    return this.current;
  }
  set(v: T) {
    this.current = v;
    this.listeners.forEach((l) => l(v as unknown as number));
  }
  jump(v: T) {
    this.set(v);
  }
  on(_event: string, cb: Listener) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
  onChange(cb: Listener) {
    return this.on("change", cb);
  }
  destroy() {
    this.listeners.clear();
  }
  getVelocity() {
    return 0;
  }
  isMotionValue = true;
}

const motionValue = <T,>(initial: T) => new MotionValue<T>(initial);
const isMotionValue = (v: unknown): v is MotionValue =>
  typeof v === "object" && v !== null && (v as { isMotionValue?: boolean }).isMotionValue === true;

const useMotionValue = <T,>(initial: T) => React.useRef(new MotionValue<T>(initial)).current;

function useTransform(...args: unknown[]) {
  // useTransform(value, input[], output[]) | useTransform(() => any)
  const [source, input, output] = args as [
    MotionValue | (() => unknown),
    number[] | undefined,
    unknown[] | undefined,
  ];
  const compute = React.useCallback(() => {
    if (typeof source === "function") return source();
    const value = isMotionValue(source) ? (source.get() as number) : 0;
    if (!input || !output) return value;
    // linear interpolation across the provided ranges
    for (let i = 0; i < input.length - 1; i++) {
      const a = input[i];
      const b = input[i + 1];
      if (value >= Math.min(a, b) && value <= Math.max(a, b)) {
        const t = b === a ? 0 : (value - a) / (b - a);
        const from = output[i];
        const to = output[i + 1];
        if (typeof from === "number" && typeof to === "number") return from + (to - from) * t;
        return from;
      }
    }
    return value <= input[0] ? output[0] : output[output.length - 1];
  }, [source, input, output]);

  const out = React.useRef(new MotionValue<unknown>(compute())).current;
  React.useEffect(() => {
    if (typeof source === "function" || !isMotionValue(source)) return;
    out.set(compute());
    return source.on("change", () => out.set(compute()));
  }, [source, compute, out]);
  return out;
}

const useScroll = () => {
  const scrollY = useMotionValue(0);
  const scrollX = useMotionValue(0);
  const scrollYProgress = useMotionValue(0);
  const scrollXProgress = useMotionValue(0);
  React.useEffect(() => {
    const onScroll = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      scrollY.set(window.scrollY);
      scrollX.set(window.scrollX);
      scrollYProgress.set(Math.min(1, window.scrollY / max));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [scrollX, scrollY, scrollYProgress]);
  return { scrollY, scrollX, scrollYProgress, scrollXProgress };
};

const noopAnimation = () => {
  const promise = Promise.resolve() as Promise<void> & { stop: () => void; then: unknown };
  promise.stop = () => {};
  return promise;
};

/** `motion.*` renders the plain element — animation props are dropped. */
const MOTION_PROPS = new Set([
  "initial",
  "animate",
  "exit",
  "transition",
  "variants",
  "viewport",
  "layout",
  "layoutId",
  "layoutScroll",
  "layoutDependency",
  "drag",
  "dragConstraints",
  "dragElastic",
  "dragMomentum",
  "dragControls",
  "dragTransition",
  "dragListener",
  "custom",
  "transformTemplate",
  "onAnimationStart",
  "onAnimationComplete",
  "onUpdate",
  "onDrag",
  "onDragStart",
  "onDragEnd",
  "onDirectionLock",
  "onHoverStart",
  "onHoverEnd",
  "onTap",
  "onTapStart",
  "onTapCancel",
  "onViewportEnter",
  "onViewportLeave",
]);

const isMotionProp = (key: string) => MOTION_PROPS.has(key) || key.startsWith("while");

/** Resolve MotionValues inside `style` so `style={{ y: scrollY }}` never leaks an object. */
function cleanStyle(style: unknown): React.CSSProperties | undefined {
  if (!style || typeof style !== "object") return style as React.CSSProperties | undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style as Record<string, unknown>)) {
    out[key] = isMotionValue(value) ? value.get() : value;
  }
  return out as React.CSSProperties;
}

const motionComponent = (tag: string) => {
  const Component = React.forwardRef<unknown, Record<string, unknown>>((props, ref) => {
    const clean: Record<string, unknown> = { ref };
    for (const [key, value] of Object.entries(props)) {
      if (isMotionProp(key)) continue;
      clean[key] = key === "style" ? cleanStyle(value) : value;
    }
    return React.createElement(tag, clean);
  });
  Component.displayName = `motion.${tag}`;
  return Component as unknown as React.ComponentType<Record<string, unknown>>;
};

const motionCache = new Map<string, React.ComponentType<Record<string, unknown>>>();

const motion = new Proxy(
  ((tag: string) => motionComponent(tag)) as unknown as Record<
    string,
    React.ComponentType<Record<string, unknown>>
  >,
  {
    get: (_target, prop: string) => {
      if (prop === "create" || prop === "custom") return (t: unknown) => motionComponent(typeof t === "string" ? t : "div");
      let cached = motionCache.get(prop);
      if (!cached) {
        cached = motionComponent(prop);
        motionCache.set(prop, cached);
      }
      return cached;
    },
  },
) as Record<string, React.ComponentType<Record<string, unknown>>>;

const passthrough = ({ children }: { children?: React.ReactNode }) => <>{children}</>;

const framerMotionApi: Record<string, unknown> = {
  motion,
  m: motion,
  AnimatePresence: passthrough,
  MotionConfig: passthrough,
  LayoutGroup: passthrough,
  LazyMotion: passthrough,
  Reorder: { Group: passthrough, Item: passthrough },
  domAnimation: {},
  domMax: {},
  MotionValue,
  motionValue,
  isMotionValue,
  useMotionValue,
  useTransform,
  useScroll,
  useSpring: useMotionValue,
  useTime: () => useMotionValue(0),
  useVelocity: () => useMotionValue(0),
  useMotionTemplate: (strings: TemplateStringsArray, ...values: unknown[]) =>
    useMotionValue(
      strings.reduce(
        (acc, s, i) =>
          acc + s + (i < values.length ? String(isMotionValue(values[i]) ? values[i].get() : values[i]) : ""),
        "",
      ),
    ),
  useMotionValueEvent: (value: unknown, _event: string, cb: Listener) => {
    React.useEffect(() => {
      if (!isMotionValue(value)) return;
      return value.on("change", cb);
    }, [value, cb]);
  },
  useAnimation: () => ({ start: noopAnimation, stop: () => {}, set: () => {} }),
  useAnimationControls: () => ({ start: noopAnimation, stop: () => {}, set: () => {} }),
  useAnimate: () => [React.useRef(null), noopAnimation] as const,
  useAnimationFrame: (_cb: unknown) => {},
  useInView: () => true,
  useReducedMotion: () => false,
  useDragControls: () => ({ start: () => {} }),
  useCycle: (...states: unknown[]) => {
    const [index, setIndex] = React.useState(0);
    return [states[index], () => setIndex((i) => (i + 1) % Math.max(1, states.length))] as const;
  },
  animate: noopAnimation,
  scroll: () => () => {},
  inView: () => () => {},
  stagger: () => 0,
  transform: (v: unknown) => v,
  spring: () => 0,
  easeIn: (t: number) => t,
  easeOut: (t: number) => t,
  easeInOut: (t: number) => t,
  cubicBezier: () => (t: number) => t,
};

/**
 * Any named export we have not modelled resolves to a harmless stub instead of
 * `undefined`, so a preview never dies on `X is not a function`.
 */
export const framerMotion = new Proxy(framerMotionApi, {
  get: (target, prop: string) => {
    if (prop in target) return target[prop];
    if (prop === "__esModule") return true;
    if (prop === "default") return target.motion;
    // Hooks/components must stay callable; return a stub that works as both.
    const stub = (...args: unknown[]) => {
      const first = args[0];
      if (first && typeof first === "object" && "children" in (first as object)) {
        return (first as { children?: React.ReactNode }).children ?? null;
      }
      return undefined;
    };
    return stub;
  },
}) as Record<string, unknown>;

export const classNameShims = {
  clsx: { default: clsx, clsx, cx: clsx },
  twMerge: { twMerge: clsx, default: clsx },
};

export { clsx };

