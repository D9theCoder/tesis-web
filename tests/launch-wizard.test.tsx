import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LaunchWizard } from "@/components/control/launch-wizard";
import type { ControlSchema } from "@/lib/control-contract";

vi.mock("@/lib/api-client", () => ({
  validateControlDraft: vi.fn(),
  startControlRun: vi.fn(),
  fetchControlSchema: vi.fn(),
  fetchControlJobs: vi.fn(),
  fetchControlLog: vi.fn(),
  cancelControlRun: vi.fn(),
  startDoctorRun: vi.fn(),
  discoverProviderModels: vi.fn(),
  fetchChatGPTAccount: vi.fn(),
  saveControlConfig: vi.fn(),
  syncControlToCheckout: vi.fn(),
}));

const { validateControlDraft, startControlRun } = await import("@/lib/api-client");

const schema: ControlSchema = {
  configPath: "/tmp/profile/config.yaml",
  sourceConfigPath: "/tmp/tesis/config.yaml",
  profileExists: true,
  yaml: "target_url: http://127.0.0.1/dvwa\n",
  preservedSecretCount: 0,
  categories: ["target", "run", "matrix"],
  forms: {},
  modelProfiles: [{ id: "provider-one", label: "Provider One / model-a" }],
  resolved: null,
  resolvedError: null,
  fieldErrors: {},
  warnings: [],
  providers: [],
  control: { enabled: true, reason: null },
  activeJob: null,
  fields: [
    {
      path: "target_url",
      label: "Target URL",
      category: "target",
      kind: "url",
      valueType: "str",
      choices: [],
      value: "http://127.0.0.1/dvwa",
      secret: false,
      multiple: false,
      required: true,
      description: "",
      forms: ["single", "matrix"],
    },
    {
      path: "experiment_condition",
      label: "Experiment condition",
      category: "run",
      kind: "select",
      valueType: "str",
      choices: ["akg_guided_hybrid", "linear_hybrid"],
      value: "akg_guided_hybrid",
      secret: false,
      multiple: false,
      required: true,
      description: "",
      forms: ["single", "matrix"],
    },
    {
      path: "scoring_mode",
      label: "Scoring mode",
      category: "run",
      kind: "select",
      valueType: "str",
      choices: ["human", "ai", "both"],
      value: "human",
      secret: false,
      multiple: false,
      required: true,
      description: "",
      forms: ["single", "matrix"],
    },
    {
      path: "provider",
      label: "Primary provider",
      category: "run",
      kind: "select",
      valueType: "str",
      choices: ["provider-one"],
      value: "provider-one",
      secret: false,
      multiple: false,
      required: true,
      description: "",
      forms: ["single", "matrix"],
    },
    {
      path: "level",
      label: "Level",
      category: "run",
      kind: "select",
      valueType: "str",
      choices: ["low", "high"],
      value: "low",
      secret: false,
      multiple: false,
      required: true,
      description: "",
      forms: ["single", "matrix"],
    },
    {
      path: "surface",
      label: "Surface",
      category: "run",
      kind: "select",
      valueType: "str",
      choices: ["sqli"],
      value: "sqli",
      secret: false,
      multiple: false,
      required: true,
      description: "",
      forms: ["single", "matrix"],
    },
    {
      path: "providers",
      label: "Providers",
      category: "matrix",
      kind: "multi_select",
      valueType: "list",
      choices: ["provider-one"],
      value: ["provider-one"],
      secret: false,
      multiple: true,
      required: true,
      description: "",
      forms: ["matrix"],
    },
    {
      path: "levels",
      label: "Levels",
      category: "matrix",
      kind: "multi_select",
      valueType: "list",
      choices: ["low", "high"],
      value: ["low"],
      secret: false,
      multiple: true,
      required: true,
      description: "",
      forms: ["matrix"],
    },
    {
      path: "surfaces",
      label: "Surfaces",
      category: "matrix",
      kind: "multi_select",
      valueType: "list",
      choices: ["sqli"],
      value: ["sqli"],
      secret: false,
      multiple: true,
      required: true,
      description: "",
      forms: ["matrix"],
    },
    {
      path: "payload_modes",
      label: "Payload modes",
      category: "matrix",
      kind: "multi_select",
      valueType: "list",
      choices: ["static_only", "hybrid"],
      value: ["static_only"],
      secret: false,
      multiple: true,
      required: true,
      description: "",
      forms: ["matrix"],
    },
    {
      path: "repeats",
      label: "Repeats",
      category: "matrix",
      kind: "integer",
      valueType: "int",
      choices: [],
      value: 1,
      secret: false,
      multiple: false,
      required: false,
      description: "",
      forms: ["matrix"],
    },
  ],
  scoring: { mode: "human", rubricVersion: "scoring.v4", configured: false, evaluator: { provider: "", model: "", maxAttempts: 2, maxTokens: 1024, timeout: 60 } },
  llmRuntime: { maxConcurrency: 1, cacheScope: "none", roles: {} },
  guardrails: { enabled: false, mode: "reactive", maxRetries: 3, cooldownThreshold: 5 },
  target: { url: "http://127.0.0.1/dvwa", username: "admin", passwordSet: true },
};

beforeEach(() => {
  vi.mocked(validateControlDraft).mockReset();
  vi.mocked(startControlRun).mockReset();
});

describe("LaunchWizard", () => {
  it("previews the matrix coordinate count from the configured axes", async () => {
    render(<LaunchWizard schema={schema} onStarted={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /^Matrix$/ }));
    // The footer badge tracks the axes without leaving the Scope step.
    expect(screen.getByText("1 coordinates")).toBeInTheDocument();
  });

  it("resolves the reviewed request and starts it with the frozen overrides", async () => {
    const onStarted = vi.fn();
    vi.mocked(validateControlDraft).mockResolvedValue({
      valid: true,
      error: null,
      fieldErrors: {},
      resolved: {
        target_url: "http://127.0.0.1/dvwa",
        experiment_condition: "akg_guided_hybrid",
        provider: "provider-one",
        surface: "sqli",
        level: "low",
        payload_mode: "static_only",
        scoring_mode: "human",
        candidate_budget: 10,
        iterations: 10,
        output_dir: "results",
      },
      coordinates: [],
      totalCoordinates: 1,
    });
    vi.mocked(startControlRun).mockResolvedValue({
      saved: true,
      job: {
        id: "job-1234",
        kind: "run",
        mode: "single",
        status: "running",
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        endedAt: null,
        pid: 4242,
        exitCode: null,
        signal: null,
        argv: [],
        configPath: "/tmp/profile/config.yaml",
        result: null,
        error: null,
        cancelRequestedAt: null,
        artifactDir: null,
        executionId: null,
        runId: null,
        logBytes: 0,
      },
    });

    render(<LaunchWizard schema={schema} onStarted={onStarted} />);
    fireEvent.click(screen.getByRole("button", { name: /Review/ }));

    await waitFor(() => expect(validateControlDraft).toHaveBeenCalled(), { timeout: 3000 });
    expect(validateControlDraft).toHaveBeenCalledWith(
      expect.objectContaining({ yaml: schema.yaml, overrides: expect.objectContaining({ matrix: false }) }),
    );

    const start = await screen.findByRole("button", { name: /Start experiment/ });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(start);

    await waitFor(() => expect(startControlRun).toHaveBeenCalledTimes(1));
    expect(startControlRun).toHaveBeenCalledWith({
      mode: "single",
      yaml: schema.yaml,
      overrides: expect.objectContaining({ matrix: false }),
    });
    await waitFor(() => expect(onStarted).toHaveBeenCalled());
  });

  it("blocks Start when the loader rejects the reviewed profile", async () => {
    vi.mocked(validateControlDraft).mockResolvedValue({
      valid: false,
      error: "Scoring evaluator must reference an available model profile",
      fieldErrors: {},
      resolved: null,
      coordinates: [],
      totalCoordinates: 0,
    });

    render(<LaunchWizard schema={schema} onStarted={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Review/ }));

    await screen.findByText(/Configuration needs attention/);
    expect(screen.getByRole("button", { name: /Start experiment/ })).toBeDisabled();
    expect(startControlRun).not.toHaveBeenCalled();
  });

  it("moves focus into the next step so Enter never drops it on the page body", async () => {
    render(<LaunchWizard schema={schema} onStarted={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /^Next$/ }));

    const step = await screen.findByRole("group", { name: "Coordinates step" });
    await waitFor(() => expect(document.activeElement).toBe(step));
  });

  it("names the axis that still blocks a matrix", async () => {
    const emptyAxes = { ...schema, fields: schema.fields.map((field) => (field.path === "providers" ? { ...field, value: [] } : field)) };
    render(<LaunchWizard schema={emptyAxes} onStarted={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /^Matrix$/ }));
    fireEvent.click(screen.getByRole("button", { name: /Coordinates/ }));

    expect(screen.getByRole("status", { name: "Matrix coordinate preview" })).toHaveTextContent(
      "Choose at least one value for Providers to build the matrix.",
    );
  });

  it("turns a loader error into the field's label and the step that owns it", async () => {
    vi.mocked(validateControlDraft).mockResolvedValue({
      valid: false,
      error: "level: must be one of low, medium, high",
      fieldErrors: { "__override__ level": "level: level: must be one of low, medium, high" },
      resolved: null,
      coordinates: [],
      totalCoordinates: 0,
    });

    render(<LaunchWizard schema={schema} onStarted={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Review/ }));

    const jump = await screen.findByRole("button", { name: /Fix in Coordinates/ });
    const item = jump.closest("li");
    expect(item).toHaveTextContent("Level: must be one of low, medium, high");
    expect(screen.queryByText(/__override__/)).not.toBeInTheDocument();

    fireEvent.click(jump);
    expect(screen.getByRole("group", { name: "Coordinates step" })).toBeInTheDocument();
  });

  it("shows matrix axes on the coordinates step and requires every axis", async () => {
    render(<LaunchWizard schema={schema} onStarted={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Matrix$/ }));
    fireEvent.click(screen.getByRole("button", { name: /Coordinates/ }));

    const preview = screen.getByRole("status", { name: "Matrix coordinate preview" });
    expect(preview).toHaveTextContent(/1 coordinate/);
  });
});
