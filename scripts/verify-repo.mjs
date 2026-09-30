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
const flags = process.argv.slice(3);
if (flags.some((flag) => !["--acceptance", "--e2e"].includes(flag)))
  throw new Error(
    "Use --acceptance for operator builds/servers/synth; --e2e adds UI browsers",
  );
const acceptance = flags.includes("--acceptance");
if (flags.includes("--e2e") && (!acceptance || name !== "react-ui"))
  throw new Error("--e2e requires react-ui --acceptance (starts app servers)");
const dir = name === "hub" ? root : resolve(root, "..", name);
const shim = mkdtempSync(join(tmpdir(), "wander-check-"));
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
  if (acceptance || name === "rest-api") {
    const bun = execFileSync("sh", ["-c", "command -v bun"], {
      encoding: "utf8",
    }).trim();
    writeFileSync(
      join(shim, "bun"),
      `#!/bin/sh\nexec '${bun.replaceAll("'", "'\"'\"'")}' --no-env-file "$@"\n`,
    );
    chmodSync(join(shim, "bun"), 0o755);
  }
  if (name === "react-ui" || name === "hub") {
    const envDirectory = name === "hub" ? resolve(root, "platform-cdk") : dir;
    if (
      readdirSync(envDirectory).some(
        (file) => /^\.env(?:\.|$)/.test(file) && file !== ".env.example",
      )
    )
      throw new Error(
        "Remove local UI/platform env files before verification; their tools load them automatically",
      );
  }
  run(root, "node", ["scripts/check-env.mjs", name]);
  if (name === "hub") {
    run(root, resolve(root, "../rest-api/node_modules/.bin/prettier"), [
      "--check",
      "README.md",
      "docs",
      "scripts",
      "compose.yaml",
      "telemetry",
    ]);
    run(root, resolve(root, "../rest-api/node_modules/.bin/eslint"), [
      "--config",
      "../rest-api/eslint.config.ts",
      "scripts",
    ]);
    run(root, "node", ["scripts/check-workflows.mjs"]);
    run(root, "bash", ["-n", "scripts/docker-acceptance.sh"]);
    run(resolve(root, "platform-cdk"), "tsc", ["--noEmit"]);
    if (acceptance) run(resolve(root, "platform-cdk"), "vitest", ["run"]);
    run(resolve(root, "platform-cdk"), "prettier", ["--check", "."]);
    run(root, "tsc", ["--project", "scripts/tsconfig.json"]);
    run(root, "bash", ["-n", "scripts/deploy-all.sh"]);
    if (acceptance)
      run(root, "node", [
        "--test",
        "scripts/deploy-all.test.mjs",
        "scripts/docker-acceptance.test.mjs",
        "scripts/check-newrelic-dashboard.test.mjs",
        "scripts/verify-repo.test.mjs",
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
    for (const key of ["format:check", "lint", "typecheck"]) check(key);
    if (acceptance) check("test");
    if (name === "graph-api") {
      if (acceptance) check("test:integration");
      check("codegen:check");
    }
    if (name === "rest-api") {
      check("spec:check");
    }
    if (name === "react-ui") {
      for (const key of ["codegen:check", "schema:check", "images:check"])
        check(key);
    }
    check("infra:typecheck");
    if (acceptance && name === "react-ui") check("test:images");
    if (acceptance) for (const key of ["build", "infra:test"]) check(key);
    if (acceptance && name === "react-ui") {
      check("test:static");
      if (process.argv.includes("--e2e")) check("test:e2e");
    }
  }
  if (acceptance) run(root, "node", ["scripts/synth-offline.mjs", name]);
  process.stdout.write(
    `${name}: ${acceptance ? "operator acceptance" : "static checks"} passed\n`,
  );
} finally {
  rmSync(shim, { recursive: true, force: true });
}
