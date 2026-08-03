# The provider pattern

This is the load-bearing pattern of the whole stack: every external dependency — an LLM, a weather
API, persistence, identity, telemetry, browser error reporting — is reached through a hand-written
interface, implemented by one small file per vendor, and selected by a single environment variable.
Read this before adding any dependency that makes a network call, opens a socket, or reads a disk.
It is written to be portable: the shape described here works in any TypeScript service, with or
without the rest of this stack.

---

## 1. The problem it solves

Three distinct failures, which people usually notice in this order.

**Demo fragility.** A new engineer clones the repo. To see the app do anything, they need an API
key, a cloud account, a database, and a VPN. The first hour is spent on credentials, and the app is
never runnable on a plane, in an interview, or in CI. Anything that cannot run offline is not really
testable either — it is only *observable in staging*.

**Untestable code.** When `planTrip()` calls `fetch('https://api.vendor.com/...')` directly, you
cannot test the planning logic without either hitting the network (slow, flaky, rate-limited,
non-deterministic) or monkey-patching global `fetch` (brittle, order-dependent, and a test of your
mocking library rather than your code). Neither gives you confidence. The logic and the I/O are
fused, so you can only exercise them together.

**Vendor lock-in.** Not the dramatic kind where you cannot leave, the ordinary kind where leaving
costs a quarter. A vendor's SDK types leak outward: `OpenAI.Chat.Completion` becomes the type flowing
through your service layer, its error classes become the ones your `catch` blocks name, its retry
semantics become assumptions your callers encode. When pricing changes or the vendor has an outage,
the migration touches every file that ever saw a response, because the vendor's data model *is* your
data model.

The pattern's promise: business logic that has never heard of a vendor, a full-featured offline mode
that is the default, and vendor swaps that are a one-file addition plus an env var.

---

## 2. What this actually is, in pattern vocabulary

It is worth being precise here, because the names are thrown around loosely and knowing exactly
which one applies tells you what each file is allowed to do.

### Ports and Adapters (Hexagonal Architecture) — yes, this is the frame

Alistair Cockburn's hexagonal architecture says: the application core defines *ports* — interfaces
expressed entirely in the application's own vocabulary — and the outside world reaches the core only
through *adapters* that translate between a port and some specific technology. The core does not
import the outside; the outside is plugged into the core.

That is exactly what is happening. `port.ts` is written in the language of the domain (`Forecast`,
`City`, `PlanChunk`), never the vendor's (`WttrResponse`, `ChatCompletionChunk`). `wttr.ts` is a
*driven* adapter: the application calls out through it. (Hexagonal also has *driving* adapters —
things that call *into* the app, like an HTTP route or a GraphQL resolver. Those exist in this stack
too; the provider pattern is only about the driven side.)

The direction of the dependency is the whole point: `adapters/wttr.ts` imports `port.ts`, never the
reverse. That single arrow is what makes the core independent of vendors — it is the Dependency
Inversion Principle applied at the process boundary.

### Strategy — yes, for the family of interchangeable adapters

The Gang of Four's Strategy pattern: define a family of algorithms, encapsulate each one, make them
interchangeable at runtime behind a common interface. `mock` and `wttr` are two strategies for
"obtain a forecast," and the caller cannot tell which one it holds. The classical framing assumes
the *client* selects the strategy; here the client never does — selection is hoisted out to the
registry so no business code ever names an implementation. That is a small, deliberate deviation.

### Factory — yes, but say *which* factory

Two different factory ideas apply at two different levels, and conflating them is the usual source
of confusion:

- Each adapter exports a **factory function** — `createWeatherAdapter(config)` — that returns a
  closed-over object satisfying the port. This is a factory in the plain sense: a function that
  builds a configured instance without exposing a constructor or a class.
- The registry is closer to a **Simple Factory** (sometimes "parameterized factory"): given a
  discriminating value, it returns the right implementation. It is *not* GoF **Abstract Factory**
  (which produces families of related products designed to be used together) and *not* GoF **Factory
  Method** (which relies on subclasses overriding a creation hook — there is no inheritance here at
  all).

### Dependency Injection — yes, the pattern; no, the container

Providers are constructed once at composition root — the place where the app is wired together —
and passed into business logic as parameters or as one context object. That is dependency injection.
What this stack deliberately does *not* have is a DI *container*: no decorators, no reflection, no
service locator, no `@Injectable()`, no string tokens resolved at runtime. Passing an argument is
already dependency injection; a container mostly adds a runtime graph that your type checker cannot
see. Plain parameters keep the wiring visible and statically checked.

### Names that do *not* apply

- **Adapter (GoF)** — confusingly, not quite. The GoF Adapter converts one *existing* interface into
  another *existing* one. Our adapters do that translation, but the port was designed first, for us,
  which makes them closer to hexagonal adapters than to the GoF pattern. Harmless overlap; just do
  not go looking for a GoF `Adaptee`.
- **Facade** — a facade simplifies a subsystem you still depend on. A port *replaces* the dependency
  in the type system. If your "port" is shaped exactly like one vendor's SDK, you have built a facade
  and you will discover this on the day you try to add a second vendor.
- **Repository** — a specialization, not a synonym. The store port in `rest-api` happens to be a
  repository (collection-of-aggregates semantics). The weather port is not a repository; it is just a
  port.
- **Anti-corruption layer** — DDD's ACL is the same *idea* applied between bounded contexts, and the
  translation step inside each adapter is doing ACL work. Fair to use the term in discussion; not a
  different structure.

The short version: **hexagonal ports and adapters, with the adapter chosen by a simple factory over
an env var, injected by hand.**

---

## 3. The three-file layout

Every capability is exactly one directory with a fixed shape:

```
src/providers/weather/
├── port.ts              interface + Zod schemas. Knows no vendor.
├── adapters/
│   ├── mock.ts          deterministic, seeded, zero network
│   └── wttr.ts          real HTTP/SDK implementation
└── index.ts             registry: picks one from an env var
```

Consistency across capabilities matters more than local cleverness. When every capability looks the
same, a reader who has understood one has understood all of them, and a new one can be added without
a design discussion.

### 3.1 `port.ts` — the contract

```ts
// src/providers/weather/port.ts
import { z } from 'zod';

export const ForecastQuerySchema = z.object({
  city: z.string().min(1),
  days: z.number().int().min(1).max(14),
});

export const DailyForecastSchema = z.object({
  date: z.string(), // ISO date, no time component
  condition: z.enum(['clear', 'cloudy', 'rain', 'snow', 'storm']),
  highC: z.number(),
  lowC: z.number(),
  precipitationChance: z.number().min(0).max(1),
});

export const ForecastSchema = z.object({
  city: z.string(),
  days: z.array(DailyForecastSchema),
});

export type ForecastQuery = z.infer<typeof ForecastQuerySchema>;
export type DailyForecast = z.infer<typeof DailyForecastSchema>;
export type Forecast = z.infer<typeof ForecastSchema>;

/** One capability, one verb. Implementations never throw vendor errors. */
export interface WeatherProvider {
  getForecast(query: ForecastQuery): Promise<Forecast>;
}
```

Three rules govern this file:

1. **Domain vocabulary only.** `condition: 'rain'` is our word. If the vendor says `"Patchy rain
   possible"`, translating that is the adapter's job, not the caller's.
2. **Narrow.** A port has the operations the application actually uses. Do not mirror a vendor's API
   surface "in case we need it" — every unused method is a method each future adapter must implement.
3. **Schemas and types together.** The Zod schema is the source of truth; the TypeScript type is
   inferred from it with `z.infer`. Declaring both by hand guarantees they drift.

### 3.2 `adapters/mock.ts` — the reference implementation

```ts
// src/providers/weather/adapters/mock.ts
import {
  ForecastSchema,
  type Forecast,
  type ForecastQuery,
  type WeatherProvider,
} from '../port';

export interface MockWeatherConfig {
  latencyMs: number;
}

const CONDITIONS = ['clear', 'cloudy', 'rain', 'snow', 'storm'] as const;

// fnv-1a: tiny, stable across runs and machines, which is the only property we need
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seeded(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10000) / 10000;
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Deterministic forecasts seeded from the query, so the same input always yields the same output. */
export function createMockWeatherAdapter(config: MockWeatherConfig): WeatherProvider {
  return {
    async getForecast(query: ForecastQuery): Promise<Forecast> {
      if (config.latencyMs > 0) await delay(config.latencyMs);

      const next = seeded(hash(query.city));
      const days = Array.from({ length: query.days }, (_, index) => {
        const roll = next();
        const high = 8 + Math.round(next() * 22);
        return {
          date: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
          condition: CONDITIONS[Math.floor(roll * CONDITIONS.length)] ?? 'clear',
          highC: high,
          lowC: high - 6,
          precipitationChance: Math.round(next() * 100) / 100,
        };
      });

      return ForecastSchema.parse({ city: query.city, days });
    },
  };
}
```

Note that the mock validates its own output. That is not paranoia — it is how you catch a mock that
has drifted away from the port after a schema change, at the moment it drifts.

### 3.3 `adapters/wttr.ts` — a real one

```ts
// src/providers/weather/adapters/wttr.ts
import { z } from 'zod';
import {
  ForecastSchema,
  type DailyForecast,
  type Forecast,
  type ForecastQuery,
  type WeatherProvider,
} from '../port';

export interface WttrConfig {
  baseUrl: string;
  timeoutMs: number;
  fetch?: typeof globalThis.fetch;
}

// only the fields we consume; unknown keys are ignored by design
const WttrPayloadSchema = z.object({
  weather: z.array(
    z.object({
      date: z.string(),
      maxtempC: z.string(),
      mintempC: z.string(),
      hourly: z.array(
        z.object({
          chanceofrain: z.string(),
          weatherDesc: z.array(z.object({ value: z.string() })),
        }),
      ),
    }),
  ),
});

/** Vendor errors and vendor shapes stop here; callers see ProviderError and Forecast. */
export class ProviderError extends Error {
  constructor(
    readonly code: 'unavailable' | 'timeout' | 'invalid_response',
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

function toCondition(description: string): DailyForecast['condition'] {
  const text = description.toLowerCase();
  if (text.includes('thunder')) return 'storm';
  if (text.includes('snow') || text.includes('sleet')) return 'snow';
  if (text.includes('rain') || text.includes('drizzle')) return 'rain';
  if (text.includes('cloud') || text.includes('overcast')) return 'cloudy';
  return 'clear';
}

export function createWttrWeatherAdapter(config: WttrConfig): WeatherProvider {
  const doFetch = config.fetch ?? globalThis.fetch;

  return {
    async getForecast(query: ForecastQuery): Promise<Forecast> {
      const url = `${config.baseUrl}/${encodeURIComponent(query.city)}?format=j1`;
      const signal = AbortSignal.timeout(config.timeoutMs);

      let response: Response;
      try {
        response = await doFetch(url, { signal });
      } catch (cause) {
        const timedOut = cause instanceof Error && cause.name === 'TimeoutError';
        throw new ProviderError(
          timedOut ? 'timeout' : 'unavailable',
          `weather lookup failed for ${query.city}`,
          cause,
        );
      }

      if (!response.ok) {
        throw new ProviderError('unavailable', `weather upstream returned ${response.status}`);
      }

      const parsed = WttrPayloadSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new ProviderError('invalid_response', 'weather upstream payload did not match schema');
      }

      const days = parsed.data.weather.slice(0, query.days).map((day) => ({
        date: day.date,
        condition: toCondition(day.hourly[0]?.weatherDesc[0]?.value ?? ''),
        highC: Number(day.maxtempC),
        lowC: Number(day.mintempC),
        precipitationChance: Number(day.hourly[0]?.chanceofrain ?? '0') / 100,
      }));

      return ForecastSchema.parse({ city: query.city, days });
    },
  };
}
```

Everything vendor-specific is in this file: the URL shape, the string-typed numbers, the free-text
condition, the timeout policy, the error translation. Delete the file and the vendor is gone from the
codebase.

The injectable `fetch` is worth copying. It costs one optional config field and it means the adapter
can be unit-tested against canned payloads — including malformed ones — with no network and no global
patching.

### 3.4 `index.ts` — the registry

```ts
// src/providers/weather/index.ts
import { env } from '../../config/env';
import { createMockWeatherAdapter } from './adapters/mock';
import { createWttrWeatherAdapter } from './adapters/wttr';
import type { WeatherProvider } from './port';

/** The only place in the codebase that knows which weather implementation is live. */
export function createWeatherProvider(): WeatherProvider {
  switch (env.PROVIDER_WEATHER) {
    case 'wttr':
      return createWttrWeatherAdapter({
        baseUrl: env.WTTR_BASE_URL,
        timeoutMs: env.PROVIDER_TIMEOUT_MS,
      });
    case 'mock':
      return createMockWeatherAdapter({ latencyMs: env.MOCK_LATENCY_MS });
  }
}

export type { Forecast, ForecastQuery, WeatherProvider } from './port';
```

Because `env.PROVIDER_WEATHER` is a Zod enum, the `switch` is exhaustive: adding `'openweather'` to
the enum without adding a `case` is a compile error. That is the type system enforcing that the
registry stays complete, which beats a `default:` clause that throws at runtime.

### 3.5 Composition root and consumption

Build every provider once, at startup, and pass the bundle down:

```ts
// src/providers/index.ts
import { createWeatherProvider } from './weather';
import type { WeatherProvider } from './weather/port';

export interface Providers {
  weather: WeatherProvider;
}

export function createProviders(): Providers {
  return { weather: createWeatherProvider() };
}
```

```ts
// src/services/planner.ts
import type { Providers } from '../providers';

export interface DaySketch {
  date: string;
  indoor: boolean;
}

/** Pure orchestration: all I/O arrives through `providers`. */
export async function sketchDays(
  providers: Providers,
  city: string,
  days: number,
): Promise<DaySketch[]> {
  const forecast = await providers.weather.getForecast({ city, days });
  return forecast.days.map((day) => ({
    date: day.date,
    indoor: day.precipitationChance > 0.5 || day.condition === 'storm',
  }));
}
```

`sketchDays` imports no vendor, reads no environment variable, and has no idea whether it is talking
to a mock. Its test is three lines and needs no mocking library:

```ts
// tests/unit/planner.test.ts
import { describe, expect, it } from 'vitest';
import { sketchDays } from '../../src/services/planner';
import type { Providers } from '../../src/providers';

const providers: Providers = {
  weather: {
    getForecast: async ({ city }) => ({
      city,
      days: [
        { date: '2025-01-01', condition: 'storm', highC: 9, lowC: 3, precipitationChance: 0.9 },
      ],
    }),
  },
};

describe('sketchDays', () => {
  it('keeps stormy days indoors', async () => {
    await expect(sketchDays(providers, 'Lisbon', 1)).resolves.toEqual([
      { date: '2025-01-01', indoor: true },
    ]);
  });
});
```

That test is the payoff for the entire pattern. Note what is absent: no `vi.mock`, no network, no
fixture server, no cleanup.

---

## 4. Why Zod at the boundary, when TypeScript already has interfaces

TypeScript types are erased at compile time. `await response.json()` is `any` (or `unknown`); every
annotation you place on it is a *promise you are making to the compiler*, not a check. When the
vendor renames a field, ships `null` where it used to send `0`, or returns an HTML error page with a
200, TypeScript is silent — and the bad value travels until something far away fails with a message
that names neither the vendor nor the field.

A Zod schema is a value that exists at runtime, so it can actually inspect the payload. Parsing at
the boundary buys four things:

1. **Failure at the boundary, with a useful message.** `invalid_type at weather[0].maxtempC:
   expected string, received null` names the vendor, the field, and the expectation. Compare with
   `NaN` surfacing three modules later.
2. **A type you have earned.** After `ForecastSchema.parse(x)`, the value genuinely is a `Forecast` —
   the type is a consequence of a check rather than an assertion. This is the one place where
   `as` casts are legitimately unnecessary.
3. **One definition instead of two.** `z.infer<typeof ForecastSchema>` means schema and type cannot
   disagree. The same schema also feeds OpenAPI generation in `rest-api` and GraphQL input validation
   in `graph-api`.
4. **Documentation that cannot rot.** The schema is the precise, executable statement of what crosses
   the boundary. `precipitationChance: z.number().min(0).max(1)` settles the "is it 0–1 or 0–100?"
   question permanently.

Where to parse, and where not to:

- **Parse** every inbound HTTP body, every upstream response, every vendor payload, every
  `process.env`, every message off a queue, every row out of a document store.
- **Do not parse** on calls between your own in-process functions. Once a value is inside the type
  system, re-validating it is cost with no information gain.
- **Parse output as well as input** in adapters and mocks. It is cheap and it catches translation
  bugs and mock drift at the moment they happen.

`safeParse` versus `parse`: use `safeParse` where you will turn a failure into a domain error you
control (as `wttr.ts` does with `ProviderError`); use `parse` where a failure is a programming error
that should throw loudly (as at the end of both adapters, and in `env.ts` at boot).

---

## 5. Determinism rules for mocks

A mock is only useful if the same input always produces the same output — everywhere, forever. That
turns snapshot tests, screenshot tests, and E2E assertions from flake sources into real signal.

1. **Seed from the input, never from ambient state.** Hash the meaningful parts of the request into a
   seed. Never `Math.random()`, never `Date.now()`, never a counter that survives between calls,
   never a value read from the environment other than declared config.
2. **No wall-clock time in output.** Derive dates from the request (a trip's start date) or from a
   fixed epoch. `new Date()` in a mock means a snapshot that expires at midnight.
3. **Stable ordering.** Sort explicitly before returning. `Object.keys`, `Map` iteration, and
   `Array.sort` on equal keys are stable enough in practice but not stable *by intent* — say what you
   mean.
4. **Deterministic ids.** Derive them from the seed (`trip_${hash(input).toString(36)}`), not from
   `crypto.randomUUID()`. This stack keeps a seedable id helper in the domain layer for exactly this.
5. **Simulated latency is configurable and off by default.** One env var (`MOCK_LATENCY_MS`), applied
   uniformly. It exists so loading states can be seen in development; it must not be needed for
   correctness, and tests run with it at `0`.
6. **Plausible, not trivial.** A mock that returns `"lorem ipsum"` proves nothing about layout,
   pagination, truncation, or empty states. Seeded mocks should return a realistic distribution:
   varying lengths, some empty arrays, occasional missing optional fields.
7. **Errors are reachable.** Give the mock a deterministic way to fail — a magic input (`city ===
   'Nowhere'` → `ProviderError('unavailable')`) or a configured failure rate keyed off the seed.
   Error paths that cannot be exercised offline will not be tested.
8. **The mock is bound by the same port, and proves it.** Run one shared contract test suite against
   every adapter (mock included), skipping real ones unless their env var is set. That suite is what
   keeps the mock honest as the real adapter learns new behavior.

---

## 6. Adding a new capability in five steps

Say you need place search.

1. **Write `port.ts`.** Zod schemas for input and output plus the interface, in domain vocabulary.
   Start with the single operation your first caller actually needs.
2. **Write `adapters/mock.ts`.** Seeded from the query, validating its own output. Write this
   *before* the real adapter — it forces the port to be shaped by your needs rather than by a
   vendor's response.
3. **Add the switch to `src/config/env.ts`.** `PROVIDER_PLACES: z.enum(['mock', 'overpass']).default('mock')`,
   plus any adapter config (base URL, timeout, optional key). Add every new variable to
   `.env.example` with a comment and an obviously-fake placeholder in the same change.
4. **Write `index.ts`.** The exhaustive `switch`, plus a re-export of the port's public types. Add
   the capability to the `Providers` bundle at the composition root.
5. **Consume it.** Business logic takes `providers` as a parameter and calls the port. Write the unit
   test against a hand-built stub, and the contract test suite against the mock adapter.

The real adapter is step 6, and it is a separate commit — often a separate week. Everything above
ships and demos without it.

---

## 7. Adding a vendor to an existing capability in two steps

1. **Add `adapters/<vendor>.ts`** exporting `create<Vendor><Capability>Adapter(config)`, translating
   to the existing port, owning its own retries, timeouts, and error mapping.
2. **Add the value to the env enum and a `case` to the registry.** The compiler will tell you if you
   forget the second half.

Nothing else changes. No business logic, no tests of business logic, no schema, no callers. If a
vendor addition forces you to touch a service or a resolver, the port was leaking and the fix belongs
in the port — not in the caller.

---

## 8. Anti-patterns

**Branching on the provider name outside the registry.**

```ts
// wrong
if (env.PROVIDER_LLM === 'mock') {
  return cannedItinerary();
}
```

The moment this exists, mock and real behavior diverge, the mock stops being a faithful
implementation, and every future branch has to be duplicated in both worlds. If a caller needs to
know something, that something is a *capability* — model it as a port field
(`supportsStreaming: boolean`), not as a vendor name.

**Leaking vendor types upward.** A port that returns `ChatCompletionChunk`, or a service that
catches `RateLimitError` from a vendor package, has already lost. The test: `grep` your service and
resolver layers for the vendor package name — there should be zero hits outside
`src/providers/<capability>/adapters/`.

**A port shaped like one vendor's API.** If `port.ts` has `temperature`, `top_p`, and
`presence_penalty` on it, you have modeled a specific vendor rather than the capability. Design the
port against what the *application* needs, then let each adapter map those needs onto its vendor's
knobs.

**Mocks that drift.** The real adapter learns to paginate; the mock still returns everything at
once. Six months later the UI breaks in production only. Prevention: one shared contract suite run
against every adapter, and mocks that validate their own output.

**Config read outside `env.ts`.** A `process.env.API_KEY` inside an adapter reintroduces exactly what
the pattern removes: an untyped, undeclared, unvalidated dependency invisible to `.env.example` and
to the reader. Config enters through the factory's argument, always.

**Constructing providers per request.** Building an adapter inside a resolver or route handler
discards connection pools, DataLoader caches, and token caches, and makes the provider bundle
untestable by substitution. Build once at the composition root; pass it down.

**A port with one implementation, forever.** The pattern costs a file and an indirection. For a
dependency that will never be swapped, never be mocked, and never fail interestingly — a date
formatting library, a hash function — that cost buys nothing. Reserve ports for things that cross a
process boundary or that you genuinely want to run without.

**Ports that are secretly two ports.** When an interface grows an operation only one adapter can
honestly implement, the mock ends up throwing `not implemented`. Split the capability instead; two
small ports beat one with holes in it.

---

## 9. What you get when it is done

- `PROVIDER_*=mock` everywhere is the default, so a fresh clone runs the whole product with no
  accounts, no keys, and no network.
- Mixing is free: real LLM, mock everything else, is a valid and supported configuration.
- Business logic is tested with plain object literals and no mocking framework.
- A vendor outage is a one-line env change to route around, and a vendor migration is one new file.
- Every external dependency in the system is discoverable by listing one directory.

---

## 10. Pattern reference

Section 2 names a dozen classical patterns in passing. This section takes each one in turn, shows a
minimal textbook implementation in plain JavaScript, and then says exactly what this stack does about
it — fully, partially, or not at all, and why. The classic examples are deliberately naive: they are
there to make the shape recognizable, not to be copied.

Classic implementations are in JavaScript to keep them free of type-system noise; the "here" side is
in TypeScript because that is what the codebase actually is.

| # | Pattern | Origin | Status here |
| - | ------- | ------ | ----------- |
| 10.1 | Ports and Adapters (Hexagonal) | Cockburn | Used, faithfully |
| 10.2 | Dependency Inversion Principle | SOLID | Used — the mechanism underneath 10.1 |
| 10.3 | Strategy | GoF | Used, with one deviation |
| 10.4 | Simple Factory | folk pattern | Used — the registry |
| 10.5 | Factory Method | GoF | **Not used** |
| 10.6 | Abstract Factory | GoF | **Not used**, deliberately |
| 10.7 | Dependency Injection | Fowler | Used, by hand |
| 10.8 | Service Locator / DI container | Fowler | **Not used**, deliberately |
| 10.9 | Adapter | GoF | Partial — same mechanics, different intent |
| 10.10 | Facade | GoF | **Not used** — and mistaking it for a port is a bug |
| 10.11 | Repository | Fowler / DDD | Partial — one capability only |
| 10.12 | Registry | Fowler | Name borrowed, pattern not used |
| 10.13 | Anti-Corruption Layer | DDD | Used in spirit, not as a separate structure |

---

### 10.1 Ports and Adapters (Hexagonal Architecture)

**Classic.** The application defines an interface in its own vocabulary; technology-specific code
implements it from the outside. Nothing in the core imports anything from the edge.

```js
// core/ports/notifier.js — the port, owned by the application
// (in JS an "interface" is just a documented shape; the discipline is the same)
export function notifyLateTrip(notifier, trip) {
  return notifier.send({ to: trip.owner, subject: 'Delay', body: `${trip.city} is delayed` });
}

// edge/adapters/smtp-notifier.js — the adapter, owned by the edge
export function createSmtpNotifier(smtpClient) {
  return {
    send: ({ to, subject, body }) =>
      smtpClient.sendMail({ to, subject, text: body, from: 'noreply@example.invalid' }),
  };
}
```

`notifyLateTrip` knows there is a thing that can `send`. It does not know SMTP exists.

**Here.** This is the frame for the entire pattern, implemented without deviation.
`src/providers/weather/port.ts` is the port — `Forecast`, `DailyForecast`, `getForecast`, all
application vocabulary. `adapters/wttr.ts` is a driven adapter that translates our vocabulary to a
vendor's and back. The import arrow only ever points inward: adapters import the port, the port
imports nothing.

The one thing worth noting is that hexagonal architecture also covers *driving* adapters — the things
that call into the application, like an HTTP route or a GraphQL resolver. Those exist in this stack
(`src/routes/`, `src/graphql/resolvers.ts`) but are not what "provider" refers to. The provider
pattern is the driven half only.

---

### 10.2 Dependency Inversion Principle

Not a GoF pattern — the "D" in SOLID — but it is the mechanism that makes 10.1 work, so it is worth
separating out.

**Classic.** High-level policy must not depend on low-level detail; both depend on an abstraction,
and the abstraction is owned by the high-level side.

```js
// before: policy depends on detail
import { MySqlTripStore } from './mysql-trip-store.js';
export function archiveOldTrips() {
  const store = new MySqlTripStore(); // policy now knows about MySQL
  return store.deleteOlderThan(Date.now() - 31536000000);
}

// after: both depend on the abstraction, which policy owns
export function archiveOldTrips(store) {
  return store.deleteOlderThan(Date.now() - 31536000000);
}
```

**Here.** Every provider consumption is the "after" case: `sketchDays(providers, city, days)` receives
its dependency rather than constructing it. The inversion is visible in the file system — the
abstraction (`port.ts`) sits *inside* `src/providers/<capability>/`, owned by the application, and
the detail (`adapters/wttr.ts`) sits below it and imports it.

Note that a provider bundle passed as a parameter is a *coarse* application of the principle: a
service receives the whole `Providers` object rather than only the two ports it uses. That is a
deliberate ergonomic trade — it keeps signatures stable as a service grows — and it is why the
interface-segregation argument shows up as advice ("ports that are secretly two ports" in section 8)
rather than as enforcement.

---

### 10.3 Strategy

**Classic.** A family of interchangeable algorithms behind one interface, selected at runtime,
usually by the client that holds them.

```js
const byPrice = { sort: (xs) => [...xs].sort((a, b) => a.price - b.price) };
const byRating = { sort: (xs) => [...xs].sort((a, b) => b.rating - a.rating) };

function renderResults(activities, strategy) {
  return strategy.sort(activities).map((a) => a.name);
}

renderResults(activities, byPrice); // the caller picks
```

**Here.** `createMockWeatherAdapter` and `createWttrWeatherAdapter` are two strategies for "obtain a
forecast," interchangeable behind `WeatherProvider`, and the consumer cannot tell which one it holds.
That much is textbook.

**Why ours is not quite classic.** In the GoF formulation the *client* chooses the strategy, and
choosing is part of what the client does — `renderResults(activities, byPrice)` is a legitimate call
site. Here, selection is hoisted entirely out of every call site into a single registry, and a caller
choosing its own adapter is an error (it is the first anti-pattern in section 8). Classical Strategy
also often swaps the strategy repeatedly over an object's life; ours is chosen once at boot from
immutable config and never changes for the life of the process.

So: the *structure* is Strategy, the *selection policy* is intentionally more restrictive than the
pattern describes.

---

### 10.4 Simple Factory (a.k.a. parameterized factory)

Not a GoF pattern — GoF has Factory Method and Abstract Factory, and this is neither — but it is the
one people actually mean when they say "a factory."

**Classic.** A function that maps a discriminating value to a constructed instance, so callers do not
name concrete types.

```js
function createTransport(kind) {
  switch (kind) {
    case 'http':
      return createHttpTransport();
    case 'websocket':
      return createWebSocketTransport();
    default:
      throw new Error(`unknown transport: ${kind}`);
  }
}
```

**Here.** `src/providers/weather/index.ts` is exactly this, with the discriminating value coming from
validated config rather than an argument:

```ts
export function createWeatherProvider(): WeatherProvider {
  switch (env.PROVIDER_WEATHER) {
    case 'wttr':
      return createWttrWeatherAdapter({ baseUrl: env.WTTR_BASE_URL, timeoutMs: env.PROVIDER_TIMEOUT_MS });
    case 'mock':
      return createMockWeatherAdapter({ latencyMs: env.MOCK_LATENCY_MS });
  }
}
```

There is a second, smaller factory idea in play: each adapter file exports a factory *function*
(`createWttrWeatherAdapter(config)`) that closes over its configuration and returns a plain object.
No classes, no `new`, no constructors — which is why "factory" here never implies a class hierarchy.

**Why ours is not quite classic.** The textbook version needs a `default:` clause that throws on an
unknown value, because the input is an arbitrary string. Ours has none: `env.PROVIDER_WEATHER` is a
Zod enum, so an invalid value fails at boot in `env.ts`, and a *valid* value with no `case` is a
compile error from exhaustiveness checking. The runtime guard moves to the type system and to
startup validation, which is strictly better — the failure happens before the process serves traffic
instead of on the first request that takes the bad branch.

---

### 10.5 Factory Method (GoF) — not used

**Classic.** A base class defines an algorithm but defers *which* object to create to an overridable
method, and subclasses supply the concrete type.

```js
class TripReportBuilder {
  build(trip) {
    const renderer = this.createRenderer(); // the factory method
    return renderer.render(trip);
  }
  createRenderer() {
    throw new Error('subclass must implement createRenderer');
  }
}

class PdfTripReportBuilder extends TripReportBuilder {
  createRenderer() {
    return createPdfRenderer();
  }
}
```

**Here: not used.** Factory Method's mechanism is inheritance — the variation point is a subclass
overriding a hook. This stack has no inheritance anywhere in the provider layer (no classes at all
except `ProviderError`, which exists only because `Error` must be subclassed to be `instanceof`-able).
Variation is supplied by passing a different function's return value, not by overriding a method, so
there is no base class and no hook to override.

---

### 10.6 Abstract Factory (GoF) — not used, deliberately

**Classic.** An interface for creating *families* of related objects that are designed to be used
together, so a client can switch entire families at once without mixing members.

```js
function createMockProviderFamily() {
  return { weather: createMockWeather(), places: createMockPlaces(), llm: createMockLlm() };
}
function createLiveProviderFamily() {
  return { weather: createWttrWeather(), places: createOverpassPlaces(), llm: createAnthropicLlm() };
}

const providers = process.env.MODE === 'live' ? createLiveProviderFamily() : createMockProviderFamily();
```

**Here: not used — and the reason is a requirement, not an oversight.** `createProviders()` looks
superficially like an Abstract Factory: it returns a bundle of related objects. But it is not one,
because there is no *family variant* to choose. Each capability resolves its own adapter from its own
env var, so `PROVIDER_LLM=anthropic` with `PROVIDER_WEATHER=mock` is a supported, ordinary
configuration — a real LLM against seeded weather while you develop offline.

An Abstract Factory would forbid exactly that. Its entire purpose is guaranteeing family members are
never mixed, which is the right guarantee when members must be compatible with each other (a widget
toolkit's buttons and scrollbars) and the wrong one here, where the members are independent and
mixing is the point. The "all mock" and "all real" configurations exist, but they are just the two
ends of a continuum of per-capability choices, not two families.

---

### 10.7 Dependency Injection

**Classic.** An object receives its collaborators from outside rather than constructing or locating
them. Constructor injection is the usual form; the code that does the wiring is the *composition
root*, at the entry point.

```js
// the collaborator arrives from outside
function createTripService(store, notifier) {
  return {
    async cancel(id) {
      const trip = await store.get(id);
      await store.put({ ...trip, status: 'cancelled' });
      await notifier.send({ to: trip.owner, subject: 'Cancelled', body: trip.city });
    },
  };
}

// composition root — the only place that knows every concrete type
const app = createTripService(createDynamoStore(config), createSmtpNotifier(smtp));
```

**Here.** Used throughout, in its plainest possible form. `createProviders()` is the composition
root, called once at startup; services take `providers` as a parameter; nothing constructs a
dependency where it is used. The three-line unit test in section 3.5 is what this buys — substituting
a collaborator is passing a different object literal.

**Why ours is not quite classic.** The textbook presentation is class-and-constructor based
(`new TripService(store, notifier)`). Ours injects into plain functions, either as the first
parameter (`sketchDays(providers, …)`) or via a per-request context object that carries the provider
bundle plus the principal. Same principle, no objects with mutable collaborator fields.

---

### 10.8 Service Locator / DI container — not used, deliberately

**Classic.** A registry that code queries at runtime to obtain its dependencies, instead of receiving
them.

```js
const container = new Map();
container.set('weather', createWttrWeather());

function locate(key) {
  const found = container.get(key);
  if (!found) throw new Error(`nothing registered for ${key}`);
  return found;
}

// dependency is fetched, not received — and invisible in the signature
function sketchDays(city) {
  return locate('weather').getForecast({ city, days: 3 });
}
```

**Here: not used.** Fowler's own critique is the reason: with a locator, a function's dependencies no
longer appear in its signature, so you cannot tell what it needs without reading its body, and you
cannot substitute a dependency in a test without mutating global state and cleaning it up afterwards.
The heavier framework version (decorators, reflection metadata, string or symbol tokens resolved at
runtime) adds a wiring graph the type checker cannot see, and turns a missing registration into a
runtime crash rather than a compile error.

Note the naming collision: `index.ts` files in this stack are called *registries*, but a DI container
is what we are declining here. See 10.12.

---

### 10.9 Adapter (GoF) — partial

**Classic.** Convert the interface of an existing class into another interface a client already
expects, so two things designed independently can work together.

```js
// the client expects .send({ to, subject, body })
// the library offers .postMessage(channel, text)
function createChatNotifierAdapter(chatLibrary) {
  return {
    send: ({ to, subject, body }) => chatLibrary.postMessage(to, `*${subject}*\n${body}`),
  };
}
```

**Here: the mechanics match, the intent differs.** `adapters/wttr.ts` translates between two
interfaces exactly as above — string-typed numbers become numbers, free-text `weatherDesc` becomes a
five-value enum, `chanceofrain` of `"70"` becomes `0.7`.

**Why ours is not quite classic.** GoF Adapter is a *retrofit*: both interfaces already exist, and
the adapter reconciles them after the fact — there is an "adaptee" whose interface you are stuck
with, and a "target" interface someone else defined. Here the target interface was designed first,
by us, specifically to be implemented by several vendors, and the adapter is written at the same time
as the code that uses it. That makes ours a hexagonal adapter (10.1): a plug built for a socket we
own, rather than a shim between two fixed things.

The distinction has a practical consequence. When a GoF Adapter is awkward, you change the adapter —
neither interface is yours. When one of ours is awkward, that is evidence the *port* is wrong, and
changing the port is the expected fix.

---

### 10.10 Facade (GoF) — not used

**Classic.** A single simplified entry point over a complicated subsystem, so callers do not have to
orchestrate its parts.

```js
// hides the four-step dance, but still hands you the subsystem's own objects
function createBookingFacade(sdk) {
  return {
    async book(tripId) {
      const session = await sdk.auth.createSession();
      const cart = await sdk.carts.create(session.id);
      await sdk.carts.addItem(cart.id, tripId);
      return sdk.checkout.submit(cart.id); // returns sdk.CheckoutResult
    },
  };
}
```

**Here: not used, and confusing it with a port is a real failure mode.** As section 2 puts it, a
facade *simplifies* a subsystem you still depend on; a port *replaces* the dependency in the type
system. The tell is in the return type: the facade above hands back the SDK's `CheckoutResult`, so
the vendor's data model is still your data model and a second vendor still means touching every
caller.

The way this goes wrong in practice is drift rather than a decision: someone writes `port.ts` by
copying the shape of the SDK they happen to be integrating. It compiles, it passes review, and it
looks exactly like a port. You discover it is a facade on the day you add the second adapter and find
that half the port's fields have no meaning for the new vendor.

---

### 10.11 Repository — partial

**Classic.** Mediates between the domain and data mapping, presenting persisted aggregates as though
they were an in-memory collection.

```js
function createTripRepository(db) {
  return {
    findById: (id) => db.query('select * from trips where id = ?', [id]).then(toTrip),
    save: (trip) => db.query('replace into trips set ?', [fromTrip(trip)]),
    remove: (id) => db.query('delete from trips where id = ?', [id]),
  };
}
```

**Here: one capability, not the general shape.** `rest-api`'s store port
(`src/providers/store/port.ts`) genuinely is a repository — collection semantics over domain
aggregates, with a memory adapter and a DynamoDB adapter behind it. Everything else is not:
`WeatherProvider` has no collection, no identity, and no persistence, and calling it a repository
would be a category error.

**Why even the store one is not quite classic.** Two departures. First, the classic formulation
usually gives one repository per aggregate root (`TripRepository`, `ActivityRepository`); ours is a
single store port parameterized by entity, because a single-table DynamoDB design makes per-entity
interfaces mostly duplicate ceremony. Second, the collection illusion is deliberately incomplete —
the port exposes pagination cursors rather than pretending the result set is an array, because
hiding pagination from callers is how you get accidental full-table scans in production.

---

### 10.12 Registry (Fowler) — name borrowed, pattern not used

**Classic.** A well-known object that other objects consult to find common objects and services —
essentially a global lookup table.

```js
const Registry = {
  instances: new Map(),
  register(key, value) {
    this.instances.set(key, value);
  },
  lookup(key) {
    return this.instances.get(key);
  },
};

Registry.register('weather', createWttrWeather());
Registry.lookup('weather').getForecast({ city: 'Lisbon', days: 3 }); // callable from anywhere
```

**Here: the word is used, the pattern is not.** This stack calls
`src/providers/<capability>/index.ts` "the registry," and that is a slight abuse of the term. It has
no mutable map, no `register` call, and no global lookup — it is a function that returns one object,
and callers receive that object by parameter rather than reaching for it by key. Fowler's Registry is
a form of Service Locator, which 10.8 explains why we avoid.

The name is kept because it describes the file's *role* accurately — it is where the set of available
implementations is enumerated — and no better single word exists. If you prefer, read it as
"selector."

---

### 10.13 Anti-Corruption Layer (DDD) — used in spirit

**Classic.** A translation layer between two bounded contexts, so another system's model cannot leak
into yours and corrupt it. Usually a substantial, named component in its own right.

```js
// their model: flat, string-typed, their vocabulary
// our model: nested, typed, ours
function toOurTrip(theirBooking) {
  return {
    city: theirBooking.dest_city_name,
    startDate: theirBooking.start.slice(0, 10),
    travellers: Number(theirBooking.pax_count),
    status: theirBooking.state === 'CONF' ? 'confirmed' : 'pending',
  };
}
```

**Here: the same job, done inside each adapter rather than as its own layer.** The translation half
of an ACL is precisely what `toCondition()` and the mapping block in `wttr.ts` are doing, and the
motivation is identical — a vendor's vocabulary must not become ours.

**Why ours is not quite classic.** An ACL in DDD is a first-class architectural component sitting
between two systems, often with its own services, its own model, and sometimes its own deployment;
it is what you build when integrating with a large legacy context you cannot change. Ours is a
handful of pure functions inside a single adapter file, because the surface being translated is one
HTTP response rather than an entire foreign domain model.

The DDD framing is still useful for arguing about *where* translation belongs: the moment a vendor's
noun shows up in a service or a resolver, the anti-corruption boundary has been breached, regardless
of how small it was.
