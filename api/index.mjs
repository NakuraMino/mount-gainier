// Vercel serverless entry. An explicit rewrite in vercel.json sends every /api/*
// request (any depth) to this function, and an Express app is itself a (req, res)
// handler, so we just mount it. (Same approach as papers_web.)
import app from '../server/app.mjs';

export default app;
