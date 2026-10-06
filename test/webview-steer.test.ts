/**
 * Steering and language. The preference is read when the bundle runs, so the harness seeds storage first.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { bootWebview, clickElement } from "./helpers/webview-harness.ts";

const tick = () => new Promise(resolve => setTimeout(resolve, 150));

/** The host owns the preferences; a panel learns them from this broadcast. */
function seedPreferences(booted: Awaited<ReturnType<typeof bootWebview>>, patch: Record<string, unknown>): void {
  const preferences = { fontSize: 15, locale: "vi", nextMessage: "queue", workDetail: "standard", ...patch };
  booted.window.dispatchEvent(new booted.window.MessageEvent("message", { data: { type: "preferences", preferences } }));
}

test("with steering on, a message sent while a run is live cancels it and starts the new one", async () => {
  const booted = await bootWebview();
  seedPreferences(booted, { nextMessage: "steer" });
  booted.window.dispatchEvent(new booted.window.MessageEvent("message", { data: { type: "ui-event", event: { kind: "run/status", status: "running" } } }));
  await tick();
  const box = booted.document.querySelector(".composer-card-input") as HTMLTextAreaElement;
  assert.ok(box, "the composer renders");
  const setter = Object.getOwnPropertyDescriptor(booted.window.HTMLTextAreaElement.prototype, "value")!.set!;
  setter.call(box, "chuyển hướng sang việc khác");
  box.dispatchEvent(new booted.window.Event("input", { bubbles: true }) as unknown as Event);
  await tick();
  const steer = booted.document.querySelector(".composer-steer");
  assert.ok(steer, "the steer button shows up while a run is live");
  clickElement(booted, steer);
  await tick();
  const actions = booted.posted.filter(message => message.type === "ui-action").map(message => message.action as { type?: string; input?: string });
  assert.ok(actions.some(action => action.type === "run/cancel"), "the live turn is cancelled: " + JSON.stringify(actions));
  assert.ok(actions.some(action => action.type === "run/start" && action.input === "chuyển hướng sang việc khác"), "and the new message starts a run");
});

test("the language setting translates the interface", async () => {
  const booted = await bootWebview();
  seedPreferences(booted, { locale: "en" });
  await tick();
  assert.equal((booted.document.querySelector(".composer-card-input") as HTMLTextAreaElement).getAttribute("placeholder"), "Ask anything");
  assert.match(booted.document.querySelector(".composer-card")?.textContent ?? "", /Approve for me|Ask before acting|Full access/, "the permission chip speaks English too");
});