import { defineStore } from 'pinia';
import { ref } from 'vue';
import { http } from '~/api/http';
import { useUiStore } from './ui';

export interface Answer {
  id?: string;
  text: string;
  weight: number;
  position?: number;
}

export interface Question {
  id: string;
  packId: string;
  kind: 'MAIN' | 'FINAL';
  text: string;
  note: string | null;
  sortOrder: number;
  isArchived: boolean;
  answers: Answer[];
}

export interface Pack {
  id: string;
  name: string;
  description: string | null;
  color: string;
  sortOrder: number;
}

export const useCatalogStore = defineStore('catalog', () => {
  const ui = useUiStore();
  const packs = ref<Pack[]>([]);
  const stats = ref<Record<string, { main: number; final: number }>>({});
  const questions = ref<Question[]>([]);
  const loading = ref(false);

  async function loadPacks(): Promise<void> {
    packs.value = await http.get<Pack[]>('/api/admin/catalog/packs');
    const rows = await http.get<Array<{ packId: string; main: number; final: number }>>(
      '/api/admin/catalog/packs/stats',
    );
    stats.value = Object.fromEntries(rows.map((r) => [r.packId, { main: r.main, final: r.final }]));
  }

  async function savePack(pack: Partial<Pack> & { id?: string }): Promise<boolean> {
    const body = {
      name: pack.name,
      description: pack.description ?? undefined,
      color: pack.color ?? undefined,
      sortOrder: pack.sortOrder ?? 0,
    };
    try {
      if (pack.id) await http.put(`/api/admin/catalog/packs/${pack.id}`, body);
      else await http.post('/api/admin/catalog/packs', body);
      await loadPacks();
      ui.toast('Zapisano pakiet', 'success');
      return true;
    } catch (error) {
      ui.toast(error instanceof Error ? error.message : 'Nie udało się zapisać pakietu', 'error');
      return false;
    }
  }

  /** Backend odmawia usunięcia pakietu, w którym są jeszcze pytania. */
  async function deletePack(id: string): Promise<boolean> {
    try {
      await http.del(`/api/admin/catalog/packs/${id}`);
      await loadPacks();
      ui.toast('Usunięto pakiet', 'success');
      return true;
    } catch (error) {
      ui.toast(error instanceof Error ? error.message : 'Nie udało się usunąć pakietu', 'error');
      return false;
    }
  }

  async function loadQuestions(packId?: string, kind?: 'MAIN' | 'FINAL'): Promise<void> {
    loading.value = true;
    try {
      const params = new URLSearchParams();
      if (packId) params.set('packId', packId);
      if (kind) params.set('kind', kind);
      const query = params.toString();
      questions.value = await http.get<Question[]>(`/api/admin/catalog/questions${query ? `?${query}` : ''}`);
    } finally {
      loading.value = false;
    }
  }

  async function saveQuestion(question: Partial<Question> & { id?: string }): Promise<boolean> {
    const body = {
      packId: question.packId,
      kind: question.kind,
      text: question.text,
      note: question.note ?? undefined,
      answers: (question.answers ?? []).map((a) => ({ text: a.text, weight: a.weight })),
    };
    try {
      if (question.id) await http.put(`/api/admin/catalog/questions/${question.id}`, body);
      else await http.post('/api/admin/catalog/questions', body);
      ui.toast('Zapisano pytanie', 'success');
      return true;
    } catch (error) {
      ui.toast(error instanceof Error ? error.message : 'Nie udało się zapisać', 'error');
      return false;
    }
  }

  async function deleteQuestion(id: string): Promise<void> {
    await http.del(`/api/admin/catalog/questions/${id}`);
    questions.value = questions.value.filter((q) => q.id !== id);
    ui.toast('Usunięto pytanie', 'success');
  }

  /** Podgląd parsowania wklejonego bloku — admin widzi wynik, zanim zapisze. */
  async function previewImport(packId: string, kind: 'MAIN' | 'FINAL', text: string) {
    return http.post<{ text: string; answers: Answer[] }>('/api/admin/catalog/import/preview', {
      packId,
      kind,
      text,
    });
  }

  async function importQuestion(packId: string, kind: 'MAIN' | 'FINAL', text: string): Promise<boolean> {
    try {
      await http.post('/api/admin/catalog/import', { packId, kind, text });
      ui.toast('Zaimportowano pytanie', 'success');
      return true;
    } catch (error) {
      ui.toast(error instanceof Error ? error.message : 'Nie udało się zaimportować', 'error');
      return false;
    }
  }

  return {
    packs,
    stats,
    questions,
    loading,
    loadPacks,
    savePack,
    deletePack,
    loadQuestions,
    saveQuestion,
    deleteQuestion,
    previewImport,
    importQuestion,
  };
});
