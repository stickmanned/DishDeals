import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";
export async function requireOwner(ctx: Pick<QueryCtx, "auth">) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Sign in before submitting or reviewing deals. Server integrations can use the HTTP API.");
  // Convex Auth subjects are userId|sessionId. Ownership must survive a new
  // login or a second device; tokenIdentifier would bind data to one session.
  return identity.subject.split("|")[0];
}
