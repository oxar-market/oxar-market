/** @type {import('next').NextConfig} */
const nextConfig = {
  // Статика: серверного кода нет, данные берутся из браузера. Так приложение
  // кладётся на Cloudflare Pages готовым каталогом и не тратит квоту сборок.
  output: "export",
  reactStrictMode: true,
};

export default nextConfig;
