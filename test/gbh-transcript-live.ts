import { gbhHome, readReadyUrl } from "../src/gbh/paths.ts";
import { parseReadyUrl } from "../src/gbh/host.ts";
import { authenticate, listSessions } from "../src/gbh/remote.ts";
import { readTranscript } from "../src/gbh/transcript.ts";

/** Đọc lại phiên vừa nhận prompt, in ra các tin nhắn. */
const ready = readReadyUrl(gbhHome());
if (ready === undefined) throw new Error("không có kernel");
const host = parseReadyUrl(ready);
if (host === undefined) throw new Error("ready-url hỏng");
const cookie = await authenticate(host);
if (cookie === undefined) throw new Error("không có cookie");
const sessionId = process.argv[2] ?? "session-5d902e63-cb5f-4707-8485-d78b04fbcae9";
const sessions = await listSessions({ host, cookie });
const summary = sessions.find((item) => item.id === sessionId);
console.log("phiên:", sessionId, "| title:", summary?.title, "| asOfSeq:", summary?.asOfSeq);
const transcript = await readTranscript({ host, cookie }, sessionId, 10);
console.log("số dòng:", transcript.messages.length);
for (const message of transcript.messages) console.log(" -", message.role, "|", message.text.replace(/\s+/gu, " ").slice(0, 100));
