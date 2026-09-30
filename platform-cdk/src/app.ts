import "dotenv/config";
import * as cdk from "aws-cdk-lib";
import { parseConfig } from "./config.js";
import { FoundationStack } from "./foundation.js";

const config = parseConfig(process.env);
const app = new cdk.App();
app.node.setContext(
  `availability-zones:account=${config.account}:region=${config.region}`,
  [...config.availabilityZones],
);
new FoundationStack(app, `Wander${config.environment}Foundation`, config);
app.synth();
