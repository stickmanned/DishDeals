"use client";

// Registers the share-target service worker (/sw.js) after the app has mounted (T-13B).
// Feature-detected and failure-tolerant: browsers or WebViews without service workers, insecure origins and
// failed registrations all simply render nothing and change nothing. It never blocks or blanks the app.
import { useEffect } from "react";
import { registerShareWorker } from "@/lib/androidShareInbox";

export function PwaShareRegistration() {
  useEffect(() => {
    void registerShareWorker(typeof navigator === "undefined" ? undefined : navigator);
  }, []);
  return null;
}
