# Referral API

This Next.js API accepts referral details and a resume. Clerk authenticates the caller, and Prisma saves the referral and base64-encoded resume in Supabase Postgres.

## Test in your browser

1. Run `npm run dev` and open <http://localhost:3000>.
2. Signed-out users see a minimal login page explaining that this is an employee initiative, not Juspay's official referral portal, and that requests are verified by the referring employee before submission to the official portal. Click **Sign in** to continue to Clerk, then return to the referral form. Signed-in users see the form immediately.
   **Referral email** is automatically filled from the signed-in account's primary email. Users with a primary email at `@juspay.in` can edit it to refer any valid email; it stays read-only for everyone else. The API enforces the same rule using the account returned by Clerk.
3. Complete the form, choose an opening, and upload or drag in a resume. Click **Submit referral**.
4. A successful request displays **Referral submitted successfully.** with the current status. In Supabase's SQL Editor, verify the record and decoded resume size:

   ```sql
   select referral_email, referral_name, graduation_date, job_id,
          referral_role, referral_role_type, status, status_message,
          length(decode(resume_base64, 'base64')) as resume_bytes
   from public.referrals
   order by created_at desc
   limit 1;
   ```

Each email can have one referral. Clerk is used to sign in, but the referral row stores neither a generated ID nor a Clerk user ID.

The browser page sends the Clerk session automatically. You do not need to copy a token or type a file path for this test.

## Setup

1. Use Node.js 24 or newer. Create a Clerk application and a Supabase project.
2. Copy `.env.example` to `.env` and replace the placeholders:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`: your Clerk application keys.
   - `STATUS_UPDATE_SECRET`: a long random secret shared only with the system that updates referral statuses.
   - `DATABASE_URL`: Supabase's pooled Postgres connection string for the running API. The transaction pooler uses port `6543` and `pgbouncer=true`; the session pooler uses port `5432`. The example uses `uselibpqcompat=true&sslmode=require` so Node's PostgreSQL driver encrypts the connection without requiring a downloaded CA certificate.
   - `DIRECT_URL`: Supabase's direct Postgres connection string for Prisma migrations. If direct IPv6 access is unavailable, use the session pooler on port `5432`. Do not use the transaction pooler for migrations.
   - URL-encode special characters in the database password.
3. Install dependencies and apply the migration:

   ```sh
   npm install
   npm run db:migrate
   npm run dev
   ```

The Prisma migration creates `public.referrals`, enables row-level security, and revokes direct access from Supabase's `anon` and `authenticated` roles. The server writes through Prisma using its database connection after Clerk verifies the session. No Supabase API key is sent to the browser.

## API

Send a `multipart/form-data` POST to `/api/referrals` from a signed-in Clerk client. Clerk's session cookie is used for same-origin browser requests; clients using a Clerk session token can send it as a bearer token.

```sh
curl -X POST http://localhost:3000/api/referrals \
  -H "Authorization: Bearer YOUR_CLERK_SESSION_TOKEN" \
  -F 'referralName=Alex Doe' \
  -F 'graduationDate=2027-07-01' \
  -F 'jobId=DEV-BE02' \
  -F 'relationship=We worked together for two years.' \
  -F 'recommendation=Alex is an excellent problem solver.' \
  -F 'resume=@/path/to/resume.pdf'
```

All form fields in the example are required. `referralEmail` defaults to the signed-in Clerk user's primary email address. If that account email has the exact domain `juspay.in` (case-insensitive), an optional `referralEmail` form field can specify any valid email of at most 320 characters. Other accounts cannot override their email, even by changing the request. The saved email is trimmed and normalized to lowercase. Invalid supplied emails from Juspay users receive `400`. Accounts without a valid primary email receive `400`; an unavailable Clerk account lookup returns `503`. Submit `graduationDate` as `YYYY-MM-DD`; the server stores it as India Standard Time text, for example `2027-07-01` becomes `Thu Jul 01 2027 00:00:00 GMT+0530 (India Standard Time)` in `graduation_date`. The resume may be a PDF, DOC, or DOCX up to 5 MB. `jobId` must be an Engineering job ID from `lib/openings.js`; the browser dropdown shows each job's title, type, location, and ID. The server derives `referralRole` and `referralRoleType` from that ID, so clients cannot set mismatched values. For example, `DEV-BE02` stores `Software Development Engineer Backend` and `Intern`. Only one referral can be submitted per email. The API returns `401` without a valid Clerk user, `409` for a duplicate email, and `201` with `referralEmail`, `jobId`, `referralRole`, `referralRoleType`, `status`, and `createdAt` on success. New referrals start as `pending`. It never returns the resume contents.

The migration replaces `opening` with `job_id`, `referral_role`, and `referral_role_type`. Existing rows with a recognized job ID are backfilled. For older unrecognized opening values, the original text remains in `referral_role`, while `job_id` and `referral_role_type` stay null because their values cannot be determined.

## Update status from another system

Send a JSON `PATCH` to `/api/referrals/status` with the `x-referral-status-secret` header. The secret is in your local `.env` and must also be configured in the system making these requests.

```sh
curl -X PATCH http://localhost:3000/api/referrals/status \
  -H 'Content-Type: application/json' \
  -H 'x-referral-status-secret: YOUR_STATUS_UPDATE_SECRET' \
  -d '{"referralEmail":"alex@example.com","status":"failure"}'
```

Allowed statuses are `pending`, `success`, and `failure`. A `failure` update stores `Applied through LinkedIn` in `status_message` and returns that text in the response. Changing the status back to `pending` or `success` clears the message. Unknown emails return `404`; a missing or incorrect secret returns `401`.

Run `npm test` for request and persistence mapping tests, and `npm run build` to verify the Next.js build. A live Supabase write requires the configured project and migration.
