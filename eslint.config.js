// ESLint flat config for the hagush.org.il static site.
// Dev-only: lints browser JS under docs/. No build step, no bundler.
import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default [
  // Never lint dependencies, data, or generated pages.
  {
    ignores: ["node_modules/**", "docs/candidates.json", "docs/ask_*.html"],
  },

  // Recommended correctness rules for all JS.
  js.configs.recommended,

  // Default: modern browser ES modules (tracker.js, dashboard/*.js load as type="module").
  {
    files: ["docs/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",
      eqeqeq: ["warn", "smart"],
      "prefer-const": "warn",
      "no-var": "warn",
    },
  },

  // app.js is a classic <script> (relies on global scope + document.currentScript),
  // so parse it as a script rather than a module.
  {
    files: ["docs/js/app.js"],
    languageOptions: {
      sourceType: "script",
    },
  },

  // Keep ESLint out of formatting's lane — Prettier owns whitespace/quotes/etc.
  prettier,
];
