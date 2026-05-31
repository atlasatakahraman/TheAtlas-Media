import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
    ...nextVitals,
    ...nextTs,
    {
        rules: {
            // ANIMATION.md R1: GPU-only animation. See plans/07_ANIMATION_PLAN.md.
            // TODO (D8 stamp): no clean flat-config way to assert absence of a
            // leading verification comment. Enforced by scripts/check-agents-rules.sh
            // instead. See plans/02_AGENTS_PLAN.md §3.4.
            "no-restricted-syntax": [
                "error",
                {
                    selector: "JSXAttribute[name.name='style'] Property[key.name=/^(transition|transitionProperty|animation|animationName)$/] Literal[value=/(width|height|top|left|right|bottom|padding|margin|border-width)/]",
                    message: "ANIMATION.md R1: animate only transform/opacity in inline styles. See plans/07_ANIMATION_PLAN.md.",
                },
                {
                    selector: "JSXAttribute[name.name='className'] Literal[value=/(^|\\s)transition-(all|width|height|top|left|right|bottom|padding|margin|spacing)(\\s|$)/]",
                    message: "ANIMATION.md R1: replace transition-all / transition-<geometry> with transition-transform or transition-opacity.",
                },
                {
                    selector: "JSXAttribute[name.name='className'] TemplateElement[value.raw=/(^|\\s)transition-(all|width|height|top|left|right|bottom|padding|margin|spacing)(\\s|$)/]",
                    message: "ANIMATION.md R1: replace transition-all / transition-<geometry> with transition-transform or transition-opacity.",
                },
            ],

            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: ["../src-tauri/*", "../../src-tauri/*", "../../../src-tauri/*"],
                            message: "Importing from src-tauri is forbidden. Use lib/api-contracts.gen.ts instead. See plans/04_SKILL_PLAN.md §5.",
                        },
                    ],
                },
            ],
        },
    },

    // Override default ignores of eslint-config-next.
    globalIgnores([
        // Default ignores of eslint-config-next:
        ".next/**",
        "out/**",
        "build/**",
        "next-env.d.ts",
    ]),
    // TODO: shadcn-generated components use transition-all by upstream
    // convention. Migrate to transition-transform / transition-opacity
    // file by file in a separate ANIMATION cleanup PR. Tracked in
    // docs/known-issues.md.
    {
        files: [
            "src/components/ui/**/*.{ts,tsx}",
            "src/hooks/use-mobile.ts",
        ],
        rules: {
            "no-restricted-syntax":                 "warn",
            "react-hooks/set-state-in-effect":      "warn",
            "@typescript-eslint/no-explicit-any":   "warn",
        },
    }
]);

export default eslintConfig;

