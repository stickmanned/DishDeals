import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";
export async function requireOwner(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Sign in before submitting or reviewing deals. Server integrations can use the HTTP API.");
  return identity.tokenIdentifier;
}
