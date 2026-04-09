/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: '/tmp/app-turnos-next',
  allowedDevOrigins: ['172.31.208.249'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
