import page from "./index.html";
import { serveLocalApp } from "@altertable/data-app-runtime/local";
import { operations } from "./operations.ts";
import app from "../app.json";

serveLocalApp({ page, operations, title: app.title });
