# Configuration and secrets

Configuration selects the outside services an application uses; secrets grant access to them.
This reference explains the target configuration contract for the trip-planner stack, from a
credential-free local demo to optional AWS deployment. Use it when adding a provider or a new
setting. The parser below is illustrative: service configuration modules and cloud wiring are
not yet implemented, and the snippet has not been executed as a standalone test.

## Parse once, pass typed values

Environment variables begin as strings. TypeScript annotations cannot prove that a port is a
number, a URL is valid, or a selected provider has its key. Parse them with Zod at startup, then
pass the validated configuration into provider factories. Domain services receive providers,
not environment variables or vendor credentials.

Separate the pure parser from the startup call so tests can supply an ordinary object. The
following small example shows conditional requirements without making the demo need a key:

```ts
import { z } from 'zod';

const llmConfig = z.discriminatedUnion('PROVIDER_LLM', [
  z.object({ PROVIDER_LLM: z.literal('mock') }),
  z.object({
    PROVIDER_LLM: z.literal('openai'),
    OPENAI_API_KEY: z.string().trim().min(1),
    OPENAI_MODEL: z.string().trim().min(1),
  }),
]);

/** Validate provider selection without exposing secret values in errors. */
export function parseLlmConfig(input: Record<string, string | undefined>) {
  const result = llmConfig.safeParse({
    ...input,
    PROVIDER_LLM: input.PROVIDER_LLM ?? 'mock',
  });

  if (!result.success) {
    const keys = [...new Set(result.error.issues.map(issue => issue.path.join('.')))];
    throw new Error(`Invalid configuration: ${keys.join(', ')}`);
  }

  return Object.freeze(result.data);
}
```

The composition root calls `parseLlmConfig(process.env)` once. A selector constructs the mock
adapter or the real adapter from the returned discriminated union. No real SDK client is created
when the mock is selected. Extend the union for another implemented vendor; do not expose a
configuration option backed by an empty adapter.

Use the same approach for bounded numeric settings, URL validation and enumerated log levels.
Parse booleans explicitly: the string `"false"` is truthy in JavaScript. Treat empty required
values as errors. Defaults belong to safe local behavior, never a personal account or a secret.
Freezing this flat object prevents accidental reassignment; nested objects need their own policy.

## Examples are the configuration inventory

Each implementation repo tracks `.env.example`; real `.env` files stay ignored. Every consumed
variable gets a comment describing its purpose, default, public/secret classification, and when
it is required. Add the entry in the same change as the consumer. For the parser above:

```dotenv
# Server configuration: mock by default; openai requires the two fields below.
PROVIDER_LLM=mock
# Server secret: blank by default; required only when PROVIDER_LLM=openai.
OPENAI_API_KEY=
# Server configuration: no default; choose an available model when enabling openai.
OPENAI_MODEL=
```

Do not fill credential slots with plausible keys. When `openai` is selected with an empty key,
startup must name `OPENAI_API_KEY` and stop. It must not log the supplied value, silently switch
providers, or allow a failure later inside a request.

The full demo uses real HTTP between UI, GraphQL and REST. External vendors use mocks, REST uses
memory storage, and telemetry is disabled by default. Provider names differ by capability:
`PROVIDER_DOMAIN=rest` and `PROVIDER_STORE=memory` are deliberate, not failures to select `mock`.
Memory data disappears when REST restarts; optional DynamoDB Local demonstrates persistence.

## Public configuration is not a secret store

The static Next.js UI can contain a GraphQL URL, Cognito public-client metadata and an optional
Sentry DSN. Anyone can inspect these values. The browser must never receive vendor API keys,
AWS credentials, a Cognito client secret, or a Sentry source-map upload token.

Use a small allowlisted public config module with literal `NEXT_PUBLIC_*` accesses where Next
requires them for build-time substitution. Never spread the server/build environment into a
client object. Values embedded in a static build change only when that artifact is rebuilt.
Source-map upload credentials are build-only and belong to a separate opt-in command.

Cognito sign-in uses a public client and Authorization Code + PKCE. The static UI has no server
session or Server Actions. APIs validate tokens and ownership regardless of what the UI displays.
Use an explicit application mode (`demo` or `live`) independently of `NODE_ENV`: an optimized
local container can still be a demo. Live mode must reject mock authentication; demo identity
must be visibly labeled and must not authorize a publicly deployed live service.

## Local, Compose, and AWS are different delivery paths

| Environment | Configuration delivery | Secret delivery |
| --- | --- | --- |
| Local processes | Safe defaults or an explicitly loaded local `.env` | Optional local `.env`, never tracked |
| Docker Compose | Explicit service `environment` entries and container-specific URLs | Explicit opt-in service environment or mounted secret file |
| ECS Fargate | Task configuration, with SSM references where appropriate | Task-definition `secrets` references to Secrets Manager |
| Static UI build | Allowlisted build-time public values | No runtime browser secrets; upload tokens stay in the build process |

Compose's project `.env` provides interpolation values; it does not automatically inject every
value into every container. Declare only the values a service needs. An internal URL such as
`http://rest-api:3000` works between containers, while a browser needs a host-accessible URL.
Keep Compose's own `.env.example` complete as well as each service's example.

Do not bake credentials into Docker `ARG`, image layers or generated assets. Inject them only
when enabling an integration. For AWS SDKs, prefer the normal credential provider chain and a
task role in deployed containers. Local DynamoDB may use explicit dummy credentials only with
a deliberately configured local endpoint; those are not a replacement for AWS authentication.

## Parameter Store versus Secrets Manager

Use SSM Parameter Store for named non-sensitive configuration and cross-stack wiring: table names,
service endpoints and resource identifiers. A versioned path such as
`/wander/v1/<environment>/<service>/<setting>` makes the contract explicit. Parameter Store also
supports encrypted values, but this stack deliberately uses Secrets Manager for vendor secrets
to keep the ownership and rotation rules simple.

Use Secrets Manager for LLM keys, observability ingestion keys and other actual credentials.
A secret name or reference may appear in infrastructure configuration; its value must not appear
in source, synthesized templates, task-definition plaintext environment, logs or stack outputs.
Do not advertise automatic rotation unless that integration actually implements it.

CDK should synthesize without reading an AWS account. Use deploy-time parameter references or
explicit fixture inputs for template tests, not `valueFromLookup` calls that retrieve and cache
account data during synthesis. Deployment resolves the real references later.
[AWS CDK parameter retrieval](https://docs.aws.amazon.com/cdk/v2/guide/get-ssm-value.html).

Scope the ECS execution role to the secret references needed for startup injection. Scope the
application task role to its runtime data access; grant runtime secret reads only if the app
actually performs them. Add KMS decrypt permission only when the selected encryption requires it.
Do not grant broad wildcard secret access because it is convenient.

Injected values are startup snapshots. Rotating a secret does not update a running container's
environment: replace/restart the tasks after changing it. This simple strategy avoids a custom
refresh cache. Never print a secret to verify rotation; verify the integration's health instead.
[AWS ECS sensitive-data guidance](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/specifying-sensitive-data.html).

## Verification contract

When the service parsers are implemented, test these cases with fixture values:

- No credential variables: default providers initialize without external calls.
- Unknown provider, invalid URL/port, or empty selected-provider key: startup fails with key names.
- Real-provider credentials present but provider disabled: no real client or exporter starts.
- Live mode plus mock auth: startup is rejected.
- Error reporting: input secret values never appear in exceptions or logs.
- Public build: no server keys or upload token reaches emitted browser assets.
- Examples: every consumed setting, including Compose and build inputs, is documented.

Injected transports and offline template assertions verify configuration and wiring without an
account. They do not prove a live vendor accepts a key or an AWS deployment succeeds. Record
those checks separately as pending until an owner deliberately enables the integration.
