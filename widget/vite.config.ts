import { defineConfig } from 'vite';
import { resolve } from 'path';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.tsx'),
      name: 'MiAgentWidget',
      fileName: () => 'widget.js',
      formats: ['iife'],
    },
    outDir: resolve(__dirname, '../frontend/public'),
    emptyOutDir: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
      },
    },
  },
  esbuild: {
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  },
});
