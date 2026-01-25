import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

const sharedGlobals = {
    ...globals.browser,
    ...globals.node,
    ToolBoxAPI: "readonly",
};

export default [
    {
        ignores: ["dist/**", "node_modules/**"],
    },
    {
        languageOptions: {
            globals: sharedGlobals,
        },
    },
    js.configs.recommended,
    {
        files: ["src/**/*.{ts,tsx}"],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: "latest",
                sourceType: "module",
            },
            globals: sharedGlobals,
        },
        plugins: {
            "@typescript-eslint": tseslint,
            "react-hooks": reactHooks,
        },
        rules: {
            ...tseslint.configs.recommended.rules,
            ...reactHooks.configs.recommended.rules,
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                },
            ],
            "@typescript-eslint/no-explicit-any": "off",
        },
    },
];
