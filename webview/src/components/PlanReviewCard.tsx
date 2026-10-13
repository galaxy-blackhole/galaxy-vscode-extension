import { useState, useSyncExternalStore } from "react";
import { dispatchUiAction } from "../host-bridge";
import { getUiState, subscribeUiState } from "../ui-store";
import { DshButton } from "./DshButton";
import { useT } from "../i18n";

/**
 * The plan, asking to become work.
 *
 * Plan mode is only half a feature without this: a plan that runs itself is not plan mode, and a plan nobody
 * approves is a plan that never becomes work. The reference calls it a user-reviewed exit, and this is it — the
 * owner reads the steps and decides whether work may start.
 */
export function PlanReviewCard() {
  const { planReview } = useSyncExternalStore(subscribeUiState, getUiState);
  const [answered, setAnswered] = useState(false);
  const t = useT();
  if (planReview === null || answered) return null;
  const answer = (on: boolean) => {
    setAnswered(true);
    dispatchUiAction({ type: "plan/mode", on });
  };
  return (
    <section className="plan-review" aria-label={t("Duyệt kế hoạch")}>
      <div className="plan-review-head">
        <span className="plan-review-title">{t("Kế hoạch đã sẵn sàng")}</span>
        <span className="plan-review-count">{planReview.length + " " + t("bước")}</span>
      </div>
      {planReview.length === 0 ? null : (
        <ol className="plan-review-steps">
          {planReview.map((step, index) => (
            <li key={String(index)}>{step}</li>
          ))}
        </ol>
      )}
      <div className="plan-review-actions">
        <DshButton variant="primary" onClick={() => { answer(false); }}>{t("Duyệt và bắt đầu")}</DshButton>
        <DshButton variant="ghost" onClick={() => { answer(true); }}>{t("Giữ kế hoạch")}</DshButton>
      </div>
    </section>
  );
}
