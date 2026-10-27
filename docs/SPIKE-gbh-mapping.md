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

## 7. Bổ sung sau khi chủ dự án duyệt (26/10/2026)

### 7.1 Đã thêm

| Thành phần | Việc làm được |
|---|---|
| `src/gbh/host.ts` | `parseReadyUrl()` tách `origin` / `token` / `url`; `probeHost()` kiểm tra kernel còn sống — **401 vẫn tính là sống** (đúng bẫy đã ghi trong AGENTS: request trần luôn 401 dù app lành) |
| Dòng đầu của view | `Kernel đang chạy` / `Kernel không phản hồi` + origin, icon `vm-running`/`vm-outline` |
| Command `galaxy-code.refreshGbhSessions` | chạy lại probe rồi vẽ lại cây |
| Command `galaxy-code.openGbhSession` (bấm vào dòng phiên) | mở GBH Web qua `vscode.env.openExternal(ready-url)` + copy session id vào clipboard |
| Làm mới tự động | `onDidChangeWorkspaceFolders` → probe + refresh |

### 7.2 Bằng chứng đo được

```
$ node --import ./test/helpers/ts-resolve.mjs -e '…probeHost…'
ready: http://127.0.0.1:5439/?token=…
host:  http://127.0.0.1:5439  | token dài: 43
probe: {"alive":true,"status":401}     ← server sống, cookie chưa set (đúng thiết kế)
```

Test: `node --test test/*.test.ts` → **75/75 pass** (7 mapping + 3 host + 65 cũ); `tsc` sạch; `node esbuild.js` build OK.

### 7.3 Còn lại của bước 1–3

1. Gọi **Remote thật** thay vì đọc tệp: hiện spike đã có `probeHost` + `ready-url` nên bước này là "nối WS + typert codec" — cần đọc `packages/host/api-gateway` (frame) và dùng đúng codec client sinh sẵn, không tự viết tay.
2. Deep-link phiên: web hiện chưa có route `#/session/<id>` ⇒ tạm mở trang chủ + copy id; muốn mở đúng phiên phải thêm route ở `client-ui-workspace` (việc phía `blackhole-tauri`).
3. Hội thoại trong `WebviewView`: đóng gói cụm `client-ui-conversation`/`chat`/`renderer` (Hướng D của ADR 0028).

## 8. Kiểm chứng LIVE trong VS Code thật (26/10/2026)

`node test/vscode/gbh-run.mjs` dựng một **kernel home giả** đúng khuôn dữ liệu thật (registry v2 + projection cache v7 + `ready-url.txt` trỏ tới một HTTP server trả 401) rồi chạy extension trong **VS Code thật** (`.vscode-test`, 1.143.1).

Kết quả lần chạy cuối:

```
[gbh-spike] step: activate
[gbh-spike] step: activated
[gbh-spike] step: commands:3177
[gbh-spike] step: refresh
[gbh-spike] step: tree
[gbh-spike] step: tree:{"roots":[{"kind":"host","detail":"http://127.0.0.1:50317","alive":true},
                            {"kind":"workspace","label":"gbh-spike-ws-VI3cS8","detail":"workspace w-fixtur · 2 phiên"}],
                     "sessions":[{"id":"session-moi","title":"phiên mới hơn"}, …]}
[gbh-spike] activation, contributions, live probe and the mapped tree are green
[gbh-spike] VS Code extension host finished with 0 failure(s)
```

Điều này chứng minh **trong editor thật**: extension activate được, 3 command có mặt, `probeHost` sống với server 401, và view vẽ đúng workspace + 2 phiên lấy từ cache — không phải chỉ đúng trong node.

### 8.1 Hai lỗi thật phát hiện khi chạy live (đã sửa trong nhánh)

| Lỗi | Nguyên nhân | Sửa |
|---|---|---|
| Extension **không activate** trên VS Code 1.143 | `chat-view-provider.ts` import tĩnh `workspace-mcp` → kéo `@modelcontextprotocol/sdk` → zod JIT chạm `navigator` và ném khi nạp module | đổi sang `await import("./workspace-mcp.js")` trong `mcpTools()` (chỉ nạp khi thật sự chạy) — activate nhẹ lại, lỗi biến mất |
| Runner **treo vô hạn** | suite `await` command `openGbhHome`, mà command đó `await showInformationMessage` → chờ người bấm OK | suite không `await` command đó nữa (`void`), host kết thúc sạch |

### 8.2 Cách chạy lại

```bash
cd galaxy-vscode-extension && yarn compile
node --test test/*.test.ts                     # 78 test logic (node)
node test/vscode/gbh-run.mjs                   # VS Code thật, ~3 phút, in 0 failure(s) là đạt
```

## 9. Remote THẬT (26/10/2026) — thay đọc tệp

Wire đã đọc từ host đang chạy, không đoán:

```
GET  <ready-url>                        → 303 + set-cookie: dsh-auth-<id>=v1.<payload>.<sig>
POST <origin>/api/session/list          (endpoint = method dotted đổi . thành /)
     {type:"client-request", rpcId, method:"session.list", payload:{args:{_request:{}}}}
  →  {type:"server-response", result:{ok:true, value:{items:[…]}}}
```

Ba chi tiết dễ sai (đều đã khoá bằng test):

| Chi tiết | Sai thì |
|---|---|
| `payload` phải **đúng một khoá `args`** | gateway trả `gateway/bad-request` |
| `method` dùng **dấu chấm** (`session.list`), URL dùng **dấu /** (`/api/session/list`) | 404 `not found` |
| `args` của `session.list` là `{_request:{}}` | `gateway/arguments-invalid: missing "_request"` |

Module: `src/gbh/remote.ts` (`authenticate`, `callRemote`, `listSessions`, `mapSessionItem`, `endpointOf`, `buildRequest`). Cây chuyển sang **Remote trước, tệp sau**: `source: "remote" | "files"`.

### 9.1 Bằng chứng LIVE với kernel thật của máy này

```
$ node --import ./test/helpers/ts-resolve.mjs test/gbh-remote-live.ts
host: http://127.0.0.1:5439 | probe: {"alive":true,"status":401}
cookie: dsh-auth-839a4abd7d12a88…
session.list trả về: 16 phiên
map /Users/buitronghieu/Desktop/Project/galaxy → 12 phiên qua Remote | vd: [null,"Tìm hiểu kỹ dự án này"]
```

### 9.2 Bằng chứng LIVE trong VS Code (fixture giả lập kernel)

Runner giờ trả lời như host thật: `/?token=` → 303 + cookie, `POST /api/session/list` → envelope. Suite khẳng định **`source === "remote"`** và tiêu đề là `phiên Remote mới` / `phiên Remote cũ` (khác hẳn dữ liệu tệp để chứng minh không phải đọc tệp):

```
[gbh-spike] step: tree:{"source":"remote","roots":[{"kind":"host","detail":"http://127.0.0.1:50432 · Remote","alive":true}, …]}
[gbh-spike] activation, contributions, live probe and the mapped tree are green
[gbh-spike] VS Code extension host finished with 0 failure(s)
```

### 9.3 Test

`node --test test/*.test.ts` → **82/82** (thêm 7 test cho `remote.ts`: cookie, endpoint, envelope, map row, lỗi gateway, thứ tự mới→cũ).

## 10. Hội thoại NATIVE trong VS Code (26/10/2026) — Hướng D, lát cắt 1

Thêm **WebviewView “Hội thoại”** (`src/gbh/conversation-view.ts`): khung là của VS Code (activity bar, view, biến theme `--vscode-*`), dữ liệu là **Remote API của kernel**, không nhúng app web GBH.

| Việc | Cách làm |
|---|---|
| Bấm một dòng phiên | mở panel hội thoại native (`galaxy-code.showGbhTranscript`) |
| Panel đọc gì | `POST /api/session/page` với `{request:{address:{kind:"session",sessionId},throughSeq:<asOfSeq>,maxMessages:40}}` |
| Dòng nào được vẽ | chỉ `user/message` + `assistant/message` có block `text`; tool result/khung khác bị bỏ |
| Nút trong panel | “Làm mới”, “Mở trong GBH Web” (bàn giao khi cần ghi) |
| Ghi/xoá/gửi tin | **ngoài phạm vi** lát cắt này — vẫn làm trong GBH web |

`throughSeq` là **bắt buộc**; lấy từ `session.list` (`projections.asOfSeq`). Test khoá cả hai điều này.

### 10.1 Bằng chứng LIVE

Kernel thật của máy:

```
$ node --import ./test/helpers/ts-resolve.mjs test/gbh-transcript-live.ts
phiên: session-f6f5e690-1f7b-4d83-a106-d5200bde7a12 | Tìm hiểu kỹ dự án này
số dòng: 5 | hasMore: true
 - user | Time sampled while preparing turn 2, step 1: 2026-10-23T16:37:51+07:00
 - user | Background subagent 98eb0234-… finished and will do no further work…
```

Trong VS Code thật (fixture trả lời cả `/api/session/list` và `/api/session/page`):

```
[gbh-spike] step: tree:{"source":"remote", …}
[gbh-spike] step: transcript → transcript:ok      ← panel vẽ đúng 2 tin nhắn, giữ tiêu đề phiên
[gbh-spike] VS Code extension host finished with 0 failure(s)
```

### 10.2 Test

`node --test test/*.test.ts` → **85/85** (thêm 3 test cho `transcript.ts`: lọc event, `throughSeq`, phiên không có trong danh sách).

### 10.3 Còn lại để “hoàn thiện VS Code”

1. **Gửi tin từ panel** — cần `session/control` + luồng assistant; hiện bàn giao sang GBH web.
2. **Deep-link `?session=`** — phải thêm xử lý phía `blackhole-tauri` (client plugin mới `ui-deep-link` dùng `ctx.uiWorkspace.open`), vì app web chưa đọc query param. Panel native đã bỏ được phụ thuộc này.
3. **Tái dùng nguyên cụm UI GBH** (`client-ui-conversation`/`chat`/`renderer`) trong webview — chỉ cần khi muốn giống 100% giao diện web.
4. Diff/preview tệp agent sửa (`vscode.diff`), duyệt uỷ quyền bằng QuickPick.

## 11. Gửi tin từ panel (26/10/2026) — không cần stream

Hoá ra **không cần** WebSocket: gửi prompt là **unary RPC**. Đọc từ client thật của kernel:

```
remote.session.prompt({ requestId, sessionId, mode, content, clientTimeZone })
  → POST /api/session/prompt
    {request:{requestId, sessionId, mode:"queue"|"steer", content:[{type:"text",text}], clientTimeZone}}
  → {"ok":true,"value":{"accepted":true}}
```

(`session/control` mới là stream, và nó chỉ là baseline điều khiển — không dùng để gửi tin.)

Panel có composer: gõ tin → `sendPrompt()` → gọi lại `session.page` để vẽ lại. Lỗi hiện ngay trong panel.

### 11.1 Bằng chứng LIVE với kernel thật

```
$ curl ... /api/session/prompt  (phiên trống session-5d902e63…)
{"result":{"ok":true,"value":{"accepted":true}}}
# sau 12s đọc lại:
phiên: session-5d902e63… | title: Yêu cầu trả lời một chữ | asOfSeq: 21   (trước khi gửi: asOfSeq 3)
 - user | Trả lời đúng một chữ: OK
```

Tức là kernel **nhận prompt thật**, đặt tiêu đề phiên và chạy turn — đúng luồng mà panel dùng.

### 11.2 Bằng chứng LIVE trong VS Code

```
[gbh-spike] step: send → send:ok
[gbh-spike] prompt the panel sent: {"sessionId":"session-moi","mode":"queue",
                                    "content":[{"type":"text","text":"chào từ panel VS Code"}],
                                    "clientTimeZone":"Asia/Saigon"}
[gbh-spike] VS Code extension host finished with 0 failure(s)
```

### 11.3 Test

`node --test test/*.test.ts` → **87/87** (thêm 2 test cho `sendPrompt`: hình dạng request + `accepted:false`).

## 12. Duyệt uỷ quyền + diff trong VS Code (27/10/2026)

### 12.1 Duyệt uỷ quyền (stream `$events`)

Kernel hỏi qua **stream sự kiện**, không phải RPC thường:

```
WS  <origin>/api/remote.mux      (cookie dsh-auth-…)
→   {type:"open", streamId, endpoint:"$events", payload:{args:{}}}
←   {type:"item", value:{type:"ready", clientId, host:{home}}}
←   {type:"item", value:{type:"waterfall", event:"approval/request", eventId, agentId, request}}
trả lời: POST /api/$events/result
→   {type:"client-request", method:"$events/result", payload:{args:{clientId, eventId, outcome}}}
outcome: {kind:"next"} | {kind:"result", value:"allowed-once"|"rejected"|"cancelled"|"unavailable"}
```

Module: `src/gbh/events.ts` (mở stream, `postEventResult`) + `src/gbh/approval-bridge.ts` (hỏi bằng notification, map lựa chọn → outcome, waterfall lạ trả `next` để không treo run).

**Giới hạn đo được:** qua Remote, `approval/request` chỉ còn `request: {}` (các trường `toolName`/`reason` không qua được biên JSON), nên hộp thoại trong VS Code ghi *“GBH cần bạn cho phép”* mà không nêu tên công cụ. Ghi nhận trung thực thay vì đoán.

Bằng chứng live với kernel thật:

```
stream sẵn sàng, clientId: 0a04b63c
prompt accepted: true
waterfall: approval/request | {}
→ đã trả lời: rejected
thấy approval request: true
```

Bằng chứng live trong VS Code (fixture WS phát ready + một waterfall):

```
[gbh-spike] step: approval-wait → approval:stream-ready
[gbh-spike] approval answered: {"clientId":"fixture-client","eventId":"evt-1","outcome":{"kind":"result","value":"allowed-once"}}
```

### 12.2 Diff tệp agent sửa

`src/gbh/changes.ts` đọc `git status --porcelain` của workspace phiên, hiện nhánh **“Thay đổi trong workspace”** trong cây, bấm một tệp → mở **diff editor của VS Code** (`vscode.diff`): bên trái là bản `HEAD`, bên phải là bản đang làm việc (tệp chưa commit thì trái rỗng).

```
[gbh-spike] step: changes → changes:ok
tab: "README.md (HEAD ↔ hiện tại)"
```

### 12.3 Test

`node --test test/*.test.ts` → **96/96** (thêm 5 test duyệt + 4 test diff: porcelain, rename, không phải git, tệp chưa có trong HEAD).
