import { useToast } from "@/components/ui/use-toast";

export const Toaster = () => {
  const { toasts } = useToast();

  return (
    <div className="fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={
            "rounded-lg border px-4 py-3 shadow-lg " +
            (t.variant === "destructive" ? "border-red-200 bg-red-50" : "border-gray-200 bg-white")
          }
        >
          {t.title ? <div className="text-sm font-semibold text-gray-900">{t.title}</div> : null}
          {t.description ? <div className="mt-1 text-sm text-gray-700">{t.description}</div> : null}
        </div>
      ))}
    </div>
  );
};
