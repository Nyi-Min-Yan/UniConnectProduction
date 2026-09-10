import type { NextConfig } from "next";
import os from 'os';

// Automatically detect all local IPv4 addresses on your network
function getLocalIpAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = ['localhost', 'localhost:3000', '127.0.0.1'];

  for (const interfaceName in interfaces) {
    const networkInterface = interfaces[interfaceName];
    if (!networkInterface) continue;

    for (const net of networkInterface) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
        ips.push(`${net.address}:3000`);
      }
    }
  }

  return ips;
}

const nextConfig: NextConfig = {
  // Dynamically assigns your computer's active Wi-Fi IP and port
  allowedDevOrigins: getLocalIpAddresses(),
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    staleTimes: {
      dynamic: 30,
    },
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;