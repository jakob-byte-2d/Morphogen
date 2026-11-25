// The engine is pure TypeScript with no DOM access, so it runs the same in
// the browser, in a Web Worker, in tests and on a server.
export * from "./world";
export { countOrganisms } from "./bonds";
export { hashWorld } from "./hash";
export { Rng, type RngState } from "./rng";
export * from "./genome";
export { GOLDEN } from "./golden";
