# AWS Lambda delivery

The React app builds to a static Vite artifact. This project includes a Lambda
Function URL adapter because the requested deployment surface is Lambda. The
function serves `dist/` from its deployment package and falls back to
`index.html` for client-side routes.

The adapter serves existing assets directly and returns `index.html` for an
unknown browser path (for example, `/studio`), allowing the SPA to boot on a
direct navigation or refresh. Hash fragments such as `#studio` are handled in
the browser and are never sent to Lambda.

## Deploy

Use an authenticated AWS identity with Lambda and IAM permissions (the current
`pgo` user has direct administrator access; it is not attached to an IAM group):

```bash
AWS_REGION=us-east-1 ./scripts/deploy-lambda.sh
```

Optional variables:

- `LAMBDA_FUNCTION_NAME` (default `twinerun-frontend`)
- `LAMBDA_ROLE_NAME` (default `twinerun-frontend-execution`)
- `LAMBDA_ROLE_ARN` to reuse an existing Lambda execution role

The script creates only the named execution role when `LAMBDA_ROLE_ARN` is not
provided. It does not touch the unrelated S3 bucket or the ECS backend.

## Validate

The `frontendv1` GitHub Actions workflow builds with the browser-visible
`VITE_API_BASE_URL` value from the repository Actions variable (preferred) or
same-named secret, and enables `VITE_DEMO_AUTH_ENABLED=true` for the hosted
demo. It never supplies `VITE_DEMO_ACCESS_TOKEN` or backend provider/database
credentials to Vite. The workflow fails before deployment if the API URL is
missing or points anywhere other than the configured API Gateway origin.

After deployment, the script prints the Function URL. Check the document shell
and a direct browser path:

```bash
curl -fsS "https://YOUR_FUNCTION_URL/" | grep -F '<title>TwineRun — Operational AI Infrastructure</title>'
curl -fsS "https://YOUR_FUNCTION_URL/studio" | grep -F '<title>TwineRun — Operational AI Infrastructure</title>'
```

`#studio` is a browser fragment and is not sent to Lambda; opening that URL in a
browser loads the existing twinerun optimizer workspace through the same app.

