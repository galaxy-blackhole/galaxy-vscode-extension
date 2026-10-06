/**
 * Webview UI test: the session panel.
 *
 * The host sends the workspace's session list; the chip must show the count, the panel must list the
 * sessions, and opening one must ask the host to load that session's history.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { bootWebview, clickElement } from "./helpers/webview-harness.ts";

test("the session panel lists the workspace history and opens a session", async () => {
  const booted = await bootWebview();
  booted.window.dispatchEvent(new booted.window.MessageEvent("message", { data: {
    type: "session-list",
    sessions: [
      { id: "s-1", messageCount: 4, title: "Sửa lỗi build", updatedAt: "2026-10-05T12:00:00.000Z" },
      { id: "s-2", messageCount: 2, title: "Viết test cho plan strip", updatedAt: "2026-10-05T11:00:00.000Z" },
    ],
  } }));
  await new Promise(resolve => setTimeout(resolve, 120));
  const chip = booted.document.querySelector(".session-chip");
  assert.ok(chip, "the sessions chip renders");
  assert.equal(chip.textContent, "Phiên · 2", "the chip counts what the workspace already has");

  clickElement(booted, chip);
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(booted.document.querySelectorAll(".session-item").length, 2, "the panel lists both sessions");
  assert.match(booted.document.querySelector(".session-list")?.textContent ?? "", /Sửa lỗi build/);

  clickElement(booted, booted.document.querySelector(".session-open")!);
  await new Promise(resolve => setTimeout(resolve, 120));
  const actions = booted.posted
    .filter(message => message.type === "session/action")
    .map(message => message.action as { id?: string; type?: string } | undefined);
  assert.deepEqual(actions.at(-1), { id: "s-1", type: "open" }, "opening a session asks the host for its history");
  assert.equal((actions[0] as { type?: string } | undefined)?.type, "list", "opening the panel refreshes the list first");
});

test("a session without history shows the empty state instead of a bare list", async () => {
  const booted = await bootWebview();
  booted.window.dispatchEvent(new booted.window.MessageEvent("message", { data: { type: "session-list", sessions: [] } }));
  await new Promise(resolve => setTimeout(resolve, 100));
  clickElement(booted, booted.document.querySelector(".session-chip")!);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(booted.document.querySelector(".session-empty"), "the empty state renders");
  assert.equal(booted.document.querySelectorAll(".session-item").length, 0);
});
