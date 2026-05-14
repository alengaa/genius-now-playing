import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import webExtension from 'vite-plugin-web-extension';
import { resolve } from 'path';

export default defineConfig({
	plugins: [
		vue(),
		webExtension({
			// The plugin treats this file as the entry point for the whole project
			manifest: resolve(__dirname, 'manifest.json'),
			watch: true,
		}),
	],
	build: {
		// Ensures the output folder is fresh every time
		outDir: resolve(__dirname, 'dist'),
		emptyOutDir: true,
	},
});
