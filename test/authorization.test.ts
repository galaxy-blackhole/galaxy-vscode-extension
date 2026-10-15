import assert from "node:assert/strict";
import test from "node:test";
import { ExtensionAuthorization, maskCredential } from "../src/host/authorization.ts";

/**
 * The panel's half of the authorization seam. The secret goes to the key store and the model gets a masked form; these
 * tests hold both halves, and hold the decline, which must store nothing at all.
 */
const SECRET = "sk-live-abcdefghijklmnop1234";

test("the panel's answer is stored and only its masked form comes back", async () => {
  const saved: { credential: string; secret: string }[] = [];
  const port = new ExtensionAuthorization({
    ask: async () => SECRET,
    save: (input) => saved.push({ ...input }),
  });
  const outcome = await port.requestSecret({ credential: "galaxy", message: "Dán API key" });
  assert.deepEqual(saved, [{ credential: "galaxy", secret: SECRET }]);
  assert.deepEqual(outcome, { credential: "galaxy", masked: "sk-…1234" });
  assert.equal(JSON.stringify(outcome).includes(SECRET), false, "the secret is not in what the model receives");
});

test("nobody answering is a decline, and nothing is stored", async () => {
  const saved: unknown[] = [];
  const declined = new ExtensionAuthorization({ ask: async () => null, save: (i) => saved.push(i) });
  const blank = new ExtensionAuthorization({ ask: async () => "  ", save: (i) => saved.push(i) });
  assert.equal(await declined.requestSecret({ credential: "galaxy", message: "?" }), null);
  assert.equal(await blank.requestSecret({ credential: "galaxy", message: "?" }), null);
  assert.deepEqual(saved, []);
});

test("a short secret has no visible window", () => {
  assert.equal(maskCredential("short"), "…");
  assert.equal(maskCredential("12345678"), "…");
  assert.equal(maskCredential("123456789"), "123…6789");
});
