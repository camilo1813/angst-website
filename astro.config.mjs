import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

// Production: static site served from the domain root at https://angstdata.ai/
export default defineConfig({
  site: 'https://angstdata.ai',
  base: '/',
  output: 'static',
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'always' },
  server: {
    port: 4323,
  },

  // React integration retained for the archived experience components (not used on the homepage).
  integrations: [react()],
});
