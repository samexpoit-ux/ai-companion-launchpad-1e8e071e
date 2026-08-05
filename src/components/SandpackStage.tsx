import { useEffect, useState, type ReactElement } from "react";
import type { PreviewPayload, PreviewDevice } from "./preview-context";

type Tab = "code" | "preview" | "console";

interface Props {
  payload: PreviewPayload;
  tab: Tab;
  device: PreviewDevice;
}

type RuntimeComponent = (props: Props) => ReactElement;

export default function SandpackStage(props: Props) {
  const [Runtime, setRuntime] = useState<RuntimeComponent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let mounted = true;

    import("./SandpackRuntime")
      .then((mod) => {
        if (mounted) setRuntime(() => mod.default as RuntimeComponent);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        setLoadError(error instanceof Error ? error.message : "Preview engine failed to load.");
      });

    return () => {
      mounted = false;
    };
  }, [retryKey]);

  if (loadError) {
    return (
      <div className="grid h-full place-items-center px-6 text-center text-xs text-red-600">
        <div className="max-w-sm rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="font-semibold text-red-700">Preview engine failed to start</p>
          <p className="mt-2 break-words font-mono text-xs text-red-600/80">{loadError}</p>
          <button
            type="button"
            onClick={() => {
              setLoadError(null);
              setRetryKey((key) => key + 1);
            }}
            className="mt-3 rounded-md border border-red-200 bg-white px-3 py-1.5 font-semibold text-red-700 transition hover:bg-red-100"
          >
            Retry preview
          </button>
        </div>
      </div>
    );
  }

  if (!Runtime) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-xs text-ink-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[color:var(--color-iris)]" />
          Loading preview engine…
        </div>
      </div>
    );
  }

  return <Runtime {...props} />;
}
