#!/bin/bash
# deploy.sh — build and deploy hagush-admin to Cloud Run
# Run from the admin/ directory: ./deploy.sh
#
# First run: docker build takes ~3 min (installs packages)
# Subsequent runs: ~30 sec if only .py files changed
#
# One-time setup:
#   gcloud auth configure-docker europe-west1-docker.pkg.dev
#   gcloud artifacts repositories create hagush-admin \
#     --repository-format=docker \
#     --location=europe-west1

set -e  # exit on any error

PROJECT=hagush-admin
REGION=europe-west1
SERVICE=hagush-admin
IMAGE=${REGION}-docker.pkg.dev/${PROJECT}/${SERVICE}/${SERVICE}

echo "=== Building Docker image ==="
docker buildx build -t ${IMAGE} .

echo "=== Pushing to Artifact Registry ==="
docker push ${IMAGE}

echo "=== Deploying to Cloud Run ==="
gcloud run deploy ${SERVICE} \
  --image ${IMAGE} \
  --region ${REGION} \
  --no-allow-unauthenticated \
  --memory 512Mi \
  --set-secrets "github_token=github_token:latest,\
google_service_account=google_service_account:latest,\
github_repo=github_repo:latest,\
github_branch=github_branch:latest,\
sheet_id=sheet_id:latest,\
drive_folder_id=drive_folder_id:latest,\
lang=lang:latest"

echo ""
echo "=== Done ==="
gcloud run services describe ${SERVICE} \
  --region ${REGION} \
  --format="value(status.url)"
