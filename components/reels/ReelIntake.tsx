"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions, useAuthToken } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import { normalizeInstagramUrl, reelDraft, reelExtraction, type ReelDraft } from "@/lib/reels/contract";

function nativeMessage(value: object) {
  (window as Window & { webkit?: { messageHandlers?: { dishdeals?: { postMessage: (v: object) => void } } } }).webkit?.messageHandlers?.dishdeals?.postMessage(value);
}
export function ReelIntake(props: { itemId?: string; shared?: string; unsupported?: boolean }) {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return <div className="narrow-page panel"><h1>Reel intake is not configured.</h1><p>This website was built without a Convex backend URL. Nothing has been submitted.</p>{props.shared !== undefined && <><h2>Received share</h2><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{props.shared || "Empty payload"}</pre></>}<Link href="/post">Use the local source preview</Link></div>;
  return <Intake key={`${props.itemId ?? ""}:${props.shared ?? ""}`} {...props} />;
}

function Intake({ itemId, shared, unsupported }: { itemId?: string; shared?: string; unsupported?: boolean }) {
  const router = useRouter(), auth = useConvexAuth(), actions = useAuthActions(), token = useAuthToken();
  const [text, setText] = useState(shared ?? ""), [days, setDays] = useState(7), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const configuration = useQuery(api.trial.status);
  const submit = useMutation(api.reels.submit);
  const items = useQuery(api.reels.list, auth.isAuthenticated ? {} : "skip");
  const auto = useRef<string | null>(null);
  const normalizedShare = useMemo(() => {
    if (!shared) return null;
    try { return normalizeInstagramUrl(shared); } catch { return null; }
  }, [shared]);
  const [receipt, setReceipt] = useState("No backend receipt yet");
  useEffect(() => { nativeMessage({ type: "session", token: token ?? null }); }, [token]);
  useEffect(() => {
    if (!shared || unsupported || !auth.isAuthenticated || !configuration?.reelsConfigured || auto.current === shared) return;
    auto.current = shared;
    let normalized: string;
    try { normalized = normalizeInstagramUrl(shared); } catch { return; }
    void submit({ text: normalized }).then(result => { setReceipt(`Backend accepted item ${result.itemId}`); nativeMessage({ type: "received", sourceUrl: normalized }); router.replace(`/reels?item=${result.itemId}`); }).catch(() => { setReceipt("Submission failed; received link remains on this page"); setError("Your link could not be saved. Try again below."); });
  }, [auth.isAuthenticated, configuration?.reelsConfigured, shared, unsupported, submit, router]);
  async function save(e: FormEvent) {
    e.preventDefault(); setError(""); if (!configuration?.reelsConfigured) { setError("Reel processing is not configured. Use a screenshot or caption instead."); return; } setBusy(true);
    try { const result = await submit({ text: normalizeInstagramUrl(text), retentionDays: days }); setText(""); router.push(`/reels?item=${result.itemId}`); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save the link."); } finally { setBusy(false); }
  }
  return <div className="narrow-page reel-page"><Link className="back-link" href="/">Back to Discover</Link><div className="page-heading"><h1>{itemId ? "Your Reel save." : "Save a Reel."}</h1><p>Private to you. Ready to review when processing finishes.</p></div>
    {shared !== undefined && <div className="panel form-stack"><h2>Received from share</h2><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", userSelect: "text" }}>{shared || "Empty payload"}</pre><p>{unsupported ? "The native extension could not recognize this payload. This preview may be truncated; it will not submit automatically. Copy a direct Reel link or use a screenshot/caption." : normalizedShare ? `Recognized Reel link: ${normalizedShare}` : "This payload is not a supported direct Instagram Reel/post link. Copy a direct link or use a screenshot/caption."}</p><p role="status">{receipt}. Session: {auth.isLoading ? "checking" : auth.isAuthenticated ? "authenticated" : "sign-in required"}. Reel provider: {configuration ? configuration.reelsConfigured ? "configured" : "not configured" : "checking"}.</p>{error && <p role="alert">{error}</p>}</div>}
    {configuration && !configuration.reelsConfigured && <div className="panel"><p>Reel processing is not configured yet. You can extract an offer from your own screenshot or pasted caption.</p><Link href="/post" className="button secondary">Share a screenshot or caption</Link></div>}
    {auth.isLoading ? <p role="status">Checking your session…</p> : !auth.isAuthenticated ? <ReelSignIn /> : <>
      <div className="form-actions"><button className="button secondary" onClick={() => nativeMessage({ type: "enableNotifications" })}>Enable iPhone alerts</button><button className="text-button" onClick={() => { nativeMessage({ type: "session", token: null }); void actions.signOut(); }}>Sign out</button></div>
      {itemId ? <Result key={itemId} itemId={itemId as Id<"reelItems">} /> : <form className="panel form-stack" onSubmit={save}>
        <label className="field">Instagram Reel link<input required type="text" autoCapitalize="none" value={text} onChange={e => setText(e.target.value)} placeholder="https://www.instagram.com/reel/…" /></label>
        <label className="field">Automatically delete after<select value={days} onChange={e => setDays(Number(e.target.value))}><option value={1}>1 day</option><option value={7}>7 days</option><option value={30}>30 days</option></select></label>
        <p className="muted">We’ll retrieve the public video and analyze its caption, audio and visible text. You review the draft before using it.</p>
        {error && <p role="alert" className="field-error">{error}</p>}<button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save privately"}</button>
      </form>}
      <section className="panel form-stack"><h2>Your saves</h2>{!items ? <p>Loading…</p> : items.length ? items.map(item => <Link key={item._id} href={`/reels?item=${item._id}`} className="reel-history"><span>{item.sourceUrl.split("/").at(-2)}</span><span>{item.status.replaceAll("_", " ")}</span></Link>) : <p className="muted">No saved Reels yet.</p>}{itemId && <Link href="/reels">Save another Reel</Link>}</section>
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
  useEffect(() => { if (item && ["ready", "no_deal", "failed"].includes(item.status) && !announced.current) { announced.current = true; nativeMessage({ type: "result", itemId, status: item.status }); } }, [item, itemId]);
  async function run(task: () => Promise<unknown>) { setBusy(true); setError(""); try { await task(); } catch { setError("That change could not be saved. Try again."); } finally { setBusy(false); } }
  if (!item) return <p role="status">Loading your private save…</p>;
  const labels = { queued: "Received. Your private item is saved.", retrieving: "Reading the Reel…", extracting: "Listening and reading the video…", ready: "Your draft is ready to review.", no_deal: "No clear dining offer was found.", failed: "Processing needs attention." };
  return <><div className="panel form-stack"><p role="status" aria-live="polite">{labels[item.status]}</p><a href={item.sourceUrl} target="_blank" rel="noreferrer">Original Reel</a>{item.error && <p role="alert">{item.error.message}</p>}{error && <p role="alert">{error}</p>}<div className="form-actions">{item.status === "failed" && <button disabled={busy || item.attempts >= 5} className="button primary" onClick={() => { announced.current = false; void run(() => retry({ itemId })); }}>Retry processing</button>}<button disabled={busy} className="button secondary" onClick={() => void run(async () => { await remove({ itemId }); router.replace("/reels"); })}>Delete save</button></div>
    <label className="field">Reset automatic deletion<select disabled={busy} defaultValue="" onChange={e => { const days = Number(e.target.value); if (days) void run(() => retention({ itemId, days })); }}><option value="">Choose retention</option><option value="1">1 day from now</option><option value="7">7 days from now</option><option value="30">30 days from now</option></select></label><p className="muted">Deletes {new Date(item.expiresAt).toLocaleString("en-CA")}. Downloaded video is deleted after extraction or failure.</p></div>{item.status === "ready" && <DraftEditor key={`${itemId}-${item.generation}`} item={item} />}</>;
}
function DraftEditor({ item }: { item: Doc<"reelItems"> }) {
  const save = useMutation(api.reels.saveDraft);
  return <DraftReview item={item} onSave={draftJson => save({ itemId: item._id, draftJson })} />;
}
export function DraftReview({ item, onSave }: { item: Pick<Doc<"reelItems">, "extractionJson" | "draftJson" | "caption">; onSave: (draftJson: string) => Promise<unknown> }) {
  const extracted = useMemo(() => reelExtraction.parse(JSON.parse(item.extractionJson!)), [item.extractionJson]);
  const [drafts, setDrafts] = useState<ReelDraft[]>(() => reelDraft.array().parse(JSON.parse(item.draftJson!))), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  function edit(index: number, patch: Partial<ReelDraft>) { setMessage(""); setDrafts(previous => previous.map((draft, i) => i === index ? { ...draft, ...patch } : draft)); }
  async function persist(e: FormEvent) { e.preventDefault(); setBusy(true); try { reelDraft.array().parse(drafts); await onSave(JSON.stringify(drafts)); setMessage("Draft saved privately."); } catch { setMessage("Check the fields and try again."); } finally { setBusy(false); } }
  return <form className="panel form-stack" onSubmit={persist}><h2>Review the draft</h2><p className="muted">Blank fields are unknown. Currency stays unknown unless the source states it. Times use America/Vancouver.</p>
    {drafts.map((draft, index) => <fieldset className="form-stack" key={index}><legend>Offer {index + 1}</legend>
      {(["restaurant", "address", "dealText", "currency", "validStart", "validEnd", "expiresOn"] as const).map(field => <label className="field" key={field}>{({ restaurant: "Restaurant", address: "Address", dealText: "Deal", currency: "Currency (e.g. CAD)", validStart: "Starts (HH:MM)", validEnd: "Ends (HH:MM)", expiresOn: "Expiry (YYYY-MM-DD)" })[field]}<input value={draft[field] ?? ""} onChange={e => edit(index, { [field]: e.target.value || null })} /></label>)}
      <label className="field">Price<input type="number" min="0" max="100000" step="0.01" value={draft.price ?? ""} onChange={e => edit(index, { price: e.target.value === "" ? null : Number(e.target.value) })} /></label>
      <label className="field">Days<select value={draft.validDays === null ? "unknown" : draft.validDays.length === 0 ? "every" : "selected"} onChange={e => edit(index, { validDays: e.target.value === "unknown" ? null : e.target.value === "every" ? [] : ["mon"] })}><option value="unknown">Unknown</option><option value="every">Every day (confirmed)</option><option value="selected">Selected days</option></select></label>
      {!!draft.validDays?.length && <div className="reel-days">{(["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map(day => <label key={day}><input type="checkbox" checked={draft.validDays!.includes(day)} onChange={e => edit(index, { validDays: e.target.checked ? [...draft.validDays!, day] : draft.validDays!.length > 1 ? draft.validDays!.filter(d => d !== day) : null })} />{day}</label>)}</div>}
      <label className="field">Conditions (one per line)<textarea value={draft.conditions?.join("\n") ?? ""} onChange={e => edit(index, { conditions: e.target.value.trim() ? e.target.value.split("\n").filter(Boolean) : null })} /></label><label><input type="checkbox" checked={draft.conditions?.length === 0} onChange={e => edit(index, { conditions: e.target.checked ? [] : null })} /> Confirm no conditions</label>
    </fieldset>)}<button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save draft"}</button><p role="status">{message}</p>
    <details><summary>Source evidence</summary>{extracted.evidence.map((e, i) => <p key={i}><b>Offer {e.draftIndex + 1}, {e.field} · {e.channel}{e.timestampSeconds !== null ? ` at ${e.timestampSeconds}s` : ""}</b><br />{e.quote}</p>)}{extracted.warnings.map((w, i) => <p key={i}>{w}</p>)}<h3>Caption</h3><p>{item.caption || "No caption"}</p><h3>Relevant audio transcript</h3><p>{extracted.transcript || "No intelligible offer speech"}</p></details>
    <p className="muted">Edits leave the original extraction and evidence intact. This private draft is saved separately from the community feed.</p></form>;
}
