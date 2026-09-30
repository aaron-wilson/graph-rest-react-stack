import { spawnSync, execFileSync } from "node:child_process";
import {
  readFileSync,
  mkdtempSync,
  writeFileSync,
  chmodSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
const name = process.argv[2];
if (!["hub", "rest-api", "graph-api", "react-ui"].includes(name))
  throw new Error("Choose hub, rest-api, graph-api or react-ui");
const dir = name === "hub" ? root : resolve(root, "..", name);
const shim = mkdtempSync(join(tmpdir(), "wander-check-"));
const bun = execFileSync("sh", ["-c", "command -v bun"], {
  encoding: "utf8",
}).trim();
writeFileSync(
  join(shim, "bun"),
  `#!/bin/sh\nexec '${bun.replaceAll("'", "'\"'\"'")}' --no-env-file "$@"\n`,
);
chmodSync(join(shim, "bun"), 0o755);
const env = {
  ...process.env,
  PATH: `${shim}:${dir}/node_modules/.bin:${root}/platform-cdk/node_modules/.bin:${process.env.PATH}`,
  DOTENV_CONFIG_PATH: "/dev/null",
  APP_MODE: "demo",
  PROVIDER_STORE: "memory",
  TELEMETRY_MODE: "off",
  NEXT_PUBLIC_APP_MODE: "demo",
  NEXT_PUBLIC_GRAPHQL_URL: "http://localhost:4000/graphql",
  NEXT_PUBLIC_SENTRY_DSN: "",
  NEXT_TELEMETRY_DISABLED: "1",
  SENTRY_SOURCE_MAPS: "false",
};
const run = (cwd, command, args) => {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error || result.status !== 0)
    throw new Error(`Check failed: ${command} ${args.join(" ")}`, {
      cause: result.error,
    });
};
try {
  run(root, "node", ["scripts/check-env.mjs", name]);
  if (name === "hub") {
    run(resolve(root, "platform-cdk"), "tsc", ["--noEmit"]);
    run(resolve(root, "platform-cdk"), "vitest", ["run"]);
    run(resolve(root, "platform-cdk"), "prettier", ["--check", "."]);
    run(root, "tsc", ["--project", "scripts/tsconfig.json"]);
    run(root, "bash", ["-n", "scripts/deploy-all.sh"]);
    run(root, "node", [
      "--test",
      "scripts/deploy-all.test.mjs",
      "scripts/check-newrelic-dashboard.test.mjs",
    ]);
  } else {
    const scripts = JSON.parse(
      readFileSync(resolve(dir, "package.json"), "utf8"),
    ).scripts;
    const check = (key) => {
      if (!scripts[key]) throw new Error(`Missing script: ${key}`);
      if (name === "rest-api" && key === "test")
        run(dir, "bun", ["--bun", "node_modules/.bin/vitest", "run"]);
      else run(dir, "sh", ["-c", scripts[key]]);
    };
    for (const key of ["format:check", "lint", "typecheck", "test"]) check(key);
    if (name === "graph-api") {
      check("test:integration");
      check("codegen:check");
    }
    if (name === "rest-api") {
      const snapshot = readFileSync(resolve(dir, "docs/openapi.json"));
      check("spec:snapshot");
      if (!snapshot.equals(readFileSync(resolve(dir, "docs/openapi.json"))))
        throw new Error("OpenAPI snapshot drift");
    }
    if (name === "react-ui") {
      if (
        readdirSync(dir).some(
          (file) => /^\.env(?:\.|$)/.test(file) && file !== ".env.example",
        )
      )
        throw new Error(
          "Remove local UI env files before verification; Next loads them automatically",
        );
      for (const key of [
        "codegen:check",
        "schema:check",
        "docs:check",
        "images:check",
      ])
        check(key);
    }
    for (const key of ["build", "infra:typecheck", "infra:test"]) check(key);
    if (name === "react-ui") {
      check("test:static");
      if (process.argv.includes("--e2e")) check("test:e2e");
    }
  }
  run(root, "node", ["scripts/synth-offline.mjs", name]);
} finally {
  rmSync(shim, { recursive: true, force: true });
}
