import { afterAll, beforeEach } from "bun:test";
import { deleteActiveWorkspaces, resetActiveWorkspaces } from "./helpers.ts";

beforeEach(async () => {
  await resetActiveWorkspaces();
});

afterAll(async () => {
  await deleteActiveWorkspaces();
});
