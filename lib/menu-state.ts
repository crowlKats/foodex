import { signal } from "@preact/signals";

/**
 * Id of the top-bar dropdown that is currently open, or null when all are
 * closed. Shared between the NavDropdown and WelcomeTour islands: the tour
 * opens a menu to ring the items inside it, and only one menu is ever open.
 */
export const openMenu = signal<string | null>(null);

/**
 * While the tour is pointing at a menu item, taps outside the panel (on the
 * tour card, say) must not close the menu.
 */
export const menuPinnedByTour = signal(false);
