# Repository Consolidation Summary

## What Changed

The PDF Accessibility project has been consolidated from **two separate repositories** into a **single unified repository** for easier management and deployment.

### Before (Two Repositories)

```
PDF_Accessibility/          # Backend processing
  ├── app.py
  ├── lambda/
  ├── deploy.sh
  └── ...

PDF_accessability_UI/       # Separate UI repo
  ├── cdk_backend/
  ├── pdf_ui/
  ├── deploy.sh
  └── ...
```

### After (Single Repository)

```
PDF_Accessibility/          # Unified repository
  ├── adobe-autotag-container/
  ├── alt-text-generator-container/
  ├── lambda/
  ├── pdf2html/
  ├── ui/                   # UI code integrated here
  │   ├── cdk_backend/
  │   ├── pdf_ui/
  │   ├── deploy.sh
  │   └── ...
  ├── docs/
  ├── deploy.sh             # Master deploy script
  ├── uninstall.sh
  └── README.md
```

---

## Benefits of Consolidation

### 1. Simpler Workflow ✅

**Before:**
- Clone backend repo
- Clone UI repo separately
- Deploy script clones UI from GitHub to temp directory
- Manage two separate .git histories

**After:**
- Clone single repo
- All code in one place
- Deploy script uses local `ui/` directory
- Single .git history

### 2. Easier Development ✅

- Make changes to backend and UI together
- Single commit for related changes
- No need to sync between repos
- Easier to review full system changes

### 3. Better IP Restrictions Configuration ✅

**Before:**
- `allowed-ips.txt` couldn't be in UI repo (would be cloned from GitHub without it)
- Had to configure IPs via deploy script prompts every time
- No persistence of configuration

**After:**
- `allowed-ips.txt` persists in `ui/cdk_backend/`
- Configure once, reuse on subsequent deployments
- Still properly excluded from version control via `.gitignore`

### 4. No Internet Required for UI Deployment ✅

**Before:**
- Deploy script required internet to clone UI from GitHub
- Failed in air-gapped or restricted environments

**After:**
- Everything local
- Deploy works offline (except AWS API calls)

### 5. Single Source of Truth ✅

- All code in one place
- Documentation references one structure
- Easier onboarding for new developers

---

## What Was Changed

### 1. Repository Structure

Added `ui/` subdirectory containing all UI code (formerly separate repo).

### 2. .gitignore Updated

```bash
# Old (excluded separate UI repo)
PDF_accessability_UI/

# New (excludes sensitive UI files)
ui/cdk_backend/allowed-ips.txt
ui/cdk_backend/cdk.out/
ui/cdk_backend/node_modules/
ui/pdf_ui/node_modules/
ui/.env
```

### 3. Deploy Script Updated

**deploy.sh** now:
- Uses local `ui/` directory instead of cloning from GitHub
- Removed temp directory creation and cleanup
- IP restrictions persist in `ui/cdk_backend/allowed-ips.txt`
- Faster deployment (no git clone needed)

**Before:**
```bash
UI_TEMP_DIR="/tmp/pdf-ui-deployment-$$"
git clone -b main https://github.com/...
cd "$UI_TEMP_DIR"
# ... deploy
rm -rf "$UI_TEMP_DIR"  # Cleanup temp directory
```

**After:**
```bash
UI_DIR="$ORIGINAL_DIR/ui"
cd "$UI_DIR"
# ... deploy
cd "$ORIGINAL_DIR"  # Return to original directory
```

### 4. Documentation Updated

All documentation now references `ui/` instead of `../PDF_accessibility_UI/`:

- `docs/UI_IP_RESTRICTIONS.md`
- `docs/IP_ACCESS_CONTROL.md`
- `docs/CUSTOM_DOMAIN_SETUP.md`
- `docs/DEPLOY_SCRIPT_AND_DOMAINS_FAQ.md`
- `docs/IP_RESTRICTIONS_IMPLEMENTATION_SUMMARY.md`

### 5. README Updated

Added repository structure section showing unified layout.

---

## Migration Guide

### For Existing Users

If you had both repositories cloned:

**Option A: Fresh Clone (Recommended)**
```bash
# Backup any local configuration
cd PDF_accessibility_UI/cdk_backend
cp allowed-ips.txt ~/backup-allowed-ips.txt  # If you have one

# Clone fresh unified repo
cd ~/Projects
rm -rf PDF_Accessibility PDF_accessibility_UI
git clone https://github.com/umbc-eis/PDF_Accessibility.git
cd PDF_Accessibility

# Restore IP configuration if needed
cp ~/backup-allowed-ips.txt ui/cdk_backend/allowed-ips.txt
```

**Option B: Update Existing Clone**
```bash
cd PDF_Accessibility

# Pull latest changes (includes ui/ directory)
git pull origin main

# Remove old separate UI repo (no longer needed)
rm -rf ../PDF_accessibility_UI
```

### For CI/CD Pipelines

Update your deployment scripts:

**Before:**
```bash
git clone https://github.com/.../PDF_Accessibility.git
git clone https://github.com/.../PDF_accessability_UI.git
cd PDF_Accessibility
./deploy.sh
```

**After:**
```bash
git clone https://github.com/.../PDF_Accessibility.git
cd PDF_Accessibility
./deploy.sh  # UI is already included
```

---

## Deployment Workflow

### Backend + UI Together (Recommended for First Deploy)

```bash
cd PDF_Accessibility
./deploy.sh

# Script will:
# 1. Deploy backend (PDF-to-PDF and/or PDF-to-HTML)
# 2. Prompt for IP restrictions (optional)
# 3. Deploy UI from ui/ directory
```

### UI Only (Subsequent Deployments)

```bash
cd PDF_Accessibility/ui/cdk_backend
npx cdk deploy
```

### Backend Only

```bash
cd PDF_Accessibility
npx cdk deploy  # For PDF-to-PDF backend
# or
cd pdf2html/cdk
npx cdk deploy  # For PDF-to-HTML backend
```

---

## IP Restrictions Configuration

### New Workflow (Persistent)

```bash
cd PDF_Accessibility/ui/cdk_backend

# First time setup
cp allowed-ips.txt.example allowed-ips.txt
nano allowed-ips.txt  # Add your VPN CIDR ranges

# Deploy
npx cdk deploy

# File persists for future deployments!
```

### Deploy Script Still Works

The master deploy script still offers interactive IP configuration:

```bash
cd PDF_Accessibility
./deploy.sh

# When prompted:
# Configure IP restrictions? (y/n): y
# Enter CIDR range: 10.0.0.0/16
```

---

## Backward Compatibility

### What Still Works

✅ All existing AWS resources (no changes)
✅ Deploy script (enhanced, not breaking)
✅ Uninstall script
✅ Documentation (updated references)
✅ Custom domains (configuration unchanged)
✅ IP restrictions (now easier to manage)

### What's Different

⚠️ **UI repo location**: Now in `ui/` subdirectory
⚠️ **Deploy script**: Uses local `ui/` instead of cloning
⚠️ **Documentation paths**: References updated from `../PDF_accessibility_UI` to `ui`

### What's Removed

❌ **No more separate UI repo**: Everything in one place
❌ **No more git clone during deploy**: Uses local code
❌ **No more temp directory cleanup**: Not needed

---

## Git History

The UI code was copied into the `ui/` subdirectory as a snapshot. The original UI repo's git history was not merged (to keep this repo's history clean).

**If you need UI repo's git history:**
```bash
# Still available in original repo
git clone https://github.com/ASUCICREPO/PDF_accessability_UI.git
cd PDF_accessability_UI
git log  # View historical commits
```

---

## Testing

After consolidation, verify functionality:

### 1. Deploy Script Test

```bash
cd PDF_Accessibility
./deploy.sh

# Verify:
# ✅ Backend deploys
# ✅ UI deployment prompts for IP restrictions
# ✅ UI deploys from local ui/ directory
# ✅ No errors about missing UI repo
```

### 2. Direct UI Deploy Test

```bash
cd PDF_Accessibility/ui/cdk_backend
npx cdk deploy

# Verify:
# ✅ Deploys successfully
# ✅ Uses local allowed-ips.txt if configured
```

### 3. IP Restrictions Test

```bash
cd PDF_Accessibility/ui/cdk_backend
cp allowed-ips.txt.example allowed-ips.txt
echo "10.0.0.0/16" > allowed-ips.txt
npx cdk deploy

# Verify:
# ✅ IP restrictions applied
# ✅ Console shows: "🔒 IP Restrictions ENABLED"
```

---

## Troubleshooting

### "UI directory not found"

**Cause:** Old version of code without `ui/` directory

**Solution:**
```bash
git pull origin main
# Verify ui/ directory exists
ls -la ui/
```

### "Deploy script still cloning from GitHub"

**Cause:** Old version of deploy.sh

**Solution:**
```bash
git pull origin main
# Verify deploy.sh shows "Using local UI directory"
```

### "allowed-ips.txt being committed to git"

**Cause:** .gitignore not updated

**Solution:**
```bash
# Verify .gitignore has:
grep "ui/cdk_backend/allowed-ips.txt" .gitignore

# Should output: ui/cdk_backend/allowed-ips.txt
```

### "Documentation references broken"

**Cause:** Old cached documentation

**Solution:**
```bash
git pull origin main
# All docs updated with new ui/ references
```

---

## FAQ

### Q: Do I need to redeploy after consolidation?

**A:** No, existing AWS resources are unchanged. Redeploy only when you want to make changes.

### Q: Can I still use the separate UI repo?

**A:** Yes, but it's not recommended. The UI code in this unified repo is the canonical version.

### Q: What about the original UI repo on GitHub?

**A:** The fork at `umbc-eis/PDF_Accessibility` is now the unified repo. The separate UI repo can be archived or kept for reference.

### Q: Will this affect my deployed application?

**A:** No, this only affects the development/deployment workflow. Running applications are unaffected.

### Q: Do I need to update my VPN IP configuration?

**A:** No, but you can now configure `ui/cdk_backend/allowed-ips.txt` directly instead of re-entering IPs each deployment.

---

## Summary

**What:** Merged UI code from separate repository into `ui/` subdirectory
**Why:** Simpler development, easier deployment, better configuration management
**Impact:** Positive - easier to use, no breaking changes to AWS resources
**Action Required:** Pull latest code or clone fresh

**Status:** ✅ Complete and tested

---

## Questions or Issues?

- Check documentation in `docs/`
- Review this consolidation guide
- Check git history for changes
- Contact: Repository maintainers
