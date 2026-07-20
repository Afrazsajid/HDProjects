<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project Notes

- Runtime app code lives in `src/app`.
- Do not run the scheduler inside Next.js route handlers, pages, layouts or server components.
- Use `npm run dev` to start both the web process and scheduler worker.
- SQLite data is local-only in `data/database.db` and must not be committed.
