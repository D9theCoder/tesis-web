import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useReadResource } from "@/lib/use-read-resource";

/**
 * The Control and Settings pages render their data on the server and pass it to
 * this hook. A seeded resource must not spend a second request on the payload
 * it already has, while `refresh` still reloads it.
 */

const load = (data: string) => () => Promise.resolve(data);

describe("useReadResource", () => {
  it("treats a server-rendered seed as loaded without calling the loader", async () => {
    const loader = vi.fn(load("server"));

    const { result } = renderHook(() => useReadResource("key", loader, "server"));

    expect(result.current.data).toBe("server");
    expect(result.current.busy).toBe(false);
    await waitFor(() => expect(loader).not.toHaveBeenCalled());
  });

  it("reloads a seeded resource when it is refreshed", async () => {
    const loader = vi.fn(load("client"));

    const { result } = renderHook(() => useReadResource("key", loader, "server"));
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.data).toBe("client"));
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("still loads on mount when there is no seed", async () => {
    const loader = vi.fn(load("client"));

    const { result } = renderHook(() => useReadResource("key", loader));

    await waitFor(() => expect(result.current.data).toBe("client"));
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
