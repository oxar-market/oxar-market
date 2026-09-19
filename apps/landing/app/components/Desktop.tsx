"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { APPS, FILES, FOLDERS, type DesktopFile } from "@/lib/desktop";
import { rememberOpenPoint } from "@/lib/open-from";
import { useIconLayout, type Layout, type Parents } from "@/lib/use-icon-layout";
import { useSellerAccount } from "@/lib/use-seller-account";
import { JosipApp } from "./JosipApp";
import { MyOrders } from "./MyOrders";
import { Proof } from "./Proof";
import { SellerDesk } from "./SellerDesk";
import { Suitcase } from "./Suitcase";
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
  | { kind: "suitcase" }
  | { kind: "placements" }
  | { kind: "folder"; slug: string; name: string }
  | null;

const CALL_URL = "https://calendly.com/daniel-l-oxar";

/**
 * Что вообще продаётся. Список для дока: иконки на столе показывают вещи по
 * одной и в разных местах - профиль лежит на столе, футболка с чемоданом в
 * папке, - а покупателю нужен один вход, за которым видно всё сразу.
 */
const SURFACES: { kind: "x" | "tshirt" | "suitcase"; name: string; what: string }[] = [
  { kind: "x", name: "X profile", what: "Seven spots: avatar, banner, bio, pinned post and more." },
  { kind: "tshirt", name: "T-shirt", what: "Eleven print zones on a shirt someone wears." },
  { kind: "suitcase", name: "Suitcase", what: "Five panels on a carry-on that lives in airports." },
];

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

/** Папка системного вида: задняя стенка с язычком и передняя створка. Створка
    залита градиентом в цвет акцента - папка единственная цветная вещь на столе,
    и бледной она терялась среди белых карточек. Идентификатор градиента свой у
    каждой папки: одинаковые id в разных svg ссылались бы на один узел. */
function FolderArt() {
  const gradient = useId();
  return (
    <svg viewBox="0 0 64 52" className="folder-art">
      <defs>
        <linearGradient
          id={gradient}
          x1="0"
          y1="14"
          x2="0"
          y2="52"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#b5d7fb" />
          <stop offset="1" stopColor="#6ba3e8" />
        </linearGradient>
      </defs>
      <path
        d="M2 10a6 6 0 0 1 6-6h16l6 7h26a6 6 0 0 1 6 6v29a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6z"
        fill="#5a90d2"
      />
      <path
        d="M2 20a6 6 0 0 1 6-6h48a6 6 0 0 1 6 6v26a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6z"
        fill={`url(#${gradient})`}
      />
    </svg>
  );
}

/**
 * Вещи из физического мира показываем самой вещью, а не значком: это снимок
 * той же модели, которую человек крутит, открыв окно. Рисованный силуэт рядом
 * с настоящим рендером читался как заглушка на месте картинки.
 *
 * Файлы сняты с `public/models/*.glb` в three.js на прозрачном фоне - тем же
 * освещением и той же цветопередачей, что в окне.
 */
const THINGS: Record<string, string> = {
  tshirt: "/icons/tshirt.png",
  suitcase: "/icons/suitcase.png",
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
  // Ничего не открыто: первым человек видит сам стол. Раньше поверх сразу
  // лежал первый файл, и на телефоне он занимал весь экран - иконки, макет
  // профиля и игра не показывались вовсе, а вместо них встречала стена текста.
  const [open, setOpen] = useState<Open>(null);

  // Окно кладёт сюда свою функцию ухода, пока оно открыто. Снаружи его
  // закрывают двое - логотип в доке и вынос иконки из папки, - и оба должны
  // уходить тем же путём, что и крестик, а не пропадать рывком.
  const closer = useRef<(() => void) | null>(null);
  const close = useCallback(() => {
    if (closer.current) closer.current();
    else setOpen(null);
  }, []);

  const { positions, parents, surface, onPointerDown, onPointerMove, onPointerUp } =
    useIconLayout(DEFAULT_POSITIONS, MOBILE_POSITIONS, DEFAULT_PARENTS, close);

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
    if (item.slug === "tshirt" || item.slug === "suitcase") {
      setOpen({ kind: item.slug });
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
        : THINGS[item.slug]
          ? "icon-art thing"
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
          ) : THINGS[item.slug] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={THINGS[item.slug]} alt="" draggable={false} />
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
      {/* Пелена, приглушающая обои. Стоит до иконок, чтобы они красились
          поверх неё без z-index: см. комментарий у .desktop-veil. */}
      <div className="desktop-veil" aria-hidden />
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
        <button className="dock-home" onClick={close} aria-label="Home">
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
          <button className="dock-item" onClick={() => setOpen({ kind: "placements" })}>
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
        <Window title={open.file.name} onClose={() => setOpen(null)} closer={closer}>
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
        <Window title="Join the waitlist" onClose={() => setOpen(null)} closer={closer}>
          <Waitlist />
        </Window>
      )}

      {/* Кабинет широкий: это таблица, а не текст. В строке имя, цена,
          состояние и два действия, и на узком окне они разъезжались. */}
      {open?.kind === "desk" && (
        <Window title="My spots" onClose={() => setOpen(null)} closer={closer} wide>
          <SellerDesk account={account} />
        </Window>
      )}

      {open?.kind === "orders" && (
        <Window title="My orders" onClose={() => setOpen(null)} closer={closer}>
          <MyOrders onWaitlist={() => setOpen({ kind: "waitlist" })} />
        </Window>
      )}

      {open?.kind === "josip" && (
        <Window title="Josip called it" onClose={() => setOpen(null)} closer={closer}>
          <JosipApp />
        </Window>
      )}

      {open?.kind === "folder" && (
        <Window
          title={open.name}
          onClose={() => setOpen(null)}
          closer={closer}
          folder={open.slug}
        >
          <div className="folder-grid">
            {ITEMS.filter((item) => parents[item.slug] === open.slug).map((item) =>
              renderIcon(item),
            )}
          </div>
        </Window>
      )}

      {open?.kind === "placements" && (
        <Window title="Placements" onClose={() => setOpen(null)} closer={closer}>
          <p className="muted small">
            Everything on sale right now. Pick a surface to see its spots and dates.
          </p>
          <div className="surface-list">
            {SURFACES.map((surface) => (
              <button
                key={surface.kind}
                type="button"
                className="surface-row"
                onClick={() => setOpen({ kind: surface.kind })}
              >
                <strong>{surface.name}</strong>
                <span className="muted small">{surface.what}</span>
              </button>
            ))}
          </div>
        </Window>
      )}

      {open?.kind === "suitcase" && (
        <Window title="Suitcase" onClose={() => setOpen(null)} closer={closer} wide>
          <Suitcase
            role={role}
            onWaitlist={() => setOpen({ kind: "waitlist" })}
            onSwap={() => setOpen({ kind: "tshirt" })}
          />
        </Window>
      )}

      {open?.kind === "tshirt" && (
        <Window title="T-shirt" onClose={() => setOpen(null)} closer={closer} wide>
          <Tshirt
            role={role}
            onWaitlist={() => setOpen({ kind: "waitlist" })}
            onSwap={() => setOpen({ kind: "suitcase" })}
          />
        </Window>
      )}

      {open?.kind === "x" && (
        <Window title="X placements" onClose={() => setOpen(null)} closer={closer} wide>
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
