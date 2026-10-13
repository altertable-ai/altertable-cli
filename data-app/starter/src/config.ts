import { defineDataApp } from "@altertable/data-app";
import { parseAppearance } from "@altertable/data-app/appearance";
import app from "#config";

export default defineDataApp({
  title: app.title,
  description: "Verify the configured lakehouse connection before authoring an exploration.",
  scope: app.scope,
  appearance: parseAppearance(app.appearance),
  queries: {
    connection: {
      statement: "SELECT 1 AS connection_check",
      params: {},
    },
  },
});
