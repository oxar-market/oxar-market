"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useConnectedStandardWallets,
  useStandardSignTransaction,
} from "@privy-io/react-auth/solana";
import { PublicKey } from "@solana/web3.js";
import { WALLET_CHAIN, connection } from "@/lib/chain";
import { publishAuctions } from "@/lib/publish";
import {
  answerRequest,
  landCapture,
  loadDealsToRate,
  deleteThing,
  loadPricingThing,
  loadSellerRequests,
  loadSellerScore,
  loadSellerThings,
  openCapture,
  savePlans,
  sendRating,
  sendThing,
  type DealToRate,
  type PricingThing,
  type Score,
  type SellerRequest,
  type SellerThing,
} from "@/lib/seller";
import { Camera } from "./camera.tsx";
import { AddOnDesktop } from "./desktop.tsx";
import { SellerHome } from "./home.tsx";
import { MarkSpots } from "./mark.tsx";
import { Bar } from "./parts.tsx";
import { RateBuyer, RateSeller } from "./rate.tsx";
import { RequestView } from "./request.tsx";
import { Sent } from "./sent.tsx";
import { SetUpSpots } from "./setup.tsx";
import { db } from "@/lib/session";
import { Reviews } from "../reviews.tsx";
import { Winners } from "../winners.tsx";

type View =
  | { name: "home" }
  | { name: "camera" }
  | { name: "desktop" }
  | { name: "mark"; photos: (Blob | string)[]; previews: string[] }
  | { name: "sent"; photos: number; spots: number }
  | { name: "setup"; thing: PricingThing }
  | { name: "request"; request: SellerRequest }
  | { name: "rate"; deal: DealToRate }
  | { name: "winners"; thing: SellerThing };

/**
 * Кабинет продавца целиком: главный экран и шаги поверх него. Шаги - это
 * состояние, а не адреса: вкладки приложения тоже состояние, и «назад»
 * везде ведёт к вещам.
 */
export function SellerFlow({
  onView,
  onOpen,
}: {
  onView?: (name: View["name"]) => void;
  /** Открыть торг своей вещи - ту же страницу, что видят покупатели. */
  onOpen: (thingId: string) => void;
}) {
  const [view, setView] = useState<View>({ name: "home" });
  const [score, setScore] = useState<Score>({ rating: null, deals: 0 });
  // Отзывы о себе - та же выкладка, что видят покупатели.
  const [me, setMe] = useState<string | null>(null);
  const [reviews, setReviews] = useState(false);
  useEffect(() => {
    void db?.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);
  const [things, setThings] = useState<SellerThing[]>([]);
  const [requests, setRequests] = useState<SellerRequest[]>([]);
  const [toRate, setToRate] = useState<DealToRate[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [problem, setProblem] = useState("");
  const { wallets } = useConnectedStandardWallets();
  const { signTransaction } = useStandardSignTransaction();
  const wallet = wallets[0];

  const reload = useCallback(() => {
    void loadSellerScore().then(setScore);
    void loadSellerThings().then(setThings);
    void loadSellerRequests().then(setRequests);
    void loadDealsToRate("seller").then(setToRate);
  }, []);

  useEffect(() => {
    reload();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [reload]);

  useEffect(() => {
    onView?.(view.name);
    window.scrollTo({ top: 0 });
  }, [view.name, onView]);

  function go(next: View) {
    setFailed(false);
    setProblem("");
    setBusy(false);
    setView(next);
  }

  function home() {
    reload();
    go({ name: "home" });
  }

  const onPhotos = useCallback(
    (photos: (Blob | string)[], previews: string[]) => go({ name: "mark", photos, previews }),
    [],
  );

  // Шаги со своей шапкой живут колонкой, как экран QR на десктопе: на
  // широком экране форма в полэкрана читается хуже, чем в телефоне.
  const column = (content: React.ReactNode) => <div className="sl-column">{content}</div>;

  switch (view.name) {
    case "camera":
      return (
        <Camera
          onCancel={home}
          onDone={(photos) =>
            go({ name: "mark", photos, previews: photos.map((one) => URL.createObjectURL(one)) })
          }
        />
      );
    case "desktop":
      return <AddOnDesktop onBack={home} onPhotos={onPhotos} />;
    case "mark":
      return column(
        <MarkSpots
          photos={view.previews}
          onBack={home}
          sending={busy}
          failed={failed}
          onSend={async (spots) => {
            setBusy(true);
            const ok = await sendThing(view.photos, spots, wallet?.address ?? null);
            setBusy(false);
            if (ok) go({ name: "sent", photos: view.photos.length, spots: spots.length });
            else setFailed(true);
          }}
        />
      );
    case "sent":
      return column(<Sent photos={view.photos} spots={view.spots} onBack={home} />);
    case "setup":
      return column(
        <SetUpSpots
          thing={view.thing}
          onBack={home}
          publishing={busy}
          failed={failed}
          problem={problem}
          onDelete={async () => {
            const ok = await deleteThing(view.thing.id);
            if (ok) home();
            return ok;
          }}
          onPublish={async (plans) => {
            setBusy(true);
            setFailed(false);
            setProblem("");
            if (!(await savePlans(view.thing.id, plans))) {
              setBusy(false);
              return setFailed(true);
            }
            // Аукционы открывает кошелёк продавца: он и получит выплату.
            // Аренда в цепочку не ходит - ей хватило сохранения.
            const auctions = plans.filter((one) => one.plan.kind === "auction").length;
            if (auctions > 0) {
              if (!wallet) {
                setBusy(false);
                return setProblem("No wallet connected. Sign in again to get one.");
              }
              const owner = new PublicKey(wallet.address);
              // Места и хранилища создаются за счёт продавца: около 0.004 SOL
              // на место и 0.002 на торг. Нет SOL - транзакция не пройдёт.
              const need = 0.002 + 0.004 * auctions;
              const sol = (await connection.getBalance(owner)) / 1e9;
              if (sol < need) {
                setBusy(false);
                return setProblem(
                  `Opening ${auctions === 1 ? "an auction" : `${auctions} auctions`} needs about ${need.toFixed(3)} SOL in your wallet for network rent. You have ${sol.toFixed(3)}.`,
                );
              }
              const opened = await publishAuctions(view.thing.id, owner, async (transaction) => {
                const { signedTransaction } = await signTransaction({
                  transaction: transaction.serialize(),
                  wallet,
                  chain: WALLET_CHAIN,
                });
                return signedTransaction;
              }).catch(() => null);
              if (opened === null) {
                setBusy(false);
                return setProblem(
                  "The auctions did not open. Prices are saved - try Publish again.",
                );
              }
            }
            setBusy(false);
            home();
          }}
        />
      );
    case "request":
      return column(
        <RequestView
          request={view.request}
          now={now}
          onBack={home}
          busy={busy}
          failed={failed}
          onAnswer={async (approve) => {
            setBusy(true);
            const ok = await answerRequest(view.request.id, approve);
            setBusy(false);
            if (ok) home();
            else setFailed(true);
          }}
        />
      );
    case "rate":
      return column(
        <RateBuyer
          deal={view.deal}
          onBack={home}
          busy={busy}
          failed={failed}
          onSend={async (rating) => {
            setBusy(true);
            const ok = await sendRating({
              side: "seller",
              lotId: view.deal.lotId,
              requestId: view.deal.requestId,
              ...rating,
            });
            setBusy(false);
            if (ok) home();
            else setFailed(true);
          }}
        />
      );
    case "winners":
      return column(
        <>
          <Bar title="Winning logos" onBack={home} />
          <p className="sl-lead">
            {view.thing.title}: what to put on each spot. Open a logo to save the
            file.
          </p>
          <Winners thingId={view.thing.id} />
        </>,
      );
        default:
      return (
          <>
          {reviews && me && (
            <Reviews seller={me} name="Your reviews" score={score} onClose={() => setReviews(false)} />
          )}
          <SellerHome
            onReviews={() => setReviews(true)}
            onWinners={(thing) => go({ name: "winners", thing })}
            score={score}
            requests={requests}
            toRate={toRate}
            things={things}
            now={now}
            onRequest={(request) => go({ name: "request", request })}
            onRate={(deal) => go({ name: "rate", deal })}
            onOpen={onOpen}
            onSetup={async (thingId) => {
              const thing = await loadPricingThing(thingId);
              if (thing) go({ name: "setup", thing });
            }}
            onAdd={() =>
              // Телефон снимает сам; у ноутбука камера смотрит на человека,
              // поэтому с него снимки приходят через QR.
              go({
                name: window.matchMedia("(pointer: coarse)").matches ? "camera" : "desktop",
              })
            }
          />
          </>
      );
  }
}

/**
 * Телефон по QR с десктопа: просто камера, без входа и кошелька. Секрет из
 * QR открывает съёмку, снимки уходят по подписанным ссылкам, размечает их
 * десктоп.
 */
export function PhoneCapture({ secret, onClose }: { secret: string; onClose: () => void }) {
  const [state, setState] = useState<"opening" | "shooting" | "sending" | "done" | "expired" | "failed">(
    "opening",
  );
  const [uploads, setUploads] = useState<{ path: string; token: string }[]>([]);

  useEffect(() => {
    void openCapture(secret).then((found) => {
      if (!found) return setState("expired");
      setUploads(found);
      setState("shooting");
    });
  }, [secret]);

  if (state === "opening") return null;
  if (state === "shooting") {
    return (
      <Camera
        onCancel={onClose}
        onDone={async (photos) => {
          setState("sending");
          setState((await landCapture(secret, uploads, photos)) ? "done" : "failed");
        }}
      />
    );
  }
  return (
    <>
      <Bar title={state === "done" || state === "sending" ? "Sent" : "Not sent"} onBack={onClose} />
      <p className="sl-lead">
        {state === "sending"
          ? "Sending the photos to your computer."
          : state === "done"
            ? "The photos are on your computer. Mark the spots there."
            : state === "expired"
              ? "This code has expired. Open Add a thing on your computer and scan the new code."
              : "The photos did not reach your computer. Check the connection and scan again."}
      </p>
    </>
  );
}

/** Покупатель оценивает продавца - вход с экрана You в режиме Buyer. */
export function BuyerRating({ deal, onDone }: { deal: DealToRate; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <RateSeller
      deal={deal}
      onBack={onDone}
      busy={busy}
      failed={failed}
      onSend={async (rating) => {
        setBusy(true);
        const ok = await sendRating({
          side: "buyer",
          lotId: deal.lotId,
          requestId: deal.requestId,
          ...rating,
        });
        setBusy(false);
        if (ok) onDone();
        else setFailed(true);
      }}
    />
  );
}
