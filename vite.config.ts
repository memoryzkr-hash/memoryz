import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
  // timetable-app/ is a separate Expo project with its own tests.
  test: { exclude: [...configDefaults.exclude, 'timetable-app/**'] },
});
