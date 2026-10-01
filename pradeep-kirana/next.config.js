/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['192.168.1.4', 'localhost', '192.168.1.6', '192.168.1.18'],
  serverExternalPackages: ['firebase-admin'],
  // transpilePackages poori tarah se hata diya hai taaki conflict na ho
};

module.exports = nextConfig;