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
import { demoDeals, previewSeedPosts } from "@/lib/frontend/demoDeals";
import { workflowApi, type WorkflowSource } from "@/lib/frontend/workflow";
import { emptyDraft, type Draft } from "@/lib/frontend/draft";
import { Dialog } from "./Dialog";
import { useRouter } from "next/navigation";
import { useAuthActions, useConvexAuth as useCanonicalSession } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import { frontendConnection } from "@/lib/frontendConnection";

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
  /** Deal ids the visitor bookmarked from Discover. Kept for this tab only, like preview votes. */
  savedIds: string[];
  toggleSaved: (id: string) => void;
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
  liveProfile,
}: {
  children: ReactNode;
  liveProfile?: Profile;
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
  const [savedIds, setSavedIds] = useState<string[]>([]);
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
      const name = profile.displayName || "Alex";
      setPreviewSession(true);
      setProfile((p) => ({ ...p, displayName: p.displayName || "Alex" }));
      // A first preview sign-in starts with a few example posts so Profile isn't empty.
      setPreviewPosts((posts) => (posts.length || previewSession ? posts : previewSeedPosts(name)));
    },
    // A real signed-in session counts in every mode, so the header and profile links follow the actual login even
    // while Discover shows the example deals (the fake preview session only applies when there is no real one).
    authenticated: !!live?.authenticated || (mode === "preview" && previewSession),
    signOut: async () => {
      if (mode === "live" || live?.authenticated) await auth?.signOut?.();
      if (mode !== "live") {
        setPreviewSession(false);
        setProfile({ displayName: "", walletAddress: "" });
        setPreviewPosts([]);
        setVotes({});
      }
      setSavedIds([]);
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
      mode === "preview" ? profile : (liveProfile ?? { displayName: "", walletAddress: "" }),
    savePreviewProfile: setProfile,
    savedIds,
    toggleSaved: (id) =>
      setSavedIds((ids) =>
        ids.includes(id) ? ids.filter((x) => x !== id) : [id, ...ids],
      ),
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
        ? [
            ...previewPosts,
            ...demoDeals.filter((d) => !previewPosts.some((p) => p.restaurant === d.restaurant)),
          ]
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

/** Canonical routes and the legacy feed share the ROOT client; no nested provider shadows it. */
function CanonicalRuntime({ children, mode, setMode, conflict }: {
  children: ReactNode;
  mode: "preview" | "live";
  setMode: FrontendState["setMode"];
  conflict: boolean;
}) {
  const { signIn, signOut } = useAuthActions();
  const session = useConvexAuth();
  const me = useQuery(api.users.me, session.isAuthenticated ? {} : "skip");
  const auth: AuthAdapter = {
    useAuth: useCanonicalSession,
    signOut,
    async signIn(email, password, create) {
      const data = new FormData();
      data.set("email", email);
      data.set("password", password);
      data.set("flow", create ? "signUp" : "signIn");
      await signIn("password", data);
    },
  };
  const props = {
    children,
    mode,
    setMode,
    auth,
    liveProfile: { displayName: me?.displayName ?? "", walletAddress: me?.walletAddress ?? "" },
  };
  if (conflict) {
    // Keep canonical route children on their original authenticated client. Never try the foreign target.
    const unavailable: LiveApi = {
      deals: [], error: true, authenticated: session.isAuthenticated, authLoading: session.isLoading,
      connection: null,
      submit: async () => { throw new Error("The legacy feed target differs from the signed-in app target."); },
    };
    return <Runtime {...props} live={unavailable}>
      <p role="alert">The Discover feed is not configured for this app. Your account, saved Reels and deal map use the signed-in app connection.</p>
      {children}
    </Runtime>;
  }
  return <LiveRuntime {...props} />;
}

export function FrontendProvider({
  children,
  auth,
}: {
  children: ReactNode;
  auth?: AuthAdapter;
}) {
  const url = process.env.NEXT_PUBLIC_WORKFLOW_CONVEX_URL;
  const plan = frontendConnection(process.env.NEXT_PUBLIC_CONVEX_URL, url);
  const client = useMemo(
    () => (plan === "standalone" && url ? new ConvexReactClient(url) : null),
    [plan, url],
  );
  // The legacy live feed targets its own deployment, so with only the canonical backend configured Discover opens on
  // the example deals instead of a feed error; real sign-in state still comes from the canonical session.
  const [mode, setMode] = useState<"preview" | "live">(plan === "preview" || plan === "canonical" ? "preview" : "live");
  if (plan === "canonical" || plan === "canonical_conflict") {
    return <CanonicalRuntime mode={mode} setMode={setMode} conflict={plan === "canonical_conflict"}>
      {children}
    </CanonicalRuntime>;
  }
  // Harry's standalone preview/runtime remains usable when no canonical provider is configured.
  return client ? (
    <ConvexProviderWithAuth client={client} useAuth={auth?.useAuth ?? unconfiguredAuth}>
      <LiveRuntime mode={mode} setMode={setMode} auth={auth}>{children}</LiveRuntime>
    </ConvexProviderWithAuth>
  ) : (
    <Runtime mode={mode} setMode={setMode} auth={auth} live={null}>{children}</Runtime>
  );
}
