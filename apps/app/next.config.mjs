/** @type {import('next').NextConfig} */
const nextConfig = {
  // Статика: серверного кода нет, данные берутся из браузера. Так приложение
  // кладётся на Cloudflare Pages готовым каталогом и не тратит квоту сборок.
  output: "export",
  reactStrictMode: true,
  // Пакет воркспейса лежит в исходниках на TypeScript, его собирает Next.
  transpilePackages: ["@oxar/core"],
};

export default nextConfig;
