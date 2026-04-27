#!/usr/bin/env bash
set -e

REGISTRY="gitea.homielab.omg"
REPO="sann/eve-tracking-jobs"
TAG=$(git rev-parse --short HEAD)

# Determine environment
ENV="prod"
EXTRA_TAG="latest"
if [[ "$1" == "--test" ]]; then
  ENV="test"
  EXTRA_TAG="test"
fi

echo "=== EVE Industry Tracker — K8s Deploy ($ENV) ==="
echo "Registry: $REGISTRY"
echo "Tag:      $TAG + $EXTRA_TAG"
echo ""

# Check podman is available
if ! command -v podman &>/dev/null; then
  echo "ERROR: podman is not installed or not in PATH"
  exit 1
fi

# Check registry login
if ! podman login --tls-verify=false "$REGISTRY" --get-login &>/dev/null 2>&1; then
  echo "ERROR: Not logged into $REGISTRY"
  echo ""
  echo "Run:"
  echo "  podman login --tls-verify=false $REGISTRY"
  echo ""
  exit 1
fi

# Build backend
echo "--- Building backend ---"
podman build \
  -t "$REGISTRY/$REPO-backend:$TAG" \
  -t "$REGISTRY/$REPO-backend:$EXTRA_TAG" \
  ./backend

# Build frontend
echo "--- Building frontend ---"
podman build \
  -t "$REGISTRY/$REPO-frontend:$TAG" \
  -t "$REGISTRY/$REPO-frontend:$EXTRA_TAG" \
  ./frontend

# Push all tags
echo "--- Pushing images ---"
podman push --tls-verify=false "$REGISTRY/$REPO-backend:$TAG"
podman push --tls-verify=false "$REGISTRY/$REPO-backend:$EXTRA_TAG"
podman push --tls-verify=false "$REGISTRY/$REPO-frontend:$TAG"
podman push --tls-verify=false "$REGISTRY/$REPO-frontend:$EXTRA_TAG"

echo ""
echo "=== Done ($ENV) ==="
echo "  $REGISTRY/$REPO-backend:$TAG"
echo "  $REGISTRY/$REPO-backend:$EXTRA_TAG"
echo "  $REGISTRY/$REPO-frontend:$TAG"
echo "  $REGISTRY/$REPO-frontend:$EXTRA_TAG"
