'use strict';

// Vercel serverless entrypoint. Uses an ephemeral DB (in /tmp), auto-seeds the
// demo data on first request, and exports the Express app.

process.env.APP_DB_PATH = process.env.APP_DB_PATH || '/tmp/app.db';

const { getDb } = require('../server/db');
const { seedIfEmpty } = require('../demo/seed');
const { createApp } = require('../server/app');

getDb();
seedIfEmpty();

module.exports = createApp();
