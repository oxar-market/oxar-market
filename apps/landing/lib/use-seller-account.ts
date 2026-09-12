"use client";

import { useCallback, useEffect, useState } from "react";
import { currentSession, onSessionChange } from "./auth";
import { mySeller, type MySeller } from "./seller";

/**
 * Кто сейчас за столом с точки зрения продажи мест.
 *
 * Нужно в двух местах сразу: кабинет решает, что показывать внутри, а док -
 * какие кнопки вообще уместны. Держать это состояние в двух местах значило бы
 * два разных ответа на один вопрос.
 */

export type SellerAccount =
  | { status: "loading" }
  | { status: "guest" }
  /** Вошёл, но продавцом не заведён: онбординг у нас ручной. */
  | { status: "stranger"; email: string }
  | { status: "seller"; seller: MySeller };

export function useSellerAccount(): SellerAccount & { reload: () => void } {
  const [state, setState] = useState<SellerAccount>({ status: "loading" });

  const load = useCallback(async () => {
    const session = await currentSession();
    if (!session) {
      setState({ status: "guest" });
      return;
    }
    const seller = await mySeller();
    setState(
      seller
        ? { status: "seller", seller }
        : { status: "stranger", email: session.user.email ?? "" },
    );
  }, []);

  useEffect(() => {
    load();
    return onSessionChange(() => load());
  }, [load]);

  return { ...state, reload: load };
}
