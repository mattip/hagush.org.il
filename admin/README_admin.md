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
  sheets.googleapis.com \
  drive.googleapis.com \
  secretmanager.googleapis.com
```

---

### Step 2 — Create a GitHub token

The app needs a fine-grained GitHub token to open Pull Requests.

1. Go to [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)
2. **Token name:** `hagush-admin`
3. **Expiration:** 1 year (or no expiration)
4. **Resource owner:** your org or personal account
5. **Repository access:** Only select repositories → `hagush.org.il`
6. **Permissions** — set these two:
   - `Contents` → **Read and Write** (to push a branch with the updated files)
   - `Pull requests` → **Read and Write** (to open the PR)
7. Click **Generate token** and copy it — you only see it once

The token cannot merge PRs, cannot access other repos, and cannot change settings.
A repo owner (Matti or Elad) still needs to review and merge.

---

### Step 3 — Create a Google Service Account

The app uses a service account to read Google Drive (portraits) and Google Sheets (form responses) without requiring user login.

1. Go to [GCP Console](https://console.cloud.google.com) → **IAM & Admin → Service Accounts**
2. Click **Create Service Account**
3. **Name:** `hagush-admin` — click **Create and Continue**
4. **Grant roles** — skip this step, click **Continue**
5. Click **Done**

**Download the key file:**
1. Click the service account you just created
2. Go to the **Keys** tab → **Add Key → Create new key**
3. Choose **JSON** → **Create**
4. A `service_account.json` file downloads automatically — keep it safe, this is the only copy

**Grant the service account access to your Drive folder and Sheet:**

For the Google Drive portraits folder:
1. Open the Drive folder in your browser
2. Click **Share** → paste the service account email (looks like `hagush-admin@your-project.iam.gserviceaccount.com`)
3. Set permission to **Viewer** → **Share**

For the Google Sheet (form responses):
1. Open the Sheet in your browser
2. Click **Share** → paste the same service account email
3. Set permission to **Viewer** → **Share**

Now store the key file as a secret:

```bash
gcloud secrets create google_service_account --data-file=service_account.json
```

After the following step you can delete the local `service_account.json` — the secret is safely stored in GCP.

---

### Step 4 — Store remaining secrets

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

### Step 4 — Create Dockerfile

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

### Step 5 — Grant Secret Manager access

The Cloud Run service account needs permission to read secrets. Run:

```bash
PROJECT_NUMBER=$(gcloud projects describe hagush-admin --format="value(projectNumber)")
gcloud projects add-iam-policy-binding hagush-admin \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

### Step 6 — Deploy

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

### Step 7 — Configure OAuth consent screen

IAP requires an OAuth client to handle Google login.

**A. Configure the consent screen** (once per project):
1. Go to [APIs & Services → OAuth consent screen](https://console.cloud.google.com/apis/auth/consent)
2. Choose **External** → **Create**
3. Fill in:
   - App name: `Hagush Admin`
   - Support email: your email
4. Click **Save and Continue** through all remaining screens — skip scopes and test users

**B. Create the OAuth client:**
1. Go to [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Name: `Hagush Admin`
5. Click **Create**
6. Copy the **Client ID** and **Client Secret** from the dialog

**C. Add the IAP redirect URI to the OAuth client:**

IAP needs to be whitelisted as an authorized redirect target:

1. Go to [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Click your OAuth client
3. Under **Authorized redirect URIs** click **Add URI** and paste:
   ```
   https://iap.googleapis.com/v1/oauth/clientIds/YOUR_CLIENT_ID.apps.googleusercontent.com:handleRedirect
   ```
   Replace `YOUR_CLIENT_ID` with your full client ID (visible at the top of the client page)
4. Click **Save**

**D. Register the client with IAP:**

1. Go to [Security → Identity-Aware Proxy](https://console.cloud.google.com/security/iap)
2. Click the `hagush-admin` row to open the info panel
3. Click the settings icon (⚙️) or **Edit OAuth configuration**
4. Select **Custom OAuth**
5. Paste your **Client ID** and **Client Secret**
6. Click **Save**

---

### Step 8 — Set up Identity-Aware Proxy (IAP)

IAP gates the app behind Google login — no separate passwords or accounts needed.
Users log in with their existing Google (Gmail) account.

**Enable IAP:**
1. Go to [GCP Console](https://console.cloud.google.com) → **Security → Identity-Aware Proxy**
2. Find `hagush-admin` under Cloud Run and toggle IAP on
3. If prompted, configure the OAuth consent screen — choose **Internal** if your accounts are in a Google Workspace, otherwise **External**

**Add users (Nina, Elad, yourself):**
1. Click the `hagush-admin` service to open its permissions panel
2. Click **Add Principal**
3. Enter their Gmail address (e.g. `nina@gmail.com`)
4. Role: **Cloud IAP → IAP-secured Web App User**
5. Click **Save**
6. Repeat for each person

**That's it** — send them the Cloud Run URL. They visit it, Google asks them to log in, and they're in. No app-specific password, no account to create.

**To add a new user later:** repeat the Add Principal steps above.

**To remove access:** find their email in the IAP principals list and click **Remove**.

---

### Step 9 — Map a custom domain (optional)

This lets `https://admin.hagush.org.il` point to the Cloud Run service, so the
`/admin.html` redirect on the static site lands on a clean URL instead of the
long `run.app` address.

**A. Create the domain mapping:**

```bash
gcloud beta run domain-mappings create \
  --service hagush-admin \
  --domain admin.hagush.org.il \
  --region europe-west1
```

> Note: the `beta` track is required — the `gcloud run` (GA) command does not
> yet accept `--region` for domain mappings.

The command prints the DNS record(s) you need to add, typically:

```
CNAME  admin  ghs.googlehosted.com.
```

**B. Add the DNS record:**

In your DNS provider (wherever `hagush.org.il` is managed), add:

| Type | Name | Value |
|---|---|---|
| CNAME | `admin` | `ghs.googlehosted.com.` |

DNS propagation takes a few minutes to an hour.

**C. Wait for SSL provisioning:**

Google provisions a TLS certificate automatically. Check the status with:

```bash
gcloud beta run domain-mappings describe \
  --domain admin.hagush.org.il \
  --region europe-west1
```

Look for `certificateStatus: ACTIVE` — this can take up to 30 minutes.

**D. Update `docs/admin.html`:**

Change the redirect target to the new domain:

```html
<meta http-equiv="refresh" content="0;url=https://admin.hagush.org.il">
```

**E. Add the domain to the OAuth client:**

1. Go to [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Click your `Hagush Admin` OAuth client
3. Under **Authorized JavaScript origins** add `https://admin.hagush.org.il`
4. Click **Save**

---

### One-time local setup

Before deploying for the first time, run these once on your machine:

```bash
# Install Docker buildx
sudo apt-get install -y docker-buildx-plugin   # Ubuntu
# brew install docker-buildx                   # macOS

# Authenticate Docker with Artifact Registry
gcloud auth configure-docker europe-west1-docker.pkg.dev

# Create the Artifact Registry repository
gcloud artifacts repositories create hagush-admin \
  --repository-format=docker \
  --location=europe-west1
```

### Deploying / updating the app

Build locally (uses Docker layer cache) and push to Artifact Registry:

```bash
cd admin/
./deploy.sh
```

The script:
1. Builds the Docker image locally (cached — fast if only `.py` files changed)
2. Pushes to Artifact Registry at `europe-west1-docker.pkg.dev/hagush-admin/hagush-admin/hagush-admin`
3. Deploys the new image to Cloud Run
4. Prints the service URL

First deploy or after `requirements.txt` changes: ~3 minutes.
Subsequent deploys (only `.py` files changed): ~30 seconds.

> **Tip:** bump `APP_VERSION` in `app_streamlit.py` before deploying so you can
> confirm the right version is live in the About tab.

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

