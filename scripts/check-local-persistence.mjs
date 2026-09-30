import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export async function readTrips(
  fetcher = fetch,
  pause = () => new Promise((resolve) => setTimeout(resolve, 1000)),
) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetcher("http://127.0.0.1:3000/trips?limit=100", {
        headers: { authorization: "Bearer demo" },
        signal: AbortSignal.timeout(1000),
      });
      if (!response.ok)
        throw new Error(`Local trip read returned ${response.status}`);
      const page = await response.json();
      assert.ok(
        Array.isArray(page.items) && page.items.length > 0,
        "No persisted demo trips",
      );
      assert.equal(
        page.nextCursor,
        null,
        "Acceptance fixture exceeds one page",
      );
      return page.items.sort((a, b) => a.id.localeCompare(b.id));
    } catch (error) {
      if (attempt === 29) throw error;
      await pause();
    }
  }
}

export function verifyTrips(before, after) {
  assert.ok(
    Array.isArray(before) && before.length > 0,
    "Missing pre-restart records",
  );
  assert.deepEqual(
    after,
    before,
    "Trip records changed across DynamoDB restart",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [mode, file] = process.argv.slice(2);
  if (!["capture", "verify"].includes(mode) || !file)
    throw new Error("Use capture|verify <snapshot-file>");
  const trips = await readTrips();
  if (mode === "capture")
    writeFileSync(file, JSON.stringify(trips), { mode: 0o600 });
  else {
    verifyTrips(JSON.parse(readFileSync(file, "utf8")), trips);
    process.stdout.write("Trip records survived DynamoDB restart\n");
  }
}
