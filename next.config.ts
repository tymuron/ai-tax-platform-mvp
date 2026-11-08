import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite', 'pdf-parse', 'tesseract.js'],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
