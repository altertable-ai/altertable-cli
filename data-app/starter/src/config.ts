import { parseAppearance } from "@altertable/data-app/appearance";
import type { DataAppConfig } from "@altertable/data-app/config";
import app from "#config";

export default {
  title: app.title,
  scope: app.scope,
  appearance: parseAppearance(app.appearance),
} satisfies DataAppConfig;
