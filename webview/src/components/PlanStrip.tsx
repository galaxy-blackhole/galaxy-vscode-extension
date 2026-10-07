import { useState, useSyncExternalStore } from "react";
import { dispatchUiAction } from "../host-bridge";
import { getUiState, subscribeUiState } from "../ui-store";
import { useT } from "../i18n";

type StepStatus = "completed" | "in_progress" | "pending" | "skipped";

const STATE_LABELS: Readonly<Record<StepStatus, string>> = Object.freeze({
  completed: "Xong",
  in_progress: "Đang làm",
  pending: "Chờ",
  skipped: "Bỏ qua",
});

/**
 * The run's plan, as a list rather than a single status word: numbered steps, a grey dot while a step is still
 * a todo, a spinner on the one in flight, a green tick once it is done — and the whole thing folds away.
 */
export function PlanStrip() {
  const t = useT();
  const { plan, planMode } = useSyncExternalStore(subscribeUiState, getUiState);
  const [folded, setFolded] = useState(false);
  const steps = plan?.steps ?? [];
  if (steps.length === 0 && !planMode) return null;
  const done = steps.filter((step) => step.status === "completed").length;
  const open = !folded;
  return (
    <div className="plan-strip" aria-label={t("Kế hoạch của lượt chạy")}>
      <div className="plan-head">
        <button type="button" className="plan-toggle" aria-expanded={open} onClick={() => { setFolded((value) => !value); }}>
          {open ? "▾" : "▸"} {t("Kế hoạch")}
          {steps.length > 0 ? <span className="plan-count">{done}/{steps.length}</span> : null}
        </button>
        <button
          type="button"
          className={"plan-chip" + (planMode ? " plan-chip-on" : "")}
          title={t("Duyệt kế hoạch và cho phép sửa workspace")}
          onClick={() => dispatchUiAction({ type: "plan/mode", on: !planMode })}
        >
          {planMode ? t("KẾ HOẠCH · duyệt") : t("Lập kế hoạch")}
        </button>
      </div>
      {open && steps.length > 0 ? (
        <ol className="plan-list">
          {steps.map((step, index) => (
            <li key={step.id} className={"plan-item plan-" + step.status}>
              <span className="plan-index">{index + 1}.</span>
              <span className="plan-badge" aria-hidden="true">
                {step.status === "in_progress" ? <span className="plan-spinner" /> : null}
                {step.status === "completed" ? "✓" : step.status === "skipped" ? "⊘" : step.status === "pending" ? "•" : null}
              </span>
              <span className="plan-title">{step.title}</span>
              <span className={"plan-state plan-state-" + step.status}>{t(STATE_LABELS[step.status])}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}