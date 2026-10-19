import { serveLocalApp } from '@altertable/data-app-bun';

import app from '#app/config.ts';
import page from '#app/index.html';
import { operations } from '#app/operations.ts';

serveLocalApp({ page, operations, title: app.title });
