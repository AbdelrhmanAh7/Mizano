/**
 * Public web origin for canonical links, share cards, robots and sitemap. `NEXT_PUBLIC_APP_URL` is
 * inlined when the image is built (Dockerfile build arg); a server-rendered page falls back to the
 * NEXTAUTH_URL the deployment already sets, so links never point at another product's domain.
 */
export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    'http://localhost:5001'
  ).replace(/\/+$/, '');
}
