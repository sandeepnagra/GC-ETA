#!/usr/bin/env node
/**
 * Promote an existing versionCode from one Play track to another.
 *
 * `eas submit` refuses a version it has already uploaded ("already submitted
 * this version"), and it is right to: the AAB reaches Play once. Putting that
 * same build on a second track is a track edit, not an upload, and there is
 * no eas command for it. Hence this.
 *
 * Builtins only, no googleapis dependency -- it signs a service-account JWT
 * and talks to androidpublisher v3 directly, so it does not add a package to
 * the app for the sake of a release step.
 *
 * Usage, from app/ so the key path resolves:
 *
 *   node ../scripts/promote-play-track.mjs \
 *     ./google-service-account.json com.gceta.app 14 internal alpha
 *
 * DRY=1 reads both tracks, prints what it would do, and deletes the edit
 * without writing. Worth running first every time: it is the only thing that
 * tells you what the destination track currently holds.
 *
 * Two deliberate safety properties:
 *
 * - It refuses to promote a versionCode that is not actually on the source
 *   track, so a typo cannot stage a build that was never submitted.
 * - It touches ONLY the destination track. Nothing here can reach production
 *   unless production is named as the destination.
 */
import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";

const KEY = JSON.parse(readFileSync(process.argv[2], "utf8"));
const PKG = process.argv[3];
const VERSION_CODE = process.argv[4];
const FROM = process.argv[5];
const TO = process.argv[6];
const DRY = process.env.DRY === "1";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

async function token() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: "RS256", typ: "JWT" });
  const claims = b64({
    iss: KEY.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${sign.sign(KEY.private_key, "base64url")}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`token: ${JSON.stringify(body)}`);
  return body.access_token;
}

const BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;
let ACCESS;
async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${ACCESS}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return parsed;
}

ACCESS = await token();
console.log(`authenticated as ${KEY.client_email}`);

const edit = await api("/edits", { method: "POST", body: {} });
console.log(`edit ${edit.id}`);

const from = await api(`/edits/${edit.id}/tracks/${FROM}`);
const present = (from.releases ?? []).flatMap((r) => r.versionCodes ?? []);
console.log(`${FROM} currently holds versionCode(s): ${present.join(", ") || "none"}`);
if (!present.includes(String(VERSION_CODE))) {
  throw new Error(`versionCode ${VERSION_CODE} is not on ${FROM}; refusing to promote a version that is not there`);
}

let before = [];
try {
  const to = await api(`/edits/${edit.id}/tracks/${TO}`);
  before = (to.releases ?? []).flatMap((r) => r.versionCodes ?? []);
} catch (e) {
  console.log(`${TO} has no existing release`);
}
console.log(`${TO} before: ${before.join(", ") || "none"}`);

if (DRY) {
  console.log("DRY=1, stopping before any write");
  await api(`/edits/${edit.id}`, { method: "DELETE" });
  process.exit(0);
}

const release = (from.releases ?? []).find((r) => (r.versionCodes ?? []).includes(String(VERSION_CODE)));
const updated = await api(`/edits/${edit.id}/tracks/${TO}`, {
  method: "PUT",
  body: {
    track: TO,
    releases: [
      {
        versionCodes: [String(VERSION_CODE)],
        status: "completed",
        ...(release?.releaseNotes ? { releaseNotes: release.releaseNotes } : {}),
      },
    ],
  },
});
console.log(`${TO} staged: ${JSON.stringify(updated.releases?.map((r) => ({ v: r.versionCodes, s: r.status })))}`);

const committed = await api(`/edits/${edit.id}:commit`, { method: "POST" });
console.log(`committed edit ${committed.id}`);
