"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/session";

/**
 * Кто носит вещь, где и когда. Покупатель места должен знать, что именно он
 * покупает: не «футболку», а футболку на человеке в день и в месте. Пустое
 * поле - «To be announced», а не пропуск: молчание читалось бы как «неважно».
 * «В чём особенность» - абзац над таблицей, и его может не быть.
 */
export type Worn = {
  by: string | null;
  where: string | null;
  when: string | null;
  about: string | null;
  /** Прежние место и дата, если вещь переехала на площадку крупнее. */
  whereWas: string | null;
  whenWas: string | null;
  /** До когда продавец покажет пруф - с последнего торга вещи. Нет - торг до защиты покупателя. */
  proofBy: string | null;
};

/** Ошибка (например, поля ещё не доехали) - те же «To be announced». */
export async function loadWorn(thingId: string): Promise<Worn> {
  const empty = { by: null, where: null, when: null, about: null, whereWas: null, whenWas: null, proofBy: null };
  if (!db) return empty;
  const [{ data }, { data: lot }] = await Promise.all([
    db.from("things").select("worn_by, worn_where, worn_when, worn_about, worn_where_was, worn_when_was").eq("id", thingId).maybeSingle(),
    // Срок пруфа покупатель видит до ставки: он же решает, когда уйдут деньги.
    db
      .from("lots")
      .select("proof_by")
      .eq("thing_id", thingId)
      .not("proof_by", "is", null)
      .order("closes_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    by: data?.worn_by ?? null,
    where: data?.worn_where ?? null,
    when: data?.worn_when ?? null,
    about: data?.worn_about ?? null,
    whereWas: data?.worn_where_was ?? null,
    whenWas: data?.worn_when_was ?? null,
    proofBy: (lot?.proof_by as string | null | undefined) ?? null,
  };
}

export function WornInfo({ thingId }: { thingId: string }) {
  const [worn, setWorn] = useState<Worn | null>(null);
  useEffect(() => {
    void loadWorn(thingId).then(setWorn);
  }, [thingId]);
  if (!worn) return null;
  // Прежнее значение - зачёркнутым под новым: место сменилось на крупнее, и
  // это видно, а не тихо подменено.
  const rows: [string, string | null, string | null][] = [
    ["Who has it", worn.by, null],
    ["Where", worn.where, worn.whereWas],
    ["When", worn.when, worn.whenWas],
  ];
  return (
    <>
      {worn.about && <p className="muted">{worn.about}</p>}
      <dl className="worn">
        {rows.map(([label, value, was]) => (
          <div key={label}>
            <dt>
              {label}
              {was && label === "Where" && <span className="worn-up">Upgraded</span>}
            </dt>
            <dd className={value ? "" : "tba"}>{value ?? "To be announced"}</dd>
            {was && <s className="worn-was">{was}</s>}
          </div>
        ))}
        {worn.proofBy && (
          <div>
            <dt>Proof by</dt>
            <dd>{new Date(worn.proofBy).toLocaleDateString("en-US", { month: "long", day: "numeric" })}</dd>
          </div>
        )}
      </dl>
      {worn.proofBy && (
        <p className="muted">
          Your money stays in escrow until the seller shows the thing in use. You get 72 hours to
          check it. No proof by this day, and your bid comes back.
        </p>
      )}
    </>
  );
}
