import { connectionCheck } from "@altertable/data-app/contract";
import app from "#app/config.ts";

/** Connectivity probe only: its successful query supplies no analytical result. Replace it with
 * bounded, validated operations that cover the questions the finished app will answer. */
export const operations = { connection: connectionCheck(app.queries) };
