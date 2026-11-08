import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ['@electric-sql/pglite', 'pdf-parse', 'tesseract.js', 'pg'],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
