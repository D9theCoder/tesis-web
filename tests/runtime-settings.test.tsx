import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RuntimeSettings } from "@/components/settings/runtime-settings";
import type { ControlAuthFlow } from "@/lib/control-contract";

vi.mock("@/lib/api-client", () => ({
  fetchControlSchema: vi.fn(),
  discoverProviderModels: vi.fn(),
  fetchChatGPTAccount: vi.fn(),
  fetchChatGPTAuthFlow: vi.fn(),
  startChatGPTAuth: vi.fn(),
  cancelChatGPTAuth: vi.fn(),
  saveControlConfig: vi.fn(),
  syncControlToCheckout: vi.fn(),
  validateControlDraft: vi.fn(),
}));

const {
  fetchControlSchema,
  fetchChatGPTAuthFlow,
  startChatGPTAuth,
  fetchChatGPTAccount,
  saveControlConfig,
} = await import("@/lib/api-client");

const idleAuthFlow: ControlAuthFlow = {
  state: "idle",
  action: null,
  account: "default",
  authorizeUrl: null,
  message: null,
  startedAt: null,
  endedAt: null,
  pid: null,
  remoteRevoked: null,
  status: null,
};

const runningLogin: ControlAuthFlow = {
  ...idleAuthFlow,
  state: "running",
  action: "login",
  authorizeUrl: "https://auth.openai.com/oauth/authorize?state=abc&code_challenge=def",
  message: "Finish sign-in in your browser within five minutes. Approve TESIS and ChatGPT plan usage.",
  startedAt: "2026-10-26T18:00:00.000Z",
  pid: 4242,
};

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
  codex: {
    id: "openai_codex_auth",
    displayName: "ChatGPT (Codex)",
    configured: false,
    model: "",
    account: "default",
    models: [],
    protocol: "openai_codex_auth",
    baseUrl: "https://api.openai.com/v1",
  },
  control: { enabled: true, reason: null },
  activeJob: null,
  scoring: { mode: "human", rubricVersion: "scoring.v4", configured: false, evaluator: { provider: "", model: "", maxAttempts: 2, maxTokens: 1024, timeout: 60 } },
  llmRuntime: { maxConcurrency: 1, cacheScope: "none", roles: {} },
  guardrails: { enabled: false, mode: "reactive", maxRetries: 3, cooldownThreshold: 5 },
  target: { url: "http://127.0.0.1/dvwa", username: "admin", passwordSet: true },
};

beforeEach(() => {
  vi.mocked(fetchControlSchema).mockReset();
  vi.mocked(fetchChatGPTAuthFlow).mockReset().mockResolvedValue(idleAuthFlow);
  vi.mocked(startChatGPTAuth).mockReset();
  vi.mocked(fetchChatGPTAccount).mockReset().mockResolvedValue({
    status: { default: { signed_in: false, plan_usage: false, email: "analyst@example.com" } },
  });
  vi.mocked(saveControlConfig).mockReset().mockResolvedValue({ saved: true, fieldErrors: {} });
  vi.mocked(fetchControlSchema).mockResolvedValue(schema);
});

describe("RuntimeSettings", () => {
  it("paints the saved profile on the first render when the server seeded it", async () => {
    render(<RuntimeSettings initialSchema={schema} />);

    expect(screen.getByRole("heading", { name: "Runtime configuration" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Target URL/)).toHaveValue("http://127.0.0.1/dvwa");
    expect(screen.queryByText(/Reading the settings profile/)).not.toBeInTheDocument();
    expect(fetchControlSchema).not.toHaveBeenCalled();
    await waitFor(() => expect(fetchChatGPTAuthFlow).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fetchChatGPTAccount).toHaveBeenCalledWith("status", "default"));
  });

  it("shows only Sign in when the saved account is signed out", async () => {
    render(<RuntimeSettings initialSchema={schema} />);
    fireEvent.click(screen.getByRole("tab", { name: "Model providers" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit provider" }));

    expect(await screen.findByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("shows only Sign out when the saved account is signed in", async () => {
    vi.mocked(fetchChatGPTAccount).mockResolvedValue({
      status: { default: { signed_in: true, plan_usage: true, email: "analyst@example.com" } },
    });

    render(<RuntimeSettings initialSchema={schema} />);
    fireEvent.click(screen.getByRole("tab", { name: "Model providers" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit provider" }));

    expect(await screen.findByRole("button", { name: "Sign out" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.getByText(/This account is connected/)).toBeInTheDocument();
  });

  it("starts a ChatGPT sign-in and shows the one-time URL", async () => {
    vi.mocked(startChatGPTAuth).mockResolvedValue(runningLogin);

    render(<RuntimeSettings initialSchema={schema} />);
    fireEvent.click(screen.getByRole("tab", { name: "Model providers" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit provider" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sign in" }));

    const link = await screen.findByRole("link", { name: "Open ChatGPT sign-in" });
    expect(link).toHaveAttribute("href", runningLogin.authorizeUrl);
    expect(screen.getByText(/Finish sign-in in your browser within five minutes/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel sign-in" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    expect(startChatGPTAuth).toHaveBeenCalledWith("login", "default");
  });

  it("signs out and reports an unconfirmed remote revocation", async () => {
    vi.mocked(fetchChatGPTAccount).mockResolvedValue({
      status: { default: { signed_in: true, plan_usage: true, email: "analyst@example.com" } },
    });
    vi.mocked(startChatGPTAuth).mockResolvedValue({
      ...idleAuthFlow,
      state: "succeeded",
      action: "logout",
      message:
        "default: signed out locally. Remote revocation was not confirmed. Disconnect TESIS in ChatGPT Settings.",
      remoteRevoked: false,
      startedAt: "2026-10-26T18:00:00.000Z",
      endedAt: "2026-10-26T18:00:01.000Z",
    });

    render(<RuntimeSettings initialSchema={schema} />);
    fireEvent.click(screen.getByRole("tab", { name: "Model providers" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit provider" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByText(/Remote revocation was not confirmed/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
    expect(startChatGPTAuth).toHaveBeenCalledWith("logout", "default");
  });

  it("clears the signed-in state when a polled sign-out completes", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(fetchChatGPTAccount).mockResolvedValue({
        status: { default: { signed_in: true, plan_usage: true, email: "analyst@example.com" } },
      });
      vi.mocked(fetchChatGPTAuthFlow)
        .mockReset()
        .mockResolvedValueOnce(idleAuthFlow)
        .mockResolvedValue({
          ...idleAuthFlow,
          state: "succeeded",
          action: "logout",
          message: "default: signed out.",
          startedAt: "2026-10-26T18:00:00.000Z",
          endedAt: "2026-10-26T18:00:01.000Z",
        });
      vi.mocked(startChatGPTAuth).mockResolvedValue({
        ...idleAuthFlow,
        state: "running",
        action: "logout",
        message: "Signing out…",
        startedAt: "2026-10-26T18:00:00.000Z",
      });

      render(<RuntimeSettings initialSchema={schema} />);
      await act(async () => {
        await Promise.resolve();
      });
      fireEvent.click(screen.getByRole("tab", { name: "Model providers" }));
      fireEvent.click(screen.getByRole("button", { name: "Edit provider" }));
      await act(async () => {
        await Promise.resolve();
      });
      fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByText("Signing out…")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
      expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the current account state when the last flow is an older sign-out", async () => {
    vi.mocked(fetchChatGPTAuthFlow).mockResolvedValue({
      ...idleAuthFlow,
      state: "succeeded",
      action: "logout",
      message: "default: signed out.",
      remoteRevoked: true,
      startedAt: "2026-10-26T17:00:00.000Z",
      endedAt: "2026-10-26T17:00:01.000Z",
    });
    vi.mocked(fetchChatGPTAccount).mockResolvedValue({
      status: { default: { signed_in: true, plan_usage: true, email: "analyst@example.com" } },
    });

    render(<RuntimeSettings initialSchema={schema} />);
    fireEvent.click(screen.getByRole("tab", { name: "Model providers" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit provider" }));

    expect(await screen.findByRole("button", { name: "Sign out" })).toBeEnabled();
    expect(screen.queryByText("default: signed out.")).not.toBeInTheDocument();
  });

  it("does not claim sign-out when account status is unavailable", async () => {
    vi.mocked(fetchChatGPTAccount).mockRejectedValue(new Error("SIWC storage unavailable"));

    render(<RuntimeSettings initialSchema={schema} />);
    fireEvent.click(screen.getByRole("tab", { name: "Model providers" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit provider" }));

    expect(await screen.findByRole("button", { name: "Status unavailable" })).toBeDisabled();
    expect(screen.getByText(/Account status is unavailable/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("fetches the Codex catalog and stages every selected model", async () => {
    vi.mocked(fetchChatGPTAccount).mockImplementation(async (action) =>
      action === "models"
        ? {
            models: [
              { slug: "gpt-5-codex", display_name: "GPT-5 Codex" },
              { slug: "gpt-5", display_name: "GPT-5" },
            ],
          }
        : { status: { default: { signed_in: true, plan_usage: true, email: "analyst@example.com" } } },
    );

    render(<RuntimeSettings initialSchema={schema} />);
    fireEvent.click(screen.getByRole("tab", { name: "Model providers" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit provider" }));
    await screen.findByRole("button", { name: "Sign out" });

    fireEvent.click(screen.getByRole("button", { name: "Fetch catalog" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "GPT-5 Codex" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "GPT-5" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply provider" }));

    expect(await screen.findByText(/ChatGPT \(Codex\) staged: gpt-5-codex, gpt-5/)).toBeInTheDocument();
    expect(screen.getByText("gpt-5-codex")).toBeInTheDocument();
    expect(screen.getByText("gpt-5")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await screen.findByText("Saved. New runs use this profile immediately.");
    const saved = vi.mocked(saveControlConfig).mock.calls.at(-1)?.[0];
    expect(saved?.overrides).toMatchObject({
      "models.openai_codex_auth": { model_name: "gpt-5-codex" },
      "models.openai_codex_auth_2": { model_name: "gpt-5" },
    });
  });

  it("offers a retry instead of a dead end when the profile cannot be read", async () => {
    vi.mocked(fetchControlSchema).mockRejectedValue(new Error("Python interpreter not found"));

    render(<RuntimeSettings />);

    await screen.findByText("Python interpreter not found");
    expect(screen.getByRole("button", { name: /Try again/ })).toBeEnabled();
  });
});
