#!/usr/bin/env bash
set -euo pipefail

# Publish all packages to npm via changesets.
# Then replace the per-package git tags with a single unified tag.

# 1. Publish to npm (changesets creates per-package tags like @goodie-ts/core@0.3.0)
pnpm changeset publish

# 2. Read the unified version from core (all packages share the same version via "fixed")
VERSION=$(node -p "require('./packages/core/package.json').version")
UNIFIED_TAG="v${VERSION}"

echo "Published version: ${VERSION}"
echo "Creating unified tag: ${UNIFIED_TAG}"

# 3. Delete per-package tags (local only — they haven't been pushed)
git tag --list '@goodie-ts/*' | while read -r tag; do
  echo "Deleting per-package tag: ${tag}"
  git tag -d "${tag}"
done

# 4. Create a single unified tag
git tag -a "${UNIFIED_TAG}" -m "Release ${UNIFIED_TAG}"

# 5. Push the unified tag
git push origin "${UNIFIED_TAG}"

echo "Done — released ${UNIFIED_TAG}"
