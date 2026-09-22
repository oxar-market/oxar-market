// Сообщения формы: ошибка и подтверждение. Вместо строки красного текста -
// спокойная плашка с иконкой, как системные уведомления на устройствах Apple:
// мягкий фон, крупное скругление, никакого кричащего цвета.

type Tone = "error" | "success";

export function Notice({
  tone,
  title,
  children,
}: {
  tone: Tone;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`notice ${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span className="notice-ico" aria-hidden>
        {tone === "error" ? <Bang /> : <Check />}
      </span>
      <span className="notice-text">
        {title && <strong>{title}</strong>}
        <span>{children}</span>
      </span>
    </div>
  );
}

function Bang() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="currentColor" />
      <path
        d="M12 6.8v7.2"
        stroke="#fff"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17.4" r="1.25" fill="#fff" />
    </svg>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="currentColor" />
      <path
        d="M7.4 12.4l3.1 3.1 6.1-6.5"
        fill="none"
        stroke="#fff"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
