import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const dashboard = JSON.parse(
  await readFile(
    new URL("../telemetry/newrelic-dashboard.json", import.meta.url),
    "utf8",
  ),
);

test("dashboard widgets have importable query and layout configuration", () => {
  assert.equal(dashboard.permissions, "PUBLIC_READ_WRITE");
  assert.equal(typeof dashboard.name, "string");
  assert.equal(dashboard.pages.length, 1);
  const widgets = dashboard.pages[0].widgets;
  assert.equal(widgets.length, 3);
  for (const widget of widgets) {
    assert.ok(widget.title);
    assert.ok(["viz.line", "viz.bar"].includes(widget.visualization?.id));
    for (const field of ["column", "row", "width", "height"])
      assert.ok(
        Number.isInteger(widget.layout?.[field]) && widget.layout[field] > 0,
      );
    const queries = widget.rawConfiguration?.nrqlQueries;
    assert.ok(Array.isArray(queries) && queries.length > 0);
    for (const { accountId, query } of queries) {
      assert.equal(accountId, 0);
      assert.ok(typeof query === "string" && query.length > 0);
    }
  }
});

test("error logs use the OTLP mapped severity and metric queries retain their scope", () => {
  const widgets = dashboard.pages[0].widgets;
  const query = (title) => {
    const widget = widgets.find((item) => item.title === title);
    return widget.rawConfiguration?.nrqlQueries[0]?.query ?? widget.nrql;
  };
  assert.match(
    query("Error logs"),
    /WHERE severity\.text = 'ERROR' FACET service\.name/,
  );
  assert.doesNotMatch(query("Error logs"), /severityText/);
  assert.match(
    query("Operation latency"),
    /percentile\(wander\.operation\.duration, 50, 95, 99\)/,
  );
  assert.match(
    query("Provider duration"),
    /wander\.operation\.duration.*operation LIKE 'provider\.%'/,
  );
});
