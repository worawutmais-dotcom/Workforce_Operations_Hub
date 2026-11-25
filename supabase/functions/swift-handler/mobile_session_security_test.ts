import assert from "node:assert/strict";
import test from "node:test";

import {
  mobileSessionExpiresAt,
  mobileTokenDigest,
} from "./mobile_session_security.ts";
import { mobileTokenDigest as legacyHandlerTokenDigest } from "../bvn-api/mobile_session_security.ts";

test("mobile tokens are stored as a SHA-256 digest, never as the bearer token", async () => {
  const token = "mobile-bearer-token-for-test";

  const digest = await mobileTokenDigest(token);

  assert.equal(digest.length, 64);
  assert.notEqual(digest, token);
  assert.equal(
    digest,
    "192759e55ba5a5f733abf7deb22df148f7dd05eb2c6ef1cbbf1ca417607b7f1d",
  );
});

test("mobile sessions expire exactly thirty days after issue", () => {
  const issuedAt = new Date("2026-11-25T00:00:00.000Z");

  assert.equal(
    mobileSessionExpiresAt(issuedAt),
    "2026-12-25T00:00:00.000Z",
  );
});

test("both deployable handlers use the same token digest", async () => {
  assert.equal(
    await legacyHandlerTokenDigest("same-mobile-token"),
    await mobileTokenDigest("same-mobile-token"),
  );
});
