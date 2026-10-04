import { queryGeneric } from "convex/server";
import { v } from "convex/values";

// Table-free test query so T-01 does not depend on schema (T-02).
// Uses the generic API because `convex/_generated` only exists after
// `npx convex dev` has been run against a real deployment.
export const ping = queryGeneric({
  args: {},
  returns: v.object({ message: v.string() }),
  handler: async () => {
    return { message: "Hello from Convex" };
  },
});
