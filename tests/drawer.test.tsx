import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Drawer } from "@/components/ui/primitives";

it("names the drawer, keeps keyboard focus inside, and closes on Escape with focus restored", () => {
  function Example() {
    const [open, setOpen] = useState(false);
    return <>
      <button onClick={() => setOpen(true)}>Open evidence</button>
      <Drawer title="Evidence Detail" open={open} onClose={() => setOpen(false)}>
        <button>Related evidence</button>
      </Drawer>
    </>;
  }
  render(<Example />);
  const trigger = screen.getByRole("button", { name: "Open evidence" });
  trigger.focus();
  fireEvent.click(trigger);
  expect(screen.getByRole("dialog", { name: "Evidence Detail" })).toBeVisible();
  const close = screen.getByRole("button", { name: "Close" });
  const related = screen.getByRole("button", { name: "Related evidence" });
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
  expect(related).toHaveFocus();
  fireEvent.keyDown(related, { key: "Tab" });
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(trigger).toHaveFocus();
});
