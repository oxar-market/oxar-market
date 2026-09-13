// Иконки для макета профиля. Рисуем сами, без библиотеки: их десяток, они
// простые, а лишняя зависимость в бандле дороже.

type Props = { className?: string };

function Svg({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function ArrowLeft(props: Props) {
  return (
    <Svg {...props}>
      <path d="M19 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </Svg>
  );
}

export function Dots(props: Props) {
  return (
    <Svg {...props}>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function Envelope(props: Props) {
  return (
    <Svg {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M4 7l8 6 8-6" />
    </Svg>
  );
}

/** Галочка в круге, как отметка подтверждённого аккаунта. */
export function Verified(props: Props) {
  return (
    <svg viewBox="0 0 24 24" className={props.className} aria-hidden>
      <circle cx="12" cy="12" r="11" fill="#1d9bf0" />
      <path
        d="M7.5 12.4l3 3 6-6.4"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LinkIcon(props: Props) {
  return (
    <Svg {...props}>
      <path d="M10 13.5a4 4 0 005.7 0l2.6-2.6a4 4 0 00-5.7-5.7L11.5 6.2" />
      <path d="M14 10.5a4 4 0 00-5.7 0l-2.6 2.6a4 4 0 005.7 5.7l1.1-1" />
    </Svg>
  );
}

export function Pin(props: Props) {
  return (
    <Svg {...props}>
      <path d="M12 21s7-6.1 7-11a7 7 0 10-14 0c0 4.9 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.6" />
    </Svg>
  );
}

export function Calendar(props: Props) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
    </Svg>
  );
}

export function Reply(props: Props) {
  return (
    <Svg {...props}>
      <path d="M20.5 12.5c0 4-3.8 7-8.5 7-1 0-2-.1-2.9-.4L4 21l1.4-3.6A6.9 6.9 0 013.5 12.5c0-4 3.8-7 8.5-7s8.5 3 8.5 7z" />
    </Svg>
  );
}

export function Repost(props: Props) {
  return (
    <Svg {...props}>
      <path d="M7 7h9a3 3 0 013 3v4" />
      <path d="M17 17H8a3 3 0 01-3-3v-4" />
      <path d="M9.5 4.5L7 7l2.5 2.5M14.5 19.5L17 17l-2.5-2.5" />
    </Svg>
  );
}

export function Heart(props: Props) {
  return (
    <Svg {...props}>
      <path d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0112 8.2a4.1 4.1 0 017.5 2.4C19.5 15.4 12 20 12 20z" />
    </Svg>
  );
}

export function Share(props: Props) {
  return (
    <Svg {...props}>
      <path d="M12 16V4" />
      <path d="M8 7.5L12 3.5l4 4" />
      <path d="M5 14v5.5a1 1 0 001 1h12a1 1 0 001-1V14" />
    </Svg>
  );
}

export function Pencil(props: Props) {
  return (
    <Svg {...props}>
      <path d="M4.5 19.5l4-1 10-10a2.1 2.1 0 00-3-3l-10 10-1 4z" />
    </Svg>
  );
}

export function Cross(props: Props) {
  return (
    <Svg {...props}>
      <path d="M6.5 6.5l11 11" />
      <path d="M17.5 6.5l-11 11" />
    </Svg>
  );
}

/** Снять с продажи: место остаётся, но его не видно в витрине. */
export function EyeOff(props: Props) {
  return (
    <Svg {...props}>
      <path d="M4 4l16 16" />
      <path d="M9.7 5.4A8.6 8.6 0 0112 5.2c5 0 8 4.1 8 6.8a9 9 0 01-1.9 3.2" />
      <path d="M6.4 7.3A11 11 0 004 12c0 2.7 3 6.8 8 6.8a8.4 8.4 0 003.6-.8" />
      <path d="M10 10a2.8 2.8 0 004 4" />
    </Svg>
  );
}

export function Eye(props: Props) {
  return (
    <Svg {...props}>
      <path d="M4 12c0-2.7 3-6.8 8-6.8s8 4.1 8 6.8c0 2.7-3 6.8-8 6.8S4 14.7 4 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </Svg>
  );
}

/** Остановить торг: круг с чертой, а не крестик - крестик читается как «закрыть». */
export function Ban(props: Props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M7 17L17 7" />
    </Svg>
  );
}

export function SignOut(props: Props) {
  return (
    <Svg {...props}>
      <path d="M9.5 19.5H6A1.5 1.5 0 014.5 18V6A1.5 1.5 0 016 4.5h3.5" />
      <path d="M14 8.5l3.5 3.5-3.5 3.5" />
      <path d="M17.5 12H9" />
    </Svg>
  );
}

export function Lock(props: Props) {
  return (
    <Svg {...props}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.6" />
      <path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" />
    </Svg>
  );
}
