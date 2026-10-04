"use client";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { draftFromDeal, emptyDraft, previewDeal } from "@/lib/frontend/draft";
import { demoDeals } from "@/lib/frontend/demoDeals";
import { prepareWorkflowImage } from "@/lib/frontend/image";
import { safeSourceUrl, type WorkflowSource } from "@/lib/frontend/workflow";
import { useFrontend } from "./FrontendProvider";
import { Gate, PreviewNote } from "./Shell";
import { Icon } from "./Icon";
import { DraftForm } from "./DraftForm";
import { JobPanel } from "./JobPanel";
import { Dialog } from "./Dialog";
export function Post({ editId, jobId }: { editId?: string; jobId?: string }) {
  const app = useFrontend();
  return (
    <>
    <div className="page-width"><Link href="/reels" className="back-link">Save an Instagram Reel privately</Link></div>
    <PostView
      key={`${app.mode}:${editId ?? "new"}`}
      editId={editId}
      jobId={jobId}
    />
    </>
  );
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
    sourceMode,
    setSourceMode,
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
  if (!app.authenticated)
    return (
      <div className="narrow-page">
        <Gate
          title="A good find is better shared."
          next={jobId ? `/post?job=${encodeURIComponent(jobId)}` : "/post"}
        />
      </div>
    );
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
    setError("");
    if (sourceMode === "image" && !app.sourceImage) {
      setError("Choose a screenshot or photo first.");
      return;
    }
    if (sourceMode === "text" && app.sourceText.trim().length < 10) {
      setError("Paste at least 10 characters of the offer text.");
      return;
    }
    if (app.sourceText.length > (sourceMode === "text" ? 30000 : 10000)) {
      setError(
        sourceMode === "text"
          ? "Keep the offer text under 30,000 characters."
          : "Keep the image caption under 10,000 characters.",
      );
      return;
    }
    if (sourceUrl && !safeSourceUrl(sourceUrl)) {
      setError(
        "Use a public HTTPS source link under 2,048 characters, without account details or a custom port.",
      );
      return;
    }
    if (app.mode === "preview") {
      setStep("review");
      return;
    }
    if (!app.live) {
      setError("Submissions aren’t available in this version yet.");
      return;
    }
    if (
      sourceMode === "image" &&
      !app.sourceImage.startsWith("data:image/jpeg;base64,")
    ) {
      setError("Choose your screenshot again before submitting it.");
      return;
    }
    const provenance = {
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(publishedAt ? { publishedAt } : {}),
    };
    const source: WorkflowSource =
      sourceMode === "text"
        ? { type: "text", text: app.sourceText.trim(), ...provenance }
        : {
            type: "image",
            mimeType: "image/jpeg",
            data: app.sourceImage.split(",")[1],
            ...(app.sourceText ? { caption: app.sourceText } : {}),
            ...provenance,
          };
    setBusy(true);
    try {
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
            : "A screenshot, a flyer, or the offer in your own words."}
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
          <div className="post-choices">
            <button
              className={`source-choice ${sourceMode === "image" ? "active" : ""}`}
              aria-pressed={sourceMode === "image"}
              onClick={() => setSourceMode("image")}
            >
              <Icon name="photo" /> Image
              <small>A screenshot, photo, or flyer</small>
            </button>
            <button
              className={`source-choice ${sourceMode === "text" ? "active" : ""}`}
              aria-pressed={sourceMode === "text"}
              onClick={() => setSourceMode("text")}
            >
              <Icon name="text" /> Offer text
              <small>Copy the words that matter</small>
            </button>
          </div>
          <form className="panel post-panel form-stack" onSubmit={submit}>
            <p className="step-label">01 / THE SOURCE</p>
            {sourceMode === "image" && (
              <>
                {app.sourceImage ? (
                  <>
                    <div className="attachment-preview">
                      <Image
                        src={app.sourceImage}
                        unoptimized
                        alt="Selected screenshot or flyer"
                        fill
                        sizes="600px"
                      />
                    </div>
                    <div className="attachment-tools">
                      <span>{filename || "Selected source image"}</span>
                      <button
                        type="button"
                        className="text-link"
                        onClick={() => {
                          app.setSourceImage("");
                          setFilename("");
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    className="upload-zone"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                  >
                    <Icon name="upload" size={32} />
                    <b>
                      {busy
                        ? "Preparing your image…"
                        : "Choose a screenshot or photo"}
                    </b>
                    <small>PNG, JPG, or WebP · up to 10 MB</small>
                  </button>
                )}
                <div className="inline-actions">
                  <button
                    className="text-link"
                    type="button"
                    onClick={() => fileRef.current?.click()}
                  >
                    Choose {app.sourceImage ? "another" : "a file"}
                  </button>
                  <button
                    className="text-link"
                    type="button"
                    onClick={() => cameraRef.current?.click()}
                  >
                    <Icon name="camera" size={16} /> Take a photo
                  </button>
                </div>
                <input
                  hidden
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => void choose(e.target.files?.[0])}
                />
                <input
                  hidden
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => void choose(e.target.files?.[0])}
                />
              </>
            )}
            <label className="field">
              {sourceMode === "text"
                ? "Offer text"
                : "Anything else in the post?"}
              <textarea
                value={app.sourceText}
                onChange={(e) => app.setSourceText(e.target.value)}
                maxLength={sourceMode === "text" ? 30000 : 10000}
                minLength={sourceMode === "text" ? 10 : undefined}
                required={sourceMode === "text"}
                placeholder={
                  sourceMode === "text"
                    ? "Paste the restaurant’s offer, including price, dates, and conditions."
                    : "Optional caption or details that help explain the offer."
                }
              />
              <small>
                {sourceMode === "text"
                  ? "10–30,000 characters. We use only the text you provide."
                  : "We never fetch Instagram links. Supply the image or copied offer text."}
              </small>
            </label>
            <details className="help-details">
              <summary>
                Original post date and source link{" "}
                <Icon name="arrow" size={14} />
              </summary>
              <div className="form-stack">
                <label className="field">
                  Original post date
                  <input
                    type="date"
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
                    Attribution only. We don’t read social media links.
                  </small>
                </label>
              </div>
            </details>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy
                ? "Preparing…"
                : app.mode === "preview"
                  ? "Review a local draft"
                  : "Submit source"}
              <Icon name="arrow" size={18} />
            </button>
            <p className="quiet-note">
              {app.mode === "preview"
                ? "Image extraction isn’t running in the preview. You’ll fill the draft yourself, or try the sample below."
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
          : "Screen recordings aren’t supported by this workflow yet."}
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
