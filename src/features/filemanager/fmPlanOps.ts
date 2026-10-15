/** API operations of operation plans, namespaced `plan/...` (see fmPlan.ts and fmPlanRun.ts). */
import type { FmHandler } from "./fmCore";
import { FmError } from "./fmPaths";
import { createPlan, findPlan, planStore, viewOf, type PlanRequest } from "./fmPlan";
import { applyPlan, undoPlan } from "./fmPlanRun";

export const planOperations: Record<string, FmHandler> = {
  /** Works out what would happen. Changes nothing. */
  async "plan/preview"(ctx, b) {
    if (!b.request || typeof b.request !== "object") throw new FmError("BAD_REQUEST", "Nothing to preview.");
    return { plan: await createPlan(ctx, b.request as PlanRequest) };
  },
  async "plan/get"(ctx, b) {
    return { plan: viewOf(findPlan(ctx, b.id)) };
  },
  /** Runs the plan through the job queue. Replacing or deleting needs `approved: true` (and `confirmPermanent: true` for deleting for good). */
  async "plan/apply"(ctx, b) {
    return await applyPlan(ctx, b.id, { approved: b.approved, confirmPermanent: b.confirmPermanent, exclude: b.exclude });
  },
  async "plan/undo"(ctx, b) {
    return await undoPlan(ctx, b.id);
  },
  async "plan/discard"(ctx, b) {
    const plan = findPlan(ctx, b.id);
    if (!plan.applied) planStore(ctx).delete(plan.id);
    return { discarded: !plan.applied };
  },
};
