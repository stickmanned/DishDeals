"use client";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { draftFromDeal, emptyDraft, previewDeal } from "@/lib/frontend/draft";
import { demoDeals } from "@/lib/frontend/demoDeals";
import { prepareWorkflowImage } from "@/lib/frontend/image";
import { type WorkflowSource } from "@/lib/frontend/workflow";
import { buildSharedSource } from "@/lib/frontend/share-source";
import { useFrontend } from "./FrontendProvider";
import { PreviewNote } from "./Shell";
import { Icon } from "./Icon";
import { DraftForm } from "./DraftForm";
import { JobPanel } from "./JobPanel";
import { Dialog } from "./Dialog";
export function Post({ editId, jobId }: { editId?: string; jobId?: string }) {
  const app = useFrontend();
  return <PostView key={`${app.mode}:${editId ?? "new"}`} editId={editId} jobId={jobId} />;
}
function PostView({ editId, jobId }: { editId?: string; jobId?: string }) {
  const app = useFrontend();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const currentJobId = app.mode === "live" ? (jobId ?? app.activeJobId) : null;
  const ownDeal =
    app.mode === "preview"
      ? app.previewPosts.find((d) => d.id === editId)
      : undefined;
  const [step, setStep] = useState<"source" | "review" | "done">(
      ownDeal || app.draft.restaurant ? "review" : "source",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [savedId, setSavedId] = useState(""),
    [discardOpen, setDiscardOpen] = useState(false),
    [duplicate, setDuplicate] = useState(false);
  const {
    sourceUrl,
    setSourceUrl,
    publishedAt,
    setPublishedAt,
    sourceFilename: filename,
    setSourceFilename: setFilename,
  } = app;
  const editDraft = ownDeal
    ? (app.editDrafts[ownDeal.id] ?? draftFromDeal(ownDeal))
    : emptyDraft;
  const setEditDraft = (draft: typeof emptyDraft) =>
    ownDeal && app.setEditDraft(ownDeal.id, draft);
  const dirty = ownDeal
    ? !!app.editDrafts[ownDeal.id]
    : !!app.sourceText ||
      !!app.sourceImage ||
      !!app.draft.restaurant ||
      !!sourceUrl ||
      !!publishedAt;
  useEffect(() => {
    if (!dirty || step === "done") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, step]);
  if (editId && !ownDeal)
    return (
      <div className="narrow-page">
        <div className="panel empty-state">
          <h1 style={{ fontSize: 28 }}>This preview can’t be edited.</h1>
          <p>You can edit only drafts you created in this tab.</p>
          <Link className="button secondary" href="/profile">
            Back to your profile
          </Link>
        </div>
      </div>
    );
  const clear = () => {
    if (ownDeal) {
      app.setEditDraft(ownDeal.id, null);
      setError("");
      return;
    }
    app.setDraft(emptyDraft);
    app.setSourceImage("");
    app.setSourceText("");
    setFilename("");
    setSourceUrl("");
    setPublishedAt("");
    setError("");
  };
  async function choose(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      app.setSourceImage(await prepareWorkflowImage(file));
      setFilename(file.name);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "We couldn’t prepare this image.",
      );
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || (app.mode === "live" && app.live?.authLoading)) return;
    setError("");
    let source: WorkflowSource;
    try {
      source = buildSharedSource({ text: app.sourceText, image: app.sourceImage, sourceUrl, publishedAt });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add a link, some details, or an optional image.");
      return;
    }
    if (app.mode === "preview") {
      if (!app.authenticated) app.signInPreview();
      setStep("review");
      return;
    }
    if (!app.live) { setError("Sharing is temporarily unavailable. Please try again."); return; }
    setBusy(true);
    try {
      if (!app.authenticated) {
        if (!app.auth?.signInGuest) throw new Error("A guest session could not be started.");
        await app.auth.signInGuest();
      }
      const result = await app.live.submit(source);
      app.setActiveJobId(result.jobId);
      router.replace(`/post?job=${encodeURIComponent(result.jobId)}`);
      setDuplicate(result.duplicate);
    } catch {
      setError(
        "We couldn’t submit this source. Check your connection, session, and the submission limit before trying again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function finish() {
    const id = ownDeal?.id ?? `preview-${crypto.randomUUID()}`;
    const draft = ownDeal ? editDraft : app.draft;
    const deal = previewDeal(
      draft,
      id,
      app.profile.displayName || "Preview member",
      ownDeal ? ownDeal.imageUrl : app.sourceImage,
    );
    if (ownDeal) app.updatePreviewPost(deal);
    else app.addPreviewPost(deal);
    setSavedId(id);
    setStep("done");
    clear();
  }
  if (step === "done")
    return (
      <div className="narrow-page">
        <div className="panel success-page">
          <div className="illustration-icon">
            <Icon name="check" size={32} />
          </div>
          <p className="eyebrow">PREVIEW COMPLETE</p>
          <h1>Your draft looks good.</h1>
          <p>It’s saved in this tab’s preview. No live post was created.</p>
          <Link href={`/deal?id=${savedId}`} className="button primary">
            View the preview <Icon name="arrow" size={18} />
          </Link>
          <Link href="/" className="button secondary">
            Back to Discover
          </Link>
          <button
            className="text-link"
            onClick={() => (ownDeal ? router.push("/post") : setStep("source"))}
          >
            Try another find
          </button>
        </div>
      </div>
    );
  return (
    <div className="narrow-page">
      <Link href="/" className="back-link">
        <Icon name="back" size={16} /> Back to Discover
      </Link>
      <PreviewNote short />
      <div className="page-heading">
        <p className="eyebrow">PASS SOMETHING GOOD ON</p>
        <h1>{step === "review" ? "Check your find." : "What did you find?"}</h1>
        <p>
          {step === "review"
            ? "The restaurant, the offer, the fine print. Make it useful."
            : "Paste a link or tell us what you found. An image is optional."}
        </p>
      </div>
      {app.mode === "live" && currentJobId && app.live ? (
        <JobPanel
          jobId={currentJobId}
          duplicate={duplicate}
          onNew={() => {
            app.setActiveJobId(null);
            router.replace("/post");
            setDuplicate(false);
          }}
        />
      ) : step === "review" ? (
        <div className="panel">
          <DraftForm
            value={ownDeal ? editDraft : app.draft}
            onChange={ownDeal ? setEditDraft : app.setDraft}
            editing={!!ownDeal}
            onSave={finish}
            onBack={() =>
              ownDeal ? router.push(`/deal?id=${ownDeal.id}`) : setStep("source")
            }
          />
        </div>
      ) : (
        <>
          <form className="panel post-panel form-stack" onSubmit={submit}>
            <p className="step-label">01 / THE SOURCE</p>
            <label className="field">
              Link or details
              <textarea value={app.sourceText} onChange={(e) => app.setSourceText(e.target.value)}
                maxLength={30000} rows={4}
                placeholder="Paste an Instagram share, a restaurant link, or the offer in your own words." />
              <small>Public links, copied captions, menus and flyers all work. No image required.</small>
            </label>
            {app.sourceImage && <>
              <div className="attachment-preview">
                <Image src={app.sourceImage} unoptimized alt="Optional source image" fill sizes="600px" />
              </div>
              <div className="attachment-tools"><span>{filename || "Selected image"}</span>
                <button type="button" className="text-link" onClick={() => { app.setSourceImage(""); setFilename(""); }}>Remove image</button>
              </div>
            </>}
            <div className="inline-actions">
              <button type="button" className="button outline" onClick={() => fileRef.current?.click()} disabled={busy}>
                <Icon name="photo" size={18} /> {busy ? "Preparing image…" : app.sourceImage ? "Change image" : "Add image (optional)"}
              </button>
              <button type="button" className="text-link" onClick={() => cameraRef.current?.click()} disabled={busy}>
                <Icon name="camera" size={16} /> Take a photo
              </button>
            </div>
            <input hidden ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void choose(e.target.files?.[0])} />
            <input hidden ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={(e) => void choose(e.target.files?.[0])} />
            <details className="help-details">
              <summary>
                More details (optional){" "}
                <Icon name="arrow" size={14} />
              </summary>
              <div className="form-stack">
                <label className="field">
                  Original post date
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="YYYY-MM-DD"
                    pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
                    maxLength={10}
                    value={publishedAt}
                    onChange={(e) => setPublishedAt(e.target.value)}
                    onInput={(e) => setPublishedAt(e.currentTarget.value)}
                  />
                  <small>
                    Leave blank if unknown. This is the original date, not
                    today’s share date.
                  </small>
                </label>
                <label className="field">
                  Source link
                  <input
                    type="url"
                    placeholder="https://…"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                  />
                  <small>
                    Optional attribution if the link is not already in your details.
                  </small>
                </label>
              </div>
            </details>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy || (app.mode === "live" && !!app.live?.authLoading)}>
              {busy
                ? "Preparing…"
                : app.mode === "preview"
                  ? "Review a local draft"
                  : "Find the offer"}
              <Icon name="arrow" size={18} />
            </button>
            <p className="quiet-note">
              {app.mode === "preview"
                ? "Automatic extraction isn’t running in the preview. You’ll fill the draft yourself, or try the sample below."
                : "Verified offers may publish automatically. Other offers need your review. Closing this page doesn’t cancel processing."}
            </p>
            {app.mode === "preview" && (
              <button
                type="button"
                className="button secondary full"
                onClick={() => {
                  app.setDraft(draftFromDeal(demoDeals[0]));
                  app.setSourceImage(demoDeals[0].imageUrl ?? "");
                  setStep("review");
                }}
              >
                Try a sample offer <Icon name="arrow" size={18} />
              </button>
            )}
          </form>
        </>
      )}
      <p className="local-draft">
        {dirty
          ? "Your draft stays in this tab as you browse."
          : "Instagram posts that require login may need their caption or an optional image."}
      </p>
      {dirty && (
        <button
          className="text-link"
          style={{ marginTop: 12 }}
          onClick={() => setDiscardOpen(true)}
        >
          Discard draft
        </button>
      )}
      <Dialog
        title="Discard your draft?"
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
      >
        <p className="muted">
          {ownDeal
            ? "Your unsaved edits will be cleared. The saved preview stays in place."
            : "The source and edited details will be cleared from this tab."}
        </p>
        <div className="form-actions">
          <button
            className="button secondary"
            onClick={() => setDiscardOpen(false)}
          >
            Keep editing
          </button>
          <button
            className="button danger"
            onClick={() => {
              clear();
              setStep(ownDeal ? "review" : "source");
              setDiscardOpen(false);
            }}
          >
            Discard draft
          </button>
        </div>
      </Dialog>
    </div>
  );
}
