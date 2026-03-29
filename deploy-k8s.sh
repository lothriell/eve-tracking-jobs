#!/usr/bin/env bash
set -e

REGISTRY="gitea.homielab.omg"
REPO="sann/eve-tracking-jobs"
TAG=$(git rev-parse --short HEAD)

echo "=== EVE Industry Tracker — K8s Deploy ==="
echo "Registry: $REGISTRY"
echo "Tag:      $TAG"
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
  -t "$REGISTRY/$REPO-backend:latest" \
  ./backend

# Build frontend
echo "--- Building frontend ---"
podman build \
  -t "$REGISTRY/$REPO-frontend:$TAG" \
  -t "$REGISTRY/$REPO-frontend:latest" \
  ./frontend

# Push all tags
echo "--- Pushing images ---"
podman push --tls-verify=false "$REGISTRY/$REPO-backend:$TAG"
podman push --tls-verify=false "$REGISTRY/$REPO-backend:latest"
podman push --tls-verify=false "$REGISTRY/$REPO-frontend:$TAG"
podman push --tls-verify=false "$REGISTRY/$REPO-frontend:latest"

echo ""
echo "=== Done ==="
echo "  $REGISTRY/$REPO-backend:$TAG"
echo "  $REGISTRY/$REPO-backend:latest"
echo "  $REGISTRY/$REPO-frontend:$TAG"
echo "  $REGISTRY/$REPO-frontend:latest"
