import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
export const reelWorkflow = new WorkflowManager(components.workflow, { workpoolOptions: { maxParallelism: 2, retryActionsByDefault: false } });
export const process = reelWorkflow.define({ args: { itemId: v.id("reelItems"), generation: v.number() }, returns: v.null() })
  .handler(async (step, args): Promise<null> => {
    try {
      const available = await step.runAction(internal.reelActions.retrieve, args, { retry: false });
      if (available) await step.runAction(internal.reelActions.extract, args, { retry: false });
    } catch {
      await step.runMutation(internal.reels.fail, { ...args, code: "PROCESSING_FAILED", message: "Processing was interrupted. Retry when the service is available." });
    }
    return null;
  });
