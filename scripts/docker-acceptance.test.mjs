import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readTrips, verifyTrips } from "./check-local-persistence.mjs";
const require = createRequire(
  new URL("../../rest-api/package.json", import.meta.url),
);
const YAML = require("yaml");

test("acceptance seeds with the build-stage service and verifies records after restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "wander-compose-test-"));
  try {
    const log = join(directory, "calls.jsonl");
    for (const tool of ["docker", "node", "bun"]) {
      writeFileSync(
        join(directory, tool),
        `#!${process.execPath}\nconst fs = require('node:fs'); const args = process.argv.slice(2); fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify([${JSON.stringify(tool)}, ...args])+'\\n'); if (args.includes('verify') && process.env.WANDER_TEST_FAIL) process.exit(7);\n`,
        { mode: 0o755 },
      );
    }
    const run = (fail = "") =>
      spawnSync("bash", ["scripts/docker-acceptance.sh"], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          WANDER_TEST_FAIL: fail,
          COMPOSE_PROJECT_NAME: "wander",
        },
      });
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    const calls = readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
    for (const args of calls.filter(([tool]) => tool === "docker")) {
      assert.equal(
        args[args.indexOf("--project-name") + 1],
        "wander-acceptance",
      );
      assert.ok(args.includes("--file"));
    }
    const seedIndex = calls.findIndex((args) =>
      args.includes("scripts/seed-once.ts"),
    );
    const seed = calls[seedIndex];
    assert.ok(seed.includes("run") && !seed.includes("exec"));
    const serviceName = seed[seed.indexOf("--no-deps") + 1];
    const compose = YAML.parse(readFileSync("compose.yaml", "utf8"));
    const service = compose.services[serviceName];
    assert.equal(service.build.target, "build");
    const recipe = readFileSync(`${service.build.context}/Dockerfile`, "utf8");
    const build = recipe.split(/\nFROM /)[0];
    assert.match(build, /AS build/);
    assert.match(build, /COPY scripts \.\/scripts/);
    assert.match(build, /COPY src \.\/src/);
    const initIndex = calls.findIndex(
      (args) => args.includes("run") && args.at(-1) === serviceName,
    );
    assert.ok(initIndex >= 0 && initIndex < seedIndex);
    const capture = calls.findIndex((args) => args.includes("capture"));
    const restart = calls.findIndex((args) => args.includes("restart"));
    const verify = calls.findIndex((args) => args.includes("verify"));
    assert.ok(seedIndex < capture && capture < restart && restart < verify);
    assert.ok(calls.at(-1).includes("down") && calls.at(-1).includes("-v"));
    assert.equal(
      run("1").status,
      7,
      "Persistence failure must fail acceptance",
    );
    const last = JSON.parse(
      readFileSync(log, "utf8").trim().split("\n").at(-1),
    );
    assert.ok(
      last.includes("down") && last.includes("-v"),
      "Failure still cleans volumes",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the database volume is handed to the image user before the database starts", () => {
  const compose = YAML.parse(readFileSync("compose.yaml", "utf8"));
  const database = compose.services.dynamodb;
  const init = compose.services["dynamodb-volume-init"];
  // The image runs as dynamodblocal and has no /data, so a fresh volume is root-owned.
  assert.equal(
    database.depends_on["dynamodb-volume-init"].condition,
    "service_completed_successfully",
  );
  assert.equal(init.image, database.image);
  assert.deepEqual(init.volumes, database.volumes);
  assert.deepEqual(init.profiles, database.profiles);
  assert.equal(init.user, "0:0");
  assert.deepEqual(init.entrypoint, [
    "chown",
    "-R",
    "dynamodblocal:dynamodblocal",
    "/data",
  ]);
  assert.equal(database.command.at(-1), init.entrypoint.at(-1));
});

test("persistence reads retry startup failures and compare actual records", async () => {
  const records = [{ id: "a", city: "Lisbon", version: 1 }];
  let attempts = 0;
  const after = await readTrips(
    async () => {
      if (++attempts === 1) return new Response("unavailable", { status: 503 });
      return Response.json({ items: records, nextCursor: null });
    },
    async () => undefined,
  );
  assert.equal(attempts, 2);
  verifyTrips(records, after);
  assert.throws(() => verifyTrips(records, []));
  assert.throws(() => verifyTrips(records, [{ ...records[0], version: 2 }]));
  await assert.rejects(
    () =>
      readTrips(
        async () => Response.json({ items: [], nextCursor: null }),
        async () => undefined,
      ),
    /No persisted/,
  );
});
