/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Allow browser builds to import modules that conditionally require 'fs'/'path'
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      fs: false,
      path: false,
      crypto: false,
    };
    return config;
  },
};

export default nextConfig;


