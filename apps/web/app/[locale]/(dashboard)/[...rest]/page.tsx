import { notFound } from 'next/navigation';

/**
 * Any address under a locale that matches no page lands here, so it renders the translated
 * dashboard "page not found" (../not-found.tsx) inside the app shell instead of Next's built-in
 * English 404 (an Arabic user typing a wrong Accounting address saw English).
 */
export default function UnknownPage(): never {
  notFound();
}
