import { gbhHome, readReadyUrl } from "../src/gbh/paths.ts";
import { parseReadyUrl } from "../src/gbh/host.ts";
import { authenticate, listSessions, sendPrompt } from "../src/gbh/remote.ts";
import { openEventStream } from "../src/gbh/events.ts";
import { APPROVAL_EVENT } from "../src/gbh/approval-bridge.ts";

/** Bằng chứng live: host thật hỏi duyệt, script trả lời "rejected". */
const ready = readReadyUrl(gbhHome());
if (ready === undefined) throw new Error("không có kernel");
const host = parseReadyUrl(ready);
if (host === undefined) throw new Error("ready-url hỏng");
const cookie = await authenticate(host);
if (cookie === undefined) throw new Error("không lấy được cookie");

const sessions = await listSessions({ host, cookie });
const scratch = sessions.find((item) => item.title === undefined) ?? sessions[0];
if (scratch === undefined) throw new Error("không có phiên");

let sawApproval = false;
const stream = openEventStream(host, cookie, {
  onFrame: (value) => { const v = value as { type?: string; event?: string }; if (v.type === "waterfall") console.log("RAW waterfall:", JSON.stringify(value).slice(0, 500)); },
  onReady: (clientId) => console.log("stream sẵn sàng, clientId:", clientId.slice(0, 8)),
  onWaterfall: async (request) => {
    console.log("waterfall:", request.event, "|", JSON.stringify(request.request).slice(0, 160));
    if (request.event !== APPROVAL_EVENT) {
      await stream.answer(request.eventId, { kind: "next" });
      return;
    }
    sawApproval = true;
    await stream.answer(request.eventId, { kind: "result", value: "rejected" });
    console.log("→ đã trả lời: rejected");
  },
  onEmit: (event) => {
    if (event.startsWith("approval/") || event.startsWith("session/")) return;
    console.log("emit:", event);
  },
  onClose: (reason) => console.log("stream đóng:", reason),
});

await new Promise((resolve) => setTimeout(resolve, 1500));
console.log("gửi prompt yêu cầu ghi ngoài workspace vào phiên", scratch.id.slice(0, 12));
const accepted = await sendPrompt({ host, cookie }, {
  sessionId: scratch.id,
  text: "Chạy đúng lệnh này bằng công cụ bash: echo gbh > /Users/buitronghieu/Desktop/gbh-approval-probe.txt",
});
console.log("prompt accepted:", accepted);
await new Promise((resolve) => setTimeout(resolve, 25000));
console.log("thấy approval request:", sawApproval);
stream.close();
process.exit(0);
