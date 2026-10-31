/**
 * Full-page navigation to another site, such as the AI app's return address after consent.
 * Its own module so tests can mock it (jsdom does not allow redefining window.location).
 */
export function leavePage(url: string): void {
  window.location.assign(url);
}
