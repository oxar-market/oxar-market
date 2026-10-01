"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/session";

/**
 * Кто носит вещь, где и когда. Покупатель места должен знать, что именно он
 * покупает: не «футболку», а футболку на человеке в день и в месте. Пустое
 * поле - «To be announced», а не пропуск: молчание читалось бы как «неважно».
 */
type Worn = { by: string | null; where: string | null; when: string | null };

export function WornInfo({ thingId }: { thingId: string }) {
  const [worn, setWorn] = useState<Worn | null>(null);
  useEffect(() => {
    if (!db) return;
    void db
      .from("things")
      .select("worn_by, worn_where, worn_when")
      .eq("id", thingId)
      .maybeSingle()
      // Ошибка (например, поля ещё не доехали) - те же «To be announced».
      .then(({ data }) =>
        setWorn({ by: data?.worn_by ?? null, where: data?.worn_where ?? null, when: data?.worn_when ?? null }),
      );
  }, [thingId]);
  if (!worn) return null;
  const rows: [string, string | null][] = [
    ["Who wears it", worn.by],
    ["Where", worn.where],
    ["When", worn.when],
  ];
  return (
    <dl className="worn">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd className={value ? "" : "tba"}>{value ?? "To be announced"}</dd>
        </div>
      ))}
    </dl>
  );
}
