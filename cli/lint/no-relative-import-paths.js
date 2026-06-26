import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const eslintPlugin = require("eslint-plugin-no-relative-import-paths");

const plugin = {
  ...eslintPlugin,
  meta: {
    ...eslintPlugin.meta,
    name: "no-relative-import-paths",
  },
};

export default plugin;
