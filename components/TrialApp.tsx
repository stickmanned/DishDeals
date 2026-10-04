"use client";
import { useEffect, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { ConvexError } from "convex/values";
import type { MapDeal, MapViewport } from "@restaurant-deals/map";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Outcome, WorkflowInput } from "@/lib/workflow/contracts";
import type { SearchResult } from "@/lib/workflow/search-contracts";
import type { ComparisonInput, ComparisonResult } from "@/lib/workflow/compare-contracts";
import { prepareTrialImage } from "@/lib/trial-image";

const DealMap = dynamic(() => import("@restaurant-deals/map").then(m => m.DealMap), {
  ssr: false, loading: () => <div className="map-loading">Loading map…</div>,
});
function errorMessage(error: unknown) {
  if (error instanceof ConvexError) {
    const data: unknown = error.data;
    if (typeof data === "string") return data;
    if (data && typeof data === "object" && "message" in data && typeof data.message === "string") return data.message;
  }
  return error instanceof Error && !error.message.includes("Server Error") ? error.message : "Request failed. Please try again.";
}
export function TrialApp() {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return <main><h1>DishDeals</h1><p>Set NEXT_PUBLIC_CONVEX_URL before building.</p></main>;
  return <ConnectedApp />;
}
function ConnectedApp() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const status = useQuery(api.trial.status);
  return <main><header><div><h1>DishDeals</h1><p>Find and compare Vancouver food offers.</p></div><span className="badge">{status ? "Live trial" : "Connecting…"}</span></header>
    {status && (!status.geminiConfigured || !status.geoapifyConfigured) && <p role="alert">Configure Gemini and Geoapify on the backend to extract offers.</p>}
    {isLoading ? <p>Checking session…</p> : isAuthenticated ? <Session /> : <SignIn />}
    <Dashboard key={isAuthenticated ? "signed-in" : "public"} authenticated={isAuthenticated} />
    <footer>Offers come from submitted sources. Confirm dates, conditions and availability with the restaurant. This trial uses a development backend.</footer></main>;
}
function Session() {
  const { signOut } = useAuthActions(); const [error, setError] = useState("");
  return <section className="session"><span>Signed in. Your submissions are saved to this session.</span><button onClick={() => { void signOut().catch(e => setError(errorMessage(e))); }}>Sign out</button>{error && <p role="alert">{error}</p>}</section>;
}
function SignIn() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState("signIn"), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function login(provider: string, data?: FormData) {
    setBusy(true); setError("");
    try { await signIn(provider, data); } catch { setError("Sign-in failed. Check your email and password, or try a guest session."); } finally { setBusy(false); }
  }
  return <section><h2>Try DishDeals</h2><p>Use a guest session to try the features. An email account lets you return to your submissions on another device.</p>
    <button className="primary" disabled={busy} onClick={() => { void login("anonymous"); }}>Continue as guest</button>
    <details><summary>Email account</summary><form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); data.set("flow", flow); void login("password", data); }}>
      <div className="row"><label>Email<input type="email" name="email" autoComplete="email" required /></label><label>Password<input type="password" name="password" minLength={8} autoComplete={flow === "signUp" ? "new-password" : "current-password"} required /></label></div>
      <button disabled={busy}>{flow === "signUp" ? "Create account" : "Sign in"}</button><button type="button" onClick={() => setFlow(flow === "signUp" ? "signIn" : "signUp")}>{flow === "signUp" ? "Use existing account" : "Create an account"}</button>
    </form></details>{error && <p role="alert">{error}</p>}</section>;
}
function Dashboard({ authenticated }: { authenticated: boolean }) {
  const [now, setNow] = useState(0);
  useEffect(() => { const tick = () => setNow(Date.now()); tick(); const timer = setInterval(tick, 60000); return () => clearInterval(timer); }, []);
  const offers = useQuery(api.workflow.deals.listForMap, now ? { limit: 100, now } : "skip");
  const find = useAction(api.workflow.search.find), compare = useAction(api.workflow.compare.find);
  const [selectedId, setSelectedId] = useState<string | null>(null), [selected, setSelected] = useState<string[]>([]);
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const [query, setQuery] = useState(""), [budget, setBudget] = useState("");
  const [language, setLanguage] = useState<"en" | "zh">("en"), [nearby, setNearby] = useState(false), [availableNow, setAvailableNow] = useState(false);
  const [priority, setPriority] = useState<ComparisonInput["priority"]>("value");
  const [evidence, setEvidence] = useState<Record<string, { quote: string; sourceUrl: string }>>({});
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null), [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [busy, setBusy] = useState(""), [error, setError] = useState("");
  const mapDeals: MapDeal[] = (offers ?? []).map(o => ({ id: o.dealId, restaurantName: o.restaurant.name, title: o.title,
    latitude: o.restaurant.latitude, longitude: o.restaurant.longitude, address: o.restaurant.address,
    price: o.currency ? o.price ?? undefined : undefined, currency: o.currency ?? undefined, discountPercent: o.discountPercent ?? undefined, sourceUrl: o.sourceUrl ?? undefined }));
  const filtered = mapDeals.filter(d => !budget || d.currency === "CAD" && d.price !== undefined && d.price <= Number(budget));
  async function search(focusDealId?: string) {
    setBusy("search"); setError(""); setSearchResult(null);
    try {
      if (nearby && !viewport) throw new Error("Wait for the map to load before searching nearby.");
      setSearchResult(await find({ inputJson: JSON.stringify({ query: query.trim() || "food offers", language, limit: focusDealId ? 1 : 5,
        ...(budget ? { maxPrice: Number(budget), currency: "CAD" } : {}), ...(availableNow ? { availableNow: true } : {}),
        ...(nearby && viewport ? { origin: { longitude: viewport.center[0], latitude: viewport.center[1] }, maxDistanceKm: 5 } : {}), ...(focusDealId ? { focusDealId } : {}) }) }));
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(""); }
  }
  async function compareSelected(e: FormEvent) {
    e.preventDefault(); setBusy("compare"); setError(""); setComparison(null);
    try { setComparison(await compare({ inputJson: JSON.stringify({ dealIds: selected, priority,
      tasteEvidence: selected.flatMap(dealId => evidence[dealId]?.quote ? [{ dealId, ...evidence[dealId] }] : []) }) })); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(""); }
  }
  function toggle(id: string) { setComparison(null); setSelected(current => current.includes(id) ? current.filter(v => v !== id) : current.length < 5 ? [...current, id] : current); }
  return <><section><h2>Find an offer</h2><form onSubmit={e => { e.preventDefault(); void search(); }}>
    <label>What would you like?<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Sushi under CAD 15 / 15加元以内的寿司" maxLength={1000} /></label>
    <div className="row"><label>Maximum listed price (CAD)<input type="number" min="0" max="100000" value={budget} onChange={e => setBudget(e.target.value)} placeholder="Any" /></label>
      <label>Result language<select value={language} onChange={e => setLanguage(e.target.value as "en" | "zh")}><option value="en">English</option><option value="zh">中文</option></select></label></div>
    <label className="check"><input type="checkbox" checked={nearby} onChange={e => setNearby(e.target.checked)} />Within 5 km of the map center</label>
    <label className="check"><input type="checkbox" checked={availableNow} onChange={e => setAvailableNow(e.target.checked)} />Offer schedule matches now</label>
    <button className="primary" disabled={!authenticated || !!busy}>{busy === "search" ? "Searching…" : "Search offers"}</button>
    {!authenticated && <small>Sign in or continue as guest to use search, comparison and submissions.</small>}</form>
    {error && <p role="alert">{error}</p>}
    {searchResult && <div className="results"><p>{searchResult.message} <span className="badge">{searchResult.mode === "gemini" ? "Gemini assisted" : "Basic search"}</span></p>
      {searchResult.warnings.map(w => <p key={w}>{w}</p>)}{searchResult.recommendations.map(r => <article key={r.dealId}><h3>{r.restaurant.name}</h3><p>{r.pitch}</p>
        <ul>{r.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul><a href={r.cta.url} target="_blank" rel="noreferrer">{r.cta.label}</a>
        {r.sourceUrl && <a href={r.sourceUrl} target="_blank" rel="noreferrer">Offer source</a>}
        <button onClick={() => toggle(r.dealId)}>{selected.includes(r.dealId) ? "Remove from comparison" : "Add to comparison"}</button></article>)}</div>}
  </section>
  <section><h2>Deal map <span className="badge">{filtered.length} offers</span></h2>
    <DealMap deals={filtered} selectedId={selectedId} onSelect={d => setSelectedId(d.id)} onViewportChange={setViewport} initialCenter={[-123.1207, 49.2827]} initialZoom={12} showLocateControl={false} style={{ height: 380 }} />
    {offers === undefined ? <p>Loading offers…</p> : !offers.length ? <p>No offers have been published yet. Submit a screenshot or caption below; any uncertain result needs your review.</p> : !filtered.length && <p>No offers match this CAD price limit.</p>}
    <div className="cards">{filtered.map(d => <article key={d.id} className={selectedId === d.id ? "chosen" : ""}>
      <button className="link" onClick={() => setSelectedId(d.id)}><h3>{d.restaurantName}</h3></button><p>{d.title}</p><p>{d.price === undefined ? "Price not recorded" : `${d.currency ?? "Currency unknown"} ${d.price}`}{d.discountPercent !== undefined ? ` · ${d.discountPercent}% off` : ""}</p><small>{d.address}</small>
      <label className="check"><input type="checkbox" checked={selected.includes(d.id)} disabled={!selected.includes(d.id) && selected.length >= 5} onChange={() => toggle(d.id)} />Compare this offer</label>
      <button disabled={!authenticated || !!busy} onClick={() => { void search(d.id); }}>Why consider this restaurant?</button>
      {d.sourceUrl && <a href={d.sourceUrl} target="_blank" rel="noreferrer">Offer source</a>}</article>)}</div>
  </section>
  <section><h2>Compare restaurants</h2><p>Select 2–5 offers from different restaurants.</p><form onSubmit={e => { void compareSelected(e); }}>
    <label>Priority<select value={priority} onChange={e => setPriority(e.target.value as ComparisonInput["priority"])}><option value="value">Value</option><option value="price">Listed price</option><option value="taste">Taste evidence</option></select></label><p>{selected.length} selected</p>
    {selected.map(id => <div key={id} className="review"><strong>{mapDeals.find(d => d.id === id)?.restaurantName ?? searchResult?.recommendations.find(d => d.dealId === id)?.restaurant.name ?? "Selected offer"}</strong><button type="button" onClick={() => toggle(id)}>Remove</button>
      {priority === "taste" && <><label>Review excerpt (optional)<textarea minLength={10} maxLength={500} value={evidence[id]?.quote ?? ""} onChange={e => setEvidence(current => ({ ...current, [id]: { sourceUrl: current[id]?.sourceUrl ?? "", quote: e.target.value } }))} /></label>
        <label>Review source URL<input type="url" required={!!evidence[id]?.quote} value={evidence[id]?.sourceUrl ?? ""} placeholder="https://…" onChange={e => setEvidence(current => ({ ...current, [id]: { quote: current[id]?.quote ?? "", sourceUrl: e.target.value } }))} /></label></>}
    </div>)}{priority === "taste" && <p>Paste review excerpts with their source URLs. The app does not fetch or independently verify these reviews.</p>}
    <button className="primary" disabled={!authenticated || !!busy || selected.length < 2}>{busy === "compare" ? "Comparing…" : "Compare selected offers"}</button></form>
    {comparison && <div className="results"><p>{comparison.message} <span className="badge">{comparison.mode === "gemini" ? "Gemini assisted" : "Recorded evidence"}</span></p>
      {comparison.recommendation && <article><h3>{comparison.recommendation.label}</h3><ul>{comparison.recommendation.reasons.map(r => <li key={r.id}>{r.text}</li>)}</ul></article>}
      <div className="cards">{comparison.restaurants.map(r => <article key={r.dealId}><h3>{r.restaurant.name}</h3><p>{r.deal.title}</p><ul>{r.facts.map(f => <li key={f.id}>{f.text}{f.sourceUrl && <> <a href={f.sourceUrl} target="_blank" rel="noreferrer">Source</a></>}</li>)}</ul>{r.caveats.map((c, i) => <p key={i}><small>{c}</small></p>)}</article>)}</div>{comparison.warnings.map(w => <p key={w}>{w}</p>)}</div>}
  </section>{authenticated && <Submissions />}</>;
}
function Submissions() {
  const submit = useMutation(api.workflow.jobs.submit), jobs = useQuery(api.workflow.jobs.listMine);
  const [jobId, setJobId] = useState<Id<"workflowJobs"> | null>(null), [type, setType] = useState<"text" | "url" | "image">("text");
  const [text, setText] = useState(""), [url, setUrl] = useState(""), [sourceUrl, setSourceUrl] = useState(""), [publishedAt, setPublishedAt] = useState("");
  const [city, setCity] = useState("Vancouver"), [file, setFile] = useState<File | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function send(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const provenance = { ...(publishedAt ? { publishedAt } : {}), ...(sourceUrl ? { sourceUrl } : {}) };
      const source: WorkflowInput["source"] = type === "image" ? { type, ...(await prepareTrialImage(file!)), caption: text, ...provenance } : type === "url" ? { type, url, ...provenance } : { type, text, ...provenance };
      const result = await submit({ inputJson: JSON.stringify({ source, context: { city, region: "British Columbia", countryCode: "ca", timezone: "America/Vancouver" } }) }); setJobId(result.jobId);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <section><h2>Submit an offer</h2><p>Upload an Instagram screenshot or paste the caption. Public restaurant webpages can also be read. Processing may take a minute.</p><form onSubmit={e => { void send(e); }}>
    <label>Source<select value={type} onChange={e => setType(e.target.value as typeof type)}><option value="text">Pasted text</option><option value="image">Screenshot / flyer photo</option><option value="url">Public restaurant webpage</option></select></label>
    {type === "url" ? <label>Webpage URL<input type="url" required value={url} onChange={e => setUrl(e.target.value)} placeholder="https://restaurant.example/offers" /></label> : <label>{type === "image" ? "Caption (optional)" : "Offer text"}<textarea required={type === "text"} minLength={type === "text" ? 10 : undefined} maxLength={type === "text" ? 30000 : 10000} value={text} onChange={e => setText(e.target.value)} rows={4} /></label>}
    {type === "image" && <label>Image<input type="file" accept="image/*" required onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>}
    <div className="row"><label>City hint<input required maxLength={100} value={city} onChange={e => setCity(e.target.value)} /></label><label>Original publication date (optional)<input type="date" value={publishedAt} onChange={e => setPublishedAt(e.target.value)} /></label></div>
    <label>Source link for attribution (optional)<input type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://…" /></label><button className="primary" disabled={busy}>{busy ? "Submitting…" : "Extract offer"}</button>
  </form>{error && <p role="alert">{error}</p>}<h3>Your recent submissions</h3><div className="row">{jobs?.map(j => <button key={j.jobId} onClick={() => setJobId(j.jobId)} aria-pressed={jobId === j.jobId}>{new Date(j.createdAt).toLocaleString()} · {j.status}</button>)}</div>{jobId && <Job key={jobId} id={jobId} />}</section>;
}
function Job({ id }: { id: Id<"workflowJobs"> }) {
  const job = useQuery(api.workflow.jobs.get, { jobId: id }), retry = useMutation(api.workflow.jobs.retryJob), review = useMutation(api.workflow.deals.reviewDeal);
  const [choices, setChoices] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function act(callback: () => Promise<unknown>) { setBusy(true); setError(""); try { await callback(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  if (job === undefined) return <p>Loading submission…</p>;
  if (job === null) return <p>Submission unavailable in this session.</p>;
  const deals = job.deals as (Omit<Outcome, "status"> & { dealId: Id<"workflowDeals">; status: string })[];
  return <div className="results"><h3>Submission: {job.status}</h3>{(job.status === "queued" || job.status === "processing") && <p>Reading the source and matching the restaurant. This page updates automatically.</p>}
    {job.error && <p role="alert">{job.error.message ?? "Processing failed. Try again."}</p>}{job.result?.rejectionReason && <p>{job.result.rejectionReason}</p>}
    {(job.status === "failed" || job.status === "completed" && !deals.some(d => d.status === "published" || d.status === "rejected")) && <button disabled={busy} onClick={() => { void act(() => retry({ jobId: id })); }}>Retry extraction</button>}
    {deals.map(o => <article key={o.dealId}><h3>{o.deal.restaurantName} · {o.deal.title}</h3><p>{o.deal.description}</p><p>State: {o.status}</p>
      <p>Recorded price: {o.deal.price === null ? "Unknown" : `${o.deal.currency ?? "Unknown currency"} ${o.deal.price}`}</p>
      <p>Schedule: {o.deal.days.join(", ") || "Days unspecified"} · {o.deal.startTime ?? "?"}–{o.deal.endTime ?? "?"}</p><p>End date: {o.deal.endDate ?? "Unspecified"}</p><blockquote>{o.deal.evidence}</blockquote>
      <ul>{[...o.reviewReasons, ...o.deal.conditions].map((r, i) => <li key={i}>{r}</li>)}</ul>
      {o.status === "needs_review" && <><label>Confirm a verified restaurant<select value={choices[o.dealId] ?? o.restaurant?.placeId ?? ""} onChange={e => setChoices(current => ({ ...current, [o.dealId]: e.target.value }))}>
        <option value="">Choose the correct branch</option>{o.candidates.map(p => <option value={p.placeId} key={p.placeId}>{p.name} · {p.address}</option>)}</select></label>
        <p>Confirm the offer, dates and branch against your source before publishing. If the correct branch is missing, retry with a clearer caption.</p>
        <button className="primary" disabled={busy || !(choices[o.dealId] ?? o.restaurant?.placeId)} onClick={() => { void act(() => review({ dealId: o.dealId, decision: "approve", placeId: choices[o.dealId] ?? o.restaurant?.placeId })); }}>Confirm and publish</button>
        <button disabled={busy} onClick={() => { void act(() => review({ dealId: o.dealId, decision: "reject" })); }}>Reject</button></>}
    </article>)}{error && <p role="alert">{error}</p>}</div>;
}
