# AWS Lambda delivery

The React app builds to a static Vite artifact. This project includes a Lambda
Function URL adapter because the requested deployment surface is Lambda. The
function serves `dist/` from its deployment package and falls back to
`index.html` for client-side routes.

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

After deployment, the script prints the Function URL. Check the document shell
and the workspace handoff:

```bash
curl -I "https://YOUR_FUNCTION_URL/"
curl -I "https://YOUR_FUNCTION_URL/#studio"
```

`#studio` is a browser fragment and is not sent to Lambda; opening that URL in a
browser loads the existing twinerun optimizer workspace through the same app.

