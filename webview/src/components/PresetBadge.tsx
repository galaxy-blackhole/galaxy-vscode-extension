import { useSyncExternalStore } from "react";
import { getUiState, subscribeUiState } from "../ui-store";

/**
 * Which composition this session runs as.
 *
 * A setting nobody can see is how the strictest approval profile ended up hidden in code for months: the symptom
 * was visible, the cause was not. This shows the choice while it is in force, so it can be questioned.
 */
export function PresetBadge() {
  const { preset } = useSyncExternalStore(subscribeUiState, getUiState);
  if (preset === null) return null;
  return <span className="preset-badge" title={"Preset: " + preset.id}>{preset.label}</span>;
}
