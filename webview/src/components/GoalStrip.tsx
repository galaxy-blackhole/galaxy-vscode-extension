import { useSyncExternalStore } from "react";
import { getUiState, subscribeUiState } from "../ui-store";

/**
 * What the session is for.
 *
 * A goal kept only in the model's context is a goal the person cannot see, and a person who cannot see the goal
 * cannot correct it early — which is the only moment correcting it is cheap. One line, always in view.
 */
export function GoalStrip() {
  const { goal } = useSyncExternalStore(subscribeUiState, getUiState);
  if (goal === null || goal.length === 0) return null;
  return <div className="goal-strip" title={goal}><span className="goal-strip-label">Mục tiêu</span><span className="goal-strip-text">{goal}</span></div>;
}
