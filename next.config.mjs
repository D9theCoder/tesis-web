/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This observer only reads the local filesystem through route handlers.
  // It never proxies to the DVWA target, so no remote image domains are
  // configured and the default CSP stays strict.
  poweredByHeader: false,
};

export default nextConfig;
