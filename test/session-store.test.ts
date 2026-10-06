import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendSessionTurn, createSession, deleteSession, listSessions, readSession, validSessionId } from "../src/host/session-store.ts";

async function withRoot<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "galaxy-sessions-"));
  try { return await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test("a session is titled by its first message and lists newest first", async () => {
  await withRoot(async root => {
    const first = await createSession(root, "  Sửa lỗi   build   ở module auth  ");
    assert.equal(first.title, "Sửa lỗi build ở module auth", "the title is the first message, normalised");
    assert.deepEqual(first.messages, []);
    await appendSessionTurn(root, first.id, "user", "Sửa lỗi build");
    const second = await createSession(root, "Viết test cho plan strip");
    const listed = await listSessions(root);
    assert.deepEqual(listed.map(item => item.id), [second.id, first.id], "the newest session leads");
    assert.equal(listed[1]?.messageCount, 1);
    assert.equal(listed[1]?.title, "Sửa lỗi build", "a session keeps the first title, not the last message");
  });
});

test("history round-trips, survives a bad id and is deleted", async () => {
  await withRoot(async root => {
    const session = await createSession(root, "hỏi đáp");
    await appendSessionTurn(root, session.id, "user", "mèo tên gì?");
    await appendSessionTurn(root, session.id, "assistant", "Miu.");
    const loaded = await readSession(root, session.id);
    assert.deepEqual(loaded?.messages.map(turn => turn.role + ": " + turn.content), ["user: mèo tên gì?", "assistant: Miu."]);

    assert.equal(validSessionId("../../etc/passwd"), false, "ids that could escape the storage root are refused");
    assert.equal(await readSession(root, "../../etc/passwd"), null);
    assert.equal(await appendSessionTurn(root, "nope/../x", "user", "hi"), null);
    assert.equal(await deleteSession(root, "../../etc/passwd"), false);

    assert.equal(await deleteSession(root, session.id), true);
    assert.deepEqual(await listSessions(root), []);
    assert.equal(await readSession(root, session.id), null);
  });
});

test("a corrupted document is ignored instead of breaking the list", async () => {
  await withRoot(async root => {
    const session = await createSession(root, "giữ");
    await writeFile(join(root, "sessions", "broken.json"), "{ not json", "utf8");
    const listed = await listSessions(root);
    assert.deepEqual(listed.map(item => item.id), [session.id], "the unreadable document is skipped");
    assert.equal(await readSession(root, "broken"), null);
  });
});
