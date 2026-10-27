import { gbhHome, readReadyUrl } from "../src/gbh/paths.ts";
import { parseReadyUrl } from "../src/gbh/host.ts";
import { authenticate } from "../src/gbh/remote.ts";
import WebSocket from "ws";

/** Thí nghiệm: mở stream $events và in ra các khung (tên + trích đoạn). */
const ready = readReadyUrl(gbhHome());
if (ready === undefined) throw new Error("không có kernel");
const host = parseReadyUrl(ready);
if (host === undefined) throw new Error("ready-url hỏng");
const cookie = await authenticate(host);
if (cookie === undefined) throw new Error("không lấy được cookie");
const url = host.baseUrl.replace("http:", "ws:") + "/api/remote.mux";
const socket = new WebSocket(url, { headers: { cookie } });
let count = 0;
socket.on("open", () => {
  console.log("WS mở:", url);
  socket.send(JSON.stringify({ type: "open", streamId: "ev1", endpoint: "$events", payload: { args: {} } }));
});
socket.on("message", (data) => {
  count += 1;
  const frame = JSON.parse(String(data));
  const value = frame.value ?? {};
  const name = value.type ?? value.event?.type ?? "?";
  console.log("frame", count, "| frame.type:", frame.type, "| value.type:", name, "|", JSON.stringify(value).slice(0, 300));
});
socket.on("error", (error) => console.log("WS lỗi:", String(error)));
setTimeout(() => { try { socket.close(); } catch {} console.log("tổng frame:", count); process.exit(0); }, 15000);
