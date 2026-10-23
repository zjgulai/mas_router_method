import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // The agent runtime and schemas are consumed as TypeScript source, so Next must
  // compile them rather than treat them as pre-built node_modules.
  transpilePackages: ['@mas/core', '@mas/shared'],
  typescript: { ignoreBuildErrors: false },
};

export default config;
