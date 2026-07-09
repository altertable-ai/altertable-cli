import { afterAll, beforeEach } from "bun:test";
import { deleteActiveWorkspacesAfterSuite, resetActiveWorkspacesBeforeTest } from "./helpers.ts";

beforeEach(async () => {
  await resetActiveWorkspacesBeforeTest();
});

afterAll(async () => {
  await deleteActiveWorkspacesAfterSuite();
});
