import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

// Every child tool is a logging fake. These fixtures never build, synthesize or
// start an application, even when checking the operator-only acceptance branch.
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "wander-verifier-"));
  const hub = join(root, "graph-rest-react-stack");
  const log = join(root, "calls.jsonl");
  const write = (path, text, mode = 0o644) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, { mode });
  };
  const fake = `#!${process.execPath}\nimport { appendFileSync } from 'node:fs'; appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(1))+'\\n');\n`;
  try {
    write(
      join(hub, "scripts/verify-repo.mjs"),
      readFileSync(new URL("./verify-repo.mjs", import.meta.url)),
    );
    write(join(hub, "scripts/docker-acceptance.sh"), "#!/bin/sh\n");
    write(join(hub, "scripts/deploy-all.sh"), "#!/bin/sh\n");
    for (const repo of [
      "rest-api",
      "graph-api",
      "react-ui",
      "graph-rest-react-stack/platform-cdk",
    ]) {
      const scripts = Object.fromEntries(
        [
          "format:check",
          "lint",
          "typecheck",
          "test",
          "test:integration",
          "codegen:check",
          "spec:check",
          "schema:check",
          "images:check",
          "test:images",
          "infra:typecheck",
          "infra:test",
          "build",
          "test:static",
          "test:e2e",
        ].map((name) => [name, `fixture-check ${name}`]),
      );
      write(
        join(root, repo, "package.json"),
        JSON.stringify({ type: "module", scripts }),
      );
      for (const tool of [
        "node",
        "bun",
        "tsc",
        "prettier",
        "eslint",
        "vitest",
        "fixture-check",
      ])
        write(join(root, repo, "node_modules/.bin", tool), fake, 0o755);
    }
    const execute = (repo, flags = []) => {
      writeFileSync(log, "");
      const result = spawnSync(
        process.execPath,
        [join(hub, "scripts/verify-repo.mjs"), repo, ...flags],
        {
          env: {
            ...process.env,
            PATH: `${join(hub, "platform-cdk/node_modules/.bin")}:${process.env.PATH}`,
          },
          encoding: "utf8",
        },
      );
      const calls = readFileSync(log, "utf8").trim();
      return { result, calls };
    };
    run(execute);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("default verification excludes builds, test servers and synthesis in every repo", () => {
  fixture((execute) => {
    for (const repo of ["hub", "rest-api", "graph-api", "react-ui"]) {
      const { result, calls } = execute(repo);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /static checks passed/);
      assert.doesNotMatch(
        calls,
        /"build"|"test"|test:integration|test:static|test:e2e|infra:test|synth-offline|--test|vitest/,
      );
      assert.match(calls, /check-env/);
      if (repo === "rest-api") {
        assert.match(calls, /spec:check/);
        assert.doesNotMatch(calls, /spec:snapshot/);
      }
    }
  });
});

test("operator acceptance retains builds, synthesis and optional UI E2E", () => {
  fixture((execute) => {
    const { result, calls } = execute("react-ui", ["--acceptance", "--e2e"]);
    assert.equal(result.status, 0, result.stderr);
    for (const command of [
      "build",
      "test:images",
      "test:static",
      "test:e2e",
      "synth-offline",
    ])
      assert.ok(calls.includes(command), command);
    assert.match(result.stdout, /operator acceptance passed/);
  });
});

test("invalid flags and E2E without acceptance fail before any child command", () => {
  fixture((execute) => {
    for (const [repo, flags] of [
      ["react-ui", ["--e2e"]],
      ["graph-api", ["--acceptance", "--e2e"]],
      ["hub", ["--unknown"]],
    ]) {
      const { result, calls } = execute(repo, flags);
      assert.notEqual(result.status, 0);
      assert.equal(calls, "");
    }
  });
});
