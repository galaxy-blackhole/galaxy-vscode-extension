import { gbhHome, readReadyUrl } from "../src/gbh/paths.ts";
import { parseReadyUrl } from "../src/gbh/host.ts";
import { authenticate, listSessions } from "../src/gbh/remote.ts";
import { readTranscript } from "../src/gbh/transcript.ts";

/** Live proof: a real transcript out of this machine's kernel. */
const ready = readReadyUrl(gbhHome());
if (ready === undefined) {
  console.log("KHÔNG có kernel — bỏ qua");
  process.exit(0);
}
const host = parseReadyUrl(ready);
if (host === undefined) throw new Error("ready-url hỏng");
const cookie = await authenticate(host);
if (cookie === undefined) throw new Error("không lấy được cookie");
const sessions = await listSessions({ host, cookie });
const target = sessions.find((item) => item.title !== undefined) ?? sessions[0];
if (target === undefined) {
  console.log("kernel không có phiên nào");
  process.exit(0);
}
const transcript = await readTranscript({ host, cookie }, target.id, 12);
console.log("phiên:", target.id, "|", transcript.title);
console.log("số dòng:", transcript.messages.length, "| hasMore:", transcript.hasMore);
for (const message of transcript.messages.slice(0, 4)) {
  console.log(" -", message.role, "|", message.text.replace(/\s+/gu, " ").slice(0, 90));
}
