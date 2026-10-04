"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ConvexProviderWithAuth,
  ConvexReactClient,
  useConvexAuth,
  useConvexConnectionState,
  useMutation,
  useQuery,
} from "convex/react";
import { parseWorkflowDeals, type DealView } from "@/lib/frontend/deals";
import { demoDeals } from "@/lib/frontend/demoDeals";
import { workflowApi, type WorkflowSource } from "@/lib/frontend/workflow";
import { emptyDraft, type Draft } from "@/lib/frontend/draft";
import { Dialog } from "./Dialog";
import { useRouter } from "next/navigation";

type AuthState = {
  isLoading: boolean;
  isAuthenticated: boolean;
  fetchAccessToken: (args: {
    forceRefreshToken: boolean;
  }) => Promise<string | null>;
};
export type AuthAdapter = {
  useAuth: () => AuthState;
  signIn?: (email: string, password: string, create: boolean) => Promise<void>;
  signOut?: () => Promise<void>;
};
const unconfiguredAuth = () => ({
  isLoading: false,
  isAuthenticated: false,
  fetchAccessToken: async () => null,
});

type LiveApi = {
  deals: DealView[] | undefined;
  error: boolean;
  authenticated: boolean;
  authLoading: boolean;
  connection: "connecting" | "reconnecting" | null;
  submit: (
    source: WorkflowSource,
  ) => ReturnType<ReturnType<typeof useMutation<typeof workflowApi.submit>>>;
};
type Profile = { displayName: string; walletAddress: string };
type FrontendState = {
  mode: "preview" | "live";
  setMode: (mode: "preview" | "live") => void;
  live: LiveApi | null;
  auth?: AuthAdapter;
  deals: DealView[];
  loading: boolean;
  error: boolean;
  previewSession: boolean;
  signInPreview: () => void;
  signOut: () => Promise<void>;
  authenticated: boolean;
  profile: Profile;
  savePreviewProfile: (profile: Profile) => void;
  votes: Record<string, "still_on" | "expired">;
  votePreview: (id: string, value: "still_on" | "expired") => void;
  previewPosts: DealView[];
  addPreviewPost: (deal: DealView) => void;
  updatePreviewPost: (deal: DealView) => void;
  removePreviewPost: (id: string) => void;
  activeJobId: string | null;
  setActiveJobId: (id: string | null) => void;
  draft: Draft;
  setDraft: (draft: Draft) => void;
  sourceText: string;
  setSourceText: (text: string) => void;
  sourceImage: string;
  setSourceImage: (image: string) => void;
  sourceMode: "image" | "text";
  setSourceMode: (mode: "image" | "text") => void;
  sourceUrl: string;
  setSourceUrl: (url: string) => void;
  publishedAt: string;
  setPublishedAt: (date: string) => void;
  sourceFilename: string;
  setSourceFilename: (name: string) => void;
  editDrafts: Record<string, Draft>;
  setEditDraft: (id: string, draft: Draft | null) => void;
};
const Context = createContext<FrontendState | null>(null);
export function useFrontend() {
  const state = useContext(Context);
  if (!state) throw new Error("Frontend provider missing");
  return state;
}

function Runtime({
  children,
  mode,
  setMode,
  live,
  auth,
}: {
  children: ReactNode;
  mode: "preview" | "live";
  setMode: FrontendState["setMode"];
  live: LiveApi | null;
  auth?: AuthAdapter;
}) {
  const router = useRouter();
  const [previewSession, setPreviewSession] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    displayName: "",
    walletAddress: "",
  });
  const [votes, setVotes] = useState<FrontendState["votes"]>({});
  const [previewPosts, setPreviewPosts] = useState<DealView[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft),
    [sourceText, setSourceText] = useState(""),
    [sourceImage, setSourceImage] = useState("");
  const [sourceMode, setSourceMode] = useState<"image" | "text">("image"),
    [sourceUrl, setSourceUrl] = useState(""),
    [publishedAt, setPublishedAt] = useState(""),
    [sourceFilename, setSourceFilename] = useState("");
  const [editDrafts, setEditDrafts] = useState<Record<string, Draft>>({});
  const [pendingMode, setPendingMode] = useState<"preview" | "live" | null>(
    null,
  );
  const dirty =
    !!sourceText ||
    !!sourceImage ||
    !!draft.restaurant ||
    !!sourceUrl ||
    !!publishedAt ||
    Object.keys(editDrafts).length > 0;
  function changeMode(next: "preview" | "live") {
    setDraft(emptyDraft);
    setSourceImage("");
    setSourceText("");
    setSourceMode("image");
    setSourceUrl("");
    setPublishedAt("");
    setSourceFilename("");
    setEditDrafts({});
    setMode(next);
    router.push("/");
    setPendingMode(null);
  }
  const value: FrontendState = {
    mode,
    setMode: (next) => {
      if (next === mode) return;
      if (dirty) setPendingMode(next);
      else changeMode(next);
    },
    live,
    auth,
    previewSession,
    signInPreview: () => {
      setPreviewSession(true);
      setProfile((p) => ({ ...p, displayName: p.displayName || "Alex" }));
    },
    authenticated: mode === "preview" ? previewSession : !!live?.authenticated,
    signOut: async () => {
      if (mode === "live") await auth?.signOut?.();
      else {
        setPreviewSession(false);
        setProfile({ displayName: "", walletAddress: "" });
        setPreviewPosts([]);
        setVotes({});
      }
      setActiveJobId(null);
      setDraft(emptyDraft);
      setSourceImage("");
      setSourceText("");
      setSourceMode("image");
      setSourceUrl("");
      setPublishedAt("");
      setSourceFilename("");
      setEditDrafts({});
    },
    profile:
      mode === "preview" ? profile : { displayName: "", walletAddress: "" },
    savePreviewProfile: setProfile,
    votes,
    votePreview: (id, vote) => setVotes((v) => ({ ...v, [id]: vote })),
    previewPosts,
    addPreviewPost: (deal) => setPreviewPosts((p) => [deal, ...p]),
    updatePreviewPost: (deal) =>
      setPreviewPosts((p) => p.map((d) => (d.id === deal.id ? deal : d))),
    removePreviewPost: (id) =>
      setPreviewPosts((p) => p.filter((d) => d.id !== id)),
    activeJobId,
    setActiveJobId,
    draft,
    setDraft,
    sourceText,
    setSourceText,
    sourceImage,
    setSourceImage,
    sourceMode,
    setSourceMode,
    sourceUrl,
    setSourceUrl,
    publishedAt,
    setPublishedAt,
    sourceFilename,
    setSourceFilename,
    editDrafts,
    setEditDraft: (id, draft) =>
      setEditDrafts((previous) => {
        const next = { ...previous };
        if (draft) next[id] = draft;
        else delete next[id];
        return next;
      }),
    deals:
      mode === "preview"
        ? [...previewPosts, ...demoDeals]
        : (live?.deals ?? []),
    loading:
      mode === "live" && !!live && live.deals === undefined && !live.error,
    error: mode === "live" && !!live?.error,
  };
  return (
    <Context.Provider value={value}>
      {children}
      <Dialog
        title="Leave your draft?"
        open={pendingMode !== null}
        onClose={() => setPendingMode(null)}
      >
        <p className="muted">
          Switching feeds clears your unsaved source and edits from this tab.
        </p>
        <div className="form-actions">
          <button
            className="button secondary"
            onClick={() => setPendingMode(null)}
          >
            Keep editing
          </button>
          <button
            className="button danger"
            onClick={() => pendingMode && changeMode(pendingMode)}
          >
            Discard and switch
          </button>
        </div>
      </Dialog>
    </Context.Provider>
  );
}

function LiveRuntime(props: Omit<Parameters<typeof Runtime>[0], "live">) {
  const raw = useQuery(
    workflowApi.list,
    props.mode === "live" ? { limit: 100 } : "skip",
  );
  const session = useConvexAuth();
  const connection = useConvexConnectionState();
  const submit = useMutation(workflowApi.submit);
  const parsed = useMemo(() => {
    if (raw === undefined) return { deals: undefined, error: false };
    try {
      return { deals: parseWorkflowDeals(raw), error: false };
    } catch {
      return { deals: [], error: true };
    }
  }, [raw]);
  const live: LiveApi = {
    ...parsed,
    authenticated: session.isAuthenticated,
    authLoading: session.isLoading,
    connection: connection.isWebSocketConnected
      ? null
      : connection.hasEverConnected
        ? "reconnecting"
        : "connecting",
    submit: (source) => submit({ inputJson: JSON.stringify({ source }) }),
  };
  return <Runtime {...props} live={live} />;
}

export function FrontendProvider({
  children,
  auth,
}: {
  children: ReactNode;
  auth?: AuthAdapter;
}) {
  const url = process.env.NEXT_PUBLIC_WORKFLOW_CONVEX_URL;
  const client = useMemo(
    () => (url ? new ConvexReactClient(url) : null),
    [url],
  );
  const [mode, setMode] = useState<"preview" | "live">(
    url ? "live" : "preview",
  );
  return client ? (
    <ConvexProviderWithAuth
      client={client}
      useAuth={auth?.useAuth ?? unconfiguredAuth}
    >
      <LiveRuntime mode={mode} setMode={setMode} auth={auth}>
        {children}
      </LiveRuntime>
    </ConvexProviderWithAuth>
  ) : (
    <Runtime mode={mode} setMode={setMode} auth={auth} live={null}>
      {children}
    </Runtime>
  );
}
