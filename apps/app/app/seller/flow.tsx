"use client";

import { useCallback, useEffect, useState } from "react";
import {
  answerRequest,
  landCapture,
  loadDealsToRate,
  loadPricingThing,
  loadSellerRequests,
  loadSellerScore,
  loadSellerThings,
  markShooting,
  savePlans,
  sendRating,
  sendThing,
  type DealToRate,
  type PricingThing,
  type Rect,
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

type View =
  | { name: "home" }
  | { name: "camera" }
  | { name: "desktop" }
  | { name: "mark"; photos: (Blob | string)[]; preview: string }
  | { name: "sent"; photos: number; spots: number }
  | { name: "setup"; thing: PricingThing }
  | { name: "request"; request: SellerRequest }
  | { name: "rate"; deal: DealToRate };

/**
 * Кабинет продавца целиком: главный экран и шаги поверх него. Шаги - это
 * состояние, а не адреса: вкладки приложения тоже состояние, и «назад»
 * везде ведёт к вещам.
 */
export function SellerFlow({ onView }: { onView?: (name: View["name"]) => void }) {
  const [view, setView] = useState<View>({ name: "home" });
  const [score, setScore] = useState<Score>({ rating: null, deals: 0 });
  const [things, setThings] = useState<SellerThing[]>([]);
  const [requests, setRequests] = useState<SellerRequest[]>([]);
  const [toRate, setToRate] = useState<DealToRate[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

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
    setBusy(false);
    setView(next);
  }

  function home() {
    reload();
    go({ name: "home" });
  }

  const onPhotos = useCallback(
    (photos: (Blob | string)[], preview: string) => go({ name: "mark", photos, preview }),
    [],
  );

  switch (view.name) {
    case "camera":
      return (
        <Camera
          onCancel={home}
          onDone={(photos) =>
            go({ name: "mark", photos, preview: URL.createObjectURL(photos[0]!) })
          }
        />
      );
    case "desktop":
      return <AddOnDesktop onBack={home} onPhotos={onPhotos} />;
    case "mark":
      return (
        <MarkSpots
          photo={view.preview}
          onBack={home}
          sending={busy}
          failed={failed}
          onSend={async (spots: Rect[]) => {
            setBusy(true);
            const ok = await sendThing(view.photos, spots);
            setBusy(false);
            if (ok) go({ name: "sent", photos: view.photos.length, spots: spots.length });
            else setFailed(true);
          }}
        />
      );
    case "sent":
      return <Sent photos={view.photos} spots={view.spots} onBack={home} />;
    case "setup":
      return (
        <SetUpSpots
          thing={view.thing}
          onBack={home}
          publishing={busy}
          failed={failed}
          onPublish={async (plans) => {
            setBusy(true);
            const ok = await savePlans(view.thing.id, plans);
            setBusy(false);
            if (ok) home();
            else setFailed(true);
          }}
        />
      );
    case "request":
      return (
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
      return (
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
    default:
      return (
          <SellerHome
            score={score}
            requests={requests}
            toRate={toRate}
            things={things}
            now={now}
            onRequest={(request) => go({ name: "request", request })}
            onRate={(deal) => go({ name: "rate", deal })}
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
      );
  }
}

/**
 * Телефон по QR с десктопа: та же камера, но снимки уходят в сессию, а
 * размечает их десктоп.
 */
export function PhoneCapture({ session, onClose }: { session: string; onClose: () => void }) {
  const [state, setState] = useState<"shooting" | "sending" | "done" | "failed">("shooting");

  useEffect(() => {
    void markShooting(session);
  }, [session]);

  if (state === "shooting") {
    return (
      <Camera
        onCancel={onClose}
        onDone={async (photos) => {
          setState("sending");
          setState((await landCapture(session, photos)) ? "done" : "failed");
        }}
      />
    );
  }
  return (
    <>
      <Bar title={state === "failed" ? "Not sent" : "Sent"} onBack={onClose} />
      <p className="sl-lead">
        {state === "sending"
          ? "Sending the photos to your computer."
          : state === "done"
            ? "The photos are on your computer. Mark the spots there."
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
