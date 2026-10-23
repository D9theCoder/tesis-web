import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BOOT_DURATION_MS,
  BOOT_SEEN_VALUE,
  BOOT_STORAGE_KEY,
  BootSequence,
} from "@/components/hacker/boot-sequence";
import { HackerChrome } from "@/components/hacker/hacker-chrome";
import { HackerEffects } from "@/components/hacker/hacker-effects";
import { HackerStatusBar } from "@/components/hacker/hacker-status-bar";
import {
  collectGlitchableHeadings,
  getLinkScrambleTarget,
  isGlitchableHeading,
  nextHeadingGlitchDelay,
  nextLinkScrambleDuration,
  pickGlitchableHeading,
  randomBetween,
  scrambleText,
} from "@/lib/hacker-effects";
import { setTheme } from "@/lib/use-theme";

vi.mock("@/components/hacker/rain-canvas", () => ({
  RainCanvas: ({ mode, reducedMotion, active }: { mode: string; reducedMotion: boolean; active: boolean }) => (
    <div
      data-testid="rain-canvas"
      data-mode={mode}
      data-reduced-motion={String(reducedMotion)}
      data-active={String(active)}
    />
  ),
}));

const SYSTEM_TIME = new Date("2026-02-03T04:05:06.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(SYSTEM_TIME);
  sessionStorage.clear();
  localStorage.clear();
  document.documentElement.dataset.theme = "hacker";
  setTheme("hacker", false);
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  document.documentElement.dataset.theme = "light";
});

describe("boot sequence", () => {
  it("completes after the startup window and records the session guard", () => {
    render(<BootSequence />);

    expect(screen.getByRole("status", { name: "Observer startup" })).toBeInTheDocument();
    expect(screen.getByText("[ OK ] loading observer shell")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(BOOT_DURATION_MS);
    });

    expect(screen.queryByRole("status", { name: "Observer startup" })).toBeNull();
    expect(sessionStorage.getItem(BOOT_STORAGE_KEY)).toBe(BOOT_SEEN_VALUE);
  });

  it("skips immediately on click and on keydown", () => {
    render(<BootSequence />);
    fireEvent.click(document.body);
    expect(screen.queryByRole("status", { name: "Observer startup" })).toBeNull();
    expect(sessionStorage.getItem(BOOT_STORAGE_KEY)).toBe(BOOT_SEEN_VALUE);

    sessionStorage.clear();
    cleanup();
    render(<BootSequence />);
    expect(screen.getByRole("status", { name: "Observer startup" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.queryByRole("status", { name: "Observer startup" })).toBeNull();
    expect(sessionStorage.getItem(BOOT_STORAGE_KEY)).toBe(BOOT_SEEN_VALUE);
  });

  it("stays hidden once this session has seen it", () => {
    sessionStorage.setItem(BOOT_STORAGE_KEY, BOOT_SEEN_VALUE);
    render(<BootSequence />);

    expect(screen.queryByRole("status", { name: "Observer startup" })).toBeNull();
    act(() => {
      vi.advanceTimersByTime(BOOT_DURATION_MS * 2);
    });
    expect(screen.queryByRole("status", { name: "Observer startup" })).toBeNull();
  });

  it("still shows once per mount when session storage is blocked", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    render(<BootSequence />);

    expect(screen.getByRole("status", { name: "Observer startup" })).toBeInTheDocument();
    fireEvent.click(document.body);
    expect(screen.queryByRole("status", { name: "Observer startup" })).toBeNull();
    getItem.mockRestore();
    expect(sessionStorage.getItem(BOOT_STORAGE_KEY)).toBe(BOOT_SEEN_VALUE);
  });

  it("skips entirely and records the session under reduced motion", () => {
    render(<BootSequence reducedMotion />);

    expect(screen.queryByRole("status", { name: "Observer startup" })).toBeNull();
    expect(sessionStorage.getItem(BOOT_STORAGE_KEY)).toBe(BOOT_SEEN_VALUE);
    act(() => {
      vi.advanceTimersByTime(BOOT_DURATION_MS);
    });
    expect(screen.queryByRole("status", { name: "Observer startup" })).toBeNull();
  });
});

describe("hacker status bar", () => {
  function renderBar(props?: Partial<Parameters<typeof HackerStatusBar>[0]>) {
    return render(
      <HackerStatusBar
        rainMode="max"
        onRainChange={() => {}}
        splashEnabled
        onSplashChange={() => {}}
        powerDownEnabled
        onPowerDownChange={() => {}}
        reducedMotion={false}
        {...props}
      />,
    );
  }

  it("renders a live UTC clock without becoming a live region", () => {
    renderBar();

    expect(screen.getByText("04:05:06 UTC")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("04:05:07 UTC")).toBeInTheDocument();
  });

  it("keeps the same three rain buttons and focus when the mode changes", () => {
    const onRainChange = vi.fn();
    const view = renderBar({ rainMode: "max", onRainChange });

    const group = screen.getByRole("group", { name: "Rain intensity" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(within(group).getByRole("button", { name: "Rain off" })).toHaveAttribute("aria-pressed", "false");
    expect(within(group).getByRole("button", { name: "Rain normal" })).toHaveAttribute("aria-pressed", "false");
    expect(within(group).getByRole("button", { name: "Rain max" })).toHaveAttribute("aria-pressed", "true");

    const normal = within(group).getByRole("button", { name: "Rain normal" });
    normal.focus();
    fireEvent.click(normal);

    expect(onRainChange).toHaveBeenCalledWith("normal");
    expect(normal).toHaveFocus();

    view.rerender(
      <HackerStatusBar
        rainMode="normal"
        onRainChange={onRainChange}
        splashEnabled
        onSplashChange={() => {}}
        powerDownEnabled
        onPowerDownChange={() => {}}
        reducedMotion={false}
      />,
    );

    // Same DOM buttons, only aria-pressed changes.
    expect(within(screen.getByRole("group", { name: "Rain intensity" })).getAllByRole("button")).toEqual(buttons);
    expect(normal).toHaveAttribute("aria-pressed", "true");
    expect(normal).toHaveFocus();
  });

  it("pins off and disables the animated intensities under reduced motion", () => {
    renderBar({ rainMode: "off", reducedMotion: true });

    const group = screen.getByRole("group", { name: "Rain intensity" });
    expect(within(group).getByRole("button", { name: "Rain off" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "Rain off" })).not.toBeDisabled();
    expect(within(group).getByRole("button", { name: "Rain normal" })).toBeDisabled();
    expect(within(group).getByRole("button", { name: "Rain max" })).toBeDisabled();
    expect(group).toHaveAccessibleDescription(/static pattern/i);
    expect(screen.getByText("static pattern")).toBeInTheDocument();
  });

  it("toggles the splash and power-down switches in place", () => {
    const onSplashChange = vi.fn();
    const onPowerDownChange = vi.fn();
    const view = renderBar({ onSplashChange, onPowerDownChange });

    const splash = screen.getByRole("button", { name: "Splash intro animation: on" });
    const powerDown = screen.getByRole("button", { name: "Power-down animation: on" });
    expect(splash).toHaveAttribute("aria-pressed", "true");
    expect(powerDown).toHaveAttribute("aria-pressed", "true");

    splash.focus();
    fireEvent.click(splash);
    expect(onSplashChange).toHaveBeenCalledWith(false);
    expect(splash).toHaveFocus();

    view.rerender(
      <HackerStatusBar
        rainMode="max"
        onRainChange={() => {}}
        splashEnabled={false}
        onSplashChange={onSplashChange}
        powerDownEnabled
        onPowerDownChange={onPowerDownChange}
        reducedMotion={false}
      />,
    );
    expect(splash).toHaveAttribute("aria-pressed", "false");
    expect(splash).toHaveAttribute("aria-label", "Splash intro animation: off");
    expect(screen.getByRole("button", { name: "Power-down animation: on" })).toBe(powerDown);
  });
});

describe("hacker chrome", () => {
  it("renders no chrome outside the hacker theme", () => {
    setTheme("light", false);
    const view = render(<HackerChrome />);

    expect(view.container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("rain-canvas")).toBeNull();
    expect(screen.queryByRole("group", { name: "Rain intensity" })).toBeNull();
    expect(document.querySelector(".hacker-scanlines")).toBeNull();
    expect(screen.queryByRole("status", { name: "Observer startup" })).toBeNull();
  });

  it("renders canvas, overlays, status bar, and the initial boot pass in hacker", () => {
    render(<HackerChrome />);

    expect(screen.getByTestId("rain-canvas")).toHaveAttribute("data-mode", "max");
    expect(document.querySelector(".hacker-scanlines")).not.toBeNull();
    expect(document.querySelector(".hacker-vignette")).not.toBeNull();
    expect(screen.getByRole("group", { name: "Rain intensity" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Observer startup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rain max" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not replay boot when the user switches into hacker later", () => {
    setTheme("dark", false);
    const view = render(<HackerChrome />);
    expect(view.container).toBeEmptyDOMElement();

    act(() => {
      setTheme("hacker", false);
    });

    expect(screen.getByRole("group", { name: "Rain intensity" })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Observer startup" })).toBeNull();
  });
});

describe("hacker effects helpers", () => {
  it("scrambles without changing length and preserves whitespace", () => {
    const original = "Live monitor";
    const scrambled = scrambleText(original, () => 0);

    expect(scrambled).toHaveLength(original.length);
    expect(scrambled).not.toBe(original);
    expect(scrambled[4]).toBe(" ");
    expect(scrambleText("", () => 0)).toBe("");
  });

  it("keeps randomized effect delays inside their windows", () => {
    expect(randomBetween(4, 8, () => 0)).toBe(4);
    expect(randomBetween(4, 8, () => 1)).toBe(8);
    expect(nextHeadingGlitchDelay(() => 0)).toBe(4000);
    expect(nextHeadingGlitchDelay(() => 1)).toBe(8000);
    expect(nextLinkScrambleDuration(() => 0)).toBe(280);
    expect(nextLinkScrambleDuration(() => 1)).toBe(350);
  });

  it("selects only visible, plain-text headings", () => {
    const main = document.createElement("main");
    main.innerHTML = [
      "<h1>Plain heading</h1>",
      "<h2><span>Nested heading</span></h2>",
      '<h3 aria-hidden="true">Hidden heading</h3>',
      "<h4 hidden>Hidden too</h4>",
      "<h5>   </h5>",
      "<p>Not a heading</p>",
    ].join("");
    document.body.append(main);

    try {
      const headings = collectGlitchableHeadings(main);
      expect(headings).toHaveLength(1);
      expect(headings[0]?.textContent).toBe("Plain heading");
      expect(isGlitchableHeading(headings[0] as Element)).toBe(true);
      expect(pickGlitchableHeading(main, () => 0)).toBe(headings[0]);
    } finally {
      main.remove();
    }
  });

  it("finds only safe link text targets", () => {
    const plain = document.createElement("a");
    plain.href = "/plain";
    plain.textContent = "Read evidence";

    const wrapped = document.createElement("a");
    wrapped.href = "/wrapped";
    const span = document.createElement("span");
    span.textContent = "Results";
    wrapped.append(span);

    const nested = document.createElement("a");
    nested.href = "/nested";
    const nestedSpan = document.createElement("span");
    nestedSpan.innerHTML = "<svg></svg>Label";
    nested.append(nestedSpan);

    const icon = document.createElement("a");
    icon.href = "/icon";
    icon.innerHTML = "<svg></svg>Guide";

    expect(getLinkScrambleTarget(plain)).toBe(plain);
    expect(getLinkScrambleTarget(wrapped)).toBe(span);
    expect(getLinkScrambleTarget(nested)).toBeNull();
    expect(getLinkScrambleTarget(icon)).toBeNull();
  });
});

describe("hacker effects behavior", () => {
  it("glitches a heading for its window and restores the exact text and class", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(
      <>
        <main id="main-content">
          <h1>Live monitor</h1>
        </main>
        <HackerEffects active reducedMotion={false} />
      </>,
    );

    const heading = screen.getByRole("heading", { level: 1 });
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(heading).toHaveClass("hacker-glitch");
    expect(heading.textContent).not.toBe("Live monitor");
    expect(heading.textContent).toHaveLength("Live monitor".length);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(heading.textContent).toBe("Live monitor");
    expect(heading).not.toHaveClass("hacker-glitch");
  });

  it("restores a heading if the effect unmounts mid-glitch", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const view = render(
      <>
        <main id="main-content">
          <h1>Live monitor</h1>
        </main>
        <HackerEffects active reducedMotion={false} />
      </>,
    );
    const heading = screen.getByRole("heading", { level: 1 });

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(heading).toHaveClass("hacker-glitch");

    view.unmount();
    expect(heading.textContent).toBe("Live monitor");
    expect(heading).not.toHaveClass("hacker-glitch");
  });

  it("scrambles a safe link on pointerover and restores it on pointerout", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(
      <>
        <main id="main-content">
          <a href="/evidence">
            <span>Read evidence</span>
          </a>
        </main>
        <HackerEffects active reducedMotion={false} />
      </>,
    );

    const span = screen.getByText("Read evidence");
    fireEvent.pointerOver(span);
    expect(span.textContent).not.toBe("Read evidence");
    expect(span.textContent).toHaveLength("Read evidence".length);

    fireEvent.pointerOut(span, { relatedTarget: document.body });
    expect(span.textContent).toBe("Read evidence");
  });

  it("does not restart when a stationary pointer re-fires pointerover after settling", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(
      <>
        <main id="main-content">
          <span>
            <a href="/evidence">Read evidence</a>
          </span>
        </main>
        <HackerEffects active reducedMotion={false} />
      </>,
    );

    const link = screen.getByRole("link", { name: /read evidence/i });
    fireEvent.pointerOver(link);
    expect(link.textContent).not.toBe("Read evidence");

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(link.textContent).toBe("Read evidence");

    // Chromium re-fires pointerover on the stationary pointer when the text
    // underneath it is replaced. That must not begin a second pass.
    fireEvent.pointerOver(link);
    expect(link.textContent).toBe("Read evidence");

    // Actually leaving the link re-arms it.
    fireEvent.pointerOut(link, { relatedTarget: document.body });
    fireEvent.pointerOver(link);
    expect(link.textContent).not.toBe("Read evidence");
  });

  it("does nothing under reduced motion", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(
      <>
        <main id="main-content">
          <h1>Live monitor</h1>
          <a href="/evidence">Read evidence</a>
        </main>
        <HackerEffects active reducedMotion />
      </>,
    );

    const heading = screen.getByRole("heading", { level: 1 });
    const link = screen.getByRole("link", { name: "Read evidence" });

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    fireEvent.pointerOver(link);

    expect(heading.textContent).toBe("Live monitor");
    expect(heading).not.toHaveClass("hacker-glitch");
    expect(link.textContent).toBe("Read evidence");
  });
});
