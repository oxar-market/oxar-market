"use client";

import { useCallback, useEffect, useState } from "react";
import { currentSession, onSessionChange } from "./auth";
import { hasAccess, mySeller, type MySeller } from "./seller";

/**
 * Кто сейчас за столом с точки зрения продажи мест.
 *
 * Нужно в двух местах сразу: кабинет решает, что показывать внутри, а док -
 * какие кнопки вообще уместны. Держать это состояние в двух местах значило бы
 * два разных ответа на один вопрос.
 *
 * Рядом лежит access - пустили ли дальше вейтлиста. Это не то же, что «есть
 * свои места»: тестера-покупателя мы вписываем в список доступа, продавцом он
 * при этом не становится. Спрашиваем базу, а не выводим из наличия мест, иначе
 * барьер в интерфейсе разошёлся бы с правами.
 */

export type SellerAccount = { access: boolean } & (
  | { status: "loading" }
  | { status: "guest" }
  /** Вошёл, но продавцом не заведён: онбординг у нас ручной. */
  | { status: "stranger"; email: string }
  | { status: "seller"; seller: MySeller }
);

export function useSellerAccount(): SellerAccount & { reload: () => void } {
  const [state, setState] = useState<SellerAccount>({
    status: "loading",
    access: false,
  });

  const load = useCallback(async () => {
    const session = await currentSession();
    if (!session) {
      setState({ status: "guest", access: false });
      return;
    }
    const [seller, access] = await Promise.all([mySeller(), hasAccess()]);
    setState(
      seller
        ? { status: "seller", seller, access }
        : { status: "stranger", email: session.user.email ?? "", access },
    );
  }, []);

  useEffect(() => {
    load();
    return onSessionChange(() => load());
  }, [load]);

  return { ...state, reload: load };
}
