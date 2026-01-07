import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

type SlideOverProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function SlideOver({ open, title, onClose, children }: SlideOverProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div
      className={
        "fixed inset-0 z-50 " +
        (open ? "pointer-events-auto" : "pointer-events-none")
      }
      aria-hidden={!open}
    >
      <div
        className={
          "absolute inset-0 bg-black/30 transition-opacity duration-200 " +
          (open ? "opacity-100" : "opacity-0")
        }
        onMouseDown={onClose}
      />

      <div
        className={
          "absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl " +
          "transition-transform duration-300 ease-out " +
          (open ? "translate-x-0" : "translate-x-full")
        }
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="text-base font-extrabold text-slate-900">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="h-[calc(100%-53px)] overflow-y-auto px-4 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}


