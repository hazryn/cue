import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import './assets/styles/main.css';
import { router } from './router';

createApp(App).use(createPinia()).use(router).mount('#app');
