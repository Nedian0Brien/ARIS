import type { NextConfig } from 'next';

const dockerFastBuild = process.env.DOCKER_FAST_BUILD === '1';
const arisWebAssetPrefix = process.env.ARIS_WEB_ASSET_PREFIX || undefined;

const nextConfig: NextConfig = {
  assetPrefix: arisWebAssetPrefix,
  eslint: {
    ignoreDuringBuilds: dockerFastBuild,
  },
  typescript: {
    ignoreBuildErrors: dockerFastBuild,
  },
  compiler: {
    styledComponents: true, // For general styled-component support
  },
  experimental: {
    // If using App Router with styled-jsx, it's often more stable to use CSS Modules or Global CSS, 
    // but we can try enabling compiler features.
  }
};

export default nextConfig;
