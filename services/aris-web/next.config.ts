import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  compiler: {
    styledComponents: true, // For general styled-component support
  },
  experimental: {
    // If using App Router with styled-jsx, it's often more stable to use CSS Modules or Global CSS, 
    // but we can try enabling compiler features.
  }
};

export default nextConfig;
