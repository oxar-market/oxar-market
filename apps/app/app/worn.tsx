"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/session";

/**
 * Кто носит вещь, где и когда. Покупатель места должен знать, что именно он
 * покупает: не «футболку», а футболку на человеке в день и в месте. Пустое
 * поле - «To be announced», а не пропуск: молчание читалось бы как «неважно».
 * «В чём особенность» - абзац над таблицей, и его может не быть.
 */
export type Worn = { by: string | null; where: string | null; when: string | null; about: string | null };

/** Ошибка (например, поля ещё не доехали) - те же «To be announced». */
export async function loadWorn(thingId: string): Promise<Worn> {
  const empty = { by: null, where: null, when: null, about: null };
  if (!db) return empty;
  const { data } = await db
    .from("things")
    .select("worn_by, worn_where, worn_when, worn_about")
    .eq("id", thingId)
    .maybeSingle();
  return {
    by: data?.worn_by ?? null,
    where: data?.worn_where ?? null,
    when: data?.worn_when ?? null,
    about: data?.worn_about ?? null,
  };
}

export function WornInfo({ thingId }: { thingId: string }) {
  const [worn, setWorn] = useState<Worn | null>(null);
  useEffect(() => {
    void loadWorn(thingId).then(setWorn);
  }, [thingId]);
  if (!worn) return null;
  const rows: [string, string | null][] = [
    ["Who has it", worn.by],
    ["Where", worn.where],
    ["When", worn.when],
  ];
  return (
    <>
      {worn.about && <p className="muted">{worn.about}</p>}
      <dl className="worn">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className={value ? "" : "tba"}>{value ?? "To be announced"}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
