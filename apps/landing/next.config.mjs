/** @type {import('next').NextConfig} */
const nextConfig = {
  // Статика: серверного кода в лендинге нет, данные берутся из браузера. Так
  // сайт можно положить на любой хостинг и не зависеть от лимитов одного.
  output: "export",
  reactStrictMode: true,
  // Пакеты воркспейса лежат в TypeScript-исходниках, их собирает Next.
  transpilePackages: ["@oxar/core"],
};

export default nextConfig;
