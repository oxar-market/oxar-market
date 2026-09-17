"use client";

import { useEffect, useState } from "react";
import { APPS, FILES, FOLDERS, type DesktopFile } from "@/lib/desktop";
import { rememberOpenPoint } from "@/lib/open-from";
import { useIconLayout, type Layout, type Parents } from "@/lib/use-icon-layout";
import { useSellerAccount } from "@/lib/use-seller-account";
import { JosipApp } from "./JosipApp";
import { MyOrders } from "./MyOrders";
import { Proof } from "./Proof";
import { SellerDesk } from "./SellerDesk";
import { Tshirt } from "./Tshirt";
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
  | { kind: "orders" }
  | { kind: "tshirt" }
  | { kind: "folder"; slug: string; name: string }
  | null;

const CALL_URL = "https://calendly.com/daniel-l-oxar";

type Item =
  | { slug: string; kind: "file"; name: string; icon: string; file: DesktopFile }
  | { slug: string; kind: "app"; name: string; icon?: string }
  | { slug: string; kind: "folder"; name: string };

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
  ...FOLDERS.map<Item>((folder) => ({
    slug: folder.slug,
    kind: "folder",
    name: folder.name,
  })),
];

const DEFAULT_POSITIONS: Layout = Object.fromEntries([
  ...FILES.map((file) => [file.slug, { x: file.x, y: file.y }]),
  ...APPS.map((app) => [app.slug, { x: app.x, y: app.y }]),
  ...FOLDERS.map((folder) => [folder.slug, { x: folder.x, y: folder.y }]),
]);

const DEFAULT_PARENTS: Parents = Object.fromEntries(
  APPS.map((app) => [app.slug, app.parent ?? null]),
);

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
  "physical-world": { x: 64, y: 38 },
};

/** Папка системного вида: задняя стенка с язычком и передняя створка. */
function FolderArt() {
  return (
    <svg viewBox="0 0 64 52" className="folder-art">
      <path
        d="M2 10a6 6 0 0 1 6-6h16l6 7h26a6 6 0 0 1 6 6v29a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6z"
        fill="#9dc4ea"
      />
      <path
        d="M2 20a6 6 0 0 1 6-6h48a6 6 0 0 1 6 6v26a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6z"
        fill="#c3ddf6"
      />
    </svg>
  );
}

/** Иконка футболки: своего файла у неё нет, и заводить его ради одного значка
    незачем. Силуэт тот же, что был в макете, - вещь узнаётся с первого взгляда. */
function TshirtArt() {
  return (
    <svg viewBox="36 94 248 244" className="tshirt-art">
      <path
        d="M104 122 L138 110 Q160 146 182 110 L216 122 L276 184 L238 212 L228 196
           L228 310 Q160 322 92 310 L92 196 L82 212 L44 184 Z"
        fill="#dfe3e9"
        stroke="#b9c1cc"
        strokeWidth="6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
  // Ничего не открыто: первым человек видит сам стол. Раньше поверх сразу
  // лежал первый файл, и на телефоне он занимал весь экран - иконки, макет
  // профиля и игра не показывались вовсе, а вместо них встречала стена текста.
  const [open, setOpen] = useState<Open>(null);

  const { positions, parents, surface, onPointerDown, onPointerMove, onPointerUp } =
    useIconLayout(DEFAULT_POSITIONS, MOBILE_POSITIONS, DEFAULT_PARENTS);

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
    if (item.kind === "folder") {
      setOpen({ kind: "folder", slug: item.slug, name: item.name });
      return;
    }
    if (item.slug === "tshirt") {
      setOpen({ kind: "tshirt" });
      return;
    }
    setOpen(item.slug === "josip" ? { kind: "josip" } : { kind: "x" });
  }

  /**
   * Одна и та же иконка стоит и на столе, и внутри папки. На столе ей задают
   * координаты, в папке она идёт обычным потоком - в остальном это один
   * элемент с одними обработчиками, поэтому перетаскивать её можно откуда
   * угодно куда угодно.
   */
  function renderIcon(item: Item, style?: React.CSSProperties) {
    const art =
      item.kind === "folder"
        ? "icon-art folder"
        : item.slug === "tshirt"
          ? "icon-art file drawn"
          : item.kind === "file"
            ? "icon-art file"
            : item.icon
              ? "icon-art photo"
              : "icon-art app";

    return (
      <button
        key={item.slug}
        className="icon"
        style={style}
        // Папка сама себе цель: по этому атрибуту перетаскивание понимает, что
        // иконку отпустили над ней.
        data-folder={item.kind === "folder" ? item.slug : undefined}
        onPointerDown={(event) => onPointerDown(item.slug, event)}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => {
          // Запоминаем до открытия: окно прочитает точку при появлении.
          rememberOpenPoint(event);
          onPointerUp(event, activate);
        }}
        onPointerCancel={(event) => onPointerUp(event, () => {})}
      >
        <span className={art} aria-hidden>
          {item.kind === "folder" ? (
            <FolderArt />
          ) : item.slug === "tshirt" ? (
            <TshirtArt />
          ) : item.icon ? (
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
        {ITEMS.filter((item) => !parents[item.slug]).map((item) => {
          const at = positions[item.slug] ?? { x: 5, y: 8 };
          return renderIcon(item, { left: `${at.x}%`, top: `${at.y}%` });
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

        {/* Свои покупки и деньги по ним. Только для тех, кого пустили: анониму
            RLS всё равно не отдаст ни строки, и обещать ему кабинет незачем. */}
        <DockSlot show={role === "advertiser" && account.access}>
          <button className="dock-item" onClick={() => setOpen({ kind: "orders" })}>
            My orders
          </button>
        </DockSlot>
      </nav>

      {open?.kind === "file" && (
        <Window title={open.file.name} onClose={() => setOpen(null)}>
          <h1>{open.file.title}</h1>
          {/* Доказательство идёт сразу за заголовком и раньше объяснения: до
              кнопки должно быть на что смотреть, а не пять абзацев подряд. */}
          {open.file.slug === "who-we-are" && <Proof />}
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

      {open?.kind === "orders" && (
        <Window title="My orders" onClose={() => setOpen(null)}>
          <MyOrders onWaitlist={() => setOpen({ kind: "waitlist" })} />
        </Window>
      )}

      {open?.kind === "josip" && (
        <Window title="Josip called it" onClose={() => setOpen(null)}>
          <JosipApp />
        </Window>
      )}

      {open?.kind === "folder" && (
        <Window title={open.name} onClose={() => setOpen(null)}>
          {/* По этому атрибуту перетаскивание понимает, что иконку отпустили
              внутри папки, а не вынесли на стол сквозь окно. */}
          <div className="folder-grid" data-folder-window>
            {ITEMS.filter((item) => parents[item.slug] === open.slug).map((item) =>
              renderIcon(item),
            )}
          </div>
        </Window>
      )}

      {open?.kind === "tshirt" && (
        <Window title="T-shirt" onClose={() => setOpen(null)} wide>
          <Tshirt role={role} onWaitlist={() => setOpen({ kind: "waitlist" })} />
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
