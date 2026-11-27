import type { Metadata } from "next";
import { AdminPage } from "../../admin/admin-page.tsx";

/**
 * Админка - своя страница, а не вкладка в профиле. В группе приложения ради
 * Privy: без входа база не скажет, админ ли это.
 */
export const metadata: Metadata = {
  title: "Admin - OXAR",
  robots: { index: false },
};

export default function Page() {
  return <AdminPage />;
}
