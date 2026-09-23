declare module "bun:test" {
  export const describe: any;
  export const test: any;
  export const it: any;
  export const expect: any;
  export const beforeAll: any;
  export const afterAll: any;
  export const beforeEach: any;
  export const afterEach: any;
  export const mock: any;
  export const spyOn: any;
}

declare const Bun: {
  file(path: string | URL): {
    text(): Promise<string>;
    json(): Promise<unknown>;
    arrayBuffer(): Promise<ArrayBuffer>;
  };
};
