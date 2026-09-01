# twinerun

twinerun is the public entry surface for the twinerun optimizer. The Vite app
opens on the twinerun landing experience and hands off to the existing interactive
optimizer studio at `#studio` (or from any **Launch TwineRun** button).

## Run locally

```bash
npm install
npm run dev
```

Production checks:

```bash
npm run lint
npm run build
```

The frontend reads its API origin from the browser-visible `VITE_API_BASE_URL`
build variable and falls back to `/api/v1` when it is not set. For the
`frontendv1` GitHub Actions deployment, configure exactly one of these in the
repository's **Settings → Secrets and variables → Actions**:

- **Variable** `VITE_API_BASE_URL` (preferred), or
- **Secret** `VITE_API_BASE_URL` (used only when the variable is absent).

The workflow passes only this value to `vite build`; it does not pass provider,
database, authentication, or other backend credentials to the frontend. The
value is embedded in the static browser bundle, so it must be an API origin or
path rather than a credential (for example, `https://api.example.com/api/v1`
or `/api/v1`).

## AWS Lambda delivery

The static Vite artifact can be packaged into a Lambda Function URL with:

```bash
AWS_REGION=us-east-1 ./scripts/deploy-lambda.sh
```

See [`docs/aws-lambda.md`](docs/aws-lambda.md) for the role, function, and
validation details. The deploy script is intentionally separate from the
frontend runtime and does not modify the ECS backend or unrelated S3 buckets.

