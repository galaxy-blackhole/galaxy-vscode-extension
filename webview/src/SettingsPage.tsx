/**
 * The settings tab, laid out like Codex's: a rail of sections on the left, and on the right groups of rows
 * whose control sits on the far side — the shape the web GUI and Codex both use.
 */
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { MODE_OPTIONS } from "./components/Composer";
import { ModelSetup } from "./components/ModelSetup";
import { announceReady, currentHostInfo, openExternal, setPermissionMode as sendPermissionMode, subscribeHostInfo, type HostInfo } from "./host-bridge";
import { ZALO_QR_URI } from "./zalo-qr";
import { getPermissionMode, setPermissionMode, subscribePermissionMode } from "./permission-mode";
import { getPreferences, setPreferences, subscribePreferenceChanges, type Locale, type NextMessage, type WorkDetail } from "./preferences";
import { useT } from "./i18n";

const SECTIONS = ["Chung", "Model", "Thông tin"] as const;
type Section = (typeof SECTIONS)[number];

function Row({ control, description, label }: { control: ReactNode; description: string; label: string }) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <div className="settings-row-label">{label}</div>
        <div className="settings-row-desc">{description}</div>
      </div>
      <div className="settings-row-control">{control}</div>
    </div>
  );
}

export function SettingsPage() {
  const [section, setSection] = useState<Section>("Chung");
  const [info, setInfo] = useState<HostInfo | null>(currentHostInfo());
  const mode = useSyncExternalStore(subscribePermissionMode, getPermissionMode);
  const preferences = useSyncExternalStore(subscribePreferenceChanges, getPreferences);
  const t = useT();
  useEffect(() => { announceReady(); return subscribeHostInfo(setInfo); }, []);

  const general = (
    <>
      <div className="settings-group">
        <Row
          label={t("Quyền")}
          description={t("Chọn chế độ quyền mặc định cho phiên mới")}
          control={
            <select className="settings-select" aria-label={t("Quyền")} value={mode} onChange={event => { const next = event.target.value as "ask" | "smart" | "auto"; setPermissionMode(next); sendPermissionMode(next); }}>
              {MODE_OPTIONS.map(choice => <option key={choice.mode} value={choice.mode}>{choice.title}</option>)}
            </select>
          }
        />
        <Row
          label={t("Ngôn ngữ")}
          description={t("Ngôn ngữ cho giao diện người dùng")}
          control={
            <select className="settings-select" aria-label={t("Ngôn ngữ")} value={preferences.locale} onChange={event => setPreferences({ locale: event.target.value as Locale })}>
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          }
        />
        <Row
          label={t("Cỡ chữ")}
          description={t("Chỉ ảnh hưởng nội dung hội thoại")}
          control={
            <span className="settings-number-wrap">
              <input className="settings-number" aria-label={t("Cỡ chữ")} type="number" min={10} max={20} value={preferences.fontSize} onChange={event => { const next = Number(event.target.value); if (Number.isFinite(next)) setPreferences({ fontSize: Math.min(20, Math.max(10, next)) }); }} />
              <span>px</span>
            </span>
          }
        />
        <Row
          label={t("Cách xử lý tin nhắn tiếp theo")}
          description={t("Khi agent đang chạy: xếp hàng chờ, hoặc chuyển hướng lượt đang chạy")}
          control={
            <select className="settings-select" aria-label={t("Cách xử lý tin nhắn tiếp theo")} value={preferences.nextMessage} onChange={event => setPreferences({ nextMessage: event.target.value as NextMessage })}>
              <option value="queue">Xếp hàng</option>
              <option value="steer">Chuyển hướng</option>
            </select>
          }
        />
        <Row
          label={t("Chi tiết công việc")}
        <Row label={t("Workspace")} description={t("Thư mục đang mở")} control={<span className="settings-mono">{info?.workspacePath ?? "—"}</span>} />
        <Row label={t("Nền tảng")} description={t("Hệ điều hành và shell")} control={<span>{(info?.platform ?? "—") + " · " + (info?.shell ?? "—")}</span>} />
          description={t("Chọn mức chi tiết hiển thị cho lệnh gọi tool")}
          control={
            <select className="settings-select" aria-label={t("Chi tiết công việc")} value={preferences.workDetail} onChange={event => setPreferences({ workDetail: event.target.value as WorkDetail })}>
              <option value="standard">Tiêu chuẩn</option>
              <option value="compact">Gọn</option>
            </select>
          }
        />
      </div>
    </>
  );

  return (
    <div className="settings-page">
      <aside className="settings-nav">
        <h1 className="settings-title">Cài đặt</h1>
        {SECTIONS.map(name => (
          <button key={name} type="button" className={"settings-tab" + (name === section ? " settings-tab-active" : "")} onClick={() => setSection(name)}>{name}</button>
        ))}
      </aside>
      <main className="settings-body">
        <h2 className="settings-h1">{section === "Chung" ? "Cài đặt chung" : section}</h2>
        {section === "Chung" ? general : null}
        {section === "Model" ? (
          info?.modelSettings ? <ModelSetup settings={info.modelSettings} /> : <p className="settings-row-desc">Đang đọc ~/.galaxy/config.json…</p>
        ) : null}
        {section === "Thông tin" ? (
          <div className="settings-group">
            <Row label={t("Tác giả")} description={t("Người làm ra Galaxy Blackhole")} control={<span>Bùi Trọng Hiếu</span>} />
            <Row label={t("Email")} description={t("Liên hệ công việc")} control={<span>kevinbui210191@gmail.com</span>} />
            <Row label={t("Website")} description={t("Trang chủ dự án")} control={<button type="button" className="settings-link" onClick={() => openExternal("https://galaxy-blackhole.vercel.app/")}>galaxy-blackhole.vercel.app</button>} />
            <Row label={t("Phiên bản")} description={t("Extension đang cài")} control={<span>{"v" + (info?.version ?? "—")}</span>} />
          </div>
        ) : null}
        {section === "Thông tin" ? (
          <div className="settings-group settings-qr">
            <img src={ZALO_QR_URI} alt="QR Zalo của tác giả" width={190} height={190} />
            <div className="settings-row-desc">Quét mã để nhắn Zalo cho tác giả.</div>
          </div>
        ) : null}
      </main>
    </div>
  );
}