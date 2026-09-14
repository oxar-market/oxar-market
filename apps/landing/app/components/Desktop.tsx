"use client";

import { useEffect, useState } from "react";
import { APPS, FILES, type DesktopFile } from "@/lib/desktop";
import { useIconLayout, type Layout } from "@/lib/use-icon-layout";
import { useSellerAccount } from "@/lib/use-seller-account";
import { JosipApp } from "./JosipApp";
import { SellerDesk } from "./SellerDesk";
import { Waitlist } from "./Waitlist";
import { Window } from "./Window";
import { XProfile } from "./XProfile";

type Role = "creator" | "advertiser";
type Open =
  | { kind: "file"; file: DesktopFile }
  | { kind: "waitlist" }
  | { kind: "x" }
  | { kind: "desk" }
  | { kind: "josip" }
  | null;

const CALL_URL = "https://calendly.com/daniel-l-oxar";

type Item =
  | { slug: string; kind: "file"; name: string; icon: string; file: DesktopFile }
  | { slug: string; kind: "app"; name: string; icon?: string };

const ITEMS: Item[] = [
  ...FILES.map<Item>((file) => ({
    slug: file.slug,
    kind: "file",
    name: file.name,
    icon: file.icon,
    file,
  })),
  ...APPS.map<Item>((app) => ({
    slug: app.slug,
    kind: "app",
    name: app.name,
    icon: app.icon,
  })),
];

const DEFAULT_POSITIONS: Layout = Object.fromEntries([
  ...FILES.map((file) => [file.slug, { x: file.x, y: file.y }]),
  ...APPS.map((app) => [app.slug, { x: app.x, y: app.y }]),
]);

/**
 * Стартовая раскладка для узкого экрана: два столбца, тот же свободный стол.
 * Столбцы стоят по центрам четвертей экрана - иконка шириной 84px на 390px
 * занимает примерно 21%, поэтому её левый край сдвинут на половину этого от
 * 25% и 75%. Прижатые к левому краю столбцы оставляли справа пустую полосу.
 */
const MOBILE_POSITIONS: Layout = {
  "who-we-are": { x: 14, y: 2 },
  "how-it-works": { x: 64, y: 2 },
  "why-us": { x: 14, y: 20 },
  x: { x: 64, y: 20 },
  josip: { x: 14, y: 38 },
};

/** Слот кнопки в доке: скрытый схлопывается по ширине, а не исчезает рывком. */
function DockSlot({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <span
      className={show ? "dock-slot" : "dock-slot off"}
      aria-hidden={!show}
      // inert убирает скрытую кнопку из фокуса и из-под курсора: видимой её нет,
      // и нажать её нельзя ни мышью, ни табом.
      inert={!show}
    >
      {children}
    </span>
  );
}

export function Desktop() {
  const [role, setRole] = useState<Role>("creator");
  // При первом заходе одно окно уже открыто: рабочий стол без подсказки
  // заставляет человека догадываться, а оффер должен читаться сразу.
  const [open, setOpen] = useState<Open>({ kind: "file", file: FILES[0]! });

  const { positions, surface, onPointerDown, onPointerMove, onPointerUp } =
    useIconLayout(DEFAULT_POSITIONS, MOBILE_POSITIONS);

  // Вход живёт по адресу, а не в интерфейсе: oxar.app/?signin. Ссылку мы
  // отправляем сами тем, кого одобрили, - до открытия платформы остальным не
  // нужно даже знать, что вход существует. Кнопка в доке или в окне это
  // обещание, которое мы пока не готовы исполнить.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("signin")) {
      setOpen({ kind: "desk" });
    }
  }, []);

  // Кабинет и звонок - две стороны одной дороги. Есть свои места - значит
  // разговор уже был, и предлагать его снова незачем. Мест нет - значит
  // начинать надо с разговора, а не с пустого кабинета.
  const account = useSellerAccount();

  function activate(slug: string) {
    const item = ITEMS.find((candidate) => candidate.slug === slug);
    if (!item) return;
    if (item.kind === "file") {
      setOpen({ kind: "file", file: item.file });
      return;
    }
    setOpen(item.slug === "josip" ? { kind: "josip" } : { kind: "x" });
  }

  return (
    <div className="desktop">
      <header className="topbar">
        {/* Переключатель подписан действием, а не ролью: «Creator» рядом с
            «Advertiser» ничего не объясняет, а «I'm selling» объясняет. */}
        <div className="roles" role="tablist" aria-label="Your side">
          <button
            role="tab"
            aria-selected={role === "creator"}
            className={role === "creator" ? "role on" : "role"}
            onClick={() => setRole("creator")}
          >
            I&apos;m selling
          </button>
          <button
            role="tab"
            aria-selected={role === "advertiser"}
            className={role === "advertiser" ? "role on" : "role"}
            onClick={() => setRole("advertiser")}
          >
            I&apos;m buying
          </button>
        </div>
      </header>

      <div className="icons" ref={surface}>
        {ITEMS.map((item) => {
          const at = positions[item.slug] ?? { x: 5, y: 8 };
          return (
            <button
              key={item.slug}
              className="icon"
              style={{ left: `${at.x}%`, top: `${at.y}%` }}
              onPointerDown={(event) => onPointerDown(item.slug, event)}
              onPointerMove={onPointerMove}
              onPointerUp={(event) => onPointerUp(event, activate)}
              onPointerCancel={(event) => onPointerUp(event, () => {})}
            >
              <span
                className={
                  item.kind === "file"
                    ? "icon-art file"
                    : item.icon
                      ? "icon-art photo"
                      : "icon-art app"
                }
                aria-hidden
              >
                {item.icon ? (
                  // Логотипы лежат в public и не меняются, оптимизатор картинок
                  // тут только добавил бы работы.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.icon} alt="" draggable={false} />
                ) : (
                  "𝕏"
                )}
              </span>
              <span className="icon-name">{item.name}</span>
            </button>
          );
        })}
      </div>

      <nav className="dock">
        {/* Логотип работает как Home: закрывает окно и возвращает на стол.
            Крестик в окне остался - на телефоне лист занимает весь экран и
            перекрывает док, там закрывает он. */}
        <button className="dock-home" onClick={() => setOpen(null)} aria-label="Home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/mark-home.png" alt="" draggable={false} />
        </button>
        <span className="dock-line" aria-hidden />

        {/* Кнопки не появляются и не исчезают рывком: каждая живёт в слоте,
            который схлопывается по ширине. Док центрирован, поэтому остальные
            съезжают к середине сами. */}
        <DockSlot show>
          <button className="dock-item" onClick={() => setOpen({ kind: "waitlist" })}>
            Join waitlist
          </button>
        </DockSlot>

        <DockSlot show={role === "creator" && account.status === "seller"}>
          <button className="dock-item" onClick={() => setOpen({ kind: "desk" })}>
            My spots
          </button>
        </DockSlot>

        <DockSlot show={role === "creator" && account.status !== "seller"}>
          {/* Подсказка объясняет, зачем звонок: сама надпись не говорит, что
              это единственный путь к проверке аккаунта и к своим местам. */}
          <a
            className="dock-item"
            href={CALL_URL}
            target="_blank"
            rel="noreferrer"
            title="We check the account is yours, then your spots go live"
          >
            Book a call
          </a>
        </DockSlot>

        {/* Вход стоял здесь третьей кнопкой и ломал правило дока: две кнопки,
            одна из которых зависит от состояния. Он переехал в окно вейтлиста -
            одобренному продавцу на новом устройстве нужен редко, а место в доке
            занимал всегда. */}

        <DockSlot show={role === "advertiser"}>
          <button className="dock-item" onClick={() => setOpen({ kind: "x" })}>
            Browse placements
          </button>
        </DockSlot>
      </nav>

      {open?.kind === "file" && (
        <Window title={open.file.name} onClose={() => setOpen(null)}>
          <h1>{open.file.title}</h1>
          {open.file.body.map((paragraph) => (
            <p key={paragraph.slice(0, 24)}>{paragraph}</p>
          ))}
          {open.file.slug === "who-we-are" && (
            <button className="primary" onClick={() => setOpen({ kind: "waitlist" })}>
              Join the waitlist
            </button>
          )}
        </Window>
      )}

      {open?.kind === "waitlist" && (
        <Window title="waitlist" onClose={() => setOpen(null)}>
          <Waitlist />
        </Window>
      )}

      {open?.kind === "desk" && (
        <Window title="My spots" onClose={() => setOpen(null)}>
          <SellerDesk account={account} />
        </Window>
      )}

      {open?.kind === "josip" && (
        <Window title="Josip called it" onClose={() => setOpen(null)}>
          <JosipApp />
        </Window>
      )}

      {open?.kind === "x" && (
        <Window title="X placements" onClose={() => setOpen(null)} wide>
          {/* Смотреть витрину может кто угодно, а цены и торги - только
              одобренный аккаунт: заводим мы их руками, и до вейтлиста человек
              всё равно ничего не купит. */}
          <XProfile
            role={role}
            access={
              account.status === "loading"
                ? "loading"
                : account.access
                  ? "open"
                  : "locked"
            }
            onWaitlist={() => setOpen({ kind: "waitlist" })}
          />
        </Window>
      )}
    </div>
  );
}
