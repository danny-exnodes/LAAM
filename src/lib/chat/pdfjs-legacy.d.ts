// pdfjs ships no bundled .d.ts next to its legacy build, but the runtime API is
// identical to the modern "pdfjs-dist" entry. We import the legacy build (see
// pdf.ts loadPdfjs) because it is Babel-transpiled + core-js polyfilled for older
// browsers — notably iPhone Safari < 17.4, which lacks Promise.withResolvers that
// the modern pdfjs build hard-requires in both the main thread and the worker.
declare module "pdfjs-dist/legacy/build/pdf.min.mjs" {
  export * from "pdfjs-dist";
}
