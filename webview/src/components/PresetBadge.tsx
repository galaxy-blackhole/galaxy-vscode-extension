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
  /*
   * The tooltip explains the name rather than repeating it: "Chương trình" is the preset that sends one program
   * per turn instead of one call per step, and a badge nobody can decode is a badge nobody trusts.
   */
  return <span className="preset-badge" title={preset.id + " — " + preset.help}>{preset.label}</span>;
}
