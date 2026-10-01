const endpoint = process.env.GRAPHQL_URL ?? "http://localhost:4000/graphql";
async function graph(query, variables = {}, authenticated = true) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authenticated ? { authorization: "Bearer demo" } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors)
    throw new Error(
      `GraphQL smoke failed: ${JSON.stringify(body.errors ?? response.status)}`,
    );
  return body.data;
}

const created = await graph(
  `mutation($input: CreateTripInput!) { startCreateGeneration(input: $input) { id status } }`,
  {
    input: {
      city: "Lisbon",
      startDate: "2026-10-15",
      dayCount: 2,
      preferences: { interests: ["food"], pace: "BALANCED" },
    },
  },
);
const generationId = created.startCreateGeneration.id;
const stream = await fetch(
  new URL(`/generations/${encodeURIComponent(generationId)}/events`, endpoint),
  {
    headers: { authorization: "Bearer demo" },
  },
);
if (!stream.ok || !stream.body)
  throw new Error(`SSE unavailable: ${stream.status}`);
const reader = stream.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
let tripId;
const deadline = Date.now() + 30000;
while (Date.now() < deadline && !tripId) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const frames = buffer.split("\n\n");
  buffer = frames.pop() ?? "";
  for (const frame of frames) {
    const data = frame.split("\n").find((line) => line.startsWith("data: "));
    if (!data) continue;
    const event = JSON.parse(data.slice(6));
    if (event.status === "failed") throw new Error("Generation failed");
    if (event.status === "completed") tripId = event.tripId;
  }
}
await reader.cancel();
if (!tripId) throw new Error("Generation did not complete");
const saved = await graph(
  `query($id: ID!) { trip(id: $id) { id ownerId version city } }`,
  { id: tripId },
);
if (saved.trip?.id !== tripId) throw new Error("Saved trip missing");
// The exact saved-trips query the UI sends, so query limits cannot reject it unnoticed.
const listed = await graph(
  `query ListTrips($first: Int!) { trips(first: $first) { items { id city version updatedAt } nextCursor } }`,
  { first: 20 },
);
if (!Array.isArray(listed.trips?.items) || listed.trips.items.length === 0)
  throw new Error("Saved trips list is empty");
const shared = await graph(
  `mutation($input: ShareTripInput!) { shareTrip(input: $input) { share { token } } }`,
  {
    input: { tripId, version: saved.trip.version },
  },
);
const publicTrip = await graph(
  `query($ownerId: ID!, $tripId: ID!, $token: String!) { sharedTrip(ownerId: $ownerId, tripId: $tripId, token: $token) { id city } }`,
  {
    ownerId: saved.trip.ownerId,
    tripId,
    token: shared.shareTrip.share.token,
  },
  false,
);
if (publicTrip.sharedTrip?.id !== tripId)
  throw new Error("Shared trip missing");
process.stdout.write("Create, SSE, save, list, and public share passed\n");
