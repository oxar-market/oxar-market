"use client";

import { useEffect, useState } from "react";
import type { PublicKey } from "@solana/web3.js";
import { APPEAL_SECONDS, proofMissed, takesProof } from "@oxar/core";
import { loadThingSales, submitProof, type SaleView, type Signer } from "@/lib/proof";
import { photoUrl } from "@/lib/seller";

/**
 * Пруф продавца: вещь в деле с логотипами. Деньги победителей программа
 * отдаёт продавцу только после него и 72 часов на спор - поэтому срок и
 * кнопка здесь же, где логотипы для печати.
 */
export function ProofPanel({ thingId, seller, sign }: { thingId: string; seller: PublicKey | null; sign: Signer }) {
  const [sales, setSales] = useState<SaleView[] | null>(null);
  const reload = () => void loadThingSales(thingId).then(setSales);
  useEffect(reload, [thingId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sales) return null;
  // Торги до защиты покупателя (срок пруфа - ноль) платят сразу: панели нет.
  const guarded = sales.filter((one) => one.chain && one.chain.proofDeadline > 0);
  if (guarded.length === 0) return null;
  return (
    <>
      {guarded.map((one) => (
        <SaleProof key={one.address.toBase58()} thingId={thingId} sale={one} seller={seller} sign={sign} onDone={reload} />
      ))}
    </>
  );
}

function SaleProof({
  thingId,
  sale,
  seller,
  sign,
  onDone,
}: {
  thingId: string;
  sale: SaleView;
  seller: PublicKey | null;
  sign: Signer;
  onDone: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "busy">("idle");
  const [problem, setProblem] = useState("");
  // Фото уже в хранилище и пруф, может быть, уже в цепочке - повтор не грузит
  // их заново и не меняет запись, иначе хеш разойдётся с программой.
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [locked, setLocked] = useState(false);

  const chain = sale.chain!;
  const now = Math.floor(Date.now() / 1000);
  const day = (seconds: number) =>
    new Date(seconds * 1000).toLocaleString("en-US", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

  if (sale.proof || chain.provedAt > 0) {
    const proved = chain.provedAt || Math.floor(Date.parse(sale.proof!.provedAt) / 1000);
    return (
      <div className="sl-card sl-plan">
        <div className="sl-plan-head">
          <h3>Proof sent</h3>
        </div>
        <p className="sl-plan-note">
          Sent {day(proved)}. Winners can check it until {day(proved + APPEAL_SECONDS)}; each spot is
          paid out when its winner confirms or after that.
        </p>
        {sale.proof && sale.proof.photos.length > 0 && (
          <div className="sl-minis">
            {sale.proof.photos.map((path) => (
              <div className="sl-mini" key={path}>
                <img src={photoUrl(path)} alt="" />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (proofMissed(chain, now)) {
    return (
      <div className="sl-card sl-plan">
        <div className="sl-plan-head">
          <h3>Proof deadline passed</h3>
        </div>
        <p className="sl-plan-note">
          No proof by {day(chain.proofDeadline)}, so the winning bids go back to the winners.
        </p>
      </div>
    );
  }

  const open = takesProof(chain, now);
  return (
    <div className="sl-card sl-plan">
      <div className="sl-plan-head">
        <h3>Proof</h3>
      </div>
      <p className="sl-plan-note">
        {open
          ? `Show the thing in use with the logos on it by ${day(chain.proofDeadline)}. Winners get 72 hours to check it, then you are paid.`
          : `When the auction closes, show the thing in use with the logos on it by ${day(chain.proofDeadline)}.`}
      </p>
      {open && (
        <>
          <label className="sl-field wide">
            Photos
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={locked}
              onChange={(event) => setFiles([...(event.target.files ?? [])])}
            />
          </label>
          <label className="sl-field wide">
            Links, one per line (optional)
            <span className="sl-input tall">
              <textarea
                rows={2}
                value={links}
                disabled={locked}
                placeholder="https://x.com/..."
                onChange={(event) => setLinks(event.target.value)}
              />
            </span>
          </label>
          <label className="sl-field wide">
            A few words (optional)
            <span className="sl-input tall">
              <textarea
                rows={2}
                value={note}
                maxLength={1000}
                disabled={locked}
                placeholder="Worn on stage at Demo Day, Kyiv"
                onChange={(event) => setNote(event.target.value)}
              />
            </span>
          </label>
          {problem && <p className="bad sl-plan-note">{problem}</p>}
          <button
            type="button"
            className="sl-btn dark sl-plan-note"
            disabled={!seller || state === "busy" || (files.length === 0 && links.trim() === "")}
            onClick={async () => {
              if (!seller) return;
              setState("busy");
              setProblem("");
              const result = await submitProof(
                thingId,
                sale.address,
                seller,
                { files, uploaded, links: links.split("\n"), note },
                sign,
              );
              setState("idle");
              if (result.ok) return onDone();
              setUploaded(result.uploaded);
              setLocked(result.onChain);
              setProblem(result.why);
            }}
          >
            {state === "busy" ? "Sending…" : "Submit proof"}
          </button>
        </>
      )}
    </div>
  );
}
