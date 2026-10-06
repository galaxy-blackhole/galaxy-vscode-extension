/**
 * The webview strings. Vietnamese is the source language and every lookup is keyed by that Vietnamese
 * text, so a call site reads t("Cài đặt") and the English comes from the table below.
 */
import { useSyncExternalStore } from "react";
import { getPreferences, subscribePreferences, type Locale } from "./preferences";

const EN: Readonly<Record<string, string>> = Object.freeze({
  "Trò chuyện mới": "New conversation",
  "Trò chuyện mới (xoá nội dung, mở phiên mới)": "New conversation (clears the view, opens a fresh session)",
  "Cài đặt": "Settings",
  "Cài đặt: model và quyền": "Settings: model and permissions",
  "v2 prototype · assistant-ui · Ollama": "v2 prototype · assistant-ui · Ollama",
  "Liệt kê file trong workspace": "List the files in this workspace",
  "Đọc package.json và tóm tắt": "Read package.json and summarise it",
  "Tạo hello.py in ra xin chào": "Create hello.py that prints a greeting",
  "Thử bất cứ điều gì": "Ask anything",
  "Đính kèm file (chưa hỗ trợ trong prototype)": "Attach a file (not supported in the prototype yet)",
  "Nên phê duyệt các hành động của Galaxy thế nào?": "How should Galaxy approve its actions?",
  "Mức suy luận": "Reasoning effort",
  "Model cho lượt chạy tiếp theo": "Model for the next run",
  "Gửi và chuyển hướng lượt đang chạy": "Send and steer the running turn",
  "Model này không cho chọn mức suy luận.": "This model does not offer reasoning levels.",
  "Yêu cầu phê duyệt": "Ask before acting",
  "Luôn hỏi khi chỉnh sửa tệp và chạy lệnh": "Always ask before editing files or running commands",
  "Phê duyệt giúp tôi": "Approve for me",
  "Chỉ hỏi khi chạy lệnh trong terminal": "Only ask before terminal commands",
  "Toàn quyền truy cập": "Full access",
  "Truy cập không giới hạn vào mọi tệp trên máy tính của bạn": "Unrestricted access to every file on your machine",
  "Chung": "General",
  "Cài đặt chung": "General settings",
  "Model": "Model",
  "Thông tin": "About",
  "Quyền": "Permissions",
  "Chọn chế độ quyền mặc định cho phiên mới": "Default permission mode for a new session",
  "Ngôn ngữ": "Language",
  "Ngôn ngữ cho giao diện người dùng": "Language of the interface",
  "Cỡ chữ": "Font size",
  "Chỉ ảnh hưởng nội dung hội thoại": "Only affects the conversation",
  "Cách xử lý tin nhắn tiếp theo": "What happens to the next message",
  "Khi agent đang chạy: xếp hàng chờ, hoặc chuyển hướng lượt đang chạy": "While the agent runs: wait in line, or steer the running turn",
  "Xếp hàng": "Queue",
  "Chuyển hướng": "Steer",
  "Chi tiết công việc": "Work detail",
  "Chọn mức chi tiết hiển thị cho lệnh gọi tool": "How much detail each tool call shows",
  "Tiêu chuẩn": "Standard",
  "Gọn": "Compact",
  "Tác giả": "Author",
  "Người làm ra Galaxy Blackhole": "Who made Galaxy Blackhole",
  "Email": "Email",
  "Liên hệ công việc": "Work contact",
  "Website": "Website",
  "Trang chủ dự án": "Project home",
  "Phiên bản": "Version",
  "Extension đang cài": "Installed extension",
  "Quét mã để nhắn Zalo cho tác giả.": "Scan the code to message the author on Zalo.",
  "Model mà lượt chạy kế tiếp sẽ dùng": "The model the next run will use",
  "Endpoint": "Endpoint",
  "Nơi gửi yêu cầu model": "Where model requests go",
  "Workspace": "Workspace",
  "Thư mục đang mở": "The open folder",
  "Nền tảng": "Platform",
  "Hệ điều hành và shell": "Operating system and shell",
  "Tiếng Việt": "Vietnamese",
  "English": "English",
  "Mặc định": "Default (system)",
  "Tắt": "Off",
  "Bật": "On",
  "Tối thiểu": "Minimal",
  "Thấp": "Low",
  "Vừa": "Medium",
  "Cao": "High",
  "Rất cao": "Very high",
  "Tối đa": "Maximum",
});

/** Translate one Vietnamese string; anything missing from the table stays as it is. */
export function translate(text: string, locale: Locale): string {
  return locale === "en" ? EN[text] ?? text : text;
}

/** Translate into the language the settings chose; components re-render when it changes. */
export function useT(): (text: string) => string {
  const locale = useSyncExternalStore(subscribePreferences, getPreferences).locale;
  return (text: string) => translate(text, locale);
}
