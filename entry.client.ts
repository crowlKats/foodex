// Extra runtime validation while developing: invalid DOM nesting, hooks called
// outside a component, duplicate/missing keys, `undefined` components, and
// readable component stacks on errors.
//
// Awaited so its `preact.options` hooks are installed before the islands boot
// bundle — a later module script, which therefore waits on this one — starts
// hydrating. Vite replaces `import.meta.env.DEV` with a literal, so the branch
// and the import drop out of production builds.
if (import.meta.env.DEV) {
  await import("preact/debug");
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
