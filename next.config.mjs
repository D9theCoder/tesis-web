import os from "node:os";

function localDevOrigins() {
  try {
    const interfaces = Object.values(os.networkInterfaces());
    const addresses = interfaces.flatMap((entries) => entries ?? []);
    return addresses
      .filter((entry) => entry.family === "IPv4" || entry.family === 4)
      .map((entry) => entry.address);
  } catch {
    // Some restricted containers do not expose interface enumeration.
    return [];
  }
}

const configuredDevOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@huggingface/transformers", "pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/control/chat/knowledge": ["./node_modules/pdfjs-dist/cmaps/*.bcmap"],
  },
  experimental: { useTypeScriptCli: false },
  // Next 16 protects dev bundles loaded through a non-default host. Include
  // loopback and the current machine addresses so WSL/Windows browser access
  // can hydrate the observer after binding the server to 0.0.0.0.
  allowedDevOrigins: [
    ...new Set([
      "localhost",
      "127.0.0.1",
      ...localDevOrigins(),
      ...configuredDevOrigins,
    ]),
  ],
  // This observer only reads the local filesystem through route handlers.
  // It never proxies to the DVWA target, so no remote image domains are
  // configured and the default CSP stays strict.
  poweredByHeader: false,
  // These two documents render the masked profile, so they must not be stored
  // by the browser or an intermediary the way a static page would be.
  async headers() {
    return ["/control", "/settings"].map((source) => ({
      source,
      headers: [{ key: "Cache-Control", value: "no-store" }],
    }));
  },
};

export default nextConfig;
