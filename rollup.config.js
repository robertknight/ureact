export default [
  {
    input: [
      "build/index.js",
      "build/enzyme.js",
      "build/jsx-runtime",
      "build/jsx-dev-runtime",
      "build/test-utils.js",
    ],
    output: [
      { dir: "dist/", format: "esm", chunkFileNames: "core.js" },
    ],
  },
];
