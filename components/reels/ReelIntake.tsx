"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import { reelDraft, reelExtraction, type ReelDraft } from "@/lib/reels/contract";
import { afterOwnSave, versionStatus } from "@/lib/reels/draftRevision";
import { postNativeMessage, recoveredLink, saveReelLink } from "@/lib/nativeSession";

// Uses the canonical root auth session (ConvexClientProvider); it creates no
// client or auth provider of its own. The session is sent to native by the
// root CanonicalSessionBridge, not from here.
export function ReelIntake(props: { itemId?: string; shared?: string }) {
  // Guard the unconfigured path before any Convex hook runs.
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return <div className="narrow-page"><div className="page-heading"><h1>Save a Reel.</h1><p>Keep the offer. Find it when you need it.</p></div><div className="panel"><p>Private Reel saves need the DishDeals backend connection. Your link has not been submitted.</p><Link className="button secondary" href="/post">Use a screenshot or caption</Link></div></div>;
  }
  return <Intake key={`${props.itemId ?? ""}|${props.shared ?? ""}`} {...props} />;
}
function Intake({ itemId, shared }: { itemId?: string; shared?: string }) {
  const router = useRouter(), auth = useConvexAuth(), actions = useAuthActions();
  const recovered = useMemo(() => recoveredLink(shared), [shared]);
  const [text, setText] = useState(recovered ?? ""), [days, setDays] = useState(7), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [declined, setDeclined] = useState(false);
  const submit = useMutation(api.reels.submit);
  const items = useQuery(api.reels.list, auth.isAuthenticated ? {} : "skip");
  const awaitingConsent = !!recovered && !declined && !itemId;
  async function save(e: FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      // The receipt message is sent only after the server confirms the save.
      const saved = await saveReelLink(text, days, args => submit(args));
      setText(""); router.push(`/reels?item=${saved.itemId}`);
    }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save the link."); } finally { setBusy(false); }
  }
  return <div className="narrow-page reel-page"><Link className="back-link" href="/">Back to Discover</Link><div className="page-heading"><h1>{itemId ? "Your Reel save." : "Save a Reel."}</h1><p>Private to you. Ready to review when processing finishes.</p></div>
    {auth.isLoading ? <p role="status">Checking your session…</p> : !auth.isAuthenticated ? <ReelSignIn /> : <>
      <div className="form-actions"><button className="button secondary" onClick={() => postNativeMessage({ type: "enableNotifications" })}>Enable iPhone alerts</button><button className="text-button" onClick={() => { void actions.signOut(); }}>Sign out</button></div>
      {itemId ? <Result key={itemId} itemId={itemId as Id<"reelItems">} /> : <form className="panel form-stack" onSubmit={save}>
        {awaitingConsent && <div role="note" className="form-stack"><p><b>A link was saved on this iPhone and has not been sent.</b> It is not tied to any account, so we will not send it automatically. Check the link below and choose whether to save it to the account you are signed in to now.</p><button type="button" className="text-button" onClick={() => { setDeclined(true); setText(""); }}>Not now, clear this link</button></div>}
        <label className="field">Instagram Reel link<input required type="text" autoCapitalize="none" value={text} onChange={e => setText(e.target.value)} placeholder="https://www.instagram.com/reel/…" /></label>
        <label className="field">Automatically delete after<select value={days} onChange={e => setDays(Number(e.target.value))}><option value={1}>1 day</option><option value={7}>7 days</option><option value={30}>30 days</option></select></label>
        <p className="muted">Saving keeps the link private to you. Processing the video depends on the service being available and may fail or be unavailable; the link alone is never analyzed. You review any draft before using it.</p>
        {shared && !recovered && <p role="alert" className="field-error">That shared link is not a supported Reel link, so it was not filled in.</p>}
        {error && <p role="alert" className="field-error">{error}</p>}<button className="button primary" disabled={busy}>{busy ? "Saving…" : awaitingConsent ? "Save this link to my account" : "Save privately"}</button>
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
  useEffect(() => { if (item && ["ready", "no_deal", "failed"].includes(item.status) && !announced.current) { announced.current = true; postNativeMessage({ type: "result", itemId, status: item.status as "ready" | "no_deal" | "failed" }); } }, [item, itemId]);
  async function run(task: () => Promise<unknown>) { setBusy(true); setError(""); try { await task(); } catch { setError("That change could not be saved. Try again."); } finally { setBusy(false); } }
  if (!item) return <p role="status">Loading your private save…</p>;
  const labels = { queued: "Received. Your private item is saved.", retrieving: "Reading the Reel…", extracting: "Listening and reading the video…", ready: "Your draft is ready to review.", no_deal: "No clear dining offer was found.", failed: "Processing needs attention." };
  return <><div className="panel form-stack"><p role="status" aria-live="polite">{labels[item.status]}</p><a href={item.sourceUrl} target="_blank" rel="noreferrer">Original Reel</a>{item.error && <p role="alert">{item.error.message}</p>}{error && <p role="alert">{error}</p>}<div className="form-actions">{item.status === "failed" && <button disabled={busy || item.attempts >= 5} className="button primary" onClick={() => { announced.current = false; void run(() => retry({ itemId })); }}>Retry processing</button>}<button disabled={busy} className="button secondary" onClick={() => void run(async () => { await remove({ itemId }); router.replace("/reels"); })}>Delete save</button></div>
    <label className="field">Reset automatic deletion<select disabled={busy} defaultValue="" onChange={e => { const days = Number(e.target.value); if (days) void run(() => retention({ itemId, days })); }}><option value="">Choose retention</option><option value="1">1 day from now</option><option value="7">7 days from now</option><option value="30">30 days from now</option></select></label><p className="muted">Deletes {new Date(item.expiresAt).toLocaleString()}. Downloaded video is deleted after extraction or failure.</p></div>{hasDraft(item.draftJson) && <DraftEditor key={itemId} item={item} />}</>;
}
function hasDraft(draftJson: string | undefined) {
  try { return draftJson !== undefined && Array.isArray(JSON.parse(draftJson)) && JSON.parse(draftJson).length > 0; } catch { return false; }
}
// Mounted per item (not per generation) so edits survive retries and reactive updates.
function DraftEditor({ item }: { item: Doc<"reelItems"> }) {
  const save = useMutation(api.reels.saveDraft);
  return <DraftReview item={item} onSave={(draftJson, expected) => save({ itemId: item._id, draftJson, expectedGeneration: expected.generation, expectedRevision: expected.revision })} />;
}
// Version fields are optional so the static layout preview can render without a stored item.
type DraftItem = Pick<Doc<"reelItems">, "extractionJson" | "draftJson" | "caption"> & Partial<Pick<Doc<"reelItems">, "generation" | "draftRevision" | "draftEdited" | "status">>;
export function DraftReview({ item, onSave }: { item: DraftItem; onSave: (draftJson: string, expected: { generation: number; revision: number }) => Promise<unknown> }) {
  const extracted = useMemo(() => { try { return item.extractionJson ? reelExtraction.parse(JSON.parse(item.extractionJson)) : null; } catch { return null; } }, [item.extractionJson]);
  // Local inputs and the expected version are captured once and never resynced from reactive props.
  const [drafts, setDrafts] = useState<ReelDraft[]>(() => reelDraft.array().parse(JSON.parse(item.draftJson!)));
  const [expected, setExpected] = useState(() => ({ generation: item.generation ?? 0, revision: item.draftRevision ?? 0 }));
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const changed = !busy && versionStatus(expected, { generation: item.generation ?? 0, draftRevision: item.draftRevision }) === "changed";
  const latest = { generation: item.generation ?? 0, revision: item.draftRevision ?? 0 };
  function edit(index: number, patch: Partial<ReelDraft>) { setMessage(""); setDrafts(previous => previous.map((draft, i) => i === index ? { ...draft, ...patch } : draft)); }
  function loadLatest() { try { setDrafts(reelDraft.array().parse(JSON.parse(item.draftJson!))); setExpected(latest); setMessage("Loaded the latest saved draft."); } catch { setMessage("The latest draft could not be loaded."); } }
  function keepMine() { setExpected(latest); setMessage("Your edits are kept. Saving will replace the latest saved version."); }
  async function persist(e: FormEvent) {
    e.preventDefault(); if (changed) return; setBusy(true);
    try { reelDraft.array().min(1).max(10).parse(drafts); await onSave(JSON.stringify(drafts), expected); const next = afterOwnSave(expected); if (next) { setExpected(next); setMessage("Draft saved privately."); } else setMessage("Draft saved. Reload the latest draft before editing again."); }
    catch { setMessage("Could not save. Check the fields; if the draft changed elsewhere, use the choices above."); } finally { setBusy(false); }
  }
  return <form className="panel form-stack" onSubmit={persist}><h2>Review the draft</h2>{!!item.status && ["queued", "retrieving", "extracting", "failed"].includes(item.status) && <p role="status" className="muted">Processing is not finished or needs attention. Your saved draft and edits are kept.</p>}{changed && <div role="alert" className="form-stack"><p><b>This draft was changed by another save or retry.</b> Your edits on this screen are unchanged and cannot be saved until you choose.</p><div className="form-actions"><button type="button" className="button secondary" onClick={loadLatest}>Load the latest saved draft</button><button type="button" className="text-button" onClick={keepMine}>Keep my edits and replace the latest</button></div></div>}<p className="muted">Blank fields are unknown. Currency stays unknown unless the source states it. Times use America/Vancouver.</p>
    {drafts.map((draft, index) => <fieldset className="form-stack" key={index}><legend>Offer {index + 1}</legend>
      {(["restaurant", "address", "dealText", "currency", "validStart", "validEnd", "expiresOn"] as const).map(field => <label className="field" key={field}>{({ restaurant: "Restaurant", address: "Address", dealText: "Deal", currency: "Currency (e.g. CAD)", validStart: "Starts (HH:MM)", validEnd: "Ends (HH:MM)", expiresOn: "Expiry (YYYY-MM-DD)" })[field]}<input value={draft[field] ?? ""} onChange={e => edit(index, { [field]: e.target.value || null })} /></label>)}
      <label className="field">Price<input type="number" min="0" max="100000" step="0.01" value={draft.price ?? ""} onChange={e => edit(index, { price: e.target.value === "" ? null : Number(e.target.value) })} /></label>
      <label className="field">Days<select value={draft.validDays === null ? "unknown" : draft.validDays.length === 0 ? "every" : "selected"} onChange={e => edit(index, { validDays: e.target.value === "unknown" ? null : e.target.value === "every" ? [] : ["mon"] })}><option value="unknown">Unknown</option><option value="every">Every day (confirmed)</option><option value="selected">Selected days</option></select></label>
      {!!draft.validDays?.length && <div className="reel-days">{(["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map(day => <label key={day}><input type="checkbox" checked={draft.validDays!.includes(day)} onChange={e => edit(index, { validDays: e.target.checked ? [...draft.validDays!, day] : draft.validDays!.length > 1 ? draft.validDays!.filter(d => d !== day) : null })} />{day}</label>)}</div>}
      <label className="field">Conditions (one per line)<textarea value={draft.conditions?.join("\n") ?? ""} onChange={e => edit(index, { conditions: e.target.value.trim() ? e.target.value.split("\n").filter(Boolean) : null })} /></label><label><input type="checkbox" checked={draft.conditions?.length === 0} onChange={e => edit(index, { conditions: e.target.checked ? [] : null })} /> Confirm no conditions</label>
    </fieldset>)}<button className="button primary" disabled={busy || changed}>{busy ? "Saving…" : "Save draft"}</button><p role="status">{message}</p>
    {item.draftEdited && extracted && <details><summary>Model suggestion (not applied)</summary><p className="muted">This is the model’s separate suggestion. It never replaces your values.</p>{extracted.drafts.map((d, i) => <p key={i}><b>Offer {i + 1}</b>: {d.restaurant ?? "restaurant unknown"} · {d.dealText ?? "deal unknown"}{d.price !== null ? ` · ${d.price} ${d.currency ?? "currency unknown"}` : ""}</p>)}</details>}
    <details><summary>Source evidence</summary>{extracted && extracted.evidence.map((e, i) => <p key={i}><b>Offer {e.draftIndex + 1}, {e.field} · {e.channel}{e.timestampSeconds !== null ? ` at ${e.timestampSeconds}s` : ""}</b><br />{e.quote}</p>)}{extracted?.warnings.map((w, i) => <p key={i}>{w}</p>)}<h3>Caption</h3><p>{item.caption || "No caption"}</p><h3>Relevant audio transcript</h3><p>{extracted ? (extracted.transcript || "No intelligible offer speech") : "No extraction yet"}</p></details>
    <p className="muted">Edits leave the original extraction and evidence intact. This private draft is saved separately from the community feed.</p></form>;
}
