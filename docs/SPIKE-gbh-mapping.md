# SPIKE — map workspace của VS Code sang kernel GBH

Nhánh: `spike/gbh-kernel-map` (KHÔNG phải sản phẩm; nhánh kiểm chứng).

## 1. Câu hỏi của spike

Mở VS Code ở một thư mục, extension có nhìn thấy **đúng workspace và đúng các phiên** của thư mục đó trong kernel GBH hay không?

## 2. Spike chứng minh điều gì (và KHÔNG chứng minh gì)

| Chứng minh | Không chứng minh |
|---|---|
| Thư mục đang mở → **workspace entity** của kernel (theo `path`) | Chưa có hội thoại trong sidebar (vẫn dùng panel cũ) |
| Workspace → **danh sách phiên** (registry `sessionIds` + fallback theo `cwd`) | Chưa gọi Remote/typert của host; đọc **read model trên đĩa** |
| Có tiêu đề phiên, thời điểm tạo, token đã dùng | Chưa ghi/không mở phiên, chưa duyệt uỷ quyền |
| Thư mục kernel **chưa từng thấy** vẫn khớp phiên nếu có `cwd` trùng | Chưa xử lý nhiều workspace folder cùng lúc (chỉ hiện từng folder một) |

## 3. Cách kiểm chứng (2 phút)

```bash
cd galaxy-vscode-extension
git checkout spike/gbh-kernel-map
yarn install            # nếu chưa
yarn compile            # hoặc: node esbuild.js && npx vite build
# mở repo này trong VS Code rồi F5 (Run Extension) — cửa sổ mới mở ra
```

Trong cửa sổ Extension Development Host:

1. Mở một thư mục **đã từng dùng với GBH** (ví dụ `~/Desktop/Project/galaxy`).
2. Ở activity bar, bấm icon **Galaxy Blackhole** → view **GBH Kernel**.
3. Kỳ vọng: một dòng `galaxy` kèm chú thích `workspace e78ee604 · 12 phiên`, xổ ra danh sách phiên có tiêu đề tiếng Việt ("Tìm hiểu kỹ dự án này", "chạy lệnh ls -la rồi"…).
4. Mở một thư mục **chưa từng dùng với GBH**: dòng workspace ghi `chưa có workspace trong kernel · 0 phiên` (đúng: kernel chưa biết thư mục đó).
5. Đổi thư mục (File → Open Folder) → view tự làm mới (`onDidChangeWorkspaceFolders`). Hoặc chạy **Galaxy Blackhole: Refresh GBH Kernel Sessions**.
6. Nếu kernel ở home khác: đặt `galaxy-code.gbhHome` trong Settings, hoặc `GBH_HOME`.

## 4. Bằng chứng đã đo trên máy này (26/10/2026)

Chạy `node --import ./test/helpers/ts-resolve.mjs test/gbh-map-verify.ts`:

```
home: /Users/buitronghieu/.galaxy/blackhole
workspaces: 2 | sessions: 17
 - /Users/buitronghieu/Documents/deepseek-harness/default-workspace | id: a9c062f1 | phiên: 5
   vd: ["Gọi set_team_limits và list_agents","Say OK Only","Request to Say OK"]
 - /Users/buitronghieu/Desktop/Project/galaxy | id: e78ee604 | phiên: 12
   vd: ["…","Tìm hiểu kỹ dự án này","chạy lệnh ls -la rồi"]
 - /Users/buitronghieu/Desktop/Project/galaxy/galaxy-blackhole | workspace: (chưa có) | phiên: 0
```

## 5. Nguồn dữ liệu (read model, không phải API)

| Tệp | Dùng cho |
|---|---|
| `<home>/storages/workspace.json` | `tables.workspaces[id] = { path, title, sessionIds[] }` |
| `<home>/storages/session_projcache/sessions/<id>.json` | `record.identity.cwd`, `record.rows.title.val`, `workingDirectory.val`, `tokenUsage.totals` |
| `<home>/ready-url.txt` | biết host đã từng boot (chỉ để hiện ghi chú, spike không tự spawn host) |

Nhật ký phiên là `session.v4.jsonl.zstd` (nén) nên spike **không** đọc; tiêu đề lấy từ projection cache — đúng bằng dữ liệu mà web UI đang hiển thị.

## 6. Bước tiếp theo (khi spike được duyệt)

1. Thay hai lần đọc tệp bằng **Remote** thật: `workspaceController` (feed workspace) + `sessionController` (danh mục phiên), qua cầu `postMessage` từ extension host xuống webview — hoặc WS trực tiếp nếu CSP cho phép.
2. Thêm hành động trên từng dòng phiên: mở trong panel hội thoại, mở trong GBH web, xoá phiên (dùng `session-delete` seam).
3. Hội thoại: đóng gói cụm UI `client-ui-conversation` + `client-ui-chat` + `client-ui-renderer` vào webview (Hướng D trong ADR 0028 của `blackhole-tauri`).
4. Giữ `matchFolder()` làm ranh giới mapping — nó đã có test, sẽ chỉ đổi nguồn dữ liệu.
