import { terser } from "rollup-plugin-terser";

export default {
  input: "build/index.js",
  output: [
    { file: "dist/ureact.js", format: "cjs" },
    { file: "dist/ureact.min.js", format: "cjs", plugins: [terser()] },
    { file: "dist/ureact.esm.js", format: "esm", plugins: [terser()] },
  ],
};
