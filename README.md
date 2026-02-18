# FPL Hub — Setup Guide

## 📁 Project Structure
```
fpl-overlay/
├── .github/
│   └── workflows/
│       └── fetch-fpl.yml     ← GitHub Actions (auto-fetch every hour)
├── scripts/
│   ├── fetch-fpl.js          ← Node.js fetch script
│   └── package.json
├── data/
│   └── cache.json            ← Auto-updated by GitHub Actions ✅
├── pages/
│   ├── fantasy.html
│   ├── predictions.html
│   └── watchalong.html
├── overlay.html              ← OBS Browser Source
└── index.html
```

---

## 🚀 GitHub Setup (အဆင့်တစ်ဆင့်ချင်း)

### Step 1 — Repo ဆောက်ပါ
1. GitHub မှာ New Repository → `fpl-overlay`
2. Public ထားပါ (GitHub Pages free)
3. Files တွေ push လုပ်ပါ

```bash
git init
git add .
git commit -m "initial: fpl hub"
git remote add origin https://github.com/YOUR_USERNAME/fpl-overlay.git
git push -u origin main
```

### Step 2 — GitHub Pages ဖွင့်ပါ
1. Repo → **Settings** → **Pages**
2. Source: **Deploy from branch**
3. Branch: `main` / `/ (root)`
4. Save → URL ရမယ်: `https://YOUR_USERNAME.github.io/fpl-overlay/`

### Step 3 — Team ID Secret ထည့်ပါ
1. Repo → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret** နှိပ်
3. Name: `FPL_TEAM_ID`
4. Value: သင့် FPL Team ID (e.g. `1234567`)
5. **Add secret** နှိပ်

> FPL Team ID ရှာနည်း:
> fantasy.premierleague.com → Pick Team → URL မှာ `/entry/XXXXXXX/` ကြည့်

### Step 4 — Actions ပထမဆုံး Run လုပ်ပါ
1. Repo → **Actions** tab
2. **FPL Data Auto-Fetch** workflow ကြည့်
3. **Run workflow** → **Run workflow** နှိပ်
4. Green check ✅ ဖြစ်ရင် `data/cache.json` update ဖြစ်ပြီ

---

## 🎮 OBS Browser Source Setup

### Overlay URL
```
https://YOUR_USERNAME.github.io/fpl-overlay/overlay.html?obs=true
```

### OBS Settings
| Setting | Value |
|---------|-------|
| URL | overlay URL above |
| Width | 1920 |
| Height | 1080 |
| FPS | 30 |
| Custom CSS | `body { background: transparent !important; }` |

### OBS မှာ ချိတ်နည်း
1. OBS → **Sources** → **+** → **Browser**
2. URL ထည့်
3. Width: 1920, Height: 1080
4. ✅ **Shutdown source when not visible**
5. ✅ **Refresh browser when scene becomes active**

---

## ⏱️ Auto-Fetch Schedule

| Time | Action |
|------|--------|
| Every hour | `data/cache.json` auto-update |
| On push to main | Immediate fetch |
| Manual trigger | Actions tab → Run workflow |

> Matchday မဆိုရင် 1hr update လုံလောက်ပါတယ်။
> Live score လိုချင်ရင် cron ကို `*/15 * * * *` (15 min) ပြောင်းနိုင်။

---

## 📡 Data Flow

```
GitHub Actions (hourly)
      ↓
FPL Official API (server-side, no CORS)
      ↓
data/cache.json commit & push
      ↓
GitHub Pages auto-deploy
      ↓
OBS Browser Source reads cache.json
      ↓
🎮 Stream Overlay Live ✅
```

---

## 🔧 Troubleshooting

**Actions failed?**
- Check Repo → Settings → Actions → General
- Workflow permissions: **Read and write** ✅

**cache.json not updating?**
- Actions tab မှာ log ကြည့်
- `FPL_TEAM_ID` secret မှန်မမှန် စစ်

**OBS transparent မဖြစ်?**
- Custom CSS: `body { background: rgba(0,0,0,0) !important; }`
- OBS Browser Source settings မှာ check

---

## 🌐 Live URLs (ဥပမာ)

```
Home:        https://username.github.io/fpl-overlay/
Fantasy:     https://username.github.io/fpl-overlay/pages/fantasy.html
Predictions: https://username.github.io/fpl-overlay/pages/predictions.html
Watch Along: https://username.github.io/fpl-overlay/pages/watchalong.html
OBS Overlay: https://username.github.io/fpl-overlay/overlay.html?obs=true
```
