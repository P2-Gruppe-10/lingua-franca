// @ts-check

import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
    js.configs.recommended,
    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: ["eslint.config.js"],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        extends: [
            tseslint.configs.stylisticTypeChecked,
            tseslint.configs.strictTypeChecked,
        ],
        ignores: ["./**/*.test.ts"],
    }
);
