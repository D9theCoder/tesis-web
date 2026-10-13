import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { MetricsSummary } from "@/components/results/scoring-table";
import { normalizeResult } from "@/lib/result-normalizer";

it("associates metric availability and reasons with their definition", () => {
  const result = normalizeResult({ execution_id: "metric-case", config: {} });
  result.metricReadings = { token_cost: { available: false, value: null, reason: "Provider usage missing", nAvailable: 0, nUnavailable: 2, unavailableReasons: { missing_usage: 2 } } };
  render(<MetricsSummary result={result} />);
  const reason = screen.getByText("Provider usage missing");
  const definition = reason.closest("dd");
  expect(definition).not.toBeNull();
  expect(definition).toHaveTextContent("Unavailable");
  expect(definition).toHaveTextContent("Available 0 · unavailable 2");
  expect(definition).toHaveTextContent("Missing Usage · 2");
  expect(definition?.parentElement?.querySelector("dt")).toHaveTextContent("Token Cost");
});
