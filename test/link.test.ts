import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { linkMessage, newNonce, verifyLinkSignature } from "../src/link/message.js";

describe("wallet link signatures", () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const other = privateKeyToAccount(generatePrivateKey());
  const message = linkMessage(12345, newNonce());

  it("accepts a signature from the claimed wallet", async () => {
    const signature = await account.signMessage({ message });
    expect(await verifyLinkSignature(null, account.address, message, signature)).toBe(true);
  });

  it("rejects a signature from a different wallet", async () => {
    const signature = await other.signMessage({ message });
    expect(await verifyLinkSignature(null, account.address, message, signature)).toBe(false);
  });

  it("rejects a signature over a different Telegram id", async () => {
    const signature = await account.signMessage({ message: linkMessage(99999, newNonce()) });
    expect(await verifyLinkSignature(null, account.address, message, signature)).toBe(false);
  });
});
