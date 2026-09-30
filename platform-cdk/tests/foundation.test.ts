import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";
import { FoundationStack } from "../src/foundation.js";

const fixture = {
  PLATFORM_ACCOUNT: "111111111111",
  PLATFORM_REGION: "us-east-1",
  PLATFORM_AVAILABILITY_ZONES: "us-east-1a,us-east-1b",
  PLATFORM_ENV: "demo",
  PLATFORM_SITE_ORIGIN: "https://wander.example",
  PLATFORM_CERTIFICATE_ARN:
    "arn:aws:acm:us-east-1:111111111111:certificate/00000000-0000-4000-8000-000000000000",
  PLATFORM_DEPLOY_PRINCIPAL_ARN:
    "arn:aws:iam::111111111111:role/wander-deployer",
  PLATFORM_COGNITO_DOMAIN_PREFIX: "wander-demo-example",
};

function synth() {
  const config = parseConfig(fixture);
  const app = new cdk.App();
  app.node.setContext(
    `availability-zones:account=${config.account}:region=${config.region}`,
    config.availabilityZones,
  );
  return Template.fromStack(new FoundationStack(app, "Foundation", config));
}

describe("foundation deployment contract", () => {
  it("validates identifiers, origins, certificate region, and explicit AZs", () => {
    expect(() => parseConfig({ ...fixture, PLATFORM_ACCOUNT: "bad" })).toThrow(
      "PLATFORM_ACCOUNT",
    );
    expect(() =>
      parseConfig({
        ...fixture,
        PLATFORM_SITE_ORIGIN: "http://wander.example",
      }),
    ).toThrow("PLATFORM_SITE_ORIGIN");
    expect(() =>
      parseConfig({
        ...fixture,
        PLATFORM_AVAILABILITY_ZONES: "us-east-1a,us-east-1a",
      }),
    ).toThrow("PLATFORM_AVAILABILITY_ZONES");
    expect(() =>
      parseConfig({ ...fixture, PLATFORM_REGION: "eu-west-1" }),
    ).toThrow("PLATFORM_AVAILABILITY_ZONES");
  });

  it("creates the private retained data resources and bounded logs", () => {
    const template = synth();
    template.resourceCountIs("AWS::DynamoDB::Table", 1);
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      BillingMode: "PAY_PER_REQUEST",
      SSESpecification: { SSEEnabled: true },
    });
    template.hasResource("AWS::DynamoDB::Table", { DeletionPolicy: "Retain" });
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      BucketEncryption: Match.anyValue(),
    });
    template.hasResource("AWS::S3::Bucket", { DeletionPolicy: "Retain" });
    template.hasResourceProperties("AWS::Logs::LogGroup", {
      RetentionInDays: 14,
      KmsKeyId: Match.anyValue(),
    });
  });

  it("grants only regional Logs scoped use alongside account administration", () => {
    const template = synth();
    const keys = Object.values(template.findResources("AWS::KMS::Key"));
    expect(keys).toHaveLength(1);
    expect(keys[0].Properties.EnableKeyRotation).toBe(true);
    expect(keys[0].DeletionPolicy).toBe("Retain");
    const statements = keys[0].Properties.KeyPolicy.Statement;
    expect(statements).toHaveLength(2);
    expect(statements[0]).toMatchObject({
      Action: "kms:*",
      Principal: {
        AWS: {
          "Fn::Join": [
            "",
            ["arn:", { Ref: "AWS::Partition" }, ":iam::111111111111:root"],
          ],
        },
      },
    });
    expect(statements[1]).toEqual({
      Effect: "Allow",
      Principal: { Service: "logs.us-east-1.amazonaws.com" },
      Action: [
        "kms:Encrypt*",
        "kms:Decrypt*",
        "kms:ReEncrypt*",
        "kms:GenerateDataKey*",
        "kms:Describe*",
      ],
      Resource: "*",
      Condition: {
        ArnEquals: {
          "kms:EncryptionContext:aws:logs:arn":
            "arn:aws:logs:us-east-1:111111111111:log-group:/wander/demo/api",
        },
      },
    });
  });

  it("separates private REST networking and execution/task/deploy roles", () => {
    const template = synth();
    template.resourceCountIs("AWS::EC2::NatGateway", 1);
    template.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 2);
    template.hasResourceProperties(
      "AWS::ElasticLoadBalancingV2::LoadBalancer",
      { Scheme: "internal" },
    );
    template.resourceCountIs("AWS::IAM::Role", 5);
    const policyText = JSON.stringify(
      template.findResources("AWS::IAM::Policy"),
    );
    expect(policyText).toContain("dynamodb:");
    expect(policyText).toContain("secretsmanager:");
    expect(policyText).not.toContain('"Resource":"*"');
  });

  it("publishes versioned references and never embeds secret values", () => {
    const template = synth();
    const parameters = template.findResources("AWS::SSM::Parameter");
    expect(Object.values(parameters)).toHaveLength(19);
    expect(
      Object.values(parameters).every((item) =>
        item.Properties.Name.startsWith("/wander/demo/v1/"),
      ),
    ).toBe(true);
    expect(JSON.stringify(template.toJSON())).not.toContain(
      "SENTRY_AUTH_TOKEN",
    );
    expect(template.findResources("AWS::SecretsManager::Secret")).toEqual({});
  });
});
