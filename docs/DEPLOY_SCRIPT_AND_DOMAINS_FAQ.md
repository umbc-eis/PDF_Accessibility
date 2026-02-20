# Deploy Script & Custom Domains FAQ

Quick answers to common questions about the deploy script and custom domain configuration.

---

## Q1: Does IP Restriction Work with the Deploy Script?

### Short Answer

**Yes, but with caveats.** The deploy script now supports IP restrictions via interactive prompts.

### How It Works

The enhanced deploy script (in the main backend repo) now:

1. **Prompts for IP restrictions** during UI deployment
2. **Creates `allowed-ips.txt`** in the local ui/ directory
3. **Deploys with IP restrictions** if configured
4. **File persists** for future deployments
5. **Defaults to no restrictions** if skipped

### Usage Example

```bash
cd PDF_Accessibility
./deploy.sh
```

**During UI deployment, you'll see:**
```
🔒 IP-Based Access Control (Optional)

Would you like to restrict UI access to specific IP addresses?
This is useful for VPN-only access or internal networks.

Configure IP restrictions? (y/n): y

🔧 Configuring IP restrictions...
Example formats:
   10.0.0.0/16         (VPN range)
   192.168.1.0/24      (Office network)
   203.0.113.50/32     (Single IP)

Enter CIDR range (or press Enter to finish): 10.0.0.0/16
   ✅ Added: 10.0.0.0/16

Enter CIDR range (or press Enter to finish): [Press Enter]
✅ Added 1 IP range(s)
```

### Alternative: Use Local UI Repo

If you have the UI repo cloned locally:

```bash
# Don't use deploy script for UI - deploy directly
cd ui/cdk_backend
cp allowed-ips.txt.example allowed-ips.txt
nano allowed-ips.txt  # Add your IPs
npx cdk deploy
```

**Benefits:**
- ✅ More control
- ✅ File persists (not recreated each time)
- ✅ Can version control example files

### What If I Don't Configure IPs?

**Default behavior:** UI deploys with **NO IP restrictions** (publicly accessible with authentication).

This is the safe default - your application works for everyone, protected by Cognito authentication.

---

## Q2: How Do I Configure a Custom Hostname?

### Short Answer

**✨ NEW:** Custom domains are now integrated into the deploy script! You'll be prompted to configure after UI deployment, or you can configure manually in AWS Amplify. It takes 5-30 minutes.

### Default URL Format

```
https://main.{app-id}.amplifyapp.com
```

Example: `https://main.d1a2b3c4d5e6f7.amplifyapp.com`

### Custom Domain Options

```
https://pdf.yourdomain.com          ← Subdomain (recommended)
https://yourdomain.com              ← Root domain
https://pdf-tool.internal.yourdomain.com  ← Multi-level subdomain
```

### Quick Setup (Deploy Script - Recommended)

**The deploy script now handles this automatically!**

```bash
cd PDF_Accessibility
./deploy.sh

# During UI deployment:
# 1. UI deploys successfully
# 2. You'll be prompted: "Would you like to configure a custom domain? (y/n)"
# 3. Answer 'y'
# 4. Enter your domain (e.g., yourdomain.com)
# 5. Enter subdomain prefix (e.g., pdf) or leave blank for root
# 6. Script creates domain association and shows DNS records
# 7. Optionally wait and check status
# 8. Optionally update Cognito callback URLs automatically
```

**What the deploy script does:**
- ✅ Creates Amplify domain association
- ✅ Shows DNS records to add
- ✅ Polls status (optional)
- ✅ Updates Cognito callback URLs (optional)
- ✅ All automated!

**You still need to:**
- Add DNS records to your DNS provider (Route 53, Cloudflare, etc.)
- Wait for DNS propagation (5-30 minutes)

### Manual Setup (AWS Console)

**If you skipped the prompt or want to configure later:**

**Step 1: Find your Amplify app**
1. AWS Console → Amplify
2. Select `pdfui-amplify-app`

**Step 2: Add domain**
1. App settings → Domain management
2. Click "Add domain"
3. Enter: `yourdomain.com`
4. Configure subdomain: `pdf`
5. Select branch: `main`
6. Click "Save"

**Step 3: Configure DNS**
- **Route 53**: Click "Auto-configure" (done!)
- **Other providers**: Add CNAME record:
  ```
  pdf.yourdomain.com  CNAME  main.{appId}.amplifyapp.com
  ```

**Step 4: Update Cognito**
1. Cognito → User Pools → Your pool
2. App integration → App client settings
3. Update Callback URLs:
   ```
   https://pdf.yourdomain.com/callback
   ```
4. Update Logout URLs:
   ```
   https://pdf.yourdomain.com/
   ```

**Step 5: Wait for verification**
- DNS propagation: 5-30 minutes
- SSL certificate: Auto-provisioned
- Status: "Pending" → "Available"

### Complete Guide

For detailed instructions, troubleshooting, and all configuration methods, see:
**[docs/CUSTOM_DOMAIN_SETUP.md](CUSTOM_DOMAIN_SETUP.md)**

Topics covered:
- AWS Console setup (easiest)
- AWS CLI commands
- CDK infrastructure as code
- DNS configuration for all major providers
- SSL/TLS certificates
- Troubleshooting common issues
- Multiple environments (dev/prod)

---

## Comparison: Deploy Script vs Manual UI Deployment

| Feature | Deploy Script | Manual UI Deployment |
|---------|--------------|----------------------|
| **Location** | Backend repo | UI repo (ui/ subdirectory) |
| **Uses local UI** | ✅ Local ui/ directory | ✅ Direct access |
| **IP restrictions** | ✅ Interactive prompt | ✅ Edit allowed-ips.txt |
| **IP file persists** | ✅ In ui/ directory | ✅ In ui/ directory |
| **Custom domain** | ✅ Interactive prompt | ❌ Configure manually after |
| **Cognito updates** | ✅ Automated | ❌ Manual |
| **Integrated flow** | ✅ Backend + UI together | ❌ Separate steps |
| **Best for** | First-time setup | Ongoing updates |

---

## Recommended Workflow

### First Deployment

Use the deploy script for convenience:

```bash
cd PDF_Accessibility
./deploy.sh

# Choose: Deploy backend first, then UI
# Configure IP restrictions when prompted
# Note the Amplify URL from output
```

### Custom Domain Setup

After deployment, configure custom domain (one-time):

```bash
# AWS Console → Amplify → Add domain
# Or see docs/CUSTOM_DOMAIN_SETUP.md
```

### Subsequent Deployments

**Option A: Continue using deploy script**
```bash
cd PDF_Accessibility
./deploy.sh
# Re-enter IP ranges when prompted
```

**Option B: Deploy UI directly (faster for UI-only changes)**
```bash
cd ui/cdk_backend
# allowed-ips.txt already configured
npx cdk deploy
```

---

## Common Scenarios

### Scenario 1: "I want VPN-only access from the start"

```bash
cd PDF_Accessibility
./deploy.sh

# When prompted:
# Configure IP restrictions? (y/n): y
# Enter CIDR range: 10.0.0.0/16  ← Your VPN range
```

### Scenario 2: "I deployed without IP restrictions, now I want to add them"

```bash
cd ui/cdk_backend
cp allowed-ips.txt.example allowed-ips.txt
nano allowed-ips.txt  # Add your VPN CIDR
npx cdk deploy
```

### Scenario 3: "I want a custom domain from day one"

```bash
# 1. Deploy with deploy script
cd PDF_Accessibility
./deploy.sh

# 2. When prompted after UI deployment:
# "Would you like to configure a custom domain? (y/n)": y
# Enter your domain: yourdomain.com
# Enter subdomain prefix: pdf
# Script handles domain association and Cognito updates!

# 3. Add DNS records shown by the script to your DNS provider

# 4. Wait for DNS propagation (5-30 minutes)
```

### Scenario 4: "I want to change IP ranges"

**Method 1: Using deploy script (full redeploy)**
```bash
cd PDF_Accessibility
./deploy.sh
# Re-enter new IP ranges when prompted
```

**Method 2: Direct update (faster)**
```bash
cd ui/cdk_backend
nano allowed-ips.txt  # Update IPs
npx cdk deploy
```

**Method 3: AWS Console (no redeploy needed)**
```bash
# Update API Gateway Resource Policy
# Update Lambda function code
# (See ui/IP_RESTRICTIONS_SETUP.md)
```

---

## Troubleshooting

### "Deploy script doesn't prompt for IP restrictions"

**Cause:** You may have an older version of the deploy script

**Solution:**
```bash
cd PDF_Accessibility
git pull origin main  # Get latest changes
./deploy.sh
```

### "Custom domain shows 'Pending' forever"

**Cause:** DNS records not added or incorrect

**Solution:**
```bash
# Check DNS propagation
dig your-subdomain.yourdomain.com CNAME

# Verify CNAME points to correct Amplify URL
# Wait longer (can take up to 48 hours, usually 5-30 minutes)
```

### "After adding custom domain, login fails"

**Cause:** Cognito callback URLs not updated

**Solution:**
1. Update Cognito User Pool Client
2. Add new custom domain to callback URLs
3. Add new custom domain to logout URLs

### "Deploy script fails on IP validation"

**Cause:** Invalid CIDR format

**Solution:**
Use correct format:
- ✅ `10.0.0.0/16` (network range)
- ✅ `192.168.1.0/24` (subnet)
- ✅ `203.0.113.50/32` (single IP)
- ❌ `10.0.0.0` (missing /prefix)
- ❌ `10.0.0.0-10.0.255.255` (wrong format)

---

## Quick Reference

### Get Current IP
```bash
curl https://checkip.amazonaws.com
```

### Convert IP to CIDR (Single IP)
```bash
echo "$(curl -s https://checkip.amazonaws.com)/32"
```

### Check Amplify App ID
```bash
aws amplify list-apps --region us-east-1 \
  --query 'apps[?name==`pdfui-amplify-app`].appId' \
  --output text
```

### Check Current Domain
```bash
# Default URL format
https://main.{APP_ID}.amplifyapp.com

# Get from CloudFormation
aws cloudformation describe-stacks \
  --stack-name CdkBackendStack \
  --query 'Stacks[0].Outputs[?OutputKey==`AmplifyAppId`].OutputValue' \
  --output text
```

### Verify DNS
```bash
dig your-subdomain.yourdomain.com CNAME
nslookup your-subdomain.yourdomain.com
```

---

## Documentation Map

- **This Guide**: Deploy script & custom domain FAQ
- **IP Restrictions Setup**: `ui/IP_RESTRICTIONS_SETUP.md`
- **Custom Domain Setup**: `docs/CUSTOM_DOMAIN_SETUP.md`
- **IP Restrictions (Backend Reference)**: `docs/UI_IP_RESTRICTIONS.md`
- **All IP Options**: `docs/IP_ACCESS_CONTROL.md`

---

## Summary

**Deploy Script & IP Restrictions:**
✅ Works via interactive prompts
✅ Default = no restrictions
✅ Alternative: Configure in UI repo directly

**Custom Domains:**
✅ Configure after deployment in Amplify Console
✅ AWS manages SSL certificates automatically
✅ 5-30 minutes for verification
✅ Must update Cognito callback URLs

**Best Practice:**
1. Deploy with deploy script (with or without IPs)
2. Configure custom domain (if needed)
3. For updates, deploy UI repo directly (faster)
