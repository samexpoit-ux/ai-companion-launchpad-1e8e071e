import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { parseApiError } from "@/lib/api-error";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile, displayNameOf } from "@/hooks/useAuth";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Plus,
  Settings,
  LogOut,
  ArrowUp,
  Paperclip,
  PanelLeftClose,
  PanelLeft,
  Trash2,
  Pencil,
  Check,
  X,
  Copy,
  Menu,
  Search,
  ChevronDown,
  Command,
  Zap,
  Sparkle,
  Diamond,
  Mic,
  Loader2,
  Image as ImageIcon,
  ChevronRight,
  Crown,
  Coins,
  History,
  ArrowLeft,
  UploadCloud,
  Square,
} from "lucide-react";
import {
  sendChatMessage,
  AI_MODELS,
  type ChatMessage,
  type ChatThread,
  type AIModel,
} from "@/lib/chat-api";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  actionForMode,
  
  estimateCostForWords,
  formatCredits,
  promptCoach,
  wordBudget,
  MAX_PROMPT_WORDS,
  ACTION_RULES,
  type CreditAction,
} from "@/lib/credits";

import { useCredits } from "@/hooks/useCredits";
import { useAdmin } from "@/hooks/useAdmin";
import { CreditMeter } from "@/components/CreditMeter";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import {
  listThreads,
  listMessages,
  createThread as createDbThread,
  deleteThread as deleteDbThread,
  renameThread as renameDbThread,
  saveMessage,
  subscribeToChat,
  type StoredMessage,
} from "@/lib/chat-store";

import { BrandMark, BrandWordmark, BrandGlyph } from "@/components/BrandMark";
import { ThemePicker } from "@/components/ThemePicker";
import { Link, useRouterState } from "@tanstack/react-router";
import { takePendingPrompt } from "@/lib/pending-prompt";
import {
  MAX_ATTACHMENTS,
  attachmentSummary,
  prepareAttachment,
  type ChatAttachment,
} from "@/lib/chat-attachments";
import { useVoiceInput } from "@/hooks/useVoiceInput";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PreviewProvider, usePreview, isPreviewable } from "@/components/preview-context";
import { PreviewPanel } from "@/components/PreviewPanel";
import { PlayCircle, GripVertical, FolderTree, PanelRight } from "lucide-react";
import { chatProse, mergeArtifactProjects, parseArtifacts, type ArtifactProject } from "@/lib/artifact";
import { ActivityCard, stepsForMessage } from "@/components/ActivityCard";

import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";

const uid = () => Math.random().toString(36).slice(2, 10);
const createFreshThread = (): ChatThread => ({
  id: uid(),
  title: "Untitled dossier",
  messages: [],
  updatedAt: Date.now(),
});

/**
 * Rows are keyed by their client id so optimistic bubbles reconcile with the
 * persisted copy. Two rows can carry the same client id (a retried save, a
 * realtime echo persisted twice), so dedupe here — otherwise React renders
 * duplicate keys and drops a bubble.
 */
function toChatMessages(rows: StoredMessage[]) {
  const byId = new Map<string, ChatThread["messages"][number]>();
  for (const row of rows) {
    const id = row.clientId ?? row.id;
    byId.set(id, {
      id,
      role: row.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: row.content,
      createdAt: new Date(row.createdAt).getTime(),
      model: row.model ?? undefined,
      tokens: row.tokens ?? undefined,
      latencyMs: row.latencyMs ?? undefined,
    });
  }
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
}


type ComposerMode = "Build" | "Chat" | "Plan" | "Image";
const COMPOSER_MODES: readonly ComposerMode[] = ["Build", "Chat", "Plan", "Image"];

const tierIcon = (tier: AIModel["tier"]) =>
  tier === "Signature" ? Crown : tier === "Reserve" ? Diamond : Sparkle;

export function ChatWorkspace() {
  return (
    <PreviewProvider>
      <ChatWorkspaceInner />
    </PreviewProvider>
  );
}

function ChatWorkspaceInner() {
  const [hydrated, setHydrated] = useState(false);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [modelId, setModelId] = useState<string>(AI_MODELS[0].id);
  const [mode, setMode] = useState<ComposerMode>("Build");
  // New project naming: every new workspace asks for a project name first.
  const [namePromptOpen, setNamePromptOpen] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [loadedThreads, setLoadedThreads] = useState<Set<string>>(() => new Set());
  const credits = useCredits();
  // Engine / provider details are admin-only; customers only see credits + workload.
  const { isAdmin } = useAdmin();

  const {
    isOpen: previewOpen,
    toggleWorkspace,
    openWorkspace,
    openProject,
    applyProjectUpdate,
    clearProject,
    setFixIntent,
  } = usePreview();
  const isMobile = useIsMobile();

  // Deep link: /workspace?thread=<id> opens that conversation.
  const requestedThreadId = useRouterState({
    select: (state) => {
      const search = state.location.search as Record<string, unknown> | undefined;
      const value = search?.["thread"];
      return typeof value === "string" && value ? value : null;
    },
  });

  const { user } = useAuth();
  const profile = useProfile(user?.id);
  const accountName = displayNameOf(profile, user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [query, setQuery] = useState("");
  useEffect(() => setSidebarOpen(!isMobile), [isMobile]);

  // When the live workspace opens, get the left rail out of the way so the
  // preview has the full width. Reopens when the workspace is closed again,
  // and a manual toggle always wins until the next transition.
  const prevPreviewOpen = useRef(false);
  useEffect(() => {
    if (isMobile) return;
    if (previewOpen !== prevPreviewOpen.current) {
      prevPreviewOpen.current = previewOpen;
      setSidebarOpen(!previewOpen);
    }
  }, [previewOpen, isMobile]);


  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState("");

  // "Ask AI" from the preview's visual editor pre-fills the composer.
  useEffect(() => {
    const onAsk = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === "string") setInput(detail);
    };
    window.addEventListener("nexura:ask-ai", onAsk);
    return () => window.removeEventListener("nexura:ask-ai", onAsk);
  }, []);
  const [isSending, setIsSending] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const requestAbortRef = useRef<AbortController | null>(null);

  const appendTranscript = useCallback((transcript: string) => {
    setVoiceDraft((current) => `${current}${current.trim() ? " " : ""}${transcript}`);
  }, []);
  const voice = useVoiceInput(appendTranscript);

  useEffect(() => () => requestAbortRef.current?.abort(), []);

  const addFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setAttachmentError(null);
      try {
        const available = Math.max(0, MAX_ATTACHMENTS - attachments.length);
        if (available === 0) throw new Error(`You can attach up to ${MAX_ATTACHMENTS} files.`);
        const selected = Array.from(files).slice(0, available);
        selected.forEach((file) =>
          setUploadProgress((current) => ({ ...current, [file.name]: 0 })),
        );
        const next = await Promise.all(
          selected.map((file) =>
            prepareAttachment(file, (progress) => {
              setUploadProgress((current) => ({ ...current, [file.name]: progress }));
            }),
          ),
        );
        setAttachments((current) => [...current, ...next].slice(0, MAX_ATTACHMENTS));
        setUploadProgress((current) => {
          const copy = { ...current };
          selected.forEach((file) => delete copy[file.name]);
          return copy;
        });
        if (files.length > available)
          setAttachmentError(`Only the first ${available} files were added.`);
      } catch (error) {
        setAttachmentError(error instanceof Error ? error.message : "Could not attach that file.");
        setUploadProgress({});
      }
    },
    [attachments.length],
  );

  // Load conversations from the database (single source of truth).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await listThreads();
      if (cancelled) return;

      let mapped: ChatThread[] = rows.map((r) => ({
        id: r.id,
        title: r.title,
        messages: [],
        updatedAt: new Date(r.lastMessageAt).getTime(),
      }));

      if (mapped.length === 0) {
        const created = await createDbThread({ title: "Untitled dossier", mode: "build" });
        if (cancelled) return;
        mapped = created
          ? [{ id: created.id, title: created.title, messages: [], updatedAt: Date.now() }]
          : [createFreshThread()];
      }

      const openId =
        requestedThreadId && mapped.some((t) => t.id === requestedThreadId)
          ? requestedThreadId
          : mapped[0].id;

      const messages = await listMessages(openId);
      if (cancelled) return;
      setThreads(
        mapped.map((t) =>
          t.id === openId
            ? {
                ...t,
                messages: toChatMessages(messages),

              }
            : t,
        ),
      );
      setActiveId(openId);
      setLoadedThreads(new Set([openId]));
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // Runs once; the deep link comes from the initial URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow ?thread= deep links after the initial hydration too.
  useEffect(() => {
    if (!hydrated || !requestedThreadId) return;
    if (!threads.some((thread) => thread.id === requestedThreadId)) return;
    setActiveId(requestedThreadId);
    if (loadedThreads.has(requestedThreadId)) return;
    void (async () => {
      const rows = await listMessages(requestedThreadId);
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === requestedThreadId
            ? {
                ...thread,
                messages: toChatMessages(rows),

              }
            : thread,
        ),
      );
      setLoadedThreads((prev) => new Set(prev).add(requestedThreadId));
    })();
  }, [hydrated, requestedThreadId, threads, loadedThreads]);

  /**
   * Live sync: threads and messages written anywhere (another tab, another
   * device, the server) land in this workspace immediately.
   */
  useEffect(() => {
    const userId = user?.id;
    if (!userId || !hydrated) return;
    return subscribeToChat(userId, {
      onThreadUpsert: (row) => {
        setThreads((prev) => {
          const at = prev.findIndex((t) => t.id === row.id);
          const updatedAt = new Date(row.lastMessageAt).getTime();
          if (at === -1) {
            return [{ id: row.id, title: row.title, messages: [], updatedAt }, ...prev];
          }
          const next = [...prev];
          next[at] = { ...next[at], title: row.title, updatedAt };
          return next.sort((a, b) => b.updatedAt - a.updatedAt);
        });
      },
      onThreadDelete: (threadId) => {
        setThreads((prev) => prev.filter((t) => t.id !== threadId));
      },
      onMessage: (threadId, message) => {
        const clientId = message.clientId ?? message.id;
        setThreads((prev) =>
          prev.map((t) => {
            if (t.id !== threadId) return t;
            if (t.messages.some((m) => m.id === clientId)) return t;
            return {
              ...t,
              updatedAt: new Date(message.createdAt).getTime(),
              messages: [
                ...t.messages,
                {
                  id: clientId,
                  role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
                  content: message.content,
                  createdAt: new Date(message.createdAt).getTime(),
                  ...(message.model ? { model: message.model } : {}),
                  ...(message.tokens != null ? { tokens: message.tokens } : {}),
                  ...(message.latencyMs != null ? { latencyMs: message.latencyMs } : {}),
                },
              ],
            };
          }),
        );
      },
    });
  }, [user?.id, hydrated]);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  useFocusTrap(sidebarRef, isMobile && sidebarOpen, closeSidebar);

  const active = useMemo(
    () => threads.find((t) => t.id === activeId) ?? threads[0],
    [threads, activeId],
  );
  const model = useMemo(() => AI_MODELS.find((m) => m.id === modelId) ?? AI_MODELS[0], [modelId]);

  // Lovable behaviour: opening a conversation that already has turns reveals
  // the right-hand workspace automatically on desktop.
  useEffect(() => {
    if (isMobile) return;
    if ((active?.messages.length ?? 0) > 0) openWorkspace();
  }, [active?.id, active?.messages.length, isMobile, openWorkspace]);

  // Reopening a conversation restores its latest generated project into the live
  // workspace, so preview, files and console match the thread you switched to.
  const restoredProjectRef = useRef<string>("");
  useEffect(() => {
    if (!active) return;
    const project = mergeArtifactProjects(
      active.messages.flatMap((message) =>
        message.role === "assistant" ? parseArtifacts(message.content) : [],
      ),
    );
    if (!project) {
      // Switching into a conversation that has no build yet must not keep the
      // previous thread's project on screen.
      const empty = `${active.id}:empty`;
      if (restoredProjectRef.current !== empty) {
        restoredProjectRef.current = empty;
        clearProject();
      }
      return;
    }
    const signature = `${active.id}:${project.title}:${Object.entries(project.files)
      .map(([path, source]) => `${path}:${source.length}`)
      .join(",")}`;
    if (restoredProjectRef.current === signature) return;
    restoredProjectRef.current = signature;
    openProject(project);
  }, [active, openProject, clearProject]);

  const filtered = useMemo(() => {
    if (!query.trim()) return threads;
    const q = query.toLowerCase();
    return threads.filter((t) => t.title.toLowerCase().includes(q));
  }, [threads, query]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [active?.messages.length, isSending]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 224) + "px";
  }, [input]);

  // Every new workspace starts by asking for the project / brand name, so the
  // thread carries the user's own name instead of an auto-generated title.
  const newChat = () => {
    setProjectNameDraft("");
    setNamePromptOpen(true);
  };

  const createNamedWorkspace = async (rawName: string) => {
    const name = rawName.trim().slice(0, 60);
    setNamePromptOpen(false);
    if (active && active.messages.length === 0) {
      // The active workspace is still empty — just name it instead of stacking
      // another blank thread.
      if (name) {
        setThreads((prev) => prev.map((t) => (t.id === active.id ? { ...t, title: name } : t)));
        void renameDbThread(active.id, name);
      }
      setInput("");
      return;
    }
    const created = await createDbThread({
      title: name || "Untitled project",
      mode: mode.toLowerCase(),
    });
    const t: ChatThread = created
      ? { id: created.id, title: created.title, messages: [], updatedAt: Date.now() }
      : createFreshThread();
    setThreads((prev) => [t, ...prev]);
    setActiveId(t.id);
    setLoadedThreads((prev) => new Set(prev).add(t.id));
    setInput("");
    setAttachments([]);
    setAttachmentError(null);
    void navigate({ to: "/workspace", search: { thread: t.id }, replace: true });
  };

  const deleteThread = (id: string) => {
    void deleteDbThread(id);
    setThreads((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        const fresh: ChatThread = {
          id: uid(),
          title: "Untitled dossier",
          messages: [],
          updatedAt: Date.now(),
        };
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  };

  const startRename = (t: ChatThread) => {
    setRenamingId(t.id);
    setRenameDraft(t.title);
  };
  const commitRename = () => {
    const id = renamingId;
    const title = renameDraft.trim();
    if (id && title) {
      setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
      void renameDbThread(id, title);
    }
    setRenamingId(null);
    setRenameDraft("");
  };
  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft("");
  };

  const updateThread = useCallback((id: string, updater: (t: ChatThread) => ChatThread) => {
    setThreads((prev) => prev.map((t) => (t.id === id ? updater(t) : t)));
  }, []);

  /** Open a conversation from the history panel and keep the URL in sync. */
  const selectThread = useCallback(
    (id: string) => {
      requestAbortRef.current?.abort();
      setActiveId(id);
      if (isMobile) setSidebarOpen(false);
      void navigate({ to: "/workspace", search: { thread: id }, replace: true });
      if (loadedThreads.has(id)) return;
      void (async () => {
        const rows = await listMessages(id);
        setThreads((prev) =>
          prev.map((t) =>
            t.id === id
              ? {
                  ...t,
                  messages: toChatMessages(rows),

                }
              : t,
          ),
        );
        setLoadedThreads((prev) => new Set(prev).add(id));
      })();
    },
    [isMobile, navigate, loadedThreads],
  );

  const sendText = useCallback(
    async (
      text: string,
      thread: ChatThread,
      requestedMode: ComposerMode = mode,
      requestAttachments: ChatAttachment[] = [],
    ) => {
      const value = text.trim();
      if (!value) return;
      const action = actionForMode(requestedMode);
      if (!credits.canAfford(action, value.length)) {
        updateThread(thread.id, (t) => ({
          ...t,
          messages: [
            ...t.messages,
            {
              id: uid(),
              role: "assistant",
              content: `**Out of credits**\n\nThis ${ACTION_RULES[action].label.toLowerCase()} needs ${formatCredits(
                credits.quote(action, value.length),
              )} credits but only ${formatCredits(credits.remaining)} remain. Upgrade your plan from the dashboard to continue.`,
              createdAt: Date.now(),
            },
          ],
          updatedAt: Date.now(),
        }));
        return;
      }

      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: `${value}${attachmentSummary(requestAttachments)}`,
        createdAt: Date.now(),
      };
      const isFirst = thread.messages.length === 0;
      // A workspace the user already named keeps that name forever.
      const isUnnamed = /^(untitled dossier|untitled project|new chat)$/i.test(thread.title.trim());
      const autoTitle = isFirst && isUnnamed;
      updateThread(thread.id, (t) => ({
        ...t,
        title: autoTitle ? value.slice(0, 48) : t.title,
        messages: [...t.messages, userMsg],
        updatedAt: Date.now(),
      }));
      setIsSending(true);
      const controller = new AbortController();
      requestAbortRef.current = controller;
      // Right-hand workspace opens itself as soon as work starts (desktop).
      if (!isMobile) openWorkspace();

      if (autoTitle) void renameDbThread(thread.id, value.slice(0, 48));
      void saveMessage({
        threadId: thread.id,
        clientId: userMsg.id,
        role: "user",
        content: userMsg.content,
      });
      try {
        const reply = await sendChatMessage([...(thread.messages ?? []), userMsg], modelId, {
          plan: credits.plan,
          mode: requestedMode,
          threadId: thread.id,
          attachments: requestAttachments,
          signal: controller.signal,
        });
        const asstMsg: ChatMessage = {
          id: uid(),
          role: "assistant",
          content: reply.content,
          model: reply.model,
          tokens: reply.tokens,
          inputTokens: reply.inputTokens,
          outputTokens: reply.outputTokens,
          latencyMs: reply.latencyMs,
          credits: reply.credits?.charged,
          traceId: reply.traceId,
          task: reply.task,
          upstream: reply.upstream,
          attempts: reply.attempts,
          createdAt: Date.now(),
        };
        updateThread(thread.id, (t) => ({
          ...t,
          messages: [...t.messages, asstMsg],
          updatedAt: Date.now(),
        }));
        void saveMessage({
          threadId: thread.id,
          clientId: asstMsg.id,
          role: "assistant",
          content: asstMsg.content,
          model: asstMsg.model ?? null,
          tokens: asstMsg.tokens ?? null,
          latencyMs: asstMsg.latencyMs ?? null,
        });
        // Lovable behaviour: a generated project loads straight into the
        // right-hand live workspace, no extra click.
        // A long build can arrive as several artifact blocks (base files,
        // followed by route/page additions). Applying only the first block
        // silently dropped later pages and made an admin-only block look like
        // it had replaced the website. Collapse the whole delivery first.
        const generated = mergeArtifactProjects(parseArtifacts(reply.content));
        if (generated) {
          applyProjectUpdate(generated);
          // Give the repair loop the conversation's intent so a fix keeps the
          // feature the user asked for instead of just silencing the error.
          setFixIntent(
            [...(thread.messages ?? []), userMsg]
              .filter((m) => m.role === "user")
              .slice(-3)
              .map((m) => m.content),
          );
        }
        if (reply.credits) credits.applyServerBalance(reply.credits);
        else void credits.refresh();
      } catch (error) {
        if (controller.signal.aborted) {
          const stopped: ChatMessage = {
            id: uid(),
            role: "assistant",
            content: "_Stopped by you._",
            createdAt: Date.now(),
          };
          updateThread(thread.id, (t) => ({
            ...t,
            messages: [...t.messages, stopped],
            updatedAt: Date.now(),
          }));
          void saveMessage({
            threadId: thread.id,
            clientId: stopped.id,
            role: "assistant",
            content: stopped.content,
          });
          return;
        }
        const apiErr = parseApiError(error, "chat");
        // Server rejected the charge — pull the authoritative balance back in.
        if (apiErr.code === "insufficient_credits" || apiErr.code === "unauthenticated") {
          void credits.refresh();
        }
        const steps = apiErr.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
        const asstMsg: ChatMessage = {
          id: uid(),
          role: "assistant",
          content: `**${apiErr.hint}**\n\n\`${apiErr.code}\` — ${apiErr.message}\n\n**What to do next**\n\n${steps}`,
          model: modelId,
          createdAt: Date.now(),
        };
        updateThread(thread.id, (t) => ({
          ...t,
          messages: [...t.messages, asstMsg],
          updatedAt: Date.now(),
        }));
      } finally {
        if (requestAbortRef.current === controller) requestAbortRef.current = null;
        setIsSending(false);
      }
    },
    [
      modelId,
      updateThread,
      mode,
      credits,
      isMobile,
      openWorkspace,
      applyProjectUpdate,
      setFixIntent,
    ],
  );

  // Pricing is word-based, so the composer measures words, quotes the cost from
  // that number and refuses anything over the hard cap before it can be charged.
  const budget = wordBudget(input);
  const coachTips = promptCoach(input);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending || !active) return;
    if (budget.overLimit) {
      setAttachmentError(
        `Prompt is ${budget.words} words — trim ${budget.overBy} to stay under the ${MAX_PROMPT_WORDS}-word limit.`,
      );
      return;
    }
    const pendingAttachments = attachments;
    setInput("");
    setAttachments([]);
    setAttachmentError(null);
    await sendText(text, active, mode, pendingAttachments);
  };


  const cancelGeneration = useCallback(() => requestAbortRef.current?.abort(), []);

  const applyVoiceDraft = useCallback(() => {
    const text =
      `${voiceDraft}${voiceDraft && voice.partialTranscript ? " " : ""}${voice.partialTranscript}`.trim();
    if (text) setInput((current) => `${current}${current.trim() ? " " : ""}${text}`);
    setVoiceDraft("");
    voice.clearPartialTranscript();
    taRef.current?.focus();
  }, [voiceDraft, voice]);

  useEffect(() => {
    const onHotkey = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === "m") {
        event.preventDefault();
        voice.toggle();
      } else if (event.key === "Escape" && voice.listening) {
        event.preventDefault();
        voice.stop();
      }
    };
    window.addEventListener("keydown", onHotkey);
    return () => window.removeEventListener("keydown", onHotkey);
  }, [voice]);

  // Prompt handed off from the dashboard hero: consumed exactly once, and always
  // delivered into an empty thread so it never lands mid-conversation.
  const handoffDone = useRef(false);
  useEffect(() => {
    if (!hydrated || handoffDone.current) return;
    handoffDone.current = true;
    const pending = takePendingPrompt();
    if (!pending) return;
    if (COMPOSER_MODES.includes(pending.mode as ComposerMode)) {
      setMode(pending.mode as ComposerMode);
    }

    // Dashboard prompts always start a new conversation. Reusing whichever
    // thread happened to be active made hand-offs dependent on load timing.
    void (async () => {
      const created = await createDbThread({
        title: pending.prompt.slice(0, 48),
        mode: pending.mode.toLowerCase(),
      });
      const fresh: ChatThread = created
        ? { id: created.id, title: created.title, messages: [], updatedAt: Date.now() }
        : createFreshThread();
      setThreads((prev) => [fresh, ...prev]);
      setActiveId(fresh.id);
      setLoadedThreads((prev) => new Set(prev).add(fresh.id));
      setInput("");
      void navigate({ to: "/workspace", search: { thread: fresh.id }, replace: true });
      await sendText(pending.prompt, fresh, pending.mode as ComposerMode);
    })();
  }, [hydrated, sendText, navigate]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSend();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-white text-ink-900">
      {/* Mobile backdrop */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-ink-900/20 backdrop-blur-sm md:hidden"
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        id="workspace-sidebar"
        role={isMobile ? "dialog" : undefined}
        aria-modal={isMobile && sidebarOpen ? true : undefined}
        aria-label="Chat history and account"
        aria-hidden={!sidebarOpen && isMobile ? true : undefined}
        tabIndex={-1}
        className={cn(
          "flex h-full w-[86vw] max-w-[300px] shrink-0 flex-col border-r border-ink-200 bg-ink-100 transition-transform duration-300 md:w-64 md:max-w-none",
          "fixed inset-y-0 left-0 z-40 md:relative md:translate-x-0",
          sidebarOpen
            ? "translate-x-0 shadow-2xl md:shadow-none"
            : "-translate-x-full md:w-0 md:-translate-x-0 md:overflow-hidden md:border-0",
        )}
      >
        {/* Brand + back out of the workspace */}
        <div className="flex items-center gap-2.5 border-b border-ink-200 px-4 py-4">
          <BrandMark size="md" />
          <div className="min-w-0">
            <BrandWordmark className="block text-sm font-bold leading-tight" />
            <div className="text-2xs font-semibold uppercase tracking-[0.16em] text-ink-500">
              Build · Preview · Ship
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Workspace menu"
                className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-500 transition hover:bg-white hover:text-ink-900 data-[state=open]:bg-white data-[state=open]:text-ink-900"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem asChild>
                <Link to="/dashboard">
                  <ArrowLeft className="mr-2 h-3.5 w-3.5" />
                  Back to dashboard
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/projects" search={{ filter: "all" }}>
                  <FolderTree className="mr-2 h-3.5 w-3.5" />
                  All projects
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/credits">
                  <Coins className="mr-2 h-3.5 w-3.5" />
                  Credits &amp; usage
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/account">
                  <Settings className="mr-2 h-3.5 w-3.5" />
                  Account settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleSignOut()}>
                <LogOut className="mr-2 h-3.5 w-3.5" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="px-4 pt-3">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-600 transition hover:text-ink-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Dashboard
          </Link>
        </div>

        {/* New chat + search */}
        <div className="flex flex-col gap-3 border-b border-ink-200 p-4">
          <Button
            onClick={() => void newChat()}
            className="w-full rounded-xl font-display font-semibold active:scale-[0.99]"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            New Workspace
          </Button>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sessions…"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        {/* Chat history — one contained box so the rail never looks scattered */}
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-ink-200 bg-white/70 shadow-[0_18px_40px_-32px_rgba(37,74,140,0.45)]">
            <div className="flex items-center justify-between border-b border-ink-200 px-3 py-2">
              <span className="text-2xs font-bold uppercase tracking-[0.18em] text-ink-400">
                Chat history
              </span>
              <span className="rounded-full bg-ink-100 px-1.5 text-2xs text-ink-500">
                {filtered.length}
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">

          {/* Skeleton rows so the rail never looks empty while threads load */}
          {!hydrated &&
            [0, 1, 2].map((i) => (
              <div
                key={`skeleton-${i}`}
                className="mb-1 animate-pulse rounded-lg border border-transparent px-3 py-2"
              >
                <div className="h-3 w-3/4 rounded bg-ink-100" />
                <div className="mt-2 h-2 w-1/3 rounded bg-ink-100" />
              </div>
            ))}
          {hydrated && filtered.length === 0 && (
            <p className="px-3 py-4 text-xs text-ink-500">No projects yet — start a new one.</p>
          )}

          {filtered.map((t) => {

            const isRenaming = renamingId === t.id;
            const isActive = t.id === activeId;
            return (
              <div
                key={t.id}
                className={cn(
                  "group relative mb-1 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
                  isActive
                    ? "border-ink-200 bg-[color:var(--color-iris-soft)]/60 font-medium text-ink-900"
                    : "border-transparent text-ink-700 hover:bg-[color:var(--color-iris-soft)]/30 hover:text-ink-900",
                )}
              >
                {isRenaming ? (
                  <>
                    <Input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") cancelRename();
                      }}
                      className="h-7 flex-1 px-1.5 text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={commitRename}
                      className="text-primary"
                      aria-label="Save name"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={cancelRename}
                      aria-label="Cancel rename"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => selectThread(t.id)}
                      onDoubleClick={() => startRename(t)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate">{t.title}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-2xs text-ink-500">
                        <span>
                          {new Date(t.updatedAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        <span className="text-ink-300">·</span>
                        <span>{t.messages.length} turns</span>
                      </div>
                    </button>
                    <div className="flex items-center opacity-0 transition group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => startRename(t)}
                        aria-label="Rename"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => deleteThread(t.id)}
                        className="hover:text-destructive"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-ink-400">
              {query.trim() ? "No conversation matches that search." : "No conversations yet."}
            </p>
          )}
            </div>
          </div>
        </div>


        {/* Credits */}
        <div className="px-3 pb-1">
          <CreditMeter
            plan={credits.plan}
            remaining={credits.remaining}
            total={credits.total}
            unlimited={credits.unlimited}
          />
        </div>

        {/* User */}
        <div className="border-t border-ink-200 p-3">
          <div className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white/60 p-2.5">
            <div
              className="relative flex h-10 w-10 items-center justify-center rounded-full p-[1.5px]"
              style={{
                background: "var(--iris-gradient)",
              }}
            >
              <div className="flex h-full w-full items-center justify-center rounded-full bg-white">
                <span className="font-display text-base font-semibold text-[color:var(--color-iris)]">
                  {accountName.charAt(0).toUpperCase()}
                </span>
              </div>
              <span
                className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-1 ring-white"
                style={{ background: "var(--iris-gradient)" }}
              >
                <Crown className="h-2 w-2 text-white" />
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <div className="truncate text-sm font-medium">{accountName}</div>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-2xs">
                <span className="rounded-sm bg-[color:var(--color-iris)]/15 px-1 py-px font-medium uppercase text-[color:var(--color-iris)]">
                  {credits.unlimited ? "Admin" : (profile?.plan ?? "free")}
                </span>
                <span className="truncate text-ink-500">{user?.email ?? ""}</span>
              </div>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Settings">
              <Settings className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Log out" onClick={handleSignOut}>
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main + Live workspace (resizable split) */}
      <PanelGroup orientation="horizontal" className="flex h-full min-w-0 flex-1">
        <Panel id="chat" minSize="26%" className="flex min-w-0 flex-col">
          <main className="relative flex h-full min-w-0 flex-1 flex-col">
            {/* Header */}
            <header className="relative z-10 flex h-14 shrink-0 items-center gap-2 overflow-hidden border-b border-ink-200 bg-white px-3 sm:gap-3 sm:px-6">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setSidebarOpen((v) => !v)}
                className="shrink-0"
                aria-label="Toggle sidebar"
              >
                {isMobile ? (
                  <Menu className="h-4 w-4" />
                ) : sidebarOpen ? (
                  <PanelLeftClose className="h-4 w-4" />
                ) : (
                  <PanelLeft className="h-4 w-4" />
                )}
              </Button>

              {/* Active workspace / project name (smart routing stays a quiet dot) */}
              <div
                className="flex min-w-0 items-center gap-1.5 rounded-full border border-ink-200 bg-ink-100 px-2.5 py-1"
                title="Nexura automatically picks the best-value model for each request"
              >
                <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[color:var(--color-iris)]" />
                <span className="truncate text-xs font-semibold text-ink-900">
                  {active?.title?.trim() || "New workspace"}
                </span>
              </div>


              <div className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-ink-700 sm:gap-2">
                {/* Chat history switcher — Lovable keeps this separate from the sidebar */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      data-testid="history-switcher"
                      aria-label="Chat history"
                      title="Switch to a previous conversation"
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-ink-200 bg-white/70 px-2.5 text-xs font-medium text-ink-700 transition hover:border-[color:var(--color-iris)]/40 hover:text-ink-900 data-[state=open]:border-[color:var(--color-iris)]/45"
                    >
                      <History className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">History</span>
                      <ChevronDown className="h-3 w-3 text-ink-400" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <DropdownMenuLabel className="text-2xs font-semibold uppercase tracking-[0.18em] text-ink-400">
                      Chat history
                    </DropdownMenuLabel>
                    <div className="max-h-72 overflow-y-auto">
                      {threads.length === 0 && (
                        <p className="px-2 py-3 text-xs text-ink-500">No conversations yet.</p>
                      )}
                      {threads.map((t) => (
                        <DropdownMenuItem
                          key={t.id}
                          onSelect={() => selectThread(t.id)}
                          className="items-start gap-2"
                        >
                          <Check
                            className={cn(
                              "mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--color-iris)]",
                              t.id === activeId ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm text-ink-900">{t.title}</span>
                            <span className="block text-2xs text-ink-500">
                              {new Date(t.updatedAt).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}{" "}
                              · {t.messages.length} turns
                            </span>
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => void newChat()}>
                      <Plus className="mr-2 h-3.5 w-3.5" />
                      New workspace
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <button
                  onClick={toggleWorkspace}
                  data-testid="workspace-toggle"
                  aria-label="Toggle live workspace"
                  title="Toggle the live workspace panel (preview, code, console)"
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs font-medium transition",
                    previewOpen
                      ? "border-[color:var(--color-iris)]/45 bg-[color:var(--color-iris)]/10 text-ink-900"
                      : "border-ink-200 bg-white/70 text-ink-700 hover:border-[color:var(--color-iris)]/40 hover:text-ink-900",
                  )}
                >
                  <PanelRight className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Workspace</span>
                </button>
                <span
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-ink-200 bg-white/70 px-2.5 text-xs font-medium text-ink-700"
                  title="Credits included in your workspace plan"
                >
                  <Coins className="h-3.5 w-3.5 text-[color:var(--color-iris)]" />
                  {credits.unlimited ? "Unlimited" : formatCredits(credits.remaining)}
                  {!credits.unlimited && (
                    <span className="hidden text-ink-400 sm:inline">
                      / {formatCredits(credits.total)} credits
                    </span>
                  )}
                </span>

                <ThemePicker />
              </div>
            </header>

            {/* Messages */}
            <div ref={scrollRef} className="relative flex-1 overflow-y-auto">
              {!active || active.messages.length === 0 ? (
                <EmptyState onPick={(q) => setInput(q)} model={model} adminView={isAdmin} />
              ) : (
                <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-10">
                  {active?.messages.map((m) => (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      userInitial={accountName.charAt(0).toUpperCase()}
                      adminView={isAdmin}
                    />
                  ))}
                  {isSending && <TypingIndicator model={model} adminView={isAdmin} />}
                </div>
              )}
            </div>

            {/* Composer — Lovable-style floating prompt box */}
            <div className="relative shrink-0 bg-white">
              {/* soft fade so the transcript melts into the composer instead of a hard rule */}
              <div
                aria-hidden
                className="pointer-events-none absolute -top-10 left-0 right-0 h-10 bg-gradient-to-b from-transparent to-white"
              />

              <div className="nx-rise mx-auto w-full max-w-3xl px-3 pb-4 pt-2 sm:px-6 sm:pb-6 sm:pt-3">
                <div
                  data-testid="composer"
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDraggingFiles(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                      setDraggingFiles(false);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDraggingFiles(false);
                    void addFiles(event.dataTransfer.files);
                  }}
                  className={cn(
                    "group relative rounded-[26px] border border-ink-200 bg-white",
                    "transition-[box-shadow,border-color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    "shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-16px_rgba(16,24,40,0.18)]",
                    "hover:border-ink-300 hover:shadow-[0_1px_2px_rgba(16,24,40,0.04),0_16px_38px_-18px_rgba(16,24,40,0.22)]",
                    "focus-within:-translate-y-0.5 focus-within:border-[color:var(--color-iris)]/50",
                    "focus-within:shadow-[0_1px_2px_rgba(16,24,40,0.05),0_22px_50px_-20px_color-mix(in_oklab,var(--color-iris)_50%,transparent)]",
                  )}
                >
                  {draggingFiles && (
                    <div className="pointer-events-none absolute inset-1 z-20 flex items-center justify-center rounded-[22px] border-2 border-dashed border-[color:var(--color-iris)] bg-white/95">
                      <div className="text-center text-sm font-medium text-ink-800">
                        <UploadCloud className="mx-auto mb-1.5 h-6 w-6 text-[color:var(--color-iris)]" />
                        Drop up to {MAX_ATTACHMENTS} images or text/code files
                        <span className="mt-1 block text-xs font-normal text-ink-500">
                          PNG, JPG, WebP, GIF, TXT, MD, CSV, JSON and source files · 5 MB each
                        </span>
                      </div>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="sr-only"
                    accept="text/*,.md,.csv,.json,.xml,.yaml,.yml,.toml,.js,.jsx,.ts,.tsx,.css,.scss,.html,.php,.py,.rb,.go,.java,.kt,.sql,.sh,.env,.log,image/*"
                    onChange={(event) => {
                      void addFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  <input
                    ref={imageInputRef}
                    type="file"
                    multiple
                    className="sr-only"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(event) => {
                      void addFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  {attachments.length > 0 && (
                    <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto px-4 pt-3 sm:px-5">
                      {attachments.map((item) => (
                        <span
                          key={item.id}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-ink-200 bg-ink-100 px-2 py-1 text-xs text-ink-700"
                        >
                          {item.kind === "image" ? (
                            <ImageIcon className="h-3.5 w-3.5" />
                          ) : (
                            <Paperclip className="h-3.5 w-3.5" />
                          )}
                          <span className="max-w-40 truncate">{item.name}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setAttachments((current) =>
                                current.filter((file) => file.id !== item.id),
                              )
                            }
                            className="rounded-sm text-ink-400 hover:text-ink-900"
                            aria-label={`Remove ${item.name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {Object.entries(uploadProgress).length > 0 && (
                    <div className="space-y-1.5 px-4 pt-3 sm:px-5" aria-live="polite">
                      {Object.entries(uploadProgress).map(([name, progress]) => (
                        <div key={name} className="text-xs text-ink-600">
                          <div className="mb-1 flex justify-between gap-3">
                            <span className="truncate">{name}</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="h-1 overflow-hidden rounded-full bg-ink-100">
                            <div
                              className="h-full bg-[color:var(--color-iris)] transition-[width]"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {(voice.listening || voice.partialTranscript || voiceDraft) && (
                    <div className="mx-4 mt-3 rounded-lg border border-ink-200 bg-ink-50 p-2.5 sm:mx-5">
                      <div className="mb-1.5 flex items-center justify-between text-xs text-ink-500">
                        <span>
                          {voice.listening ? "Listening… edit before inserting" : "Voice draft"}
                        </span>
                        <span className="font-mono">Alt+M · Esc</span>
                      </div>
                      <textarea
                        aria-label="Editable voice transcript"
                        value={`${voiceDraft}${voiceDraft && voice.partialTranscript ? " " : ""}${voice.partialTranscript}`}
                        onChange={(event) => {
                          setVoiceDraft(event.target.value);
                          voice.clearPartialTranscript();
                        }}
                        rows={2}
                        className="w-full resize-none bg-transparent text-sm text-ink-900 outline-none"
                      />
                      <div className="mt-1.5 flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            voice.stop();
                            voice.clearPartialTranscript();
                            setVoiceDraft("");
                          }}
                        >
                          Discard
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            voice.stop();
                            applyVoiceDraft();
                          }}
                        >
                          Insert transcript
                        </Button>
                      </div>
                    </div>
                  )}
                  <textarea
                    ref={taRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    rows={1}
                    placeholder="Ask Nexura to build something…"
                    className="block max-h-56 w-full resize-none bg-transparent px-4 pb-2 pt-4 text-[15px] leading-6 text-ink-900 transition-[height] duration-150 ease-out placeholder:text-ink-400 focus:outline-none sm:px-5 sm:pt-4.5"
                  />

                  <div className="flex items-center gap-1.5 px-3 pb-3 pt-0.5 sm:px-3.5">
                    {/* + menu, exactly one entry point for attachments like Lovable */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label="Add attachment"
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink-200 text-ink-600 transition-all duration-150 hover:border-ink-300 hover:bg-ink-100 hover:text-ink-900 active:scale-95 data-[state=open]:border-[color:var(--color-iris)]/45 data-[state=open]:text-ink-900"
                        >
                          <Plus className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-45" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" side="top" className="w-52">
                        <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
                          <Paperclip className="mr-2 h-4 w-4" /> Attach a file
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => imageInputRef.current?.click()}>
                          <ImageIcon className="mr-2 h-4 w-4" /> Add an image
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Command className="mr-2 h-4 w-4" /> Browse commands
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <span className="hidden min-w-0 truncate text-2xs text-ink-400 sm:inline">
                      {ACTION_RULES[actionForMode(mode)].label} ·{" "}
                      <span className="font-medium text-ink-600">
                        {formatCredits(estimateCostForWords(actionForMode(mode), budget.words))}
                      </span>{" "}
                      credits {credits.unlimited && "· unlimited"}
                    </span>

                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium tabular-nums",
                        budget.overLimit
                          ? "bg-destructive/10 text-destructive"
                          : budget.pct > 80
                            ? "bg-amber-500/10 text-amber-600"
                            : "text-ink-400",
                      )}
                      aria-live="polite"
                    >
                      {budget.words}/{MAX_PROMPT_WORDS} words
                    </span>


                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      {/* Mode as a compact dropdown, not a tab strip */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label="Response mode"
                            className="inline-flex h-8 max-w-[7.5rem] shrink-0 items-center gap-1 truncate rounded-full px-2.5 text-xs font-medium text-ink-700 transition-colors duration-150 hover:bg-ink-100 hover:text-ink-900 data-[state=open]:bg-ink-100 data-[state=open]:text-ink-900"
                          >
                            {mode}
                            <ChevronDown className="h-3.5 w-3.5 text-ink-400" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" side="top" className="w-64">
                          {COMPOSER_MODES.map((m) => (
                            <DropdownMenuItem
                              key={m}
                              onSelect={() => setMode(m)}
                              className="items-start gap-2"
                            >
                              <Check
                                className={cn(
                                  "mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--color-iris)]",
                                  mode === m ? "opacity-100" : "opacity-0",
                                )}
                              />
                              <span className="min-w-0">
                                <span className="block text-sm font-medium text-ink-900">{m}</span>
                                <span className="block text-2xs leading-snug text-ink-500">
                                  {isAdmin
                                    ? ACTION_RULES[actionForMode(m)].note
                                    : ACTION_RULES[actionForMode(m)].customerNote}
                                </span>
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <button
                        type="button"
                        aria-label={voice.listening ? "Stop voice input" : "Voice input"}
                        aria-pressed={voice.listening}
                        title={
                          voice.supported
                            ? "Voice input"
                            : "Voice input is unavailable in this browser"
                        }
                        onClick={voice.toggle}
                        className={cn(
                          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-150 hover:bg-ink-100 hover:text-ink-900 active:scale-95",
                          voice.listening
                            ? "bg-destructive/10 text-destructive ring-2 ring-destructive/20"
                            : "text-ink-500",
                        )}
                      >
                        {voice.listening ? (
                          <span className="h-2.5 w-2.5 rounded-sm bg-current" />
                        ) : (
                          <Mic className="h-4 w-4" />
                        )}
                      </button>

                      <SendButton
                        onClick={isSending ? cancelGeneration : () => void handleSend()}
                        disabled={!isSending && (!input.trim() || budget.overLimit)}
                        loading={isSending}
                      />
                    </div>
                  </div>
                </div>

                {coachTips.length > 0 && (
                  <ul className="mt-2 space-y-1 text-2xs leading-snug text-ink-500">
                    {coachTips.map((tip) => (
                      <li key={tip} className={cn(budget.overLimit && "text-destructive")}>
                        {tip}
                      </li>
                    ))}
                  </ul>
                )}


                {(attachmentError || voice.error) && (
                  <div
                    className="mt-2 flex items-center justify-center gap-2 text-xs text-destructive"
                    role="status"
                  >
                    <span>{attachmentError ?? voice.error}</span>
                    <button
                      type="button"
                      className="underline underline-offset-2"
                      onClick={() => {
                        setAttachmentError(null);
                        voice.clearError();
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                <p className="mt-3 text-center text-2xs leading-relaxed text-ink-400">
                  {credits.unlimited
                    ? `Smart routing · Unlimited · ${formatCredits(credits.used)} credits used`
                    : `Smart routing · ${formatCredits(credits.remaining)} of ${formatCredits(credits.total)} credits left`}
                </p>
              </div>
            </div>
          </main>
        </Panel>

        {previewOpen && (
          <>
            <PanelResizeHandle className="group relative w-1.5 shrink-0 bg-transparent outline-none">
              <span
                aria-hidden
                className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-ink-200 transition group-hover:bg-[color:var(--color-iris)] group-data-[resize-handle-state=drag]:bg-[color:var(--color-iris)]"
              />
              <span className="pointer-events-none absolute left-1/2 top-1/2 flex h-10 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-ink-200 bg-white/80 opacity-0 shadow-lg transition group-hover:opacity-100">
                <GripVertical className="h-3 w-3 text-ink-600" />
              </span>
            </PanelResizeHandle>
            <Panel id="workspace" defaultSize="46%" minSize="24%" className="min-w-0">
              <PreviewPanel />
            </Panel>
          </>
        )}
      </PanelGroup>

      <Dialog open={namePromptOpen} onOpenChange={setNamePromptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Name your project</DialogTitle>
            <DialogDescription>
              This becomes the workspace name and the brand name Nexura uses while building.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void createNamedWorkspace(projectNameDraft);
            }}
            className="space-y-4"
          >
            <input
              autoFocus
              value={projectNameDraft}
              onChange={(e) => setProjectNameDraft(e.target.value)}
              placeholder="e.g. Lumen Fitness, Nexura Store, Portfolio v2"
              aria-label="Project name"
              maxLength={60}
              className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-[color:var(--color-iris)] focus:ring-2 focus:ring-[color:var(--color-iris)]/20"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => void createNamedWorkspace("")}
                className="rounded-lg px-3 py-2 text-xs font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
              >
                Skip for now
              </button>
              <button
                type="submit"
                className="rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-95"
                style={{ background: "var(--iris-gradient)" }}
              >
                Start building
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function SendButton({
  onClick,
  disabled,
  loading,
}: {
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
}) {
  const ready = !disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={loading ? "Stop generation" : "Send message"}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-95",
        ready
          ? "nx-pop scale-100 text-white shadow-[0_6px_16px_-8px_color-mix(in_oklab,var(--color-iris-deep)_80%,transparent)] hover:scale-105"
          : "scale-95 cursor-not-allowed bg-ink-200 text-ink-400",
      )}
      style={ready ? { background: "var(--iris-gradient)" } : undefined}
    >
      {loading ? (
        <Square className="h-3.5 w-3.5 fill-current" strokeWidth={2.5} />
      ) : (
        <ArrowUp className="h-4 w-4" strokeWidth={2.75} />
      )}
    </button>
  );
}

const markdownComponents: Components = {
  code(props) {
    const { className, children, ...rest } = props as ComponentPropsWithoutRef<"code"> & {
      node?: unknown;
      inline?: boolean;
    };
    const match = /language-(\w+)/.exec(className || "");
    const raw = String(children ?? "").replace(/\n$/, "");
    const isBlock = raw.includes("\n") || Boolean(match);
    if (!isBlock) {
      return (
        <code
          {...rest}
          className="rounded bg-[color:var(--color-iris)]/10 px-1.5 py-0.5 font-mono text-[0.85em] text-[color:var(--color-iris)]"
        >
          {children}
        </code>
      );
    }
    return <CodeBlock language={match?.[1] ?? "text"} value={raw} />;
  },
  pre({ children }) {
    return <>{children}</>;
  },
  table({ children }) {
    return (
      <div className="my-4 overflow-x-auto rounded-xl border border-ink-200/80">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return (
      <th className="border-b border-ink-200/80 bg-[color:var(--color-iris)]/[0.06] px-3 py-2 text-left font-medium uppercase tracking-wider text-xs text-[color:var(--color-gold-soft)]">
        {children}
      </th>
    );
  },
  td({ children }) {
    return <td className="border-b border-ink-200 px-3 py-2 align-top">{children}</td>;
  },
  a({ children, href }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-[color:var(--color-iris)] underline decoration-[color:var(--color-iris)]/30 underline-offset-4 hover:decoration-[color:var(--color-iris)]"
      >
        {children}
      </a>
    );
  },
};

function sanitizeCode(input: string) {
  let out = input.replace(/\r\n/g, "\n").trim();
  // a full fence line the model sometimes leaves inside a block
  out = out.replace(/^`{3,4}[a-zA-Z0-9+-]*[ \t]*\n/, "");
  out = out.replace(/\n[ \t]*`{3,4}[ \t]*$/, "");
  // stray single backticks wrapping the snippet
  out = out.replace(/^`+(?=\S)/, "").replace(/`+$/, "");
  return out.trim();
}

/** Multi-file project generated by the model — opens in the live workspace. */
function ArtifactCard({ project }: { project: ArtifactProject }) {
  const { openProject } = usePreview();
  const paths = project.order;

  return (
    <div
      className="not-prose my-3 overflow-hidden rounded-2xl border border-ink-200 bg-white/70"
      style={{ boxShadow: "0 12px 30px -22px rgba(37,74,140,0.4)" }}
    >
      <div className="flex items-center gap-2 border-b border-ink-200 px-3 py-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-lg text-white"
          style={{ background: "var(--iris-gradient)" }}
        >
          <FolderTree className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-ink-900">{project.title}</div>
          <div className="font-mono text-2xs text-ink-500">
            {paths.length} file{paths.length > 1 ? "s" : ""} · entry {project.entry}
          </div>
        </div>
        <button
          onClick={() => openProject(project)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white transition hover:brightness-110"
          style={{ background: "var(--iris-gradient)" }}
        >
          <PlayCircle className="h-3.5 w-3.5" />
          Open project
        </button>
      </div>
      <ul className="max-h-40 overflow-auto px-3 py-2">
        {paths.map((p) => (
          <li key={p} className="truncate font-mono text-xs leading-6 text-ink-600">
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CodeBlock({ language, value: rawValue }: { language: string; value: string }) {
  const value = useMemo(() => sanitizeCode(rawValue), [rawValue]);
  const [copied, setCopied] = useState(false);
  const { openPreview } = usePreview();

  const previewable = isPreviewable(language);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  return (
    <div
      className="group relative my-4 overflow-hidden rounded-xl border border-ink-200/80"
      style={{
        background: "linear-gradient(180deg, #FFFFFF 0%, #F4F6F9 100%)",
        boxShadow: "0 10px 30px -18px rgba(37,74,140,0.18), inset 0 1px 0 rgba(255,255,255,0.9)",
      }}
    >
      <div className="flex items-center justify-between border-b border-ink-200 bg-white/80 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="flex gap-1">
            <span className="h-2 w-2 rounded-full bg-[color:var(--color-iris-warm)]/50" />
            <span className="h-2 w-2 rounded-full bg-[color:var(--color-iris)]/50" />
            <span className="h-2 w-2 rounded-full bg-[color:var(--color-iris-cyan)]/60" />
          </span>
          <span className="font-mono text-2xs uppercase tracking-[0.2em] text-ink-500">
            {language}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {previewable && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => openPreview(value, language)}
              className="text-2xs text-primary hover:bg-primary/10 hover:text-primary"
              aria-label="Open in live preview"
              title="Open in live workspace"
            >
              <PlayCircle className="h-3 w-3" />
              <span className="uppercase tracking-wider">Preview</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={onCopy}
            className="text-2xs"
            aria-label="Copy code"
          >
            {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
            <span className="uppercase tracking-wider">{copied ? "Copied" : "Copy"}</span>
          </Button>
        </div>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneLight}
        PreTag="div"
        customStyle={{
          margin: 0,
          background: "transparent",
          padding: "14px 16px",
          fontSize: "12.5px",
          lineHeight: "1.6",
        }}
        codeTagProps={{
          style: { fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace" },
        }}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
}

function MessageBubble({
  message,
  userInitial = "Y",
  adminView = false,
}: {
  message: ChatMessage;
  userInitial?: string;
  /** Engine / provider details are admin-only. */
  adminView?: boolean;
}) {
  const isUser = message.role === "user";
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const project = !isUser ? (parseArtifacts(message.content)[0] ?? null) : null;
  const modelName = message.model
    ? (AI_MODELS.find((m) => m.id === message.model)?.name ?? message.model)
    : undefined;
  return (
    <div className={cn("flex gap-3 sm:gap-4", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
          isUser ? "border-ink-200 bg-white/80" : "border-transparent p-[1.5px]",
        )}
        style={!isUser ? { background: "var(--iris-gradient)" } : undefined}
      >
        {isUser ? (
          <span className="text-xs font-medium text-ink-900">{userInitial}</span>
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-white p-1">
            <BrandGlyph />
          </div>
        )}
      </div>
      <div
        className={cn("min-w-0 max-w-[92%] sm:max-w-[85%]", isUser ? "text-right" : "text-left")}
      >
        <div
          className={cn(
            "mb-1.5 flex items-center gap-2 text-2xs uppercase tracking-[0.18em] text-ink-500",
            isUser && "justify-end",
          )}
        >
          <span>{isUser ? "You" : "Nexura"}</span>
          {!isUser && message.model && adminView && (
            <>
              <span className="text-ink-300">·</span>
              <span className="normal-case tracking-normal font-mono text-[color:var(--color-iris-cyan)]/90">
                {modelName}
              </span>
            </>
          )}
          <span className="text-ink-300">·</span>
          <span className="normal-case font-mono">{time}</span>
        </div>
        {!isUser && (
          <ActivityCard
            title={
              project ? `Built ${project.title || "your project"}` : "Responded to your prompt"
            }
            project={project}
            adminView={adminView}
            messageId={message.id}
            durationMs={message.latencyMs}
            charge={{
              action: creditActionFor(message, Boolean(project)),
              credits: message.credits,
              inputTokens: message.inputTokens,
              outputTokens: message.outputTokens,
              fileCount: project?.order.length,
              models: adminView
                ? [message.model, message.upstream, ...(message.attempts ?? []).map((a) => a.model)]
                    .filter((v): v is string => Boolean(v))
                    .filter((v, i, arr) => arr.indexOf(v) === i)
                : undefined,
            }}
            steps={stepsForMessage({
              adminView,
              modelName,
              latencyMs: message.latencyMs,
              tokens: message.tokens,
              inputTokens: message.inputTokens,
              outputTokens: message.outputTokens,
              credits: message.credits,
              fileCount: project?.order.length,
              traceId: message.traceId,
              task: message.task,
              attempts: message.attempts,
            })}
          />
        )}
        <div
          className={cn(
            "relative px-4 py-3 text-base leading-relaxed",
            isUser ? "inline-block rounded-lg bg-primary text-primary-foreground" : "text-ink-900",
          )}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap break-words text-left">{message.content}</div>
          ) : (
            <div className="prose prose-slate prose-sm max-w-none break-words prose-p:my-2 prose-headings:font-display prose-headings:tracking-tight prose-headings:mt-3 prose-headings:mb-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-strong:text-[color:var(--color-iris-deep)]">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {chatProse(message.content)}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {!isUser && (message.tokens || message.latencyMs || message.credits != null) && (
          <div className="mt-1.5 flex items-center gap-2 font-mono text-2xs text-ink-500">
            {message.latencyMs && <span>{(message.latencyMs / 1000).toFixed(2)}s</span>}
            {message.tokens && (
              <>
                <span className="text-ink-200">·</span>
                <span>{message.tokens} tokens</span>
              </>
            )}
            {message.credits != null && (
              <>
                <span className="text-ink-200">·</span>
                <span className="text-[color:var(--color-iris)]">
                  {formatCredits(message.credits)} credits
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Best-effort billable action for a stored reply (customer-safe label source). */
function creditActionFor(message: ChatMessage, hasProject: boolean): CreditAction {
  const task = (message.task ?? "").toLowerCase();
  if (task.includes("plan")) return "plan";
  if (task.includes("fix")) return "autofix";
  if (task.includes("chat")) return "chat";
  return hasProject ? "code" : "chat";
}

function TypingIndicator({ model, adminView = false }: { model: AIModel; adminView?: boolean }) {
  const [phase, setPhase] = useState(0);
  const phases = [
    { label: "Understanding the request", detail: "requirements and context" },
    { label: "Planning the delivery", detail: "structure, state and edge cases" },
    { label: "Building and validating", detail: "files, imports and preview" },
  ];

  useEffect(() => {
    const timer = window.setInterval(
      () => setPhase((current) => Math.min(current + 1, phases.length - 1)),
      2400,
    );
    return () => window.clearInterval(timer);
  }, [phases.length]);

  return (
    <div className="flex gap-3 sm:gap-4">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl p-[1.5px]"
        style={{
          background: "var(--iris-gradient)",
        }}
      >
        <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-white p-1">
          <BrandGlyph />
        </div>
      </div>
      <div className="min-w-0 flex-1 max-w-[92%] sm:max-w-[85%]">
        <div className="mb-1.5 text-2xs uppercase tracking-[0.18em] text-ink-500">
          Nexura ·{" "}
          <span className="normal-case tracking-normal font-mono text-[color:var(--color-iris-cyan)]/90">
            {adminView ? model.name : "smart routing"}
          </span>
        </div>
        <ActivityCard
          busy
          title={phases[phase].label}
          steps={phases.map((item, index) => ({
            ...item,
            detail: index === 0 && adminView ? `${item.detail} · ${model.name}` : item.detail,
            done: index < phase,
          }))}
        />
      </div>
    </div>
  );
}

function EmptyState({
  onPick,
  model,
  adminView = false,
}: {
  onPick: (q: string) => void;
  model: AIModel;
  adminView?: boolean;
}) {
  const starters = [
    {
      key: "saas",
      icon: Sparkle,
      title: "SaaS landing page",
      body: "Hero, pricing tiers and a comparison table.",
      prompt:
        "Build a modern SaaS landing page with a hero, 3 pricing tiers and a feature comparison table.",
    },
    {
      key: "table",
      icon: Command,
      title: "Data table",
      body: "Responsive, sortable and filterable.",
      prompt: "Create a responsive data table with sorting, filtering and pagination.",
    },
    {
      key: "arch",
      icon: Diamond,
      title: "Architect a system",
      body: "Multi-tenant SaaS with auth and billing.",
      prompt: "Draft a scalable multi-tenant SaaS architecture with auth, billing and analytics.",
    },
    {
      key: "dash",
      icon: Zap,
      title: "Analytics dashboard",
      body: "Charts, KPI cards and a sidebar shell.",
      prompt:
        "Build an analytics dashboard with KPI cards, a line chart and a collapsible sidebar.",
    },
  ];

  return (
    <div
      data-testid="workspace-empty-state"
      className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center gap-6 px-5 py-10 text-center sm:px-6"
    >
      {/* Illustration: brand mark on a soft aurora halo */}
      <div className="nx-rise relative flex items-center justify-center">
        <span
          aria-hidden
          className="absolute h-24 w-24 rounded-full blur-2xl sm:h-28 sm:w-28"
          style={{ background: "var(--iris-gradient)", opacity: 0.22 }}
        />
        <span
          aria-hidden
          className="absolute h-16 w-16 rounded-full border border-[color:var(--color-iris)]/25 sm:h-20 sm:w-20"
        />
        <BrandMark size="lg" className="relative" />
      </div>

      <div className="nx-rise space-y-2.5" style={{ animationDelay: "70ms" }}>
        <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight text-ink-900 sm:text-3xl">
          What should we build today?
        </h1>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-ink-500">
          Describe your idea below — Nexura builds, previews and ships it in one workspace.
        </p>
      </div>

      {/* Suggestion pills — two balanced rows on every viewport */}
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {starters.map((s, i) => (
          <button
            key={s.key}
            type="button"
            data-testid="starter-pill"
            onClick={() => onPick(s.prompt)}
            title={s.body}
            style={{ animationDelay: `${140 + i * 60}ms` }}
            className={cn(
              "nx-rise group inline-flex min-w-0 items-center gap-2 rounded-full border border-ink-200 bg-white px-3.5 py-2 text-left",
              "text-xs font-medium text-ink-700 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
              "hover:-translate-y-0.5 hover:border-[color:var(--color-iris)]/45 hover:text-ink-900 hover:shadow-[0_10px_24px_-14px_rgba(16,24,40,0.35)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-iris)]/35",
            )}
          >
            <s.icon className="h-3.5 w-3.5 shrink-0 text-[color:var(--color-iris)]" />
            <span className="truncate">{s.title}</span>
            <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-ink-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[color:var(--color-iris)]" />
          </button>
        ))}
      </div>

      {/* Credit / trust note — same rhythm as the composer footnote */}
      <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5 text-2xs text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-[color:var(--color-iris)]" />
          Smart routing
        </span>

        <span className="text-ink-300">·</span>
        <span className="font-medium text-ink-600">
          {adminView ? model.name : "Best-value engine per request"}
        </span>
      </div>
    </div>
  );
}
