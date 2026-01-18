import { useEffect, useState } from "react";

type Props = {
  name: string;
  photo?: string | null;
  size?: number; // px
  className?: string;
  onClick?: () => void;
};

export function ProductThumb({ name, photo, size = 40, className = "", onClick }: Props) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    // se trocar a URL, reabilita o img
    setImgError(false);
  }, [photo]);

  const initial = String(name || "P").trim().charAt(0).toUpperCase();
  const showImg = Boolean(photo && !imgError);

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50",
        onClick ? "cursor-pointer hover:brightness-[0.98]" : "cursor-default",
        className,
      ].join(" ")}
      style={{ width: size, height: size }}
      aria-label={`Produto: ${name}`}
      title={name}
    >
      {showImg ? (
        <img
          src={String(photo)}
          alt={name}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-extrabold text-slate-700">{initial}</div>
      )}
    </button>
  );
}

