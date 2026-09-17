"use client";

import { auth } from "./auth";

// Запросы про деньги. Прав у анонима нет вовсе: RLS отдаёт бронь только тому,
// чей адрес в токене совпадает с адресом в ней, а писать разрешает лишь четыре
// поля - статус, окно оплаты, кошелёк и стрим.

export type MyOrder = {
  id: string;
  start_date: string;
  end_date: string;
  price_cents: number;
  status: string;
  pay_by: string | null;
  stream_id: string | null;
  buyer_wallet: string | null;
  network: string;
  listing: {
    kind: string;
    /** Поток по секундам или разовый перевод. Свойство места, не платформы. */
    payment: "stream" | "transfer";
    seller: { x_handle: string; payout_wallet: string | null };
  } | null;
};

/**
 * Свои покупки. Продавец видит заявки на свои места отдельным запросом в
 * seller.ts - это разные роли и разные политики, сводить их в один список
 * нельзя.
 */
export async function myOrders(): Promise<MyOrder[]> {
  if (!auth) return [];
  const { data } = await auth
    .from("bookings")
    .select(
      "id,start_date,end_date,price_cents,status,pay_by,stream_id,buyer_wallet,network," +
        "listing:listings(kind,payment,seller:sellers(x_handle,payout_wallet))",
    )
    .order("start_date");

  // Как и в витрине: без типов схемы вложенные листинг и продавец выводятся
  // массивами, хотя запрос отдаёт по одному.
  return (data ?? []) as unknown as MyOrder[];
}

/**
 * Привязать оплату к брони. Один раз: второй привязки не даст триггер, и это
 * правильно - иначе бронь можно было бы перевести на другой, более дешёвый
 * стрим уже после одобрения.
 */
export async function attachPayment(input: {
  bookingId: string;
  wallet: string;
  streamId: string;
}): Promise<"saved" | "error"> {
  if (!auth) return "error";
  const { error } = await auth
    .from("bookings")
    .update({ buyer_wallet: input.wallet, stream_id: input.streamId })
    .eq("id", input.bookingId);
  return error ? "error" : "saved";
}

/** Куда продавцу текут деньги. Поле его собственное, менять может только он. */
export async function setPayoutWallet(
  sellerId: string,
  wallet: string,
): Promise<"saved" | "error"> {
  if (!auth) return "error";
  const { error } = await auth
    .from("sellers")
    .update({ payout_wallet: wallet })
    .eq("id", sellerId);
  return error ? "error" : "saved";
}
