/**
 * The settings tab. Opened in an editor tab (the header's gear), mirroring the web GUI's three sections:
 * Chung, Model and Thông tin.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { MODE_OPTIONS } from "./components/Composer";
import { ModelSetup } from "./components/ModelSetup";
import { announceReady, currentHostInfo, setPermissionMode as sendPermissionMode, subscribeHostInfo, type HostInfo } from "./host-bridge";
import { getPermissionMode, setPermissionMode, subscribePermissionMode } from "./permission-mode";

const SECTIONS = ["Chung", "Model", "Thông tin"] as const;
type Section = (typeof SECTIONS)[number];

export function SettingsPage() {
  const [section, setSection] = useState<Section>("Chung");
  const [info, setInfo] = useState<HostInfo | null>(currentHostInfo());
  const mode = useSyncExternalStore(subscribePermissionMode, getPermissionMode);
  useEffect(() => { announceReady(); return subscribeHostInfo(setInfo); }, []);
  return (
    <div className="settings-page">
      <aside className="settings-nav">
        <h1 className="settings-title">Cài đặt</h1>
        {SECTIONS.map(name => (
          <button key={name} type="button" className={"settings-tab" + (name === section ? " settings-tab-active" : "")} onClick={() => setSection(name)}>{name}</button>
        ))}
      </aside>
      <main className="settings-body">
        {section === "Chung" ? (
          <section className="ms-section" aria-label="Quyền">
            <h2 className="ms-section-title">Quyền</h2>
            <p className="ms-sub">Galaxy hỏi trước khi ghi tệp hay chạy lệnh ở mức nào.</p>
            <div className="ms-modes">
              {MODE_OPTIONS.map(choice => (
                <button
                  key={choice.mode}
                  type="button"
                  className={"ms-mode" + (choice.mode === mode ? " ms-mode-active" : "")}
                  onClick={() => { setPermissionMode(choice.mode); sendPermissionMode(choice.mode); }}
                >
                  <span className="ms-mode-title">{choice.title}</span>
                  <span className="ms-mode-desc">{choice.description}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
        {section === "Model" ? (
          info?.modelSettings ? <ModelSetup settings={info.modelSettings} onClose={() => undefined} /> : <p className="ms-sub">Đang đọc ~/.galaxy/config.json…</p>
        ) : null}
        {section === "Thông tin" ? (
          <section className="ms-section" aria-label="Thông tin">
            <h2 className="ms-section-title">Thông tin</h2>
            <dl className="settings-facts">
              <dt>Model</dt><dd>{info?.model ?? "—"}</dd>
              <dt>Endpoint</dt><dd>{info?.baseUrl ?? "—"}</dd>
              <dt>Workspace</dt><dd>{info?.workspacePath ?? "—"}</dd>
              <dt>Nền tảng</dt><dd>{(info?.platform ?? "—") + " · " + (info?.shell ?? "—")}</dd>
            </dl>
          </section>
        ) : null}
      </main>
    </div>
  );
}