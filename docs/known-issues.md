# Known Issues

🟡 transition-all in shadcn-generated components
   Files: `src/components/ui/{input-otp,navigation-menu,sidebar,…}.tsx`
   Plan: Fix in a dedicated ANIMATION cleanup PR before v0.1.0 release.
   Tracking: this entry.

🟡 react-hooks/set-state-in-effect warnings in shadcn components
   Files: `src/components/ui/` and `src/hooks/`
   Plan: These are React 19 warnings inherited from Shadcn upstream code. Will be addressed via upstream updates or manual refactoring before v0.1.0.

🟡 React 19 set-state-in-effect and no-explicit-any in shadcn vendored code
   Files: src/components/ui/carousel.tsx, src/hooks/use-mobile.ts,
          src/components/ui/input.tsx
   Plan: Track upstream shadcn updates; fix here only if no upstream fix
         arrives by v0.1.0. These are inherent to the upstream component
         shape and not appropriate for us to fork-and-patch.
   Tracking: this entry.
