# Tích hợp giao diện DSH vào extension — kế hoạch

## Điều tra (đã làm, có bằng chứng)

| Gói | Phụ thuộc | Dùng thẳng được không |
|---|---|---|
| `@deepseek-ai/dsh-client-ui-primitives` | `deps: {}` · `peer: cordis ~4.0.4` | **Được** ✓ — component thuần trình bày (Button, Checkbox, `Icon*`), nhận props thường. Đây là đường ngắn nhất để giao diện **giống DSH**: icon, nút, ô nhập, bảng. |
| `@deepseek-ai/dsh-client-ui-chat` | `deps: schemastery` · `peer: cordis` | **Không thẳng** ✗ — cần `cordis` (framework DI của DSH) và hợp đồng **slot/session/agent** của host DSH. Dùng trọn gói này = dựng lại DSH trong webview. |
| `@deepseek-ai/dsh-client-ui-settings-*`, `...-schedule`, `...-session-log` | tương tự | Cùng lý do: cần slot + `ctx`. |

## Hướng làm được

1. **Dùng `dsh-client-ui-primitives`** trong webview hiện tại (React + Vite, đã có sẵn):
   - thay bộ icon tự vẽ (`webview/src/components/icons.tsx`) bằng `Icon*` của DSH;
   - dùng `Button`, `Checkbox`, các primitive khác cho hàng trạng thái, hộp phê duyệt, khối code;
   - **rủi ro thấp**: package không có dependency, chỉ cần React (đã có).
2. **Đồng bộ system prompt với DSH**: core của ta (`@galaxy-stack/ai-coder-core`) đã sở hữu prompt;
   đọc prompt trong các gói DSH (`dsh-agent-preset-registry`, prompt của các preset) rồi **đối chiếu và chỉnh
   cho khớp văn phong/quy tắc** — không copy nguyên khối vì core ta khác DSH.
3. **Chỉ giữ một nguồn sự thật về giao diện**: sau khi thay, xoá dần CSS tự viết trùng với primitive để tránh
   hai hệ style chồng nhau.

## Không nên làm

- Import `dsh-client-ui-chat` để "có giao diện DSH nguyên bản": nó kéo theo `cordis` + slot + hợp đồng host,
  tức là **dựng lại DSH** trong extension. Chi phí lớn và sẽ vỡ mỗi lần DSH đổi hợp đồng.

## Thứ tự đề xuất

1. Thử `dsh-client-ui-primitives` với **một** màn hình (khối code + hộp phê duyệt) để đo chi phí thật;
2. Nếu rẻ, mở rộng ra các màn còn lại;
3. Đối chiếu prompt với DSH (việc độc lập, có thể làm song song).