# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

# 2.0.4

The same content as 2.0.3, which never reached the marketplace: its tag pointed at a commit whose type check
was red, so the publish job stopped before uploading. Nothing shipped from it.
# 2.0.3

## Added

- `yarn resources:sync` / `yarn resources:check`: the marketplace icon and the activity bar art are copied
  from the brand directory of the CLI repo and their hashes recorded, so a brand update can no longer
  leave a stale icon behind. CI clones the brand repo and runs the check.

## Fixed

- Command Palette entries still read "Galaxy Code"; they now read **Galaxy Blackhole**, matching the listing.
# 2.0.2

## Fixed

- The marketplace showed a placeholder instead of the Galaxy mark: the manifest had no `icon` field.
  It now ships the shared 512px app icon, and the activity bar carries the shared brand logo too.
- The activity bar container is titled **Galaxy Blackhole**, matching the listing.
# 2.0.1

First stable release of the 2.0 line. (`2.0.0` went out as a pre-release; the marketplace keeps
pre-release and release versions in separate channels, so the stable release carries the next version.)

The VS Code surface now runs the Galaxy Blackhole core (`@galaxy-stack/ai-coder-core`) — the same
engine as the CLI — instead of its own loop.

## Added

- Per-workspace session list with history: open, delete, start a session; the transcript comes back on
  screen, and the documents live outside the workspace.
- Project MCP servers from `.vscode/mcp.json`, read through the same core module the CLI uses; a server
  that will not start is reported instead of being dropped silently.
- Plan checklist from the agent checkpoints, rendered above the composer.
- `/compact` for the live run, and the compaction is reported to the view.
- Model and key setup edits the shared `~/.galaxy` document.

## Not in 2.0 yet (present in 0.1.x)

- The preview/RAG/workflow-graph/review commands and their keybindings are not part of this surface.
  They can return as the 2.0 line grows.
## [2.0.5] - 2026-10-06 16:40 +0700

### Changed

- **Header có icon bánh răng mở Cài đặt** (thay nút Model): panel Cài đặt gồm mục **Quyền** (3 chế độ phê
  duyệt, đổi tại chỗ) và phần model/nhà cung cấp như trước.
- **Chip Auto ở box nhập liệu nay ghi rõ model đang dùng** (ví dụ `kimi-k2.7-code:cloud`), menu của nó có
  thêm mục mở Cài đặt; menu quyền cũng vậy — mục Tùy chỉnh chết đã bỏ.
- Tên hiển thị trong webview đổi từ Galaxy Code sang **Galaxy Blackhole**.

### Fixed

- **Menu không còn bị cắt ở mép sidebar**: menu mở lên trên, giới hạn bề rộng theo panel, menu của chip
  model neo phải, thêm `max-height` và cuộn.
## [2.0.6] - 2026-10-06 17:05 +0700

Cùng nội dung với 2.0.5, vốn không lên marketplace: tag của nó nằm trên commit còn lỗi type-check (test mới
dùng spread một NodeList trong project build ra CommonJS), và job publish chạy `check-types` trước khi đóng
gói nên dừng ở đó.
## [2.0.7] - 2026-10-06 18:05 +0700

### Changed

- **Header gọn theo kiểu Codex**: bỏ dòng `model — workspace` và bỏ nút Model; còn tên **Galaxy Blackhole**
  cùng hai icon: **trò chuyện mới** (xoá nội dung, mở phiên mới) và **bánh răng** mở Cài đặt.
- **Chip model thành model picker**: menu liệt kê các model của nhà cung cấp đang dùng và đổi được ngay —
  ghi vào `~/.galaxy/config.json`, lượt chạy kế tiếp dùng model mới — kèm mục mở Cài đặt và mở thư viện model.

### Chưa có

- Chọn **thinking / reasoning effort** ngay trong picker: policy hiện chỉ nằm ở CLI (`thinking-policy.ts`),
  core chưa có. Bước tiếp theo là đưa policy đó vào core để CLI, web GUI và extension dùng chung một nguồn.
## [2.0.8] - 2026-10-06 19:20 +0700

### Added

- **Chọn mức suy luận (thinking) trong picker model** — cùng policy với blackhole web và CLI (core 0.3.13):
  menu model giờ có mục **Mức suy luận** với đúng các mức model đó hỗ trợ (Mặc định/Tắt/Thấp/Vừa/Cao/Rất
  cao/Tối đa…), chọn xong ghi vào `~/.galaxy/config.json` và lượt chạy kế tiếp gửi `think` tương ứng.

### Fixed

- Menu quyền không còn mục **Cài đặt** (Cài đặt nằm ở icon bánh răng) và menu model không còn **Cài đặt model**
  / **Mở thư viện model** — đúng như bạn góp ý.
- **Bấm menu này thì menu kia tự đóng**: menu model nay cũng đóng khi bấm ra ngoài hoặc nhấn Escape (trước đây
  chỉ menu quyền có, nên hai menu cùng mở).
## [2.0.9] - 2026-10-06 19:55 +0700

### Changed

- **Picker model/thinking theo kiểu Codex**: thay danh sách dài bằng một popover gọn — mức suy luận hiện ở
  trên (kèm nút ↺ về mặc định), hàng model ở dưới mở ra danh sách model, và **thanh trượt** với đúng số nấc
  mà model cho phép. Kéo tới nấc nào là ghi ngay mức đó vào `~/.galaxy/config.json`.
## [2.0.10] - 2026-10-06 20:30 +0700

### Changed

- **Cài đặt mở ra tab riêng** (như Codex): bấm bánh răng ở header là mở tab *Galaxy Blackhole: Cài đặt* trong
  vùng soạn thảo, không còn tấm overlay trong sidebar.
- **Trang Cài đặt có 3 phần như blackhole web**: **Chung** (chế độ phê duyệt), **Model** (nhà cung cấp, API
  key, model) và **Thông tin** (model, endpoint, workspace, nền tảng).
- **Bỏ thanh Phiên** phía trên khung nhập liệu.

## [2.0.11] - 2026-10-06 21:20 +0700

### Fixed

- **Test host xanh trở lại (38/38)**: cắt vòng import `ui-store → host-bridge` bằng cách tách các registry sự
  kiện ra module lá `webview/src/host-events.ts`. Trước đó bundle ném `Cannot access 'uiEventListeners'
  before initialization` ở module-scope nên **10 test DOM đỏ**.
- **Slider thinking kiểu Codex**: thanh pill bo tròn 14px với **gradient đổi màu theo từng mức** (xám → lam →
  chàm → tím → hồng), chấm mức nằm trong thanh, thumb trắng 20px; **bỏ hàng chữ dưới thanh** — tên mức hiện
  lớn ở trên và **đổi màu theo mức**; kéo được từ bất kỳ đâu (pointer capture), giữ giá trị tạm (draft) nên
  không giật về khi host chưa trả lời; hỗ trợ bàn phím ←/→.
- **Slider to hơn, bỏ viền focus và bỏ 2 icon không cần**: thanh pill 20px, thumb 28px, chấm mức 8px; bỏ
  vòng focus mặc định (chỉ còn viền mảnh khi tab vào bằng bàn phím) và bỏ icon ⚡ cùng nút ↺.
- **Sửa lỗi tab Cài đặt mở ra chat**: cờ chọn giao diện được host bơm thẳng vào HTML
  (`window.__GALAXY_VIEW__`) — trước đó nó nằm trên URL của script, mà `location.hash` là của *trang*, nên tab
  Cài đặt lại render giao diện chat.
- **Cài đặt xếp lại theo bố cục Codex**: rail chọn mục bên trái, bên phải là các nhóm hàng có nhãn + mô tả và
  điều khiển nằm ngoài cùng. Mục **Chung** gồm: Quyền, **Ngôn ngữ (vi/en)**, **Cỡ chữ** (áp dụng thật cho nội
  dung hội thoại), **Cách xử lý tin nhắn tiếp theo** (Xếp hàng / Chuyển hướng) và **Chi tiết công việc**
  (Tiêu chuẩn / Gọn — Gọn ẩn phần args/result của tool).
- **Chip model hiện `auto`** khi dùng nhà cung cấp mặc định, đúng quy ước của CLI và blackhole web (trước đó
  hiện thẳng `deepseek-v4.1-flash:cloud`); rê chuột vẫn thấy model ngầm hiểu trong tooltip.
- **Slider nằm gọn trong khung**: đệm hai bên 20px nên chấm và thumb không còn thò ra ngoài viền popover.
- **Mục Model gọn như blackhole web**: bỏ khối **Quyền** trùng lặp (đã có trong *Chung*), bỏ luôn tiêu đề
  "Cài đặt" và nút ✕ lồng bên trong — panel model giờ chỉ còn danh sách nhà cung cấp và API key.
- **Mục Thông tin như blackhole web**: Tác giả (Bùi Trọng Hiếu), Email, Website (bấm mở được), Phiên bản
  extension đang cài, và **QR Zalo** nhúng sẵn trong webview (không cần file rời).
- **Chuyển hướng (steer) chạy thật**: khi agent đang chạy, ô chọn *Chuyển hướng* làm hiện thêm nút gửi — bấm là
  **huỷ lượt đang chạy rồi chạy lượt mới** với nội dung vừa gõ (seam `steerRun` trong `galaxy-ui-runtime.ts`).
  Kèm đó là một bug thật: runtime chỉ đọc state **một lần** nên `isRunning` không cập nhật — nay đã subscribe.
- **i18n phủ thêm**: màn hình trống, toàn bộ tab **Cài đặt** (nhãn, mô tả, các lựa chọn), nhãn ngắn của chip
  quyền và tên các mức suy luận. Chưa bọc: pane Model, thẻ tool và dải kế hoạch.
- **Sửa gốc lỗi cỡ chữ không có tác dụng**: hai webview (panel chat và tab Cài đặt) là **hai document riêng** nên
  `localStorage` không chia sẻ ✗ — đổi cỡ chữ bên Cài đặt thì panel chat không hề biết. Preferences nay do **host**
  giữ (`src/host/preferences.ts`, ghi vào global storage) và host phát cho **cả hai** webview, giống permission mode.
- **Chữ to hơn, đọc dễ hơn**: mặc định 15px (khoảng chọn 12–22), áp cho nội dung hội thoại, ô nhập và cả trang
  Cài đặt (nhãn/mô tả/ô chọn theo cỡ đó).
- **i18n nốt phần còn lại**: dải kế hoạch (PlanStrip) và pane **Model** (ModelSetup) đã bọc `t()` — thêm 22 cặp
  dịch. Đổi sang English là đổi cả hai chỗ này.
- Bỏ 2 test của thanh Phiên (đã gỡ theo yêu cầu) và thay bằng test chốt: khung nhập liệu không còn thanh đó,
  và message phiên vẫn không làm hỏng view.

> Chưa publish marketplace — bản này chỉ nằm trên git; tag `v2.0.11` sẽ tạo khi có yêu cầu.

## [2.0.12] - 2026-10-07 03:40 +0700

### Fixed

- **Hết `SESSION_ERROR: Workspace mutation snapshot exceeded its byte limit`** trên workspace lớn (gặp trên
  Windows): core 0.3.14 giới hạn theo từng tệp (8 MiB) và **hạ cấp** sang băm metadata thay vì giết lượt chạy,
  nên mở thẳng thư mục cha nặng (có `.vscode-test/`, `graphify-out/`, PDF, video…) vẫn chat được bình thường.
  Không cần thêm tên thư mục derived nào nữa — thư mục lạ chỉ làm snapshot bị đánh dấu `degraded`.## [2.0.13] - 2026-10-07 04:10 +0700

### Fixed

- **Model hiển thị `auto`** cho nhà cung cấp mặc định (thay vì `Ollama · https://ollama.com ·
  deepseek-v4.1-flash:cloud`) — đúng quy ước: `auto` nghĩa là ngầm dùng Ollama + model mặc định.
- **Thông tin**: bỏ hai hàng Model và Endpoint; **Workspace** và **Nền tảng** chuyển sang mục **Chung**.## [2.0.14] - 2026-10-07 05:15 +0700

### Changed

- **Bỏ hẳn credential khỏi `config.json`**: key chỉ còn nằm ở store chung `~/.galaxy/credentials.yaml` (ref
  `GBH_<PROVIDER>_API_KEY`) — mirror `agent[manual]` và `providers.items[]` không còn ghi `apiKey` nữa.
- **Migration tự động, không ai mất key**: trước mỗi lần ghi tài liệu, key nào chỉ tồn tại trong mirror sẽ được
  **copy sang store chung** trước; nếu store chung đã có thì giữ nguyên giá trị ở đó (mirror cũ bị bỏ qua).

> Đây là bước 1 của kế hoạch: các bản mới đọc store chung trước, mirror chỉ còn là fallback cho tài liệu cũ.
> Bước 2 (bỏ fallback trong CLI/core) sẽ làm sau khi bản này tới tay người dùng.## [2.0.15] - 2026-10-07 14:30 +0700

### Fixed

- **Lượt chạy không còn treo vô hạn khi stream model im lặng**: client Ollama trước đây đọc stream **không giới
  hạn** nên chỉ cần đường truyền khựng một nhịp là lượt chạy đứng mãi ở tool cuối (đúng triệu chứng "dừng ở
  `detect_project`"). Nay stream im lặng **180 giây** là huỷ và báo rõ: *"Ollama stream im lặng 180s — lượt
  chạy đã dừng."*.

### Changed

- **Tool call hiển thị bằng tên, không phải id hàm**: trước đây thẻ tool in thẳng `list_files`, `detect_project`
  — id mà model gọi. Nay webview đọc **chung bảng tên với TUI** (`@galaxy-stack/ai-coder-core/tools`):
  *"Liệt kê thư mục"*, *"Nhận diện dự án"*, kèm chi tiết gọn (*"Đọc tệp (src/app.ts)"*); id gốc vẫn nằm ở
  tooltip khi rê chuột.
- **Chip model đọc `Auto - <mức suy luận>`** (viết hoa), ví dụ `Auto - Mặc định (hệ thống)` hoặc `Auto - Cao`.
- **Danh sách model gọn như blackhole web**: với nhà cung cấp mặc định chỉ hiện **một dòng `Auto`** thay vì
  phơi id model (`deepseek-v4.1-flash:cloud`); chọn dòng đó không ghi lại provider.## [2.0.16] - 2026-10-07 15:20 +0700

### Fixed

- **Chữ hiện ra theo từng delta, không phải đợi hết câu**: `streamRound` trước đây **gom toàn bộ** nội dung rồi
  mới phát một lần (`content += delta.content` … `yield { delta: content }`) nên ô chat chỉ đầy khi model viết
  xong — đúng cảm giác "phải full text mới hiện". Nay delta được đẩy qua hàng đợi **ngay khi tới**, và có test
  chứng minh delta tới **trước khi** stream đóng (code cũ sẽ timeout ở test này).

### Added

- **Dòng trạng thái trên ô nhập, như CLI**: *"Đang suy nghĩ…"*, *"Đang gọi Liệt kê thư mục…"* (dùng bảng tên
  công cụ chung), *"Đã dừng: <lý do>"*, *"Đã dừng theo yêu cầu"*. Nhờ đó nếu lượt chạy có dừng thì **thấy ngay
  lý do** thay vì im lặng — trước đây store có ghi `run/status` nhưng không UI nào hiển thị.## [2.0.17] - 2026-10-07 15:45 +0700

### Fixed

- **Nguyên nhân thật của "dự án nào cũng dừng sau hai tool đầu"**: id tool-call được sinh theo **chỉ số trong
  lượt** (`call-1`, `call-2`…), nên **lượt thứ hai lại bắt đầu từ `call-1`** — mà run controller thì nhớ id
  theo cả lượt chạy. Kết quả: model vừa xin thêm tool ở lượt hai là bị chặn với lỗi
  *"toolCallId call-1 was already used in this run"* và lượt chạy chết — đúng khớp triệu chứng: hai tool đầu
  chạy xong rồi đứng. Nay mỗi call có id riêng (`randomUUID`), giống core, và có test bắt đúng lỗi này.## [2.0.18] - 2026-10-07 16:20 +0700

### Added

- **Gom các tool liên tiếp thành một thẻ** như các hệ thống khác: *"Đã gọi 5 công cụ · Liệt kê thư mục, Nhận
  diện dự án, Đọc tệp…"* — bấm ▸ để xem chi tiết từng tool trong nhóm. Trước đây mỗi call một thẻ nên
  transcript bị ngập, nhất là khi model đọc nhiều tệp liên tiếp.
- **Thinking hiện ngay khi model suy luận**: khối *"Suy luận"* **tự mở** trong lúc lượt chạy đang diễn ra (trước
  đây mặc định đóng nên trông như model không có thinking); một cú bấm để ghim mở/đóng.

### Fixed

- Nhãn công cụ không còn in cặp ngoặc rỗng (*"Liệt kê thư mục ( )"* → *"Liệt kê thư mục"*) — sửa ở core
  0.3.17, bản này đóng gói kèm.
- Kèm bản sửa **2.0.17**: id tool-call phải duy nhất cho **cả lượt chạy**, không chỉ trong một lượt — đây là
  nguyên nhân "dự án nào cũng dừng sau hai tool đầu" (*"toolCallId call-1 was already used in this run"*).## [2.0.19] - 2026-10-07 16:45 +0700

### Added

- **Chỉ báo trạng thái sống động thay cho dòng chữ đơn điệu**: trước `"Đang suy nghĩ…"` chỉ là chữ tĩnh. Nay có
  **vòng xoáy quay** (vòng cung gradient kiểu đĩa bồi tụ — đúng chất Galaxy Blackhole), **chữ shimmer** chạy
  qua, và **ba chấm nhấp nháy** theo nhịp.
  Tất cả là **CSS thuần**: không timer JavaScript nào chạy nền, và khi `prefers-reduced-motion` được bật thì
  giữ nguyên chữ, bỏ hết chuyển động.
- Khi lượt chạy **kết thúc hoặc lỗi**, hoạt ảnh dừng và dòng trạng thái chuyển sang màu cảnh báo — nhìn là biết
  đang chạy hay đã dừng.## [2.0.20] - 2026-10-07 17:10 +0700

### Fixed

- **Markdown của model được render đầy đủ (GFM)**: bảng dạng `| cột | cột |` trước đây hiện **nguyên dấu sổ**
  trong khung chat vì renderer thiếu **GFM**. Nay có `remark-gfm` (đúng cách thư viện `assistant-ui` hỗ trợ:
  `MarkdownTextPrimitive` nhận `remarkPlugins`) → bảng thành bảng thật, kèm gạch ngang, danh sách nhiệm vụ và
  autolink.
- Thêm style cho bảng và nội dung markdown: nền cho hàng tiêu đề, sọc xen kẽ, viền, blockquote và danh sách —
  dễ đọc trong cả theme sáng và tối.

### Test

- Dựng một bảng markdown thật qua `message/text-delta` rồi khẳng định DOM có `<table>` với đúng hai ô tiêu đề
  và hai hàng, đồng thời **không** còn dòng `|---|` nào sót lại.## [2.0.21] - 2026-10-07 17:40 +0700

### Fixed

- **Suy luận hiện đúng thứ tự, không còn bị dồn lên đầu**: trước đây mỗi delta thinking được gộp vào part
  `reasoning` **đầu tiên** hoặc `unshift` lên đầu tin nhắn, nên **toàn bộ** suy luận của cả lượt chạy nằm trên
  cùng. Nay suy luận là một **part trong dòng chảy** như text: gộp vào khối đang mở, mở khối mới khi model
  chuyển việc — đúng tuần tự think → viết → gọi tool → think…

### Changed

- **Thẻ nhóm tool gọn lại**: chỉ còn *"Đã gọi 9 công cụ"*; danh sách tên nằm trong phần mở rộng và tooltip.
- **Tool kế hoạch không còn chiếm một dòng trong transcript** (`task_checkpoint`, `update_checkpoint`): chúng chỉ
  là ghi chú tiến độ, UI kế hoạch mới là chỗ người dùng đọc — model vẫn thấy đầy đủ trong lịch sử của nó.
- **UI kế hoạch thành checklist thật**: đánh số `1.` `2.` `3.`; badge **xám = chờ**, **spinner xanh = đang làm**
  (kèm nhãn *"Đang làm"*), **tick xanh = xong**, *"Bỏ qua"* mờ; tiêu đề có bộ đếm `2/5` và **thu gọn/mở rộng** được.## [2.0.22] - 2026-10-07 18:05 +0700

### Changed

- **Chỉ báo chạy gọn theo đúng kiểu đã chọn**: bỏ vòng xoáy ở đầu dòng; giữ **ba chấm nhấp nháy** và thêm **đồng
  hồ giây** — `Đang suy nghĩ... 20s` — với chữ màu link như ảnh mẫu.

### Fixed

- Đồng hồ dùng `setInterval` nhưng gọi **`unref()`** ở nơi có (Node — tức là trong test): một timer đang chạy
  **không thể** giữ process mở nữa. Trong trình duyệt `unref` không tồn tại nên là no-op. Đây chính là lỗi đã
  làm treo test runner ở lần thêm đồng hồ trước đó.
- `prefers-reduced-motion`: giữ nguyên chữ, bỏ hoạt ảnh.## [2.0.23] - 2026-10-07 19:15 +0700

### Changed

- **Câu báo lỗi trung tính với nhà cung cấp**: *"Ollama stream im lặng 180s — lượt chạy đã dừng."* → *"Không nhận
  được dữ liệu trong 180s — lượt chạy đã dừng."* Người dùng chỉ thấy provider **`auto`** (Galaxy Blackhole tự
  chọn `deepseek-v4.1-flash`); hệ thống bên dưới không cần lộ ra.
- README: bỏ tên vendor khỏi bảng mô tả nguồn.## [2.0.24] - 2026-10-09 11:10 +0700

### Fixed

- **Kế hoạch cập nhật thật, không còn đứng im ở `1/4`**: core phát sự kiện `{ type: "plan", plan, planMode }`
  nhưng webview chỉ hiểu `plan/updated`, và host chuyển tiếp nguyên xi — nên dù model có cập nhật kế hoạch bao
  nhiêu lần, checklist vẫn không nhúc nhích. Nay host dịch sự kiện (`src/host/plan-event.ts`), ưu tiên `steps`
  đầy đủ và quy đổi từ các nhóm cũ khi cần; có 2 test khoá hành vi này.
- **Danh sách tin nhắn không còn trống trong những giây đầu**: khi lượt chạy đang đi mà chưa có nội dung nào, khung
  chat hiện dòng *"Đang xử lý…"* với ba chấm động — trước đây chỉ có dòng trạng thái nhỏ dưới ô nhập nên nhìn như
  app không phản hồi.

### Changed

- **Bố cục khung kế hoạch sửa lại**: `.plan-strip` là **cột** (tiêu đề trên, danh sách dưới) thay vì một hàng
  ngang — chính vì hàng ngang mà hai chip và danh sách chen vào nhau, xô lệch như ảnh bạn gửi.## [2.0.25] - 2026-10-09 11:40 +0700

### Test

- **Khoá tính chất streaming của thinking**: `mapCoreEventToUi` là nơi duy nhất chạm giữa hình dạng sự kiện của
  core và dây UI, và nó phát **một sự kiện cho mỗi delta** — `thinking` → `message/thinking-delta`, `content` →
  `message/text-delta`, không gom, không đợi hết pha suy luận. Test mới khẳng định đúng thứ tự và nội dung của
  ba delta liên tiếp (hai thinking rồi một content).## [2.0.26] - 2026-10-09 12:20 +0700

### Fixed

- **~30 giây đầu đứng yên: đã tìm ra và nói rõ đang làm gì.** `run/status: running` được phát **ngay khi bấm
  gửi**, nhưng trước delta đầu tiên còn ba việc nặng: `await this.mcpTools()` (**kết nối MCP server**),
  `model.capabilities()` (**một vòng gọi provider** để dò khả năng) và `createCoreToolExecutor` (**lập chỉ mục
  workspace**). Trong suốt thời gian đó UI vẫn nói *"Đang suy nghĩ"* — nhìn như app chết. Nay từng bước phát
  tiến trình riêng: *"Đang kết nối công cụ và đọc workspace…"* → *"Đang đọc khả năng của model…"* → *"Đang lập
  chỉ mục workspace…"*, và khi delta đầu tiên tới thì dòng trạng thái tự trở về *"Đang suy nghĩ"*.
- **Kế hoạch không còn kẹt ở "đang làm" sau khi lượt chạy kết thúc**: nếu lượt chạy kết thúc mà model chưa xác
  nhận bước nào, bước đó trở về **chờ** thay vì đứng mãi ở trạng thái đang làm.

### Changed

- **Kế hoạch bỏ hẳn chữ trạng thái** (*Xong / Đang làm / Chờ*): bước đã xong = **tick + gạch ngang chữ**, bước
  đang làm = **chữ tô màu nhấn, in đậm** kèm spinner, bước còn chờ = chữ mờ. Nhìn là biết, không cần đọc.## [2.0.27] - 2026-10-09 18:20 +0700

### Changed — giao diện hội thoại, đợt 1 (theo hướng blackhole web)

- **Tầng token thiết kế + một ngôn ngữ card duy nhất**: tool card, nhóm tool, kế hoạch và khối suy luận nay dùng
  chung bán kính 8px, viền 1px, cùng thang khoảng cách và cùng chiều cao header tối thiểu 28px.
- **Nhịp đọc**: line-height 1.6 cho toàn bộ văn bản, khoảng cách rõ giữa các lượt, và `scroll-padding-bottom` để
  composer không che mất nội dung khi cuộn tới cuối.
- **Chữ nhỏ vẫn phải đọc được**: nhãn nâng lên tối thiểu 11px kèm tracking, chữ trong khối code 11.5-12px với
  line-height 1.5.
- **Focus ring hiện rõ** cho mọi phần tử tương tác (`:focus-visible`), và `prefers-reduced-motion` được tôn trọng
  ở phạm vi toàn cục thay vì chỉ vài animation.
- **Trạng thái không chỉ bằng màu**: mỗi trạng thái có glyph riêng (✓ · ✗ · ⏳) kèm màu, nên vẫn đọc được với người
  khó phân biệt màu.

### Fixed

- **Tên nhà cung cấp bị lộ trong giao diện**: dòng phụ ở màn hình trống và ba nhãn khác còn in tên nhà cung cấp.
  Nay dùng nhãn trung tính (*Máy cục bộ*, *Tương thích máy cục bộ*).
- **Selector CSS trỏ vào class không tồn tại** (rule chết): sửa về đúng `tool-header`, `plan-head` và các trạng
  thái `tool-running` / `tool-done` / `tool-error` / `tool-pending`.## [2.0.28] - 2026-10-09 21:10 +0700

### Added (P4b của `docs/design/tool-modes.md`)

- **Extension chạy được `ptc`**: khi chế độ công cụ không phải `native`, host compose `WorkerCodeRuntime` (mỗi
  chương trình một worker thread, heap cap, deadline, huỷ) và đưa cho **cả** executor lẫn run controller — nên
  chốt chặn `CODE_RUNTIME_MISSING` của core tự mở.
- **Worker được build riêng**: esbuild sinh thêm `dist/code-worker-entry.mjs`, vì worker sống trên thread riêng
  với module graph riêng nên không thể nằm trong bundle extension; runtime tìm nó ngay cạnh bundle.
- Tuỳ chọn `toolsMode` trong preferences của host: `native (mặc định) | ptc | both`, đọc lúc bắt đầu phiên.

### Fixed

- **`__dirname` không tồn tại khi chạy mã nguồn dạng ESM** (test bắt được). Cách sửa cũng là cách đúng theo thiết
  kế: sandbox **chỉ** được compose khi mode không phải `native`, nên đường chạy mặc định không đụng tới worker —
  native không cần runtime.## [2.0.29] - 2026-10-10 09:20 +0700

### Added (P4c của `docs/design/tool-modes.md`)

- **VS Code: call con của chương trình lồng ngay trong thẻ `run_code`.** Sự kiện `tool/start` mang thêm `parent`,
  store giữ nó trên part, và `toolRunFor` **loại** call con khỏi lượt gọi cấp cao nhất — nên dòng *"Đã gọi N công
  cụ"* không đếm chúng là công cụ riêng.
- Thẻ `run_code` render các call con thành **dòng thụt lề luôn hiển thị** (kể cả khi thẻ đang thu gọn), nên đọc
  transcript là thấy chương trình đã gọi những gì mà không phải mở gì thêm.
- Host extension theo dõi call `run_code` đang chạy rồi phát `tool/start` / `tool/result` cho từng call con kèm
  `parent` — cùng một đường sự kiện mà call trực tiếp đi qua.

### Test

- `test/webview-nested-calls.test.ts`: một chương trình là **một** tool trong lượt; các call của nó thuộc về nó và
  đúng là những gì thẻ render lồng.## [2.0.30] - 2026-10-10 11:30 +0700

### Added

- **Chọn chế độ công cụ ngay trong trang Cài đặt**: `Từng công cụ` (mặc định), `Qua chương trình (ptc)`, `Cả hai` —
  không phải sửa tay `preferences.json` nữa. Mục này ghi xuống host qua đúng đường `preferences/set` mà mọi tuỳ
  chọn khác đang dùng, và có nhãn aria + mô tả như các mục còn lại.## [Unreleased]

### Changed

- **Runtime is now `@galaxy-stack/ai-coder-core`** (was a broken
  `@galaxy/ai-coder-core` link into the pre-restructure path). The webview keeps
  its `ui-protocol.ts` seam; only the host side changed.
- Host is durable instead of in-memory: `FileRunStore` checkpoints, a redacted
  NDJSON trace port, an 8 MiB tool-output spill, and the core's
  `NodeWorkspaceEvidenceVerifier` for resume — all under
  `context.globalStorageUri`, never inside the workspace.
- The five hand-written workspace tools were replaced by the core's canonical
  executor (`NodeToolExecutor` + `NodeWorkspaceReviewExecutor` when the workspace
  is not a Git work tree + a read-only `tool_output.read` artifact reader,
  composed through `CompositeToolExecutor`), so schemas, effect profile, policy,
  and idempotency come from the core.
- Approval prompts now flow through the core's approval port: the executor is
  built with the `strict` profile and the port applies the live webview mode
  (`ask` prompts, `smart` uses the `balanced` threshold, `auto`
  auto-approves).

### Added

- Command **Galaxy Blackhole: Open Web GUI** — runs `blackhole web --no-open`,
  scrapes the token URL from stdout, and opens it in the real browser. The web GUI
  is not embedded: its session cookie is `SameSite=Strict` and its `/api` fence
  rejects cross-site requests, so a `vscode-webview://` iframe could never
  authenticate.
- **Model setup panel** in the sidebar, mirroring the Galaxy Blackhole web
  surface: the active provider card with its API key field, a catalog of known
  routes, and the custom-provider form (provider id, display name, API protocol,
  base URL, models, optional key). It opens automatically when the active
  provider has no key and is reachable from the header's **Model** button.
- Provider list support in the shared `~/.galaxy/config.json`: the panel writes
  `providers.items` and mirrors the active provider into the single
  `agent[type=manual]` entry the core resolver reads, so the CLI, this extension,
  and the core adapter always agree. Keys are never sent to the webview.
- Provider keys are written to the **shared** `~/.galaxy/credentials.yaml`
  (`GBH_<ID>_API_KEY`, DSH's document schema) through
  `@galaxy-stack/ai-coder-core/adapters/node/config/galaxy-credentials`, while
  `config.json` keeps the compatibility mirror older builds read. Reading prefers
  the shared document, so a key stored by the CLI or the web GUI appears here
  without re-entry.
- Settings `galaxy-code.cliPath` and `galaxy-code.webPort`.
- `npm run test:host`: node:test coverage for the pure host helpers (web launcher
  argv and URL parsing, spill round-trip and traversal refusal, trace redaction,
  durable store creation) plus a `tsconfig.test.json` project.

## [2.0.0-prototype.0] - 2026-09-18

### Changed

- Marketplace display name: "Galaxy Code (v2 prototype)" → "Galaxy Blackhole".
- Marketplace item ID stays `kevinbui.galaxy-code-vscode` (IDs cannot be renamed;
  the old ID preserves install counts and ratings).
- Project joins the AI coding product line under the
  [galaxy-blackhole](https://github.com/galaxy-blackhole) organization.

## Historical

Prototype history lives in the git history of this repository.
