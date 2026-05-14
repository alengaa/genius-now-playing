// vite.config.js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
	plugins: [vue()],
	build: {
		rollupOptions: {
			input: {
				main: resolve(__dirname, 'index.html'),
				background: resolve(__dirname, 'src/background/index.js'),
				content: resolve(__dirname, 'src/content/index.js'),
			},
			output: {
				entryFileNames: 'assets/[name].js',
			},
		},
	},
});
