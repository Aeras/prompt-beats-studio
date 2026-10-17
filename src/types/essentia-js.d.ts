declare module "essentia.js/dist/essentia.js-core.es.js" {
  const Essentia: new (wasm: unknown) => any;
  export default Essentia;
}

declare module "essentia.js/dist/essentia-wasm.es.js" {
  export const EssentiaWASM: unknown;
}
