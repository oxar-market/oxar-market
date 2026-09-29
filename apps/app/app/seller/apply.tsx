"use client";

import { useEffect, useState } from "react";
import { applyAsSeller, myApplication, type Application } from "@/lib/applications";

/**
 * Заявка в продавцы с вкладки You. Роль выдаём мы: здесь человек только
 * просит, одобрение - в админке. Созвона с каждым нет - фильтр это сама
 * заявка: кто он и что продаёт, и её читает человек.
 */
export function SellerApply({ wallet }: { wallet: string | null }) {
  const [mine, setMine] = useState<Application | null | undefined>(undefined);
  const [contact, setContact] = useState("");
  const [about, setAbout] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "failed">("idle");
  useEffect(() => {
    void myApplication().then(setMine);
  }, []);

  if (mine === undefined) return null;

  if (mine?.status === "waiting") {
    return (
      <p className="role-note">
        Request sent. We usually reply within a day - the Seller tab shows up
        here once you are in.
      </p>
    );
  }

  if (mine?.status === "declined") {
    return <p className="role-note">Your request was not approved this time.</p>;
  }

  return (
    <form
      className="apply"
      onSubmit={async (event) => {
        event.preventDefault();
        setState("sending");
        const ok = await applyAsSeller({ contact, about, wallet });
        if (!ok) return setState("failed");
        setMine(await myApplication());
      }}
    >
      <p className="role-note">
        Want to sell spots on your things? Tell us what you have - we reply
        within a day.
      </p>
      <label className="sl-field">
        How to reach you
        <span className="sl-input soft">
          <input
            value={contact}
            maxLength={200}
            placeholder="X or Telegram handle"
            onChange={(event) => setContact(event.target.value)}
          />
        </span>
      </label>
      <label className="sl-field">
        What you want to sell
        <span className="sl-input soft">
          <input
            value={about}
            maxLength={500}
            placeholder="Laptop lid, backpack, jacket"
            onChange={(event) => setAbout(event.target.value)}
          />
        </span>
      </label>
      {state === "failed" && <p className="bad">Could not send. Try again.</p>}
      <button
        type="submit"
        className="primary"
        disabled={!contact.trim() || !about.trim() || state === "sending"}
      >
        {state === "sending" ? "Sending…" : "Request access"}
      </button>
    </form>
  );
}
