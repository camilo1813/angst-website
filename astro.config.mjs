import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

export default defineConfig({
  server: {
    port: 4323,
  },

  integrations: [react()],
});