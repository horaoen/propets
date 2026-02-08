#!/usr/bin/env bash
set -euo pipefail

cd backend
go test ./...

cd ../frontend
npx vitest run
