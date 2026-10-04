import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  // Canonical Password stays primary (web and native). Anonymous is restored additively for the published guest history
  // (N-REMOTE-B); it adds a provider only: same single convexAuth export, JWT and HTTP routes.
  providers: [Password, Anonymous],
});
