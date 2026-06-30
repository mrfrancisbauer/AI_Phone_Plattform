/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The dashboard talks to the API via NEXT_PUBLIC_API_URL (no secrets in the
  // frontend). Transpile the shared workspace package.
  transpilePackages: ['@ai-phone/shared'],
};

export default nextConfig;
