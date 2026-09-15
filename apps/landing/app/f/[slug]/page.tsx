import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { FILES } from "@/lib/desktop";
import { Proof } from "../../components/Proof";

// Те же файлы, что лежат на рабочем столе, но обычными страницами: для поиска,
// для превью ссылок и для тех, кому прислали прямой адрес.

export function generateStaticParams() {
  return FILES.map((file) => ({ slug: file.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const file = FILES.find((f) => f.slug === slug);
  if (!file) return {};
  return {
    title: `${file.title} - OXAR`,
    description: file.body[0],
  };
}

export default async function FilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const file = FILES.find((f) => f.slug === slug);
  if (!file) notFound();

  return (
    <main className="page">
      <Link href="/" className="back">
        Back to the desktop
      </Link>
      <h1>{file.title}</h1>
      {slug === "who-we-are" && <Proof />}
      {file.body.map((paragraph) => (
        <p key={paragraph.slice(0, 24)}>{paragraph}</p>
      ))}
    </main>
  );
}
