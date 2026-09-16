# Galaxy UI Protocol

Giao diện webview chỉ phụ thuộc schema ổn định trong `src/ui-protocol.ts`,
không phụ thuộc trực tiếp vào `@galaxy/ai-coder-core` hay wire format của
provider. Khi core thay đổi bên trong (compaction, retry, evidence…), chỉ
mapper phía host cần sửa.

## Ranh giới

```
webview (assistant-ui render)  ←→  GalaxyUiEvent / GalaxyUiAction  ←→  host mapper  ←→  AiCoderRunController
```

- `src/ui-protocol.ts` — schema sự kiện/hành động cho UI, có bảng ánh xạ từ
  `AiCoderRuntimeEvent` trong comment.
- `src/protocol.ts` — wire transport hiện tại (chat-delta, tool-exec…).
  Khi tích hợp core, các message này đổi sang phát `GalaxyUiEvent`; webview
  chỉ cập nhật ở `host-bridge.ts`.
- Provider knowledge (VD: suy ra URL thư viện model từ baseUrl/model) thuộc về
  host — `resolveModelLibraryUrl()` trong `src/host/config.ts`. UI chỉ nhận
  `modelLibraryUrl` qua `host-info` và render link.

## Quy tắc khi core thay đổi

1. Core sửa nội tại, port không đổi → không sửa gì.
2. Core đổi/thêm event → cập nhật mapper + bảng trong `src/ui-protocol.ts`,
   bump `GALAXY_UI_PROTOCOL_VERSION`; webview chỉ thêm renderer nếu muốn hiển thị.
3. Không import type từ `@galaxy/ai-coder-core` vào `webview/`.
