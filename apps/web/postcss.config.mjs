/**
 * Tailwind v4 runs through PostCSS. Utilities are generated from `app/` and `src/`
 * (see the `@source` directives in app/kassora.css), so every arbitrary value used by a
 * component exists in the emitted CSS. The previous setup imported a precompiled bundle from
 * another site and therefore dropped most of our utilities.
 *
 * @type {import('postcss-load-config').Config}
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;