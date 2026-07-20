# H&D Shift Messenger

Localhost-first workforce shift messaging and attendance operations for H&D Recruitment.

## Stack

- Next.js App Router with TypeScript strict mode
- Tailwind CSS and local shadcn-style primitives
- Prisma 7 with SQLite at `data/database.db`
- Dedicated scheduler worker via `tsx`
- OpenWA localhost integration at `http://localhost:2785`
- Optional Google Sheets parsing support

## Local Setup

```bash
npm install
npm run db:generate
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script --output prisma/migrations/20260719174700_init/migration.sql
npm run db:seed
npm run dev
```

`npm run dev` starts both processes:

- `next dev`
- `tsx watch src/worker/index.ts`

The app is served at `http://localhost:3000`.

## OpenWA

Expected local OpenWA settings:

```text
OPENWA_BASE_URL=http://localhost:2785
OPENWA_SESSION_ID=hd-main
```

The SDK base URL intentionally excludes `/api`. Raw REST fallback sends to:

```text
POST /api/sessions/{sessionId}/messages/send-text
```

with `X-API-Key`.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Secrets

Do not commit:

- `.env`
- `data/database.db`
- Google credential JSON files
- OpenWA API keys
- session credentials

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
