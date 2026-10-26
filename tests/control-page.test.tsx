import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ControlPage } from "@/components/control/control-page";

vi.mock("@/lib/api-client", () => ({
  fetchControlSchema: vi.fn(),
  fetchControlJobs: vi.fn(),
  fetchControlLog: vi.fn(),
  validateControlDraft: vi.fn(),
  startControlRun: vi.fn(),
  cancelControlRun: vi.fn(),
  startDoctorRun: vi.fn(),
  discoverProviderModels: vi.fn(),
  fetchChatGPTAccount: vi.fn(),
  saveControlConfig: vi.fn(),
  syncControlToCheckout: vi.fn(),
}));

const { fetchControlSchema, fetchControlJobs } = await import("@/lib/api-client");

const schema = {
  configPath: "/tmp/profile/config.yaml",
  sourceConfigPath: "/tmp/tesis/config.yaml",
  profileExists: true,
  yaml: "target_url: http://127.0.0.1/dvwa\n",
  preservedSecretCount: 0,
  fields: [],
  forms: {},
  categories: [],
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

const finishedJob = {
  id: "job-abcd1234",
  kind: "run" as const,
  mode: "matrix" as const,
  status: "finished" as const,
  createdAt: "2026-10-26T03:00:00.000Z",
  startedAt: "2026-10-26T03:00:00.000Z",
  endedAt: "2026-10-26T03:02:00.000Z",
  pid: null,
  exitCode: 0,
  signal: null,
  argv: ["-m", "tesis", "run"],
  configPath: "/tmp/profile/config.yaml",
  result: { status: "success", totals: { total_runs: 3 } },
  error: null,
  cancelRequestedAt: null,
  artifactDir: "/tmp/results/matrix-1",
  executionId: "exec-matrix",
  runId: "run-matrix",
  logBytes: 0,
};

beforeEach(() => {
  vi.mocked(fetchControlSchema).mockReset();
  vi.mocked(fetchControlJobs).mockReset();
  vi.mocked(fetchControlJobs).mockResolvedValue({ jobs: [] });
});

describe("ControlPage", () => {
  it("surfaces run history and lets the reader open it", async () => {
    vi.mocked(fetchControlSchema).mockResolvedValue(schema);
    vi.mocked(fetchControlJobs).mockResolvedValue({ jobs: [finishedJob] });

    render(<ControlPage />);

    await screen.findByRole("heading", { name: "Experiment control" });
    fireEvent.click(screen.getByRole("tab", { name: /Runs/ }));

    await screen.findByRole("heading", { name: "Runs" });
    await waitFor(() => expect(screen.getByText(/exec-matrix/)).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Open results/i })).toBeInTheDocument();
    expect(screen.getByText("succeeded")).toBeInTheDocument();
  });

  it("disables control actions when the server reports the plane is off", async () => {
    vi.mocked(fetchControlSchema).mockResolvedValue({
      ...schema,
      control: { enabled: false, reason: "Runtime controls are disabled (TESIS_CONTROL_DISABLED=1)." },
    });
    render(<ControlPage />);

    await screen.findByText(/Runtime controls are disabled/);
    expect(screen.getByText("read-only")).toBeInTheDocument();
  });

  it("reports a schema failure without hiding the rest of the page", async () => {
    vi.mocked(fetchControlSchema).mockRejectedValue(new Error("Python interpreter not found"));
    render(<ControlPage />);

    await screen.findByText("Python interpreter not found");
    expect(screen.getByRole("heading", { name: "Experiment control" })).toBeInTheDocument();
  });

  it("renders the form from server-rendered schema without refetching it", () => {
    render(<ControlPage initialSchema={schema} />);

    expect(screen.getByRole("group", { name: "Experiment mode" })).toBeInTheDocument();
    expect(fetchControlSchema).not.toHaveBeenCalled();
  });

  it("keeps the launch draft when the reader checks another tab", async () => {
    vi.mocked(fetchControlSchema).mockResolvedValue(schema);
    render(<ControlPage />);

    fireEvent.click(await screen.findByRole("button", { name: /^Next$/ }));
    await screen.findByRole("group", { name: "Coordinates step" });

    fireEvent.click(screen.getByRole("tab", { name: /Runs/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Launch/ }));

    // The wizard is still mounted, so the step it had reached survives.
    expect(screen.getByRole("group", { name: "Coordinates step" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Scope step" })).not.toBeInTheDocument();
  });

  it("waits for the job list instead of painting an empty one", async () => {
    vi.mocked(fetchControlSchema).mockResolvedValue(schema);
    let settle: (value: { jobs: never[] }) => void = () => {};
    vi.mocked(fetchControlJobs).mockImplementation(
      () => new Promise<{ jobs: never[] }>(resolve => { settle = resolve; }),
    );

    render(<ControlPage />);
    fireEvent.click(screen.getByRole("tab", { name: /Runs/ }));

    expect(await screen.findByText("Loading runs…")).toBeInTheDocument();
    settle({ jobs: [] });

    expect(await screen.findByText("No run in this session yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start a run/ })).toBeInTheDocument();
  });

  it("keeps the refresh button out of its busy label before the first job list arrives", async () => {
    let settle: (value: { jobs: never[] }) => void = () => {};
    vi.mocked(fetchControlSchema).mockResolvedValue(schema);
    vi.mocked(fetchControlJobs).mockImplementation(
      () => new Promise<{ jobs: never[] }>(resolve => { settle = resolve; }),
    );

    render(<ControlPage />);

    expect(screen.getByRole("button", { name: /^Refresh$/ })).toHaveTextContent(/^Refresh$/);
    expect(screen.getByRole("button", { name: /^Refresh$/ })).toBeDisabled();

    await waitFor(() => expect(settle).toBeTypeOf("function"));
    settle({ jobs: [] });
    await waitFor(() => expect(screen.getByRole("button", { name: /^Refresh$/ })).toBeEnabled());
  });
});
