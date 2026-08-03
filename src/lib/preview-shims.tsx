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
}

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
  const [path, setPath] = React.useState(initialEntries?.[0] ?? "/");
  const value = React.useMemo<RouterCtx>(
    () => ({
      path,
      params: {},
      navigate: (to: string) => {
        if (typeof to === "string") setPath(to.startsWith("/") ? to : `/${to}`);
      },
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
  return null;
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
  createBrowserRouter: () => ({}),
  RouterProvider: MemoryRouter,
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

/** `motion.*` renders the plain element — animation props are dropped. */
const MOTION_PROPS = new Set([
  "initial",
  "animate",
  "exit",
  "transition",
  "variants",
  "whileHover",
  "whileTap",
  "whileInView",
  "viewport",
  "layout",
  "layoutId",
  "drag",
  "dragConstraints",
]);

const motion: Record<string, React.ComponentType<Record<string, unknown>>> = new Proxy(
  {},
  {
    get: (_target, tag: string) => {
      const Component = (props: Record<string, unknown>) => {
        const clean: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(props)) {
          if (!MOTION_PROPS.has(key)) clean[key] = value;
        }
        return React.createElement(tag, clean);
      };
      Component.displayName = `motion.${tag}`;
      return Component;
    },
  },
) as Record<string, React.ComponentType<Record<string, unknown>>>;

export const framerMotion = {
  motion,
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  useAnimation: () => ({ start: () => Promise.resolve(), stop: () => {} }),
  useInView: () => true,
  useReducedMotion: () => false,
};

export const classNameShims = {
  clsx: { default: clsx, clsx, cx: clsx },
  twMerge: { twMerge: clsx, default: clsx },
};

export { clsx };
