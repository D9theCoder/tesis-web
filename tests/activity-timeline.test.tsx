import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ActivityTimeline } from "@/components/runtime/activity-timeline";
import { fetchEvents } from "@/lib/api-client";
import type { EventCursorResponse } from "@/lib/schemas";
vi.mock("@/lib/api-client", () => ({ fetchEvents: vi.fn() }));
beforeEach(() => vi.mocked(fetchEvents).mockReset());
it("keeps earlier events accessible across local and server pages", async () => {
  vi.mocked(fetchEvents).mockResolvedValueOnce({ executionId: "history", events: Array.from({ length: 26 }, (_, i) => ({ event_type: `record-${i}`, execution_id: "child-a", timestamp: i + 1 })), status: "completed", nextCursor: 400, hasMore: true })
    .mockResolvedValueOnce({ executionId: "history", events: [{ event_type: "later-record" }], status: "completed", nextCursor: 800, hasMore: false });
  render(<ActivityTimeline executionId="history" />);
  expect(await screen.findByText("record-0")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Next steps" }));
  expect(screen.getByText("record-25")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Next steps" }));
  expect(await screen.findByText("later-record")).toBeVisible();
  expect(fetchEvents).toHaveBeenLastCalledWith("history", 400, expect.any(AbortSignal), null);
});
it("rejects a previous execution response after selection changes", async () => {
  const { promise, resolve } = Promise.withResolvers<EventCursorResponse>();
  vi.mocked(fetchEvents).mockReturnValueOnce(promise)
    .mockResolvedValue({ executionId: "new", events: [{ event_type: "new-record" }], status: "completed", nextCursor: 1, hasMore: false });
  const view = render(<ActivityTimeline key="old" executionId="old" />);
  view.rerender(<ActivityTimeline key="new" executionId="new" />);
  expect(await screen.findByText("new-record")).toBeVisible();
  await act(async () => resolve({ executionId: "old", events: [{ event_type: "stale-record" }], status: "completed", nextCursor: 1, hasMore: false }));
  expect(screen.queryByText("stale-record")).toBeNull();
});
