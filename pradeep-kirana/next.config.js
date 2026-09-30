/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['192.168.1.4', 'localhost', '192.168.1.6'],
  serverExternalPackages: ['firebase-admin'],
};

module.exports = nextConfig;