#!/usr/bin/env bash
#
# generate-commit-messages.sh
#
# Prints a set of 19 realistic, conventional-commit style messages that reflect
# how the EstateFlow CRM backend was built, module by module.
#
# This script is NON-DESTRUCTIVE: it only prints the messages to stdout.
# It does NOT create commits, rewrite history, or push anything.
#
# Usage:
#   ./scripts/generate-commit-messages.sh          # print numbered messages
#   ./scripts/generate-commit-messages.sh --plain  # print raw messages (one per line)
#
set -euo pipefail

COMMIT_MESSAGES=(
  "chore: scaffold NestJS project with TypeScript, ESLint and Prettier"
  "chore(docker): add Dockerfile and docker-compose for PostgreSQL and API"
  "feat(config): add typed configuration loader and environment validation"
  "feat(prisma): add Prisma schema with User and Property models"
  "feat(prisma): add PrismaService and register a global PrismaModule"
  "feat(common): add consistent API response envelope and transform interceptor"
  "feat(common): add global exception filter with Prisma error mapping"
  "feat(common): add CurrentUser and Roles decorators with a RolesGuard"
  "feat(auth): implement JWT register and login endpoints with bcrypt hashing"
  "feat(auth): add Passport JWT strategy and JwtAuthGuard for protected routes"
  "feat(users): add users module with admin-only user management"
  "feat(properties): add properties CRUD with owner-based access rules"
  "feat(clients): add clients CRUD with creator scoping"
  "feat(db): add seed data for admin, agents, properties and clients"
  "docs: set up Swagger API documentation and write project README"
  "test(api): add automated API smoke-test script using Axios"
  "feat(leads): add lead management module with pagination and status filtering"
  "feat(visits): add visit management module with client and property validation"
  "test(api): extend smoke tests to cover lead and visit flows"
)

if [[ "${1:-}" == "--plain" ]]; then
  printf '%s\n' "${COMMIT_MESSAGES[@]}"
else
  echo "EstateFlow CRM - suggested commit messages (${#COMMIT_MESSAGES[@]} total):"
  echo
  i=1
  for msg in "${COMMIT_MESSAGES[@]}"; do
    printf '%2d. %s\n' "$i" "$msg"
    i=$((i + 1))
  done
fi
