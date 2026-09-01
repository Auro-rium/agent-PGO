#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
FUNCTION_NAME="${LAMBDA_FUNCTION_NAME:-agentpgo-frontend}"
ROLE_NAME="${LAMBDA_ROLE_NAME:-agentpgo-frontend-execution}"
ROLE_ARN="${LAMBDA_ROLE_ARN:-}"
PACKAGE_DIR="$ROOT_DIR/.lambda-package"
ZIP_PATH="$ROOT_DIR/.lambda-package.zip"

command -v aws >/dev/null || { echo "aws CLI is required" >&2; exit 1; }
command -v npm >/dev/null || { echo "npm is required" >&2; exit 1; }
command -v zip >/dev/null || { echo "zip is required" >&2; exit 1; }

cd "$ROOT_DIR"
npm install --no-audit --no-fund
npm run build

rm -rf "$PACKAGE_DIR" "$ZIP_PATH"
mkdir -p "$PACKAGE_DIR/site"
cp -R dist/. "$PACKAGE_DIR/site/"
cp lambda/handler.py "$PACKAGE_DIR/handler.py"
(cd "$PACKAGE_DIR" && zip -qr "$ZIP_PATH" .)

if [[ -z "$ROLE_ARN" ]]; then
  ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text --region "$REGION" 2>/dev/null || true)"
fi

if [[ -z "$ROLE_ARN" || "$ROLE_ARN" == "None" ]]; then
  TRUST_FILE="$(mktemp)"
  trap 'rm -f "$TRUST_FILE"' EXIT
  cat >"$TRUST_FILE" <<'JSON'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON
  ROLE_ARN="$(aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document "file://$TRUST_FILE" --description "Execution role for the TwineRun frontend" --query 'Role.Arn' --output text --region "$REGION")"
  aws iam attach-role-policy --role-name "$ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole --region "$REGION"
  sleep 8
fi

if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FUNCTION_NAME" --zip-file "fileb://$ZIP_PATH" --publish --region "$REGION" >/dev/null
  aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION"
  aws lambda update-function-configuration --function-name "$FUNCTION_NAME" --runtime python3.12 --handler handler.lambda_handler --memory-size 256 --timeout 10 --role "$ROLE_ARN" --region "$REGION" >/dev/null
  aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION"
else
  aws lambda create-function --function-name "$FUNCTION_NAME" --runtime python3.12 --handler handler.lambda_handler --memory-size 256 --timeout 10 --role "$ROLE_ARN" --zip-file "fileb://$ZIP_PATH" --publish --region "$REGION" >/dev/null
  aws lambda wait function-active-v2 --function-name "$FUNCTION_NAME" --region "$REGION"
fi

if ! aws lambda get-function-url-config --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
  aws lambda create-function-url-config --function-name "$FUNCTION_NAME" --auth-type NONE --cors 'AllowOrigins=["*"],AllowMethods=["GET","HEAD"],AllowHeaders=["*"],MaxAge=86400' --region "$REGION" >/dev/null
fi

aws lambda add-permission --function-name "$FUNCTION_NAME" --statement-id FunctionURLAllowPublicAccess --action lambda:InvokeFunctionUrl --principal '*' --function-url-auth-type NONE --region "$REGION" >/dev/null 2>&1 || true
aws lambda add-permission --function-name "$FUNCTION_NAME" --statement-id FunctionURLAllowPublicInvoke --action lambda:InvokeFunction --principal '*' --region "$REGION" >/dev/null 2>&1 || true

URL="$(aws lambda get-function-url-config --function-name "$FUNCTION_NAME" --query 'FunctionUrl' --output text --region "$REGION")"
echo "TwineRun frontend deployed: $URL"
echo "Function: $FUNCTION_NAME"
echo "Region: $REGION"

