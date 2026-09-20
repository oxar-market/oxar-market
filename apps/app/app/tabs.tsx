"use client";

import { useEffect, useState } from "react";

/**
 * Нижнее меню.
 *
 * Плавающая панель с отступом от низа, а не приклеенная к краю: у приклеенной
 * на телефоне последний ряд уезжает под домашнюю полоску, и по нему трудно
 * попасть.
 *
 * Подсветка выбранного - отдельный слой, который переезжает между вкладками.
 * Так переход читается как движение одного предмета, а не как «погасло тут,
 * зажглось там»: взгляд успевает проследить, куда он попал.
 */

export type Tab = "market" | "auction" | "you";

const TABS: { id: Tab; label: string }[] = [
  { id: "market", label: "Market" },
  { id: "auction", label: "Auction" },
  { id: "you", label: "You" },
];

/** Где человек был в прошлый раз. Перезагрузка не должна отбрасывать назад. */
const REMEMBER = "oxar.tab";

export function useTab(): [Tab, (next: Tab) => void] {
  // Первый кадр всегда одинаков и на сервере, и в браузере: если читать
  // хранилище сразу, статика разъедется с разметкой и React перерисует всё.
  const [tab, setTab] = useState<Tab>("auction");

  useEffect(() => {
    const saved = window.localStorage.getItem(REMEMBER);
    if (saved && TABS.some((t) => t.id === saved)) setTab(saved as Tab);
  }, []);

  return [
    tab,
    (next) => {
      setTab(next);
      window.localStorage.setItem(REMEMBER, next);
    },
  ];
}

export function Tabs({
  tab,
  onPick,
}: {
  tab: Tab;
  onPick: (next: Tab) => void;
}) {
  const at = TABS.findIndex((t) => t.id === tab);

  return (
    <nav className="tabs" aria-label="Sections">
      {/* Подсветка одна на все вкладки и ездит между ними. Ширина в долях,
          чтобы не пересчитывать её в пикселях при смене ширины экрана. */}
      <span
        className="tabs-pill"
        style={{ transform: `translateX(${at * 100}%)` }}
        aria-hidden
      />
      {TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={item.id === tab ? "tab on" : "tab"}
          aria-current={item.id === tab ? "page" : undefined}
          // На нажатие, а не на отпускание: ожидание click ощущается мёртвым.
          onPointerDown={() => onPick(item.id)}
          onClick={(event) => event.preventDefault()}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
