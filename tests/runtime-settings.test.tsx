import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RuntimeSettings } from "@/components/settings/runtime-settings";

vi.mock("@/lib/api-client", () => ({
  fetchControlSchema: vi.fn(),
  discoverProviderModels: vi.fn(),
  fetchChatGPTAccount: vi.fn(),
  saveControlConfig: vi.fn(),
  syncControlToCheckout: vi.fn(),
  validateControlDraft: vi.fn(),
}));

const { fetchControlSchema } = await import("@/lib/api-client");

const schema = {
  configPath: "/tmp/profile/config.yaml",
  sourceConfigPath: "/tmp/tesis/config.yaml",
  profileExists: true,
  yaml: "target_url: http://127.0.0.1/dvwa\n",
  preservedSecretCount: 0,
  fields: [
    {
      path: "target_url",
      label: "Target URL",
      category: "target",
      kind: "text",
      valueType: "string",
      choices: [],
      default: null,
      value: "http://127.0.0.1/dvwa",
      secret: false,
      multiple: false,
      required: false,
      minValue: null,
      maxValue: null,
      description: "Authorized DVWA base URL.",
      forms: [],
    },
  ],
  forms: {},
  categories: ["target"],
  modelProfiles: [],
  resolved: null,
  resolvedError: null,
  fieldErrors: {},
  warnings: [],
  providers: [],
  control: { enabled: true, reason: null },
  activeJob: null,
  scoring: { mode: "human", rubricVersion: "scoring.v4", configured: false, evaluator: { provider: "", model: "", maxAttempts: 2, maxTokens: 1024, timeout: 60 } },
  llmRuntime: { maxConcurrency: 1, cacheScope: "none", roles: {} },
  guardrails: { enabled: false, mode: "reactive", maxRetries: 3, cooldownThreshold: 5 },
  target: { url: "http://127.0.0.1/dvwa", username: "admin", passwordSet: true },
};

beforeEach(() => {
  vi.mocked(fetchControlSchema).mockReset();
});

describe("RuntimeSettings", () => {
  it("paints the saved profile on the first render when the server seeded it", () => {
    render(<RuntimeSettings initialSchema={schema} />);

    expect(screen.getByRole("heading", { name: "Runtime configuration" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Target URL/)).toHaveValue("http://127.0.0.1/dvwa");
    expect(screen.queryByText(/Reading the settings profile/)).not.toBeInTheDocument();
    expect(fetchControlSchema).not.toHaveBeenCalled();
  });

  it("offers a retry instead of a dead end when the profile cannot be read", async () => {
    vi.mocked(fetchControlSchema).mockRejectedValue(new Error("Python interpreter not found"));

    render(<RuntimeSettings />);

    await screen.findByText("Python interpreter not found");
    expect(screen.getByRole("button", { name: /Try again/ })).toBeEnabled();
  });
});
