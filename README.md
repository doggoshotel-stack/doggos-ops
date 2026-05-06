# doggos · operaciones

Wall-mounted ops dashboard for Doggos Hotel & Daycare. Pulls live data from three Google Sheets (Mews reservations, HubSpot intake form, Calendly events) via Apps Script, displays a brand-styled kiosk view that auto-refreshes every 60 seconds.

---

## What's in the box

```
doggos-ops/
├── public/fonts/        Cooper BT + GT Zirkon (brand fonts)
├── src/
│   ├── App.jsx          The dashboard (kiosk + admin)
│   ├── PasswordGate.jsx Login wrapper
│   ├── storage.js       localStorage wrapper
│   └── main.jsx         Vite entry
├── index.html
├── package.json
├── vite.config.js
├── .env.example         Password template
└── .gitignore
```

---

## Local test (5 minutes, do this first)

You need Node.js 18+. If you don't have it, install from https://nodejs.org.

```bash
# 1. From the project folder
npm install

# 2. (Optional) Copy the env template if you want to test with a custom password locally
cp .env.example .env.local
# Edit .env.local to change the password from "doggos2026" if you want

# 3. Run the dev server
npm run dev
```

Open http://localhost:5173. You'll see the password screen. Enter `doggos2026` (or whatever you set in `.env.local`). The dashboard loads. Click the small "admin" link in the top-right corner, then "Cargar datos demo" to see it populated.

If it works locally, deploy.

---

## Deploy to GitHub + Vercel (free, ~10 minutes)

### Step 1. Create a GitHub repo

1. Go to https://github.com/new
2. Repository name: `doggos-ops` (or whatever you want)
3. Set it to **Private**.
4. Do NOT initialize with README, .gitignore, or license (we already have those).
5. Click "Create repository". GitHub shows you setup instructions, ignore them, follow these instead.

### Step 2. Push the code from your machine

From the `doggos-ops/` project folder:

```bash
git init
git add .
git commit -m "Initial commit: doggos ops dashboard"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/doggos-ops.git
git push -u origin main
```

Replace `YOUR-USERNAME` with your GitHub username. If git asks for credentials, use a Personal Access Token (Settings → Developer settings → Personal access tokens → Generate new token, classic, with `repo` scope).

### Step 3. Connect Vercel to the repo

1. Go to https://vercel.com and sign up with your GitHub account if you haven't.
2. Click "Add New..." → "Project".
3. Pick the `doggos-ops` repository from the list.
4. Vercel auto-detects Vite. Leave all defaults.
5. **Before clicking Deploy, expand "Environment Variables"** and add:
   - Name: `VITE_DOGGOS_PASSWORD`
   - Value: your real password (something stronger than `doggos2026`)
6. Click **Deploy**.

Wait ~60 seconds. Done. You get a URL like `doggos-ops.vercel.app`.

### Step 4. Configure on first load

1. Open the deployed URL. Enter the password.
2. Click the small "admin" link top-right (or add `#admin` to the URL).
3. Paste the three Apps Script URLs and their secrets.
4. Click "Probar / actualizar ahora" to verify each source returns data.
5. Click "Guardar configuración".
6. Click "Volver al kiosco".

The dashboard is now live.

### Step 5. Bookmark on the iPad

1. Open the URL in Safari on the iPad.
2. Enter the password (it's remembered after that).
3. Tap the share icon → "Add to Home Screen".
4. Launch from the home screen icon. It runs full-screen, no browser chrome.

For an always-on display: Settings → Display & Brightness → Auto-Lock → Never. Settings → Accessibility → Guided Access → On (lets you lock the iPad to this single app).

---

## Rotate the password

1. Go to your project on Vercel → Settings → Environment Variables.
2. Edit `VITE_DOGGOS_PASSWORD`. Save.
3. Go to Deployments → click the three dots on the latest → Redeploy.
4. The iPad will need to re-enter the new password on next load.

---

## Use a custom domain (optional)

If you own `doggos.cat` (or any domain) and want `ops.doggos.cat`:

1. Vercel project → Settings → Domains → Add → enter `ops.doggos.cat`.
2. Vercel shows you a CNAME record to add at your domain registrar.
3. Add it. DNS propagates in ~5 min, HTTPS is automatic.

---

## Updating the code later

Any change you commit and push to GitHub auto-deploys to Vercel within a minute. No CI to set up. To change demo data, tweak alert keywords, or adjust the layout: edit, commit, push, done.

```bash
git add .
git commit -m "What you changed"
git push
```

---

## Architecture quick reference

- **Three Google Sheets** (Mews / HubSpot / Calendly) each have an Apps Script Web App that returns JSON gated by a `?key=...` secret.
- **The dashboard** fetches all three on load and every 60 seconds.
- **Mews is the booking source of truth.** HubSpot enriches by email match (allergies, medications, vet info, etc.). HubSpot intakes with no Mews booking become the "Por confirmar" KPI.
- **Calendly events** populate the strip showing today + tomorrow.
- **Config and cache** live in `localStorage` per device. Each iPad / laptop is configured once.
- **Apps Script template** is embedded in the admin panel. Click "Ver código" to copy it.

---

## Security notes

- The password gate is client-side. It stops casual passersby but not someone determined enough to inspect the JS bundle. For an internal ops display this is fine. If you later want stronger auth (e.g. SSO with Google Workspace), switch to Cloudflare Access on a custom domain.
- The Apps Script secret keys are also in the bundle (since `localStorage` config is set per device). Anyone who can load the dashboard can read them. If keys leak, rotate the SECRET in each Apps Script and redeploy.
- The dashboard shows guest names and medical/dietary notes. Treat the URL like the password: share with ops, not publicly.
