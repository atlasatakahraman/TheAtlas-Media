# Skill: adding shadcn components

The project uses `shadcn@4.8` with `tw-animate-css` + Tailwind v4 + Base UI + Radix.

To add a component:

```bash
bunx shadcn@4.8 add <component>
```

After the install, **diff** the change. The generator may pull in dev-only deps or modify `components.json` in unwanted ways — revert anything outside `components/ui/<component>/`.

Animation in generated components: many shadcn defaults use `transition-all` or `data-[state=open]:animate-...`. Replace `transition-all` with `transition-transform` / `transition-opacity` per Plan 07 R1. The provided Radix/Base UI primitives that animate via `data-state` are usually GPU-only already — verify before merging.

Custom theme colors from `globals.css` are already wired; do not introduce new CSS variables.
