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

## AWS Lambda delivery

The static Vite artifact can be packaged into a Lambda Function URL with:

```bash
AWS_REGION=us-east-1 ./scripts/deploy-lambda.sh
```

See [`docs/aws-lambda.md`](docs/aws-lambda.md) for the role, function, and
validation details. The deploy script is intentionally separate from the
frontend runtime and does not modify the ECS backend or unrelated S3 buckets.

