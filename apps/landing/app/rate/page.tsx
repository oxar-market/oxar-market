import Link from "next/link";
import type { Metadata } from "next";
import { Rate } from "../components/Rate";

// Отдельный адрес, а не только окно на столе: ссылку кидают в чат, и человек
// должен попасть сразу в поле ввода, а не на стол с шестью иконками.

export const metadata: Metadata = {
  title: "What can you charge for your profile? - OXAR",
  description:
    "Your follower count is enough. See what you could ask for your avatar, banner and bio link.",
};

export default function RatePage() {
  return (
    <main className="page">
      <Link href="/" className="back">
        Back to the desktop
      </Link>
      <Rate />
    </main>
  );
}
