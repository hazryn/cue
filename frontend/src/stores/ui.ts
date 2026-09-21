import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface ToastItem {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'error';
}

interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

/**
 * Toasty i potwierdzenia aplikacji. Natywne okienka przeglądarki odpadają:
 * na telewizorze wyglądają jak awaria, a na telefonie potrafią zablokować ekran.
 */
export const useUiStore = defineStore('ui', () => {
  const toasts = ref<ToastItem[]>([]);
  const confirmRequest = ref<ConfirmRequest | null>(null);
  let resolveConfirm: ((value: boolean) => void) | null = null;
  let nextId = 1;

  function toast(text: string, tone: ToastItem['tone'] = 'info', ttl = 3500): void {
    const id = nextId++;
    toasts.value.push({ id, text, tone });
    window.setTimeout(() => dismiss(id), ttl);
  }

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  function confirm(request: ConfirmRequest): Promise<boolean> {
    confirmRequest.value = request;
    return new Promise<boolean>((resolve) => {
      resolveConfirm = resolve;
    });
  }

  function answer(value: boolean): void {
    confirmRequest.value = null;
    resolveConfirm?.(value);
    resolveConfirm = null;
  }

  return { toasts, confirmRequest, toast, dismiss, confirm, answer };
});
