/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['172.31.208.249'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
