import { readFileSync } from "node:fs";
import { gbhHome, readReadyUrl } from "../src/gbh/paths.ts";
import { parseReadyUrl } from "../src/gbh/host.ts";
import { authenticate, listSessions } from "../src/gbh/remote.ts";
import WebSocket from "ws";

/** Thí nghiệm: mở stream session/follow rồi thử gửi một prompt, xem khung trả về. */
const ready = readReadyUrl(gbhHome());
if (ready === undefined) throw new Error("không có kernel");
const host = parseReadyUrl(ready);
if (host === undefined) throw new Error("ready-url hỏng");
const cookie = await authenticate(host);
if (cookie === undefined) throw new Error("không lấy được cookie");
const sessions = await listSessions({ host, cookie });
const blank = sessions.find((item) => item.title === undefined) ?? sessions[0];
if (blank === undefined) throw new Error("không có phiên nào");
console.log("dùng phiên:", blank.id, "| title:", blank.title, "| asOfSeq:", blank.asOfSeq);

const url = host.baseUrl.replace("http:", "ws:") + "/api/remote.mux";
const socket = new WebSocket(url, { headers: { cookie } });
const seen: unknown[] = [];
socket.on("open", () => {
  console.log("WS mở:", url);
  socket.send(JSON.stringify({ type: "open", streamId: "s1", endpoint: "session/follow", payload: { args: { request: { address: { kind: "session", sessionId: blank.id }, assistantStream: true } } } }));
});
socket.on("message", (data) => {
  const frame = JSON.parse(String(data));
  seen.push(frame.type);
  console.log("frame:", frame.type, JSON.stringify(frame).slice(0, 400));
  if (seen.length === 1) {
    socket.send(JSON.stringify({ type: "item", streamId: "s1", value: { type: "prompt", content: [{ type: "text", text: "GBH spike: trả lời đúng một chữ OK" }], mode: "queue" } }));
    console.log("→ đã gửi uplink prompt (đoán hình dạng)");
  }
  if (seen.length >= 8) {
    socket.send(JSON.stringify({ type: "cancel", streamId: "s1" }));
    socket.close();
  }
});
socket.on("error", (error) => console.log("WS lỗi:", String(error)));
setTimeout(() => { try { socket.close(); } catch {} console.log("kết thúc sau 14s; các loại frame:", [...new Set(seen)].join(",")); process.exit(0); }, 14000);
