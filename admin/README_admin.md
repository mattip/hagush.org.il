# Candidates Admin App

Streamlit app to manage hagush.org.il candidates page.

## Files

- `app_streamlit.py`   — Streamlit UI
- `candidates_lib.py`  — shared logic (also used by parse_candidates.py CLI)
- `.streamlit/secrets.toml` — local secrets (gitignored)
- `requirements.txt`   — Python deps
- `Dockerfile`         — container for Cloud Run

---

## Local development

### 1. Install Python dependencies

```bash
cd admin/
pip install -r requirements.txt
```

### 2. Configure secrets

Copy the template and fill in your values:

```bash
cp secrets.toml .streamlit/secrets.toml
```

Edit `.streamlit/secrets.toml` — at minimum set:
```toml
lang = "he"
github_token = ""   # leave empty for dev mode
```

The dev mode paths default to the repo layout automatically — no changes needed
unless your folder structure differs.

### 3. Run

```bash
streamlit run app_streamlit.py -- --dev
```

Opens at http://localhost:8501. In dev mode:
- Reads candidates from `../docs/candidates.json`
- Reads images from `../edited/`
- Reads responses from `../responses.csv`
- No GitHub or Google API calls are made

---

## Production deployment (Google Cloud Run + IAP)

### Prerequisites

**macOS:**
```bash
brew install google-cloud-sdk   # ~70 MB
```

**Ubuntu:**
```bash
sudo apt-get install -y google-cloud-cli   # ~700 MB
```

Then authenticate:
```bash
gcloud auth login
gcloud config set project hagush-admin   # or your project name
```

**Enable billing** — required for Cloud Run even though the free tier covers
normal usage. In the [GCP Console](https://console.cloud.google.com):

1. Go to **Billing** → **Link a billing account** for your project
2. If you have no billing account yet, click **Create billing account** —
   a credit card is required for identity verification
3. Google will **not charge you** unless you exceed the free tier.
   For 2-3 users with occasional sessions this is essentially impossible:
   - 2 million Cloud Run requests/month free
   - 360,000 GB-seconds of memory/month free
4. Set a budget alert just in case: **Billing → Budgets & alerts →
   Create budget** → $5 → add your email. You'll get an email before
   any real spending happens.

> New GCP accounts receive **$300 free credit** valid for 90 days,
> which covers any experimentation costs.

---

### Step 1 — Enable APIs

```bash
gcloud services enable run.googleapis.com \
  cloudbuild.googleapis.com \
  iap.googleapis.com \
  secretmanager.googleapis.com
```

---

### Step 2 — Store secrets in Secret Manager

```bash
echo -n "ghp_yourtoken" | gcloud secrets create github_token --data-file=-
echo -n "mattip/hagush.org.il" | gcloud secrets create github_repo --data-file=-
echo -n "main" | gcloud secrets create github_branch --data-file=-
echo -n "your_sheet_id" | gcloud secrets create sheet_id --data-file=-
echo -n "your_drive_folder_id" | gcloud secrets create drive_folder_id --data-file=-
echo -n "he" | gcloud secrets create lang --data-file=-
gcloud secrets create google_service_account --data-file=service_account.json
```

To update a secret later:
```bash
echo -n "new_value" | gcloud secrets versions add github_token --data-file=-
```

---

### Step 3 — Create Dockerfile

Create `admin/Dockerfile`:

```dockerfile
FROM python:3.12-slim

# ImageMagick for PNG→WebP conversion
RUN apt-get update && apt-get install -y imagemagick && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8080
CMD ["streamlit", "run", "app_streamlit.py", \
     "--server.port=8080", \
     "--server.address=0.0.0.0", \
     "--server.headless=true"]
```

---

### Step 4 — Deploy

```bash
cd admin/
gcloud run deploy hagush-admin \
  --source . \
  --region europe-west1 \
  --no-allow-unauthenticated \
  --memory 512Mi \
  --set-secrets "github_token=github_token:latest,\
google_service_account=google_service_account:latest,\
github_repo=github_repo:latest,\
github_branch=github_branch:latest,\
sheet_id=sheet_id:latest,\
drive_folder_id=drive_folder_id:latest,\
lang=lang:latest"
```

First deploy takes ~3 minutes. Get the URL:

```bash
gcloud run services describe hagush-admin \
  --region europe-west1 \
  --format="value(status.url)"
```

---

### Step 5 — Set up Identity-Aware Proxy (IAP)

IAP gates the app behind Google login — no passwords needed.

1. Go to [GCP Console](https://console.cloud.google.com) → **Security → Identity-Aware Proxy**
2. Find `hagush-admin` under Cloud Run and enable IAP
3. Click **Add Principal** for each allowed user:
   - Email: their Google account
   - Role: `IAP-secured Web App User`

To grant access to a new user, just add their Google account in IAP.
To revoke, remove them.

---

### Updating the app

```bash
cd admin/
gcloud run deploy hagush-admin --source . --region europe-west1
```

Takes ~2 minutes.

---

### Costs

With typical usage (2-3 admin users, occasional sessions):

| Service | Cost |
|---|---|
| Cloud Run (requests + CPU) | ~$0/month (free tier) |
| Cloud Run (min instances=0) | $0 — cold start ~5-10s |
| Cloud Run (min instances=1) | ~$3-7/month — instant startup |
| Secret Manager | $0 (under 6 secrets free) |
| IAP | $0 |
| Artifact Registry (container) | $0 (~200MB, under free tier) |
| **Total** | **$0-7/month** |

