#!/usr/bin/env bash
set -euo pipefail

# Get current version from package.json
CURRENT=$(node -p "require('./package.json').version")

# Compute default patch bump
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
DEFAULT="${MAJOR}.${MINOR}.$((PATCH + 1))"

echo "Current version: $CURRENT"
echo -n "New version [$DEFAULT]: "
read -r INPUT
VERSION="${INPUT:-$DEFAULT}"

# Basic semver validation
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: '$VERSION' is not a valid semver (expected X.Y.Z)"
  exit 1
fi

TAG="v${VERSION}"

echo ""
echo "Releasing $TAG"
echo "  - npm version $VERSION"
echo "  - git tag $TAG"
echo "  - git push origin main"
echo "  - git push origin $TAG"
echo -n "Proceed? [y/N] "
read -r CONFIRM
if [[ "${CONFIRM,,}" != "y" ]]; then
  echo "Aborted."
  exit 0
fi

# Update package.json version without creating a git commit/tag
npm version "$VERSION" --no-git-tag-version

# Commit the version bump
git add package.json package-lock.json
git commit -m "Release $TAG"

# Tag and push
git tag "$TAG"
git push origin main
git push origin "$TAG"

echo ""
echo "Done. $TAG pushed."
