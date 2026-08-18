// next@16.2.9 — verified against node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md on 2026-08-19

/**
 * Route shell for the dependency manager.
 *
 * Deliberately does not own scrolling — `#page-content-container` in
 * `AppView` is already the scroll container, and a second one here would
 * nest two scrollbars.
 */
export default function Layout({ children }: React.PropsWithChildren) {
	return <div className="flex-1 min-w-0">{children}</div>;
}
