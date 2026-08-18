import { createElement } from "react";
import { ICONS, type IconName } from "./icons";

export type NavIconProps = {
	name?: IconName;
	className?: string;
};

/**
 * Renders a registry icon by name.
 *
 * Built with `createElement` rather than `<Component />`: assigning a component
 * to a local and rendering it as JSX is indistinguishable, to the compiler's
 * static-components rule, from defining a new component inside render — which
 * would reset its state every pass. Nothing is being created here, only looked
 * up from a frozen map, and this spelling says so.
 */
export default function NavIcon({ name, className }: NavIconProps) {
	if (!name) return null;

	const component = ICONS[name];
	if (!component) return null;

	return createElement(component, { className });
}
