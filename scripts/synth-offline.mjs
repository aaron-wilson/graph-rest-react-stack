import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
const name = process.argv[2];
const directories = {
  hub: resolve(root, "platform-cdk"),
  "rest-api": resolve(root, "../rest-api"),
  "graph-api": resolve(root, "../graph-api"),
  "react-ui": resolve(root, "../react-ui"),
};
if (!(name in directories))
  throw new Error("Choose hub, rest-api, graph-api or react-ui");
const env = {
  ...process.env,
  AWS_EC2_METADATA_DISABLED: "true",
  AWS_CONFIG_FILE: "/dev/null",
  AWS_SHARED_CREDENTIALS_FILE: "/dev/null",
  DOTENV_CONFIG_PATH: "/dev/null",
  CDK_OUTDIR: "cdk.out",
  PLATFORM_ACCOUNT: "111111111111",
  PLATFORM_REGION: "us-east-1",
  PLATFORM_ENV: "demo",
  PLATFORM_AVAILABILITY_ZONES: "us-east-1a,us-east-1b",
  PLATFORM_SITE_ORIGIN: "https://wander.example",
  PLATFORM_CERTIFICATE_ARN:
    "arn:aws:acm:us-east-1:111111111111:certificate/00000000-0000-4000-8000-000000000000",
  UI_CERTIFICATE_ARN:
    "arn:aws:acm:us-east-1:111111111111:certificate/00000000-0000-4000-8000-000000000000",
  PLATFORM_DEPLOY_PRINCIPAL_ARN:
    "arn:aws:iam::111111111111:role/wander-deployer",
  PLATFORM_COGNITO_DOMAIN_PREFIX: "wander-demo-example",
  API_IMAGE_TAG: "1111111111111111111111111111111111111111",
  API_LLM_PROVIDER: "mock",
  API_EVENTS_PROVIDER: "mock",
  TSX_TSCONFIG_PATH: name === "hub" ? "tsconfig.json" : "infra/tsconfig.json",
};
for (const key of [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_PROFILE",
  "AWS_DEFAULT_PROFILE",
])
  env[key] = undefined;
const loader = resolve(root, "platform-cdk/node_modules/tsx/dist/loader.mjs");
const result = spawnSync(
  "node",
  ["--import", loader, name === "hub" ? "src/app.ts" : "infra/app.ts"],
  { cwd: directories[name], env, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
