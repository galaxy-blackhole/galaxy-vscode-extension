import { useMemo, useState, useSyncExternalStore } from "react";
import { MODE_OPTIONS } from "./Composer";
import { setPermissionMode as sendPermissionMode } from "../host-bridge";
import { getPermissionMode, setPermissionMode as storePermissionMode, subscribePermissionMode } from "../permission-mode";
import type { ModelSettingsSummary, ProviderApi, ProviderSummary } from "../../../src/model-settings-types";
import { removeProvider, saveApiKey, saveProvider, setActiveProvider } from "../host-bridge";

/**
 * Model setup for the sidebar, mirroring the Galaxy Blackhole web surface:
 * the active provider's key, a small catalog of known routes, and the custom
 * provider form. Wording follows the same Vietnamese dictionary the web GUI uses.
 */

interface CatalogEntry {
  readonly api: ProviderApi;
  readonly baseUrl: string;
  readonly displayName: string;
  readonly id: string;
  readonly model: string;
  readonly needsKey: boolean;
}

const CATALOG: readonly CatalogEntry[] = [
  { api: "ollama", baseUrl: "https://ollama.com", displayName: "Galaxy Blackhole", id: "galaxy", model: "deepseek-v4.1-flash:cloud", needsKey: true },
  { api: "ollama", baseUrl: "http://127.0.0.1:11434", displayName: "Ollama (máy này)", id: "ollama-local", model: "qwen3-coder:30b", needsKey: false },
];

const BUILT_IN_IDS = new Set(["galaxy", "ollama-local"]);

interface CustomDraft {
  api: ProviderApi;
  apiKey: string;
  baseUrl: string;
  displayName: string;
  id: string;
  models: string;
}

const EMPTY_DRAFT: CustomDraft = { api: "ollama", apiKey: "", baseUrl: "", displayName: "", id: "", models: "" };

function validateId(value: string): string | undefined {
  if (value.trim().length === 0) return "Nhập ID nhà cung cấp.";
  if (!/^[a-z][a-z0-9-]*$/.test(value.trim())) return "Bắt đầu bằng chữ thường; sau đó là chữ thường, chữ số và dấu gạch ngang.";
  return undefined;
}

function validateUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? undefined : "Nhập URL HTTP hoặc HTTPS hợp lệ.";
  } catch {
    return "Nhập URL HTTP hoặc HTTPS hợp lệ.";
  }
}

function KeyEditor({ provider, onDone }: { provider: ProviderSummary; onDone: () => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="ms-key">
      <label className="ms-label" htmlFor={`ms-key-${provider.id}`}>API key</label>
      <input
        id={`ms-key-${provider.id}`}
        className="ms-input"
        type="password"
        autoComplete="off"
        placeholder={provider.keyConfigured ? "Đã cấu hình — nhập giá trị mới để thay" : "Nhập API key"}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <div className="ms-actions">
        <button type="button" className="ms-btn" onClick={onDone}>Huỷ</button>
        <button
          type="button"
          className="ms-btn ms-btn-primary"
          onClick={() => { saveApiKey(provider.id, value); onDone(); }}
        >
          Áp dụng
        </button>
      </div>
    </div>
  );
}

function CustomForm({ onDone }: { onDone: () => void }) {
  const [draft, setDraft] = useState<CustomDraft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<CustomDraft>): void => setDraft(current => ({ ...current, ...patch }));

  const submit = (): void => {
    const idError = validateId(draft.id);
    if (idError !== undefined) { setError(idError); return; }
    const urlError = validateUrl(draft.baseUrl);
    if (urlError !== undefined) { setError(urlError); return; }
    const models = draft.models.split(/[\n,]/).map(value => value.trim()).filter(value => value.length > 0);
    if (models.length === 0) { setError("Nhà cung cấp tuỳ chỉnh cần ít nhất một model."); return; }
    saveProvider({
      api: draft.api,
      ...(draft.apiKey.trim().length === 0 ? {} : { apiKey: draft.apiKey.trim() }),
      baseUrl: draft.baseUrl.trim(),
      displayName: draft.displayName.trim().length === 0 ? draft.id.trim() : draft.displayName.trim(),
      id: draft.id.trim(),
      models,
    });
    onDone();
  };

  return (
    <div className="ms-form">
      <label className="ms-label" htmlFor="ms-custom-id">ID nhà cung cấp</label>
      <input id="ms-custom-id" className="ms-input" value={draft.id} placeholder="my-gateway"
        onChange={(event) => update({ id: event.target.value })} />
      <p className="ms-hint">Định danh chữ thường, bắt đầu bằng chữ cái; dùng làm tên provider và tên thông tin xác thực.</p>

      <label className="ms-label" htmlFor="ms-custom-name">Tên hiển thị</label>
      <input id="ms-custom-name" className="ms-input" value={draft.displayName} placeholder="Dùng ID khi để trống"
        onChange={(event) => update({ displayName: event.target.value })} />

      <label className="ms-label" htmlFor="ms-custom-api">Giao thức API</label>
      <select id="ms-custom-api" className="ms-input" value={draft.api}
        onChange={(event) => update({ api: event.target.value as ProviderApi })}>
        <option value="ollama">Ollama (runtime hiện tại)</option>
        <option value="openai-completions">OpenAI-compatible — chưa được runtime hỗ trợ</option>
      </select>

      <label className="ms-label" htmlFor="ms-custom-url">Base URL</label>
      <input id="ms-custom-url" className="ms-input" value={draft.baseUrl} placeholder="https://gateway.example/v1"
        onChange={(event) => update({ baseUrl: event.target.value })} />

      <label className="ms-label" htmlFor="ms-custom-models">Model</label>
      <textarea id="ms-custom-models" className="ms-input ms-textarea" value={draft.models}
        placeholder={"Mỗi dòng một model id\nqwen3-coder:30b"}
        onChange={(event) => update({ models: event.target.value })} />

      <label className="ms-label" htmlFor="ms-custom-key">API key (tuỳ chọn)</label>
      <input id="ms-custom-key" className="ms-input" type="password" autoComplete="off" value={draft.apiKey}
        placeholder="Để trống nếu endpoint không cần xác thực"
        onChange={(event) => update({ apiKey: event.target.value })} />

      {error !== null ? <p className="ms-error">{error}</p> : null}
      <div className="ms-actions">
        <button type="button" className="ms-btn" onClick={onDone}>Huỷ</button>
        <button type="button" className="ms-btn ms-btn-primary" onClick={submit}>Tạo nhà cung cấp</button>
      </div>
    </div>
  );
}

export function ModelSetup({ settings, onClose }: { settings: ModelSettingsSummary; onClose: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const permissionMode = useSyncExternalStore(subscribePermissionMode, getPermissionMode);
  const [mode, setMode] = useState<"idle" | "catalog" | "custom">("idle");
  const missingKey = useMemo(
    () => settings.providers.some(provider => provider.active && !provider.keyConfigured),
    [settings],
  );

  return (
    <section className="ms-panel" aria-label="Cài đặt">
      <header className="ms-header">
        <div>
          <h2 className="ms-title">Cài đặt</h2>
          <p className="ms-sub">Model, nhà cung cấp và chế độ phê duyệt.</p>
        </div>
        <button type="button" className="ms-btn ms-btn-ghost" onClick={onClose} aria-label="Đóng">✕</button>
      </header>

      <section className="ms-section" aria-label="Quyền">
        <h3 className="ms-section-title">Quyền</h3>
        <p className="ms-sub">Galaxy hỏi trước khi ghi tệp hay chạy lệnh ở mức nào.</p>
        <div className="ms-modes">
          {MODE_OPTIONS.map(choice => (
            <button
              key={choice.mode}
              type="button"
              className={`ms-mode${choice.mode === permissionMode ? " ms-mode-active" : ""}`}
              onClick={() => { storePermissionMode(choice.mode); sendPermissionMode(choice.mode); }}
            >
              <span className="ms-mode-title">{choice.title}</span>
              <span className="ms-mode-desc">{choice.description}</span>
            </button>
          ))}
        </div>
      </section>

      {missingKey ? (
        <p className="ms-warning">Chưa có API key cho nhà cung cấp đang dùng. Nhập key để bắt đầu.</p>
      ) : null}

      {settings.providers.map(provider => (
        <article key={provider.id} className={`ms-card${provider.active ? " ms-card-active" : ""}`}>
          <div className="ms-card-head">
            <span className="ms-name">{provider.displayName}</span>
            {BUILT_IN_IDS.has(provider.id) ? null : <span className="ms-badge">Tuỳ chỉnh</span>}
            <span className={`ms-dot${provider.keyConfigured ? " ms-dot-ok" : ""}`}
              title={provider.keyConfigured ? "Đã cấu hình API key" : "Thiếu API key"} />
            <span className="ms-spacer" />
            {provider.active ? null : (
              <button type="button" className="ms-btn" onClick={() => setActiveProvider(provider.id)}>Dùng</button>
            )}
            <button type="button" className="ms-btn" onClick={() => setEditing(editing === provider.id ? null : provider.id)}>
              Sửa
            </button>
            {settings.providers.length > 1 ? (
              <button type="button" className="ms-btn ms-btn-ghost" onClick={() => removeProvider(provider.id)} aria-label={`Xoá ${provider.displayName}`}>
                Xoá
              </button>
            ) : null}
          </div>
          <p className="ms-meta">{provider.api === "ollama" ? "Ollama" : "OpenAI-compatible"} · {provider.baseUrl}
            {provider.models.length > 0 ? ` · ${provider.models.map(model => model.id).join(", ")}` : ""}</p>
          {editing === provider.id ? <KeyEditor provider={provider} onDone={() => setEditing(null)} /> : null}
        </article>
      ))}

      {mode === "custom" ? <CustomForm onDone={() => setMode("idle")} /> : null}

      {mode === "catalog" ? (
        <div className="ms-catalog">
          {CATALOG.map(entry => (
            <button
              key={entry.id}
              type="button"
              className="ms-catalog-row"
              onClick={() => {
                saveProvider({ api: entry.api, baseUrl: entry.baseUrl, displayName: entry.displayName, id: entry.id, models: [entry.model] });
                setMode("idle");
              }}
            >
              <span className="ms-name">{entry.displayName}</span>
              <span className="ms-meta">{entry.needsKey ? "cần API key" : "không cần key"}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="ms-buttons">
        <button type="button" className="ms-dashed" onClick={() => setMode(mode === "catalog" ? "idle" : "catalog")}>
          + Thêm nhà cung cấp model
        </button>
        <button type="button" className="ms-dashed" onClick={() => setMode(mode === "custom" ? "idle" : "custom")}>
          + Thêm nhà cung cấp tuỳ chỉnh
        </button>
      </div>
    </section>
  );
}
