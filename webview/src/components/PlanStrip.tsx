import { useSyncExternalStore } from "react";
import { dispatchUiAction } from "../host-bridge";
import { getUiState, subscribeUiState } from "../ui-store";
import { useT } from "../i18n";

/** Marks match the TUI strip so the same plan reads the same on both surfaces. */
const MARKS: Readonly<Record<"completed" | "in_progress" | "pending" | "skipped", string>> = Object.freeze({
  completed: "☑",
  in_progress: "◐",
  pending: "☐",
  skipped: "⊘",
});

/**
 * The permanent plan strip above the composer: what the run is doing and what is left.
 * It hides itself when the run has no plan, and doubles as the plan-mode control.
 */
export function PlanStrip() {
  const t = useT();
  const { plan, planMode } = useSyncExternalStore(subscribeUiState, getUiState);
  const steps = plan?.steps ?? [];
  if (steps.length === 0 && !planMode) return null;
  const active = steps.filter((step) => step.status !== "completed");
  const done = steps.filter((step) => step.status === "completed");
  const visible = [...active, ...done].slice(0, 6);
  return (
    <div className="plan-strip" aria-label={t("Kế hoạch của lượt chạy")}>
      <div className="plan-steps">
        {visible.map((step) => (
          <span key={step.id} className={"plan-step" + (step.status === "in_progress" ? " plan-step-active" : "")}>
            {MARKS[step.status]} {step.title}
          </span>
        ))}
        {steps.length > visible.length && <span className="plan-step plan-step-muted">… {steps.length - visible.length} bước đã xong</span>}
      </div>
      <button
        type="button"
        className={"plan-chip" + (planMode ? " plan-chip-on" : "")}
        title={planMode ? "Duyệt kế hoạch và cho phép sửa workspace" : "Bật chế độ kế hoạch chỉ-đọc"}
        onClick={() => dispatchUiAction({ type: "plan/mode", on: !planMode })}
      >
        {planMode ? "KẾ HOẠCH · duyệt" : "Lập kế hoạch"}
      </button>
    </div>
  );
}
