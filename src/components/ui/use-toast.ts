import * as React from "react";

export type ToastVariant = "default" | "destructive";

export type Toast = {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
};

type State = {
  toasts: Toast[];
};

const listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };

function emit(next: State) {
  memoryState = next;
  listeners.forEach((l) => l(memoryState));
}

function genId() {
  return Math.random().toString(36).slice(2);
}

export function toast(input: Omit<Toast, "id">) {
  const id = genId();
  const t: Toast = { id, ...input };
  emit({ toasts: [t, ...memoryState.toasts].slice(0, 3) });
  window.setTimeout(() => {
    emit({ toasts: memoryState.toasts.filter((x) => x.id !== id) });
  }, 3500);
  return { id };
}

export function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const idx = listeners.indexOf(setState);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }, []);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => {
      if (!toastId) {
        emit({ toasts: [] });
        return;
      }
      emit({ toasts: memoryState.toasts.filter((t) => t.id !== toastId) });
    },
  };
}
