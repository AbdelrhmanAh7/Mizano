declare module 'ofx-js' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function parse(content: string): Promise<any>;
}
