/** @type {import('next').NextConfig} */
const nextConfig = {
  // Статика: серверного кода нет. Так лендинг кладётся на Cloudflare Pages
  // готовым каталогом и не тратит квоту сборок.
  output: "export",
  reactStrictMode: true,
  // Сцена и правила приезжают исходниками из пакетов - их собирает сам Next.
  transpilePackages: ["@oxar/core", "@oxar/stage"],
};

export default nextConfig;
