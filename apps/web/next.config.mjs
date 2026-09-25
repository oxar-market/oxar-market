/** @type {import('next').NextConfig} */
const nextConfig = {
  // Статика: серверного кода нет. Так лендинг кладётся на Cloudflare Pages
  // готовым каталогом и не тратит квоту сборок.
  output: "export",
  reactStrictMode: true,
  // Сцена приезжает исходниками из пакета - её собирает сам Next.
  transpilePackages: ["@oxar/stage"],
};

export default nextConfig;
