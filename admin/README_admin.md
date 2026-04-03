# Candidates Admin App

Streamlit app to manage hagush.org.il candidates page.

## Local dev

```bash
pip install -r requirements.txt
streamlit run app_streamlit.py -- --dev
```

- Edit `.streamlit/secrets.toml` with your paths
- Put test images in `test_data/new_images/`
- Put test CSV in `test_data/responses.csv`
- No GitHub or Google API calls in dev mode

## Production (Cloud Run)

```bash
gcloud run deploy candidates-admin \
  --source . \
  --region europe-west1 \
  --no-allow-unauthenticated
```

Then enable Identity-Aware Proxy on the Cloud Run service in GCP console.
Add allowed users via IAP → Add Principal.

Secrets via Secret Manager:
  github_token, github_repo, drive_folder_id, sheet_id, google_service_account

## Files

- `candidates_lib.py`  — shared logic (also used by parse_candidates.py CLI)
- `app_streamlit.py`   — Streamlit UI
- `parse_candidates.py` — CLI tool (unchanged)
- `.streamlit/secrets.toml` — local secrets (gitignored)
- `requirements.txt`   — Python deps
