declare module 'muuri' {
  export default class Muuri {
    constructor(element: HTMLElement | string, options?: Record<string, unknown>);
    refreshItems(items?: unknown[]): this;
    layout(instant?: boolean, callback?: () => void): this;
    synchronize(): this;
    destroy(removeElements?: boolean): this;
  }
}
