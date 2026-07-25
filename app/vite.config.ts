import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Published as a GitHub Pages *project* page (https://owlyfans.github.io/GregLineMaker/), not a
  // user/org root page - built asset URLs need this subpath prefix or they 404 once deployed.
  // `base` affects the dev server too (not just the build), so this is build-only - the user's own
  // `npx vite --port 5183` dev workflow keeps serving from "/" like today, unaffected.
  base: command === 'build' ? '/GregLineMaker/' : '/',
}))
