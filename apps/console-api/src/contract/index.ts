/**
 * The REST contract: everything the Console and the routes both have to agree
 * about, and the only place either of them should be importing shapes from.
 *
 * Zod is the single source. The OpenAPI document in `openapi.json` is
 * generated from these schemas, and the Console reads its types off them
 * rather than restating them — so there is one definition of a Light, and the
 * document, the validation and the browser's types cannot drift apart.
 */
export * from "./acknowledgement.js";
export * from "./command.js";
export * from "./errors.js";
export * from "./light.js";
export * from "./login.js";

// `openapi.ts` is deliberately not re-exported. It is how the document is
// built, not something a route or a browser has any use for, and importing it
// from here would put the whole document in front of every consumer of a
// Light. Import it directly if you are generating the document.
