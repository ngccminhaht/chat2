import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'MiAgentWidget',
      fileName: () => 'widget.js',
      formats: ['iife'], // Single global bundle
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true, // Bundle everything for IIFE
      },
    },
    minify: 'esbuild',
    target: 'es2020',
    sourcemap: false,
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});
