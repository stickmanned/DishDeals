"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { profileHref, returnFromParams } from "@/lib/authReturn";

export default function SignInPage() {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <main>
        <h1>Sign in</h1>
        <p role="status">Convex is not configured: NEXT_PUBLIC_CONVEX_URL is unset.</p>
      </main>
    );
  }
  // useSearchParams needs a Suspense boundary so the rest of the route can still be prerendered.
  return (
    <Suspense fallback={<main><p role="status">Loading…</p></main>}>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  // Validated same-origin app route (or null); carried through /profile until the profile is ready.
  const next = returnFromParams(useSearchParams());
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn("password", new FormData(event.currentTarget));
      router.push(profileHref(next));
    } catch {
      setError(
        flow === "signIn"
          ? "Could not sign in. Check your email and password."
          : "Could not sign up. Use a valid email and a password of at least 8 characters.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>{flow === "signIn" ? "Sign in" : "Sign up"}</h1>
      <form onSubmit={onSubmit}>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            minLength={8}
            autoComplete={flow === "signIn" ? "current-password" : "new-password"}
            required
          />
        </label>
        <input name="flow" type="hidden" value={flow} />
        <button type="submit" disabled={busy}>
          {flow === "signIn" ? "Sign in" : "Sign up"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}
      >
        {flow === "signIn" ? "Need an account? Sign up" : "Have an account? Sign in"}
      </button>
    </main>
  );
}
