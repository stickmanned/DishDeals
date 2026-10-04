"use client";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions, useConvexAuth as useSessionToken } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import { postNativeMessage, recoveredLink, requestShareContext, saveReelLink, shareContextForSave, type ShareContextOutcome } from "@/lib/nativeSession";
import { MAX_CAPTION_BYTES, MAX_CAPTION_CHARS, MAX_DURATION_SECONDS, MAX_MEDIA_BYTES, checkFileChoice, readVideoDuration, uploadSuppliedReel, validateCaption, type VideoProbe } from "@/lib/reels/suppliedMedia";
import { instagramSourceKind } from "@/lib/reels/contract";
import { CanonicalReelReview } from "./CanonicalReelReview";
import { PublishGuard, createPublishHandler, createSearch, type GateInput } from "@/lib/reels/publish";

// Uses the canonical root auth session (ConvexClientProvider); it creates no
// client or auth provider of its own. The session is sent to native by the
// root CanonicalSessionBridge, not from here.
export function ReelIntake(props: { itemId?: string; shared?: string }) {
  // Guard the unconfigured path before any Convex hook runs.
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return <div className="narrow-page"><div className="page-heading"><h1>Save a Post or Reel.</h1><p>Keep the offer. Find it when you need it.</p></div><div className="panel"><p>Private saves need the DishDeals backend connection. Your link has not been submitted.</p><Link className="button secondary" href="/post">Use a screenshot or caption</Link></div></div>;
  }
  return <Intake key={`${props.itemId ?? ""}|${props.shared ?? ""}`} {...props} />;
}
function Intake({ itemId, shared }: { itemId?: string; shared?: string }) {
  const router = useRouter(), auth = useConvexAuth(), actions = useAuthActions();
  const recovered = useMemo(() => recoveredLink(shared), [shared]);
  const [text, setText] = useState(recovered ?? ""), [days, setDays] = useState(7), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [declined, setDeclined] = useState(false), [duplicateOf, setDuplicateOf] = useState<string | null>(null);
  const inputKind = instagramSourceKind(text);
  const kindLabelLower = inputKind === "post" ? "post" : inputKind === "reel" ? "Reel" : "post or Reel";
  // The text native received with a recovered link lives only in this component's memory until the user saves.
  const [shareContext, setShareContext] = useState<ShareContextOutcome | { status: "pending" }>(() => recovered && !itemId ? { status: "pending" } : { status: "unavailable" });
  useEffect(() => {
    if (!recovered || itemId) return;
    let live = true;
    const request = requestShareContext(recovered);
    void request.result.then(outcome => { if (live) setShareContext(outcome); });
    return () => { live = false; request.cancel(); };
  }, [recovered, itemId]);
  const submit = useMutation(api.reels.submit);
  const items = useQuery(api.reels.list, auth.isAuthenticated ? {} : "skip");
  const awaitingConsent = !!recovered && !declined && !itemId;
  const contextPlan = declined ? { action: "none" as const } : shareContextForSave(text, recovered, shareContext);
  async function save(e: FormEvent) {
    e.preventDefault(); setError("");
    if (contextPlan.action === "wait") { setError("Still checking for the text shared with this link. Wait a moment, then save."); return; }
    if (contextPlan.action === "blocked") { setError(`The text shared with this link could not be read, so nothing was saved. Clear the link, or share the ${kindLabelLower} again from Instagram.`); return; }
    setBusy(true);
    try {
      // The context goes in the same submit; the receipt message is sent only after the server confirms the save.
      const saved = await saveReelLink(text, days, args => submit(args), undefined, contextPlan.action === "send" ? contextPlan.context : undefined);
      setText("");
      // A duplicate keeps the first save as it was: newly received text was NOT stored, and the user is told so.
      if (saved.duplicate && contextPlan.action === "send") setDuplicateOf(saved.itemId); else router.push(`/reels?item=${saved.itemId}`);
    }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save the link."); } finally { setBusy(false); }
  }
  if (duplicateOf) return <div className="narrow-page reel-page"><div className="panel form-stack"><h1>Already saved.</h1><p role="status">You already saved this {kindLabelLower}. The earlier save was kept exactly as it was; the text just received from your iPhone was not stored with it.</p><Link className="button primary" href={`/reels?item=${duplicateOf}`}>Open the existing save</Link></div></div>;
  return <div className="narrow-page reel-page"><Link className="back-link" href="/">Back to Discover</Link><div className="page-heading"><h1>{itemId ? "Your save." : inputKind === "post" ? "Save a Post." : inputKind === "reel" ? "Save a Reel." : "Save a Post or Reel."}</h1><p>Private to you. Ready to review when processing finishes.</p></div>
    {auth.isLoading ? <p role="status">Checking your session…</p> : !auth.isAuthenticated ? <ReelSignIn /> : <>
      <div className="form-actions"><button className="button secondary" onClick={() => postNativeMessage({ type: "enableNotifications" })}>Enable iPhone alerts</button><button className="text-button" onClick={() => { void actions.signOut(); }}>Sign out</button></div>
      {itemId ? <Result key={itemId} itemId={itemId as Id<"reelItems">} /> : <form className="panel form-stack" onSubmit={save}>
        {awaitingConsent && <div role="note" className="form-stack"><p><b>A link was saved on this iPhone and has not been sent.</b> It is not tied to any account, so we will not send it automatically. Check the link below and choose whether to save it to the account you are signed in to now.</p><button type="button" className="text-button" onClick={() => { setDeclined(true); setText(""); }}>Not now, clear this link</button></div>}
        {awaitingConsent && contextPlan.action === "wait" && <p role="status" className="muted">Checking for the text shared with this link…</p>}
        {awaitingConsent && contextPlan.action === "send" && <p role="status" className="muted">{contextPlan.context.truncated ? "Some of the text shared with this link was cut off. What arrived will be saved privately; automatic analysis will stay blocked, so you would fill in the draft by hand." : "The text shared with this link will be saved privately with it. It is never made public."}</p>}
        {awaitingConsent && contextPlan.action === "blocked" && <p role="alert" className="field-error">The text shared with this link could not be read, so it will not be saved as if it were complete.</p>}
        <label className="field">Instagram {kindLabelLower} link<input required type="text" autoCapitalize="none" value={text} onChange={e => setText(e.target.value)} placeholder="https://www.instagram.com/…" /></label>
        <label className="field">Automatically delete after<select value={days} onChange={e => setDays(Number(e.target.value))}><option value={1}>1 day</option><option value={7}>7 days</option><option value={30}>30 days</option></select></label>
        <p className="muted">Saving keeps the link private to you. DishDeals then reads the Reel in the background and prepares a draft; this can fail if the Reel is private or the service is busy. You review any draft before using it.</p>
        {shared && !recovered && <p role="alert" className="field-error">That shared link is not a supported Instagram post or Reel link, so it was not filled in.</p>}
        {error && <p role="alert" className="field-error">{error}</p>}<button className="button primary" disabled={busy || (awaitingConsent && contextPlan.action !== "send" && contextPlan.action !== "none")}>{busy ? "Saving…" : awaitingConsent ? "Save this link to my account" : "Save privately"}</button>
      </form>}
      <section className="panel form-stack"><h2>Your saves</h2>{!items ? <p>Loading…</p> : items.length ? items.map(item => {
        const k = instagramSourceKind(item.sourceUrl);
        const badge = k === "post" ? "Post" : k === "reel" ? "Reel" : "Post/Reel";
        return (
          <Link key={item._id} href={`/reels?item=${item._id}`} className="reel-history">
            <span>{item.sourceUrl.split("/").at(-2)}</span>
            <span className="source-kind">{badge}</span>
            <span>{item.status.replaceAll("_", " ")}</span>
          </Link>
        );
      }) : <p className="muted">No saved posts or Reels yet.</p>}{itemId && <Link href="/reels">Save another post or Reel</Link>}</section>
    </>}<p className="muted"><Link href="/post">Share a screenshot or caption</Link></p></div>;
}
function ReelSignIn() {
  const { signIn } = useAuthActions(); const [create, setCreate] = useState(false), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function login(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const data = new FormData(e.currentTarget); data.set("flow", create ? "signUp" : "signIn"); setBusy(true); setError(""); try { await signIn("password", data); } catch { setError("Sign-in failed. Check your details and backend setup."); } finally { setBusy(false); } }
  return <form className="panel form-stack" onSubmit={login}><h2>{create ? "Create an account" : "Sign in to save privately"}</h2><label className="field">Email<input name="email" required type="email" autoComplete="email" /></label><label className="field">Password<input name="password" required minLength={8} type="password" autoComplete={create ? "new-password" : "current-password"} /></label>{error && <p role="alert">{error}</p>}<button disabled={busy} className="button primary">{busy ? "Signing in…" : create ? "Create account" : "Sign in"}</button><button className="text-button" type="button" onClick={() => setCreate(!create)}>{create ? "Use an existing account" : "Create an account"}</button></form>;
}
function Result({ itemId }: { itemId: Id<"reelItems"> }) {
  const item = useQuery(api.reels.get, { itemId }), retry = useMutation(api.reels.retry), remove = useMutation(api.reels.remove), retention = useMutation(api.reels.setRetention);
  const router = useRouter(), [error, setError] = useState(""), [busy, setBusy] = useState(false), announced = useRef(false);
  useEffect(() => { if (item && ["ready", "no_deal", "failed"].includes(item.status) && !announced.current) { announced.current = true; postNativeMessage({ type: "result", itemId, status: item.status as "ready" | "no_deal" | "failed" }); } }, [item, itemId]);
  async function run(task: () => Promise<unknown>) { setBusy(true); setError(""); try { await task(); } catch { setError("That change could not be saved. Try again."); } finally { setBusy(false); } }
  if (!item) return <p role="status">Loading your private save…</p>;
  const kind = instagramSourceKind(item.sourceUrl);
  const kindLabel = kind === "post" ? "Post" : kind === "reel" ? "Reel" : "Post or Reel";
  const kindLabelLower = kind === "post" ? "post" : kind === "reel" ? "Reel" : "post or Reel";
  const labels = { queued: item.sourceKind === "supplied" ? "Recording attached. Waiting to be analyzed." : "Link saved privately. Reading the Reel to prepare a draft…", retrieving: `Reading the ${kindLabelLower}…`, extracting: "Listening and reading the video…", ready: "Your draft is ready to review.", no_deal: "No clear dining offer was found.", failed: "Processing needs attention." };
  return <><div className="panel form-stack"><p role="status" aria-live="polite">{labels[item.status]}</p><a href={item.sourceUrl} target="_blank" rel="noreferrer">Original {kindLabel}</a>{item.nativeContext?.truncated && <p role="note">The text shared with this {kindLabelLower} was cut off, so automatic analysis is blocked. Delete this save and share the {kindLabelLower} again with its complete text, or fill in the draft by hand.</p>}{item.error && <p role="alert">{item.error.message}</p>}{error && <p role="alert">{error}</p>}<div className="form-actions">{item.status === "failed" && <button disabled={busy || item.attempts >= 5} className="button primary" onClick={() => { announced.current = false; void run(() => retry({ itemId })); }}>Retry processing</button>}<button disabled={busy} className="button secondary" onClick={() => void run(async () => { await remove({ itemId }); router.replace("/reels"); })}>Delete save</button></div>
    <label className="field">Reset automatic deletion<select disabled={busy} defaultValue="" onChange={e => { const days = Number(e.target.value); if (days) void run(() => retention({ itemId, days })); }}><option value="">Choose retention</option><option value="1">1 day from now</option><option value="7">7 days from now</option><option value="30">30 days from now</option></select></label><p className="muted">Deletes {new Date(item.expiresAt).toLocaleString()}. A recording you attach is kept for retries and deleted after analysis, when you delete this save, or at expiry.</p></div>
    <div className="panel form-stack">
      <h2>Public deal entry</h2>
      <p>
        <b>Private save vs. Public deal:</b> This saved {kindLabelLower} is private to your account.
        To share this deal with the community, review the details and publish it as a community deal on the map and deal detail page (feed integration is pending until resolved).
      </p>
      <div className="form-actions">
        <a className="button secondary" href="#reel-deal-review">
          Review and publish publicly
        </a>
        <Link className="button secondary" href={`/post?source=${encodeURIComponent(item.sourceUrl)}`}>
          Use standard post form
        </Link>
      </div>
      <p className="muted">
        DishDeals reads the shared Reel automatically and prepares a draft for you to review. If that fails (for example, a private or removed Reel), attach your own recording below, fill in the deal by hand, or use the standard post form with a screenshot or caption.
      </p>
    </div>
    <AttachRecording item={item} processing={["retrieving", "extracting"].includes(item.status)} /><DraftEditor key={itemId} item={item} /></>;
}
function browserProbe(): VideoProbe {
  return {
    createObjectURL: file => URL.createObjectURL(file as Blob), revokeObjectURL: url => URL.revokeObjectURL(url),
    createVideo: () => document.createElement("video") as unknown as ReturnType<VideoProbe["createVideo"]>,
    setTimer: (fn, ms) => window.setTimeout(fn, ms), clearTimer: id => window.clearTimeout(id as number),
  };
}
const uploadErrors = { invalid: "That recording or its details cannot be uploaded.", auth: "Your session expired. Sign in again.", rejected: "The server did not accept this recording. Check its type and length, then try again.",
  rate_limited: "Too many uploads or retries this hour. Try later.", network: "The upload did not reach the server. Your choices are kept; try again.", timeout: "The upload took too long and was stopped. Your choices are kept; try again.", aborted: "The upload was cancelled. Your choices are kept.", unexpected: "The upload could not be confirmed. Try again." } as const;
// The user's own recording of this same Reel. File, caption and date are kept on every cancel or error.
function AttachRecording({ item, processing }: { item: Doc<"reelItems">; processing: boolean }) {
  const session = useSessionToken(), siteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  const [file, setFile] = useState<File | null>(null), [duration, setDuration] = useState<number | null>(null);
  const [caption, setCaption] = useState(item.caption ?? ""), [published, setPublished] = useState(item.publishedAt?.slice(0, 10) ?? "");
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [receipt, setReceipt] = useState("");
  const kind = instagramSourceKind(item.sourceUrl);
  const kindLabelLower = kind === "post" ? "post" : kind === "reel" ? "Reel" : "post or Reel";
  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0];
    if (!chosen) return; // cancelling the picker keeps the previous selection
    setReceipt("");
    const problem = checkFileChoice(chosen);
    if (problem) { setMessage(problem === "too_large" ? `That recording is larger than ${MAX_MEDIA_BYTES / 1048576} MB.` : problem === "empty" ? "That recording is empty." : "Choose an MP4 or QuickTime (.mov) recording."); return; }
    setMessage("Reading the recording length…");
    const seconds = await readVideoDuration(chosen, browserProbe());
    if (seconds === null) { setMessage(`The recording length could not be read, or is outside 1 to ${MAX_DURATION_SECONDS} seconds.`); return; }
    setFile(chosen); setDuration(seconds); setMessage("");
  }
  async function send() {
    if (!file || duration === null || !siteUrl || processing) return;
    if (validateCaption(caption) === null) { setMessage(`The caption is too long or has unsupported characters (up to ${MAX_CAPTION_CHARS} characters and ${MAX_CAPTION_BYTES} bytes). It was not changed.`); return; }
    setBusy(true); setMessage(""); setReceipt("");
    try {
      const token = await session.fetchAccessToken({ forceRefreshToken: false });
      if (!token) { setMessage(uploadErrors.auth); return; }
      const outcome = await uploadSuppliedReel({ siteUrl, token, file, query: { itemId: item._id, duration, ...(published ? { publishedAt: published } : {}), ...(caption.trim() ? { caption: caption.trim() } : {}) } });
      if (outcome.ok) setReceipt("Recording attached. Processing has started."); else setMessage(uploadErrors[outcome.reason]);
    } finally { setBusy(false); }
  }
  return <div className="panel form-stack"><h2>Attach recording (optional)</h2>
    <p className="muted">Attaching a recording is optional. DishDeals tries to read this {kindLabelLower} from its link; if that fails (for example, a private or removed one), attach a screen recording or video from Photos or Files. Alternatively, you can review and publish a public deal manually below, or <Link href={`/post?source=${encodeURIComponent(item.sourceUrl)}`}>use the standard post form</Link> with screenshot or caption text. The recording stays private and is used only for this save. Its length is read by your browser and is not independently verified. Processing also needs video analysis to be enabled; if it is not, you will see a failed result and can edit by hand.</p>
    {!siteUrl ? <p role="status" className="muted">Recording upload is not configured for this build.</p> : <>
      <label className="field">Video recording (MP4 or QuickTime, up to {MAX_MEDIA_BYTES / 1048576} MB, 1 to {MAX_DURATION_SECONDS} seconds)<input type="file" accept="video/mp4,video/quicktime,.mp4,.mov" onChange={e => void pick(e)} disabled={busy || processing} /></label>
      {file && duration !== null && <p role="status">{file.name} · {(file.size / 1048576).toFixed(1)} MB · about {Math.round(duration)} s (read by your browser)</p>}
      <label className="field">Caption from the {kindLabelLower} (optional)<textarea maxLength={MAX_CAPTION_CHARS} value={caption} onChange={e => setCaption(e.target.value)} disabled={busy} /></label>
      <label className="field">Date the {kindLabelLower} was posted (optional, leave blank if unknown)<input type="date" value={published} onChange={e => setPublished(e.target.value)} disabled={busy} /></label>
      <button type="button" className="button primary" disabled={busy || processing || !file || duration === null} onClick={() => void send()}>{busy ? "Uploading…" : processing ? "Processing…" : "Upload recording"}</button>
      {message && <p role="alert" className="field-error">{message}</p>}{receipt && <p role="status">{receipt}</p>}</>}
  </div>;
}
// Mounted per item (not per generation) so edits survive retries and reactive updates.
function DraftEditor({ item }: { item: Doc<"reelItems"> }) {
  const save = useMutation(api.reels.saveDraft);
  // Real canonical session and profile: never a local preview identity.
  const auth = useConvexAuth();
  const me = useQuery(api.users.me, auth.isAuthenticated ? {} : "skip");
  const create = useMutation(api.deals.create);
  const geocode = useAction(api.geocode.geocode);
  // One guard per editor makes publishing single-flight. The handler is rebuilt each render so a click always
  // sees the current session, profile and item.
  const [guard] = useState(() => new PublishGuard());
  const gate: GateInput = { isLoading: auth.isLoading, isAuthenticated: auth.isAuthenticated, me };
  const publish = createPublishHandler({
    gate: () => gate,
    // The args are exactly deals.create's; imageId only reaches here after its shape was validated.
    create: args => create({ ...args, imageId: args.imageId as Id<"_storage"> | undefined }),
    item: () => ({ sourceUrl: item.sourceUrl, videoId: item.videoId }),
    guard,
  });
  const search = createSearch(query => geocode({ query }));
  return (
    <CanonicalReelReview
      key={item._id}
      item={item}
      onSave={(draftJson, expected) =>
        save({
          itemId: item._id,
          draftJson,
          expectedGeneration: expected.generation,
          expectedRevision: expected.revision,
        })
      }
      onPublish={publish}
      search={search}
      sourceUrl={item.sourceUrl}
    />
  );
}
// Version fields are optional so the static layout preview can render without a stored item.
export type DraftItem = Pick<Doc<"reelItems">, "extractionJson" | "draftJson" | "caption"> &
  Partial<Pick<Doc<"reelItems">, "generation" | "draftRevision" | "draftEdited" | "status">>;

export function DraftReview({
  item,
  onSave,
}: {
  item: DraftItem;
  onSave: (draftJson: string, expected: { generation: number; revision: number }) => Promise<unknown>;
}) {
  return <CanonicalReelReview item={item} onSave={onSave} />;
}
