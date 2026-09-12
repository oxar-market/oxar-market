/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Пакеты воркспейса лежат в TypeScript-исходниках, их собирает Next.
  transpilePackages: ["@oxar/core"],
};

export default nextConfig;
