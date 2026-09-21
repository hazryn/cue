import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('~/views/Home.vue') },
  { path: '/tv', name: 'tv', component: () => import('~/views/Tv.vue') },
  { path: '/admin', name: 'admin', component: () => import('~/views/Admin.vue') },
  { path: '/play', name: 'play', component: () => import('~/views/Play.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({ history: createWebHistory(), routes });
