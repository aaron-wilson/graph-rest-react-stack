import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(resolve(root, "platform-cdk/package.json"));
const ts = require("typescript");
const standard = new Set([
  "NODE_ENV",
  "PATH",
  "TZ",
  "DOTENV_CONFIG_PATH",
  "CDK_OUTDIR",
  "TSX_TSCONFIG_PATH",
  "NEXT_TELEMETRY_DISABLED",
  "REST_API_DIR",
  "RUN_DYNAMO_CONTRACT",
]);
const names = process.argv.slice(2);
for (const name of names.length
  ? names
  : ["hub", "rest-api", "graph-api", "react-ui"]) {
  const dir = name === "hub" ? root : resolve(root, "..", name);
  if (!["hub", "rest-api", "graph-api", "react-ui"].includes(name))
    throw new Error("Unknown repository");
  const files = execFileSync("git", ["-C", dir, "ls-files"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n");
  const documented = new Set();
  for (const file of files.filter((file) => file.endsWith(".env.example"))) {
    for (const match of readFileSync(resolve(dir, file), "utf8").matchAll(
      /^([A-Z][A-Z0-9_]*)=/gm,
    ))
      documented.add(match[1]);
  }
  const consumed = new Set();
  for (const file of files.filter(
    (file) =>
      /\.(ts|tsx|js|mjs)$/.test(file) &&
      !/test|vitest|playwright|eslint|codegen|generated|\/gql\//.test(file),
  )) {
    const text = readFileSync(resolve(dir, file), "utf8");
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node) => {
      if (
        ts.isPropertyAccessExpression(node) &&
        node.expression.getText(source) === "process.env"
      )
        consumed.add(node.name.text);
      if (
        ts.isVariableDeclaration(node) &&
        ts.isObjectBindingPattern(node.name) &&
        node.initializer?.getText(source) === "process.env"
      )
        for (const item of node.name.elements)
          consumed.add(
            item.propertyName?.getText(source) ?? item.name.getText(source),
          );
      if (
        (file.includes("config/") ||
          file.endsWith("infra/config.ts") ||
          file.endsWith("platform-cdk/src/config.ts")) &&
        ts.isPropertyAssignment(node)
      ) {
        const key = node.name.getText(source).replaceAll('"', "");
        if (/^[A-Z][A-Z0-9_]+$/.test(key)) consumed.add(key);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (file.endsWith("upload-sourcemaps.mjs"))
      for (const match of text.matchAll(/"(SENTRY_[A-Z_]+)"/g))
        consumed.add(match[1]);
  }
  if (name === "hub")
    for (const match of readFileSync(
      resolve(dir, "compose.yaml"),
      "utf8",
    ).matchAll(/\$\{([A-Z][A-Z0-9_]*)/g))
      consumed.add(match[1]);
  const missing = [...consumed].filter(
    (key) => !standard.has(key) && !documented.has(key),
  );
  if (missing.length)
    throw new Error(
      `${name}: undocumented environment keys: ${missing.join(", ")}`,
    );
  process.stdout.write(
    `${name}: ${consumed.size} env consumers checked against example keys\n`,
  );
}
