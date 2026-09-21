<script setup lang="ts">
import Modal from './Modal.vue';
import { useUiStore } from '~/stores/ui';

const ui = useUiStore();
</script>

<template>
  <Modal v-if="ui.confirmRequest" :title="ui.confirmRequest.title" @close="ui.answer(false)">
    <p v-if="ui.confirmRequest.message" class="text-white/80">{{ ui.confirmRequest.message }}</p>
    <template #footer>
      <button data-testid="confirm-no" class="btn-ghost" @click="ui.answer(false)">
        {{ ui.confirmRequest.cancelLabel ?? 'Anuluj' }}
      </button>
      <button
        data-testid="confirm-yes"
        :class="ui.confirmRequest.danger ? 'btn-danger' : 'btn-primary'"
        @click="ui.answer(true)"
      >
        {{ ui.confirmRequest.confirmLabel ?? 'Potwierdzam' }}
      </button>
    </template>
  </Modal>
</template>
