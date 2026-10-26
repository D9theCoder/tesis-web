import { ControlError } from "@/lib/server/control/errors";

/**
 * Access gate for every mutating control route.
 *
 * The observer used to be read-only, so binding 0.0.0.0 was harmless. Starting
 * experiments and storing provider keys is not: by default only loopback
 * clients may call the control plane. Operators who intentionally expose it add
 * their hostnames to TESIS_CONTROL_ALLOWED_HOSTS.
 */

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

function allowedHosts(): string[] {
  return (process.env.TESIS_CONTROL_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Request host: Host header first, because req.url is normalised locally. */
function requestHostname(req: Request): string | null {
  const header = req.headers.get("host")?.trim();
  if (header) {
    try {
      return new URL(`http://${header}`).hostname.toLowerCase();
    } catch {
      return header.toLowerCase();
    }
  }
  return hostnameOf(req.url);
}

export function isLocalHost(hostname: string | null): boolean {
  if (!hostname) return false;
  return LOOPBACK.has(hostname) || allowedHosts().includes(hostname);
}

/**
 * Throws unless this request may change server state.
 * Reads stay available so remote dashboards keep working.
 */
export function assertControlAllowed(req: Request): void {
  if (process.env.TESIS_CONTROL_DISABLED === "1") {
    throw new ControlError(
      "Runtime controls are disabled (TESIS_CONTROL_DISABLED=1). Enable them to start experiments from the web.",
      403,
    );
  }
  const host = requestHostname(req);
  if (!isLocalHost(host)) {
    throw new ControlError(
      `Runtime controls are restricted to this machine. Add ${host ?? "this host"} to TESIS_CONTROL_ALLOWED_HOSTS to allow it.`,
      403,
    );
  }
  // A browser always sends Origin for cross-site writes; a page that is not the
  // app itself must not be able to drive the local control plane.
  const origin = req.headers.get("origin");
  if (origin) {
    const originHost = hostnameOf(origin);
    if (!isLocalHost(originHost)) {
      throw new ControlError("Cross-origin control requests are not allowed.", 403);
    }
  }
}

/** Whether the current process is configured to accept control writes. */
export function controlAvailability(): { enabled: boolean; reason: string | null } {
  if (process.env.TESIS_CONTROL_DISABLED === "1") {
    return { enabled: false, reason: "Runtime controls are disabled by TESIS_CONTROL_DISABLED=1." };
  }
  return { enabled: true, reason: null };
}
