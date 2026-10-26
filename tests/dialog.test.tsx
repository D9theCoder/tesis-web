import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { Dialog } from "@/components/ui/primitives";

function Example() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Write config</button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Write to TESIS config.yaml"
        footer={
          <>
            <button data-dialog-initial-focus onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button>Write config.yaml</button>
          </>
        }
      >
        <p>This replaces the checkout document.</p>
      </Dialog>
    </>
  );
}

it("opens on its least destructive control, traps focus, and restores focus on Escape", () => {
  render(<Example />);
  const trigger = screen.getByRole("button", { name: "Write config" });
  trigger.focus();
  fireEvent.click(trigger);

  const dialog = screen.getByRole("dialog", { name: "Write to TESIS config.yaml" });
  expect(dialog).toBeVisible();

  const cancel = screen.getByRole("button", { name: "Cancel" });
  const confirm = screen.getByRole("button", { name: "Write config.yaml" });
  const close = screen.getByRole("button", { name: "Close" });

  expect(cancel).toHaveFocus();

  // Tab wraps from the last footer control back to the header close button.
  confirm.focus();
  fireEvent.keyDown(confirm, { key: "Tab" });
  expect(close).toHaveFocus();
  // Shift+Tab from the first control wraps to the last.
  fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
  expect(confirm).toHaveFocus();

  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(trigger).toHaveFocus();
});

it("closes from the backdrop and from the cancel control", () => {
  render(<Example />);
  fireEvent.click(screen.getByRole("button", { name: "Write config" }));
  fireEvent.click(document.querySelector(".ui-dialog-backdrop") as HTMLElement);
  expect(screen.queryByRole("dialog")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Write config" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
