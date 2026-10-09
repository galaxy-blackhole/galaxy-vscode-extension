import { useState, useSyncExternalStore } from "react";
import { dispatchUiAction } from "../host-bridge";
import { getUiState, subscribeUiState } from "../ui-store";
import { useT } from "../i18n";

type StepStatus = "completed" | "in_progress" | "pending" | "skipped";

/**
 * No status words: a finished step is struck through behind its tick, the step in flight is coloured and
 * carries the spinner, and everything else waits quietly.
 */

/**
 * The run's plan, as a list rather than a single status word: numbered steps, a grey dot while a step is still
 * a todo, a spinner on the one in flight, a green tick once it is done — and the whole thing folds away.
 */
export function PlanStrip() {
  const t = useT();
  const { plan, planMode } = useSyncExternalStore(subscribeUiState, getUiState);
  const [folded, setFolded] = useState(false);
  const steps = plan?.steps ?? [];
  /*
   * A one- or two-step plan is a sentence, not a checklist, and a framed strip for it costs more room than it
   * explains. Three steps is where a list starts to be worth the frame. Plan mode still shows, because the chip
   * in the strip is also how the owner turns it off.
   */
  if (steps.length < 3 && !planMode) return null;
  const done = steps.filter((step) => step.status === "completed").length;
  const open = !folded;
  return (
    <div className="plan-strip" aria-label={t("Kế hoạch của lượt chạy")}>
      <div className="plan-head">
        <button type="button" className="plan-toggle" aria-expanded={open} onClick={() => { setFolded((value) => !value); }}>
          {open ? "▾" : "▸"} {t("Kế hoạch")}
          {steps.length > 0 ? <span className="plan-count">{done}/{steps.length}</span> : null}
        </button>
        {planMode ? (
          <button
            type="button"
            className="plan-chip plan-chip-on"
            title={t("Duyệt kế hoạch và cho phép sửa workspace")}
            onClick={() => dispatchUiAction({ type: "plan/mode", on: false })}
          >
            {t("KẾ HOẠCH · duyệt")}
          </button>
        ) : null}
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
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}