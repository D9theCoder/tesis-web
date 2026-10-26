import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { YamlKeyValue } from "@/components/settings/yaml-key-value";

const SAMPLE = `# Leading comment
target_url: http://127.0.0.1/dvwa
api_providers:
  river-ai:
    display_name: river-ai
    models:
      - zai-org/GLM-5.3-Flash
      - deepseek-ai/DeepSeek-V4.1-Flash-1017
secret_value: __TESIS_PRESERVE_SECRET_0__
env_value: \${TESIS_PROVIDER_RIVER_AI_KEY}
retries: 2
enabled: true
missing: null
`;

function Harness() {
  const [value, setValue] = useState(SAMPLE);
  return <YamlKeyValue value={value} onChange={setValue} />;
}

describe("YamlKeyValue", () => {
  it("renders read-only nested keys and editable leaf values", () => {
    render(<Harness />);

    expect(screen.getByText("api_providers.river-ai.models[0]")).toBeInTheDocument();
    expect(screen.getByLabelText("api_providers.river-ai.models[0] value")).toHaveValue(
      "zai-org/GLM-5.3-Flash",
    );
    expect(screen.getByText(/Stored secret/)).toBeInTheDocument();
    expect(screen.queryByLabelText("secret_value value")).not.toBeInTheDocument();
    expect(screen.getByLabelText("target_url value")).toHaveValue("http://127.0.0.1/dvwa");
  });

  it("edits a scalar in place", () => {
    render(<Harness />);

    const input = screen.getByLabelText("target_url value");
    fireEvent.change(input, { target: { value: "http://127.0.0.1/login.php" } });
    expect(input).toHaveValue("http://127.0.0.1/login.php");
  });

  it("commits typed numbers and booleans", () => {
    render(<Harness />);

    const number = screen.getByLabelText("retries value");
    fireEvent.change(number, { target: { value: "4.5" } });
    fireEvent.blur(number);
    expect(screen.getByLabelText("retries value")).toHaveValue("4.5");

    fireEvent.change(screen.getByLabelText("enabled value"), { target: { value: "false" } });
    expect(screen.getByLabelText("enabled value")).toHaveValue("false");
  });

  it("filters nested keys and forces matching groups open", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: /api_providers/ }));
    expect(screen.queryByLabelText("api_providers.river-ai.models[0] value")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search configuration keys and values"), {
      target: { value: "models[" },
    });
    expect(screen.getByLabelText("api_providers.river-ai.models[0] value")).toBeInTheDocument();
    expect(screen.queryByLabelText("target_url value")).not.toBeInTheDocument();
  });

  it("collapses and expands every mapping", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(screen.queryByLabelText("api_providers.river-ai.models[0] value")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByLabelText("api_providers.river-ai.models[0] value")).toBeInTheDocument();
  });

  it("keeps the document intact when a null value becomes text", () => {
    render(<Harness />);

    const missing = screen.getByLabelText("missing value");
    fireEvent.change(missing, { target: { value: "filled" } });
    fireEvent.blur(missing);
    expect(screen.getByLabelText("missing value")).toHaveValue("filled");
  });
});
