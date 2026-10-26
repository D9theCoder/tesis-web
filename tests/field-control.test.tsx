import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FieldControl } from "@/components/control/field-control";
import type { ControlField } from "@/lib/control-contract";

function field(overrides: Partial<ControlField>): ControlField {
  return {
    path: "providers",
    label: "Providers",
    category: "matrix",
    kind: "multi_select",
    valueType: "list",
    choices: ["river-ai"],
    value: [],
    secret: false,
    multiple: true,
    required: true,
    description: "",
    forms: ["matrix"],
    ...overrides,
  };
}

describe("FieldControl", () => {
  it("drops the repeated path prefix from a loader error", () => {
    render(
      <FieldControl
        field={field({})}
        value={[]}
        error="providers: must contain at least 1 item(s)"
        onChange={vi.fn()}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/^must contain at least 1 item\(s\)$/);
  });

  it("keeps an error that does not name the field path", () => {
    render(
      <FieldControl
        field={field({ path: "levels", label: "Security levels" })}
        value={[]}
        error="Unknown security level"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Unknown security level");
  });

  it("adds and removes a choice from a multi-select axis", () => {
    const onChange = vi.fn();
    render(<FieldControl field={field({})} value={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "river-ai" }));

    expect(onChange).toHaveBeenCalledWith(["river-ai"]);
  });
});
