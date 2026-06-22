# Firebase Setup for hagush.org.il Tracking

## 1. Create a Firebase Project
- Go to https://console.firebase.google.com
- Click "Add Project" → name it (e.g. "hagush-tracking")
- Disable Gemini
- Disable Google Analytics (you don't need it)
- Click "Create Project"

## 2. Enable Firestore
- In the Firebase console, go to **Database and Storage → Firestore**
- Click "Create database"
- Choose **Standard Edition**
- Pick a location close to your users: `europe-west1` (Belgium) is closest to Israel
- Choose **Production**

## 3. Get your Firebase config
- Go to **Project Settings** (gear icon) → **General**
- Under "Your apps", click the web icon `</>`
- Register an app (name: "hagush-web")
- Copy the `firebaseConfig` object — you'll paste it into `tracker.js` and `dashboard.html`

## 4. Enable Email/Password Auth
- Go to **Security → Authentication → Sign-in method**
- Enable **Google**

## 5. Set Firestore Security Rules
Go to **Firestore → Rules** and paste instead of the content:

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return request.auth != null
        && request.auth.token.email == "<admin@example.com>";
    }

    match /events/{event} {
      // Allow writes, but restrict the schema to reduce abuse.
      allow create: if request.resource.data.keys().hasOnly([
          "type", "referrer", "url", "page", "userAgent", "timestamp",
          "firstName", "lastName", "phone", "email"
        ])
        && request.resource.data.type in ["visit", "signup"];

      allow read: if isAdmin();
    }
  }
}
```

This lets anyone write tracking events, but only logged-in users can read (your dashboard).

## 6. Deploy
- Copy `tracker.js` to your GitHub Pages repo
- Copy `dashboard.html` to your repo
- Replace the `firebaseConfig` placeholder in BOTH files with your real config
- Push to GitHub

## Files
- `tracker.js` → add via `<script>` tag in your index.html (replaces nothing, just adds tracking)
- `dashboard.html` → your admin dashboard at hagush.org.il/dashboard.html
