// Copies the published data bundle into the app so Metro can bundle it.
// The app ships with a snapshot so it works on first launch with no network;
// at runtime it fetches a newer bundle from the CDN when one exists.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const from = resolve(here, "../../data");
const to = resolve(here, "../assets/data");
mkdirSync(to, { recursive: true });
for (const name of ["app-bundle.json", "events.json"]) {
  copyFileSync(resolve(from, name), resolve(to, name));
  console.log(`synced ${name}`);
}
