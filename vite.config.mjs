import { defineConfig } from 'vite';
export default defineConfig({server:{port:1420,strictPort:true},build:{rollupOptions:{input:{main:'index.html',settings:'settings.html'}}}});
