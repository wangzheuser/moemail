---
name: moemail-cloudflare-deploy
description: Use when deploying this MoeMail repository to Cloudflare Pages, D1, KV, Email Routing, Email Worker, Cleanup Worker, or when configuring custom domains and production deployment verification for this project.
---

# MoeMail Cloudflare Deploy

## Scope

Use this skill only inside `/Users/777java/777/projects/github/moemail` for Cloudflare deployment and production verification tasks.

## Safety rules

Ask for explicit confirmation before mutating remote Cloudflare resources. High-risk actions include:

- creating or changing D1, KV, Pages, Workers, DNS, Email Routing, or Pages secrets
- running remote D1 migrations
- changing Email Routing catch-all
- pushing code or creating commits

Never print API tokens, OAuth secrets, `AUTH_SECRET`, or raw `.env` contents.

## Production shape

Current project deployment consists of:

- Cloudflare Pages: Next.js app
- Cloudflare D1: application database
- Cloudflare KV binding `SITE_CONFIG`: site settings
- Email Worker: receives inbound mail
- Cleanup Worker: scheduled cleanup job
- Email Routing: routes inbound domain mail to the Email Worker

Known names used by this deployment:

| Resource | Name |
|---|---|
| Pages project | `moemail` |
| Website domain | `moemail.codeai.de5.net` |
| Email domain | `codeai.de5.net` |
| D1 database | `moemail-db` |
| KV namespace | `moemail-kv` |
| Email Worker | `email-receiver-worker` |
| Cleanup Worker | `cleanup-worker` |

## Local configuration

Read deployment values from project `.env`. Required for deployment:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
PROJECT_NAME
DATABASE_NAME
KV_NAMESPACE_NAME
CUSTOM_DOMAIN
AUTH_SECRET
```

Optional but useful after first deployment:

```text
DATABASE_ID
KV_NAMESPACE_ID
AUTH_GITHUB_ID
AUTH_GITHUB_SECRET
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
```

`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are also runtime Pages secrets because the admin profile can sync email domains from Cloudflare. The deployment script must push them to Pages without printing values.

`DATABASE_ID` and `KV_NAMESPACE_ID` can be discovered or created by the deployment script and then written back to `.env`.

## Critical known pitfalls

1. Cloudflare SDK must use API token auth:

```ts
new Cloudflare({ apiToken: CF_API_TOKEN })
```

Do not pass `CLOUDFLARE_API_TOKEN` as `apiKey`; that treats it like a Global API Key and causes 401 errors.

2. `dotenv/config` does not override already-set process environment variables. If the shell has an old `CLOUDFLARE_API_TOKEN`, deployment may use the wrong token. Prefer commands that load `.env` explicitly or unset inherited values first.

3. `moemail.codeai.de5.net` is the website domain. Email addresses should use `@codeai.de5.net`, not `@moemail.codeai.de5.net`.

4. The Email Routing catch-all for `codeai.de5.net` is expected to point to `email-receiver-worker`. Changing it may disrupt any previous mail handler.

## Preflight checks

Before deployment:

1. Inspect branch and worktree:

```bash
git branch --show-current
git status --short
```

2. Confirm `.env` exists and only print key presence, never values.

3. Verify token capability with Cloudflare API:

- token verify succeeds
- target account is accessible
- D1 list works
- KV list works
- Pages list works
- Email Routing endpoints work if configuring mail routing

4. For production safety, run a local build when code changed:

```bash
pnpm run build
pnpm run build:pages
```

Existing warnings about React Hook dependencies and large PWA font cache are known project warnings unless new errors appear.

## Full deployment

Use full deployment only after explicit confirmation, because it can create remote resources, push secrets, deploy workers, and run remote D1 migrations.

To avoid inheriting stale environment variables:

```bash
unset CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID DATABASE_ID KV_NAMESPACE_ID CUSTOM_DOMAIN PROJECT_NAME DATABASE_NAME KV_NAMESPACE_NAME AUTH_GITHUB_ID AUTH_GITHUB_SECRET AUTH_GOOGLE_ID AUTH_GOOGLE_SECRET AUTH_SECRET
pnpm dlx tsx ./scripts/deploy/index.ts
```

The project script performs:

1. setup `wrangler.json`, `wrangler.email.json`, `wrangler.cleanup.json`
2. create or reuse D1
3. apply remote D1 migrations
4. create or reuse KV
5. create or reuse Pages
6. push Pages secrets, including `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
7. deploy Pages
8. deploy Email Worker
9. deploy Cleanup Worker

If D1 or KV IDs are created, write them back to `.env` without printing secrets.

## Pages-only deployment

Use this when only app code changed and D1/KV/Workers do not need changes.

If runtime Pages secrets changed or new runtime env keys were added, push only the required keys first. Never print values:

```bash
node --input-type=module - <<'NODE'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const required = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'AUTH_SECRET']
const envFile = {}
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (!match || !required.includes(match[1])) continue
  let value = match[2].trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  if (value) envFile[match[1]] = value
}

const missing = required.filter((key) => !envFile[key])
if (missing.length) {
  console.error(`Missing required runtime secrets: ${missing.join(', ')}`)
  process.exit(1)
}

fs.writeFileSync('.env.runtime.json', JSON.stringify(envFile, null, 2))
const result = spawnSync('pnpm', ['dlx', 'wrangler', 'pages', 'secret', 'bulk', '.env.runtime.json'], {
  cwd: process.cwd(),
  stdio: 'inherit',
})
fs.rmSync('.env.runtime.json', { force: true })
process.exit(result.status ?? 1)
NODE
```

Load `.env` into the child process so stale shell variables do not win:

```bash
node --input-type=module - <<'NODE'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const envPath = '.env'
const envFile = {}
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (!match) continue
  let value = match[2].trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  envFile[match[1]] = value
}

const result = spawnSync('pnpm', ['run', 'deploy:pages'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: { ...process.env, ...envFile },
})
process.exit(result.status ?? 1)
NODE
```

## Email Routing workflow

Desired state:

```text
*@codeai.de5.net -> email-receiver-worker
```

Before changing Email Routing:

1. Inspect zone `codeai.de5.net`.
2. Inspect current Email Routing settings.
3. Inspect current catch-all rule.
4. Warn the user if catch-all points to any Worker other than `email-receiver-worker`.
5. Ask explicit confirmation before overwriting catch-all.

After confirmation, set catch-all action to:

```json
{
  "name": "MoeMail Catch-all Worker",
  "enabled": true,
  "matchers": [{ "type": "all" }],
  "actions": [{ "type": "worker", "value": ["email-receiver-worker"] }]
}
```

Ensure KV site config includes:

```text
EMAIL_DOMAINS=codeai.de5.net
```

Verify public MX records:

```bash
dig @1.1.1.1 +short MX codeai.de5.net | sort
dig @8.8.8.8 +short MX codeai.de5.net | sort
```

Expected Cloudflare MX targets:

```text
route1.mx.cloudflare.net.
route2.mx.cloudflare.net.
route3.mx.cloudflare.net.
```

## Post-deploy verification

Verify after deployment:

```bash
curl -I -L --max-time 30 https://moemail.codeai.de5.net
```

Also check:

- latest Pages deployment URL from Wrangler output
- Pages custom domain status if relevant
- `/api/auth/register` smoke test after registration-related changes
- Email Routing status: enabled and ready
- catch-all points to `email-receiver-worker`
- KV `EMAIL_DOMAINS` is `codeai.de5.net`
- D1 migrations completed if full deployment ran

## Git rules for this repository

Do not commit unless explicitly asked. When committing, the commit subject after any Conventional Commit prefix must be Simplified Chinese, for example:

```text
feat: 增加注册开关并修复 Cloudflare API 鉴权
```

After every commit, run:

```bash
git log -1 --pretty=%s
```

and verify the subject is compliant.
