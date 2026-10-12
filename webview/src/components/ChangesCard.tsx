import { useSyncExternalStore } from "react";
import { dispatchUiAction } from "../host-bridge";
import { getUiState, subscribeUiState } from "../ui-store";
import { useT } from "../i18n";

/**
 * What the run changed, read from Git. Every path is a button: the editor's own diff is one click away, which is
 * the thing a web panel cannot give — a real side-by-side diff with the history behind it.
 */
export function ChangesCard() {
  const { changes } = useSyncExternalStore(subscribeUiState, getUiState);
  const t = useT();
  if (changes.length === 0) return null;
  const added = changes.reduce((sum, file) => sum + file.added, 0);
  const removed = changes.reduce((sum, file) => sum + file.removed, 0);
  return (
    <section className="changes-card" aria-label={t("Tệp đã sửa")}>
      <header className="changes-head">
        <span className="changes-title">{t("Đã sửa") + " " + changes.length + " " + t("tệp")}</span>
        <span className="changes-totals">
          <span className="changes-add">{"+" + added}</span>
          <span className="changes-del">{"−" + removed}</span>
        </span>
      </header>
      <ul className="changes-list">
        {changes.map((file) => (
          <li key={file.path}>
            <button type="button" className="changes-row" onClick={() => { dispatchUiAction({ type: "changes/openDiff", path: file.path }); }}>
              <span className="changes-path">{file.path}</span>
              <span className="changes-add">{"+" + file.added}</span>
              <span className="changes-del">{"−" + file.removed}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
