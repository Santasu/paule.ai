/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: '/api/paule/:path*', destination: '/api/augam/:path*' },
    ];
  },
};

module.exports = nextConfig;
