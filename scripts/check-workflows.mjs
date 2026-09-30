import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(resolve(root, "../rest-api/package.json"));
const YAML = require("yaml");
for (const repo of [
  "graph-rest-react-stack",
  "rest-api",
  "graph-api",
  "react-ui",
]) {
  const dir = resolve(root, "..", repo, ".github");
  const active = resolve(dir, "workflows");
  assert.ok(
    !existsSync(active) ||
      !readdirSync(active).some((file) => /\.ya?ml$/.test(file)),
    `${repo}: active workflow found`,
  );
  assert.ok(
    !existsSync(resolve(dir, "dependabot.yml")),
    "Dependabot must remain inactive",
  );
  const folder = resolve(dir, "workflow-templates");
  for (const file of readdirSync(folder)) {
    assert.ok(
      file.endsWith(".yml.disabled"),
      "Template must remain outside workflow discovery",
    );
    const doc = YAML.parseDocument(
      readFileSync(resolve(folder, file), "utf8"),
      { uniqueKeys: true },
    );
    assert.deepEqual(doc.errors, []);
    const workflow = doc.toJS();
    assert.equal(workflow.permissions.contents, "read");
    assert.ok(!JSON.stringify(workflow.on).includes("schedule"));
    if (file.startsWith("deploy"))
      assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
    for (const job of Object.values(workflow.jobs)) {
      assert.ok(job["timeout-minutes"] > 0 && job["timeout-minutes"] <= 60);
      const checkouts = job.steps.filter((step) =>
        step.uses?.startsWith("actions/checkout@"),
      );
      assert.deepEqual(
        checkouts.map((step) => step.with.path).sort(),
        ["graph-rest-react-stack", "rest-api", "graph-api", "react-ui"].sort(),
      );
      assert.ok(
        checkouts.every(
          (step) => step.with.ref && step.with["persist-credentials"] === false,
        ),
      );
      if (file.startsWith("deploy"))
        assert.equal(job.permissions["id-token"], "write");
      else assert.ok(!job.permissions?.["id-token"]);
      for (const step of job.steps)
        if (step.uses?.startsWith("actions/upload-artifact@"))
          assert.ok(step.with["retention-days"] <= 3);
    }
  }
  process.stdout.write(
    `${repo}: disabled workflow YAML and permission/checkout contracts passed\n`,
  );
}
