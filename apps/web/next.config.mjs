/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The dashboard talks to the API via NEXT_PUBLIC_API_URL (no secrets in the
  // frontend). Transpile the shared workspace package.
  transpilePackages: ['@ai-phone/shared'],
  // Emit a minimal self-contained server for small production Docker images.
  output: 'standalone',
  // In a monorepo, trace dependencies from the repo root.
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
};

export default nextConfig;
