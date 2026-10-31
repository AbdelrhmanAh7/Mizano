import '@testing-library/jest-dom';

// Polyfill ResizeObserver for jsdom (used by Radix UI components)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom has no scrollIntoView; cmdk (the searchable pickers) calls it on keyboard navigation.
// Suites on `@jest-environment node` (auth, NextAuth route) have no DOM at all.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
