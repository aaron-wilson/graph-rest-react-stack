import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { archiveStatic } from "./archive-static.ts";
const fixture = {
  PLATFORM_ACCOUNT: "111111111111",
  PLATFORM_REGION: "us-east-1",
  PLATFORM_ENV: "demo",
  PLATFORM_AVAILABILITY_ZONES: "us-east-1a,us-east-1b",
  PLATFORM_SITE_ORIGIN: "https://wander.example",
  PLATFORM_CERTIFICATE_ARN:
    "arn:aws:acm:us-east-1:111111111111:certificate/00000000-0000-4000-8000-000000000000",
  PLATFORM_DEPLOY_PRINCIPAL_ARN:
    "arn:aws:iam::111111111111:role/wander-deployer",
  PLATFORM_COGNITO_DOMAIN_PREFIX: "wander-demo-example",
  UI_CERTIFICATE_ARN:
    "arn:aws:acm:us-east-1:111111111111:certificate/00000000-0000-4000-8000-000000000000",
  DEPLOY_GRAPH_ORIGIN: "https://api.wander.example",
  API_LLM_PROVIDER: "mock",
  API_EVENTS_PROVIDER: "mock",
  OPENAI_API_KEY: "PRIVATE_DEPLOY_SENTINEL",
};
const run = (args = ["demo"], extra = {}) =>
  spawnSync("bash", ["scripts/deploy-all.sh", ...args], {
    encoding: "utf8",
    env: { ...process.env, ...fixture, ...extra },
  });
test("defaults to a safe ordered plan with pinned images and built public config", () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DRY RUN/);
  const steps = [
    "WanderdemoFoundation",
    "docker' 'build",
    "WanderdemoRest",
    "WanderdemoGraph",
    "scripts/build-static.mjs",
    "WanderdemoUi",
    "scripts/publish-static.mjs",
  ];
  let index = -1;
  for (const step of steps) {
    const next = result.stdout.indexOf(step, index + 1);
    assert.ok(next > index, step);
    index = next;
  }
  assert.match(
    result.stdout,
    /REST=[a-f0-9]{40} graph=[a-f0-9]{40} UI=[a-f0-9]{40}/,
  );
  assert.match(result.stdout, /NEXT_PUBLIC_APP_MODE='live'/);
  assert.match(result.stdout, /auth\/callback\//);
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /PRIVATE_DEPLOY_SENTINEL|:latest|GetSecretValue/,
  );
});
test("validates required inputs and flags before any deployment", () => {
  for (const result of [
    run(["demo", "--yes"]),
    run(["other"]),
    run(["demo"], { UI_CERTIFICATE_ARN: "" }),
    run(["demo"], { DEPLOY_GRAPH_ORIGIN: "http://api.wander.example" }),
  ]) {
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /WanderdemoFoundation/);
  }
});
test("prints only selected secret names for the explicit provider path", () => {
  const result = run(["demo", "--dry-run"], {
    API_LLM_PROVIDER: "openai",
    API_LLM_MODEL: "example-model",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /describe-secret/);
  assert.match(result.stdout, /secrets\/openai/);
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /PRIVATE_DEPLOY_SENTINEL|secrets\/anthropic/,
  );
});

test("archives changed public auth identity separately and preserves existing exports", () => {
  const root = mkdtempSync(join(tmpdir(), "wander-archive-"));
  const source = join(root, "out");
  mkdirSync(source);
  const revision = "1111111111111111111111111111111111111111";
  const manifest = (clientId) =>
    JSON.stringify({ revision, publicConfig: { cognito: { clientId } } });
  try {
    writeFileSync(join(source, "deployment.json"), manifest("first-client"));
    writeFileSync(join(source, "index.html"), "first export");
    const first = archiveStatic(source, join(root, "archive"), revision);
    writeFileSync(join(source, "index.html"), "rebuilt export");
    assert.equal(archiveStatic(source, join(root, "archive"), revision), first);
    assert.equal(
      readFileSync(join(first, "index.html"), "utf8"),
      "first export",
    );
    writeFileSync(join(source, "deployment.json"), manifest("second-client"));
    const second = archiveStatic(source, join(root, "archive"), revision);
    assert.notEqual(second, first);
    assert.equal(
      readFileSync(join(second, "index.html"), "utf8"),
      "rebuilt export",
    );
    assert.throws(
      () => archiveStatic(source, join(root, "archive"), "wrong-revision"),
      /manifest/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
