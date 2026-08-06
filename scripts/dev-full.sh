#!/usr/bin/env bash
# Local dev with working photo uploads: runs a mock S3 (s3rver) alongside the
# dev server. Point .env at it:
#   S3_ENDPOINT=http://127.0.0.1:4568
#   S3_ACCESS_KEY_ID=S3RVER
#   S3_SECRET_ACCESS_KEY=S3RVER
#   S3_BUCKET=foodex
#   S3_REGION=us-east-1
set -euo pipefail
trap 'kill 0' INT TERM EXIT
mkdir -p .s3data
npx --yes s3rver --directory .s3data --configure-bucket foodex \
  --address 127.0.0.1 --port 4568 &
deno task dev
