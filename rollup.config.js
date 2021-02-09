export default [
  {
    input: [
      "build/index.js",
      "build/jsx-runtime",
      "build/jsx-dev-runtime",
      "build/test-utils.js",
    ],
    output: [
      { dir: "dist/", format: "cjs", chunkFileNames: "core.js" },
      { dir: "dist/esm", format: "esm", chunkFileNames: "core.js" },
    ],
  },
];
