/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Отдельного сайта для платформы больше нет: всё живёт на рабочем столе
  // oxar.app, а этот домен только перенаправляет старые ссылки.
  async redirects() {
    return [{ source: "/:path*", destination: "https://oxar.app", permanent: false }];
  },
};

export default nextConfig;
