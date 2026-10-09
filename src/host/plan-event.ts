import type { GalaxyUiEvent } from "../ui-protocol";

/**
 * The core announces its plan as `{ type: "plan", plan, planMode }`, which is not the shape the webview
 * listens for. The host used to forward it untouched, so the checklist never moved however much the model
 * updated it. Rich `steps` win; the legacy buckets are the fallback.
 */
export function planEventForWebview(event: unknown): GalaxyUiEvent {
  const record = event as {
    plan?: {
      completed?: readonly string[];
      inProgress?: string | null;
      pending?: readonly string[];
      steps?: readonly { id?: string; status?: string; title?: string }[];
    };
    planMode?: boolean;
    type?: string;
  };
  if (record === null || typeof record !== "object" || record.type !== "plan") return event as GalaxyUiEvent;
  const plan = record.plan;
  const statuses = ["completed", "in_progress", "pending", "skipped"] as const;
  type Step = { id: string; status: (typeof statuses)[number]; title: string };
  const fromSteps: Step[] = (plan?.steps ?? []).map(step => {
    const status = statuses.find(candidate => candidate === step.status) ?? "pending";
    return {
      id: typeof step.id === "string" && step.id.length > 0 ? step.id : String(step.title ?? ""),
      status,
      title: String(step.title ?? ""),
    };
  });
  const fromBuckets: Step[] = [
    ...(plan?.completed ?? []).map((title): Step => ({ id: title, status: "completed", title })),
    ...(plan?.inProgress !== null && plan?.inProgress !== undefined && plan.inProgress.trim().length > 0 ? [{ id: plan.inProgress, status: "in_progress" as const, title: plan.inProgress }] : []),
    ...(plan?.pending ?? []).map((title): Step => ({ id: title, status: "pending", title })),
  ];
  const steps = fromSteps.length > 0 ? fromSteps : fromBuckets;
  return { kind: "plan/updated", mode: record.planMode === true, steps };
}
