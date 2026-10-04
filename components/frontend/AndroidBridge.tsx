"use client";

import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { App } from "@capacitor/app";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { emptyDraft } from "@/lib/frontend/draft";
import { Dialog } from "./Dialog";
import { useFrontend } from "./FrontendProvider";

type IncomingText = { id: string; text: string };
const Inbox = registerPlugin<{
  peek(): Promise<Partial<IncomingText>>;
  dismiss(options: { id: string }): Promise<void>;
  addListener(event: "shareReceived", callback: () => void): Promise<PluginListenerHandle>;
}>("IncomingShare");

export function AndroidBridge() {
  const app = useFrontend();
  const router = useRouter();
  const [pending, setPending] = useState<IncomingText | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = !!(app.sourceText || app.sourceImage || app.sourceUrl || app.publishedAt || app.draft.restaurant);

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    let disposed = false;
    const handles: PluginListenerHandle[] = [];
    const keep = (handle: PluginListenerHandle) => {
      if (disposed) void handle.remove();
      else handles.push(handle);
    };
    const read = async () => {
      try {
        const share = await Inbox.peek();
        if (!disposed && typeof share.id === "string" && typeof share.text === "string") {
          setPending({ id: share.id, text: share.text.slice(0, 30000) });
        }
      } catch { if (!disposed) setError("We couldn’t open the shared text. Paste it into Share a deal."); }
    };
    void (async () => {
      try {
        keep(await Inbox.addListener("shareReceived", () => void read()));
        keep(await App.addListener("resume", () => void read()));
        keep(await App.addListener("backButton", ({ canGoBack }) => {
          const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
          if (dialog) dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
          else if (canGoBack) window.history.back();
          else if (window.location.pathname !== "/") router.replace("/");
          else void App.minimizeApp();
        }));
        await read();
      } catch { if (!disposed) setError("Sharing is unavailable. Paste the link into Share a deal."); }
    })();
    return () => { disposed = true; for (const handle of handles) void handle.remove(); };
  }, [router]);

  async function finish(useText: boolean) {
    if (!pending || busy) return;
    setBusy(true);
    setError("");
    try {
      // Acknowledge only after an explicit choice; importing never calls the backend.
      await Inbox.dismiss({ id: pending.id });
      if (useText) {
        app.setDraft(emptyDraft);
        app.setSourceText(pending.text);
        app.setSourceImage("");
        app.setSourceFilename("");
        app.setSourceUrl("");
        app.setPublishedAt("");
        app.setActiveJobId(null);
        router.push("/post/");
      }
      setPending(null);
    } catch { setError("We couldn’t open the shared text. Please try again."); }
    finally { setBusy(false); }
  }

  return <>
    {error && !pending && <p role="alert" className="form-error">{error}</p>}
    <Dialog open={!!pending} title="Open shared text?" onClose={() => { if (!busy) void finish(false); }}>
      <p className="muted">{dirty ? "This replaces your current source and unsaved offer details." : "Review this in Share a deal, then choose Find the offer."}</p>
      <p style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap", maxHeight: 180, overflow: "auto" }}>{pending?.text}</p>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="form-actions">
        <button className="button secondary" disabled={busy} onClick={() => void finish(false)}>{dirty ? "Keep current draft" : "Dismiss"}</button>
        <button className="button primary" disabled={busy} onClick={() => void finish(true)}>{dirty ? "Replace source" : "Use shared text"}</button>
      </div>
    </Dialog>
  </>;
}
