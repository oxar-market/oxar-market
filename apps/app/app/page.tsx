"use client";

import { useEffect, useState } from "react";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import { db, exchange } from "@/lib/session";

/**
 * Страница спайка. Она не продукт, а доказательство: вошёл через Privy - база
 * узнала тебя и отдала только твоё. Удаляется вместе со спайком.
 *
 * Проверка честная только если видно обе стороны: и что своя строка читается,
 * и что чужая - нет. Поэтому здесь считаются обе.
 */
export default function Spike() {
  const { ready, authenticated, user, getAccessToken, logout } = usePrivy();
  const { login } = useLogin();
  const [step, setStep] = useState("…");
  const [mine, setMine] = useState<number | null>(null);
  const [all, setAll] = useState<number | null>(null);

  useEffect(() => {
    if (!ready || !authenticated || !db) return;

    (async () => {
      setStep("Меняю токен Privy на сессию Supabase…");
      const token = await getAccessToken();
      if (!token) return setStep("Privy не отдал токен");

      const result = await exchange(token);
      if (!result.ok) return setStep(`Обмен не прошёл: ${result.reason}`);

      const { data: session } = await db.auth.getUser();
      if (!session.user) return setStep("Сессии нет");
      setStep(`Сессия есть. auth.uid() = ${session.user.id}`);

      // Своя заметка: если её нет, заводим - заодно проверяется политика на
      // запись, которая требует писать только от своего имени.
      await db
        .from("spike_notes")
        .insert({ user_id: session.user.id, note: "привет из спайка" });

      const { count: ours } = await db
        .from("spike_notes")
        .select("*", { count: "exact", head: true })
        .eq("user_id", session.user.id);
      setMine(ours ?? 0);

      // Без фильтра: RLS обязан вернуть столько же, сколько и с ним. Если
      // чисел два разных - политика дырявая.
      const { count: everything } = await db
        .from("spike_notes")
        .select("*", { count: "exact", head: true });
      setAll(everything ?? 0);
    })();
  }, [ready, authenticated, getAccessToken]);

  if (!ready) return <main>Загрузка…</main>;

  return (
    <main>
      <h1>Спайк: Privy → Supabase RLS</h1>

      {!authenticated ? (
        <>
          <p>Войди кошельком или почтой - проверяем оба пути.</p>
          <button onClick={login}>Войти</button>
        </>
      ) : (
        <>
          <p>
            <strong>Privy:</strong> {user?.id}
          </p>
          <p>
            <strong>Кошелёк:</strong> {user?.wallet?.address ?? "нет"}
          </p>
          <p>
            <strong>Шаг:</strong> {step}
          </p>

          {mine !== null && all !== null && (
            <p className={mine === all ? "ok" : "bad"}>
              {mine === all
                ? `RLS держит: свои ${mine}, видно всего ${all}. Чужого не видно.`
                : `RLS ДЫРЯВЫЙ: своих ${mine}, а видно ${all}.`}
            </p>
          )}

          <button onClick={logout}>Выйти</button>
        </>
      )}
    </main>
  );
}
