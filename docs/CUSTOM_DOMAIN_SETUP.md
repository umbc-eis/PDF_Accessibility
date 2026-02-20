# Custom Domain Setup for PDF Accessibility UI

This guide explains how to configure a custom domain (e.g., `pdf-tool.yourdomain.com`) for your Amplify-hosted UI instead of the default `https://main.{appId}.amplifyapp.com` URL.

## Quick Start: Deploy Script (Recommended)

**✨ NEW:** Custom domain configuration is now built into the deployment script!

When you deploy the UI using `./deploy.sh`, you'll be prompted to configure a custom domain after successful deployment. The script will:
- Create the domain association in Amplify
- Show you the DNS records to add
- Optionally wait and check status
- Update Cognito callback URLs automatically

**To use:**
```bash
./deploy.sh
# Select "Deploy Frontend UI"
# After deployment, answer "y" to custom domain prompt
```

**For manual configuration or if you skipped the prompt during deployment**, use one of the options below.

---

## Table of Contents

- [Quick Start: Deploy Script (Recommended)](#quick-start-deploy-script-recommended)
- [Prerequisites](#prerequisites)
- [Option 1: AWS Console (Easiest)](#option-1-aws-console-easiest)
- [Option 2: AWS CLI](#option-2-aws-cli)
- [Option 3: CDK Code (Infrastructure as Code)](#option-3-cdk-code-infrastructure-as-code)
- [DNS Configuration](#dns-configuration)
- [SSL/TLS Certificates](#ssltls-certificates)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin:

1. ✅ **Own a domain name** (e.g., `yourdomain.com`)
2. ✅ **Access to DNS management** (Route 53, GoDaddy, Cloudflare, etc.)
3. ✅ **Deployed Amplify app** (from the PDF Accessibility UI deployment)
4. ✅ **AWS Console access** or AWS CLI configured

**Domain Options:**
- Use subdomain: `pdf.yourdomain.com` (recommended)
- Use root domain: `yourdomain.com`
- Use multi-level subdomain: `pdf-tool.internal.yourdomain.com`

---

## Option 1: AWS Console (Easiest)

### Step 1: Open Amplify Console

1. Navigate to **AWS Console** → **Amplify**
2. Select your app: `pdfui-amplify-app`
3. Click **App settings** → **Domain management** in the left sidebar

### Step 2: Add Custom Domain

1. Click **Add domain**
2. **Enter your domain**: `yourdomain.com` or `subdomain.yourdomain.com`
3. Click **Configure domain**

### Step 3: Configure Branch

1. Amplify will show domain and subdomain options:
   ```
   Domain: yourdomain.com
   Subdomain: pdf
   Branch: main
   ```

   **Result:** Your UI will be at `pdf.yourdomain.com`

2. Or configure root domain:
   ```
   Domain: yourdomain.com
   Subdomain: (leave blank or use www)
   Branch: main
   ```

   **Result:** Your UI will be at `yourdomain.com`

3. Click **Save**

### Step 4: DNS Configuration

Amplify will show DNS records to add:

**For Route 53 (AWS-hosted domain):**
- Amplify can automatically add records ← **Click "Auto-configure"**

**For external DNS providers:**
- You'll see CNAME records like:
  ```
  pdf.yourdomain.com  CNAME  main.{appId}.amplifyapp.com
  ```
- Add these to your DNS provider

### Step 5: Wait for Verification

1. **DNS Verification**: 5-30 minutes (DNS propagation)
2. **SSL Certificate**: Auto-provisioned by Amplify (5-10 minutes)
3. **Status** will change from "Pending" → "Available"

### Step 6: Update Cognito Redirect URLs

**Important:** After adding custom domain, update Cognito callback URLs:

1. Navigate to **Cognito** → **User Pools** → Select your pool
2. Go to **App integration** → **App client settings**
3. Update **Callback URLs**:
   ```
   https://pdf.yourdomain.com/callback
   ```
4. Update **Sign out URLs**:
   ```
   https://pdf.yourdomain.com/
   ```
5. **Save changes**

### Step 7: Redeploy UI (Update Environment Variables)

The UI needs to know about the custom domain:

```bash
cd ui/cdk_backend
npx cdk deploy
```

Or update manually in Amplify Console:
1. **App settings** → **Environment variables**
2. Update `REACT_APP_HOSTED_UI_URL` to your custom domain

---

## Option 2: AWS CLI

### Step 1: Get Amplify App ID

```bash
# List Amplify apps
aws amplify list-apps --region us-east-1

# Note your app ID
APP_ID="your-app-id-here"
REGION="us-east-1"
```

### Step 2: Create Domain Association

```bash
# Set your domain
DOMAIN="yourdomain.com"
SUBDOMAIN="pdf"  # Optional, use "" for root domain

# Create domain association
aws amplify create-domain-association \
  --app-id $APP_ID \
  --domain-name $DOMAIN \
  --sub-domain-settings '[
    {
      "prefix": "'$SUBDOMAIN'",
      "branchName": "main"
    }
  ]' \
  --region $REGION
```

**Response includes DNS records:**
```json
{
  "domainAssociation": {
    "domainName": "yourdomain.com",
    "domainStatus": "PENDING_VERIFICATION",
    "certificateVerificationDNSRecord": "...",
    "subDomains": [...]
  }
}
```

### Step 3: Get DNS Records

```bash
aws amplify get-domain-association \
  --app-id $APP_ID \
  --domain-name $DOMAIN \
  --region $REGION
```

### Step 4: Add DNS Records

Extract CNAME records from response and add to your DNS provider:

```bash
# Example output:
pdf.yourdomain.com  CNAME  main.d1234abcd5678.amplifyapp.com
```

### Step 5: Verify Status

```bash
# Check status (repeat until "AVAILABLE")
aws amplify get-domain-association \
  --app-id $APP_ID \
  --domain-name $DOMAIN \
  --query 'domainAssociation.domainStatus' \
  --output text \
  --region $REGION
```

### Step 6: Update Cognito (AWS CLI)

```bash
# Get User Pool ID
USER_POOL_ID=$(aws cognito-idp list-user-pools --max-results 10 \
  --query 'UserPools[?Name==`PDF-Accessability-User-Pool`].Id' \
  --output text)

# Get App Client ID
APP_CLIENT_ID=$(aws cognito-idp list-user-pool-clients \
  --user-pool-id $USER_POOL_ID \
  --query 'UserPoolClients[0].ClientId' \
  --output text)

# Update callback URLs
aws cognito-idp update-user-pool-client \
  --user-pool-id $USER_POOL_ID \
  --client-id $APP_CLIENT_ID \
  --callback-urls "https://pdf.yourdomain.com/callback" \
  --logout-urls "https://pdf.yourdomain.com/"
```

---

## Option 3: CDK Code (Infrastructure as Code)

Add custom domain configuration to your CDK stack.

### Step 1: Modify CDK Stack

Edit: `ui/cdk_backend/lib/cdk_backend-stack.ts`

```typescript
// After creating the Amplify app (around line 97)
const amplifyApp = new amplify.App(this, 'pdfui-amplify-app', {
  description: 'PDF Accessibility UI - Manual Deployment',
});

const mainBranch = amplifyApp.addBranch('main', {
  autoBuild: false,
  stage: 'PRODUCTION'
});

// ✅ ADD CUSTOM DOMAIN
const customDomain = new amplify.CfnDomain(this, 'AmplifyCustomDomain', {
  appId: amplifyApp.appId,
  domainName: 'yourdomain.com',  // ⚠️ Replace with your domain
  subDomainSettings: [
    {
      branchName: mainBranch.branchName,
      prefix: 'pdf',  // Subdomain prefix (use '' for root)
    },
  ],
});

// Update appUrl to use custom domain
const appUrl = 'https://pdf.yourdomain.com';  // ⚠️ Replace with your domain
```

### Step 2: Update Cognito Configuration

```typescript
// Update the Cognito callback URLs (around line 330)
const userPoolClient = userPool.addClient('PDF-Accessability-User-Pool-Client', {
  // ... existing config ...
  oAuth: {
    callbackUrls: [
      'https://pdf.yourdomain.com/callback',  // ⚠️ Use your custom domain
      'http://localhost:3000/callback'  // Keep for local development
    ],
    logoutUrls: [
      'https://pdf.yourdomain.com/',  // ⚠️ Use your custom domain
      'http://localhost:3000/'
    ],
    // ... rest of config ...
  },
});
```

### Step 3: Deploy

```bash
cd ui/cdk_backend
npx cdk deploy
```

### Step 4: Add DNS Records

After deployment, CDK will output the required DNS records:

```
Outputs:
CdkBackendStack.CustomDomainCertificateRecord = _abc123.yourdomain.com CNAME _xyz789.acm-validations.aws
CdkBackendStack.CustomDomainCNAME = pdf.yourdomain.com CNAME main.d1234abcd5678.amplifyapp.com
```

Add these to your DNS provider.

---

## DNS Configuration

### Route 53 (AWS-hosted)

**Amplify can auto-configure** - just click the button in the console!

Or manually:

```bash
HOSTED_ZONE_ID="your-zone-id"

# Add CNAME record
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "pdf.yourdomain.com",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [
          {"Value": "main.d1234abcd5678.amplifyapp.com"}
        ]
      }
    }]
  }'
```

### GoDaddy

1. Log in to GoDaddy
2. Go to **My Products** → **DNS**
3. Add **CNAME Record**:
   - **Name**: `pdf`
   - **Value**: `main.d1234abcd5678.amplifyapp.com`
   - **TTL**: 600 seconds

### Cloudflare

1. Log in to Cloudflare
2. Select your domain
3. Go to **DNS**
4. Add **CNAME Record**:
   - **Name**: `pdf`
   - **Target**: `main.d1234abcd5678.amplifyapp.com`
   - **Proxy status**: DNS only (gray cloud) ⚠️ **Important!**
   - **TTL**: Auto

**Note:** For Cloudflare, you MUST disable the proxy (gray cloud) for Amplify domains to work correctly.

### Other DNS Providers

General instructions:
1. Add CNAME record
2. Point subdomain (`pdf`) to Amplify URL
3. Wait for DNS propagation (5-30 minutes)

---

## SSL/TLS Certificates

### Automatic (Default)

Amplify automatically provisions SSL certificates via **AWS Certificate Manager (ACM)**:

✅ **Free** - No cost for certificates
✅ **Auto-renewal** - Certificates renew automatically
✅ **HTTPS enforced** - HTTP redirects to HTTPS

**Verification Methods:**
- **DNS Validation** (recommended) - Amplify adds TXT records
- **Email Validation** - Emails sent to domain admin

### Check Certificate Status

**AWS Console:**
1. Amplify → Your App → Domain management
2. Check status: "Pending" → "Creating" → "Available"

**AWS CLI:**
```bash
aws amplify get-domain-association \
  --app-id $APP_ID \
  --domain-name yourdomain.com \
  --query 'domainAssociation.certificateVerificationDNSRecord' \
  --output text
```

---

## Testing

### Verify DNS Propagation

```bash
# Check CNAME record
dig pdf.yourdomain.com CNAME

# Or
nslookup pdf.yourdomain.com
```

### Test HTTPS

```bash
# Should return 200 OK
curl -I https://pdf.yourdomain.com

# Check certificate
openssl s_client -connect pdf.yourdomain.com:443 -servername pdf.yourdomain.com
```

### Test Login Flow

1. Navigate to `https://pdf.yourdomain.com`
2. Click login → Should redirect to Cognito
3. After login → Should redirect back to your custom domain

---

## Troubleshooting

### "Domain verification failed"

**Cause:** DNS records not added or not propagated

**Solution:**
```bash
# Check DNS propagation
dig pdf.yourdomain.com

# Wait longer (DNS can take up to 48 hours, usually 5-30 minutes)
# Verify records are correct in DNS provider
```

### "SSL certificate pending"

**Cause:** DNS validation not complete

**Solution:**
1. Check ACM validation records are added to DNS
2. Wait for DNS propagation
3. Check ACM console for validation status

### "Login redirect fails after custom domain"

**Cause:** Cognito callback URLs not updated

**Solution:**
```bash
# Update Cognito User Pool Client callback URLs
# Must include new custom domain
Callback URLs: https://pdf.yourdomain.com/callback
Logout URLs: https://pdf.yourdomain.com/
```

### "Cloudflare: ERR_TOO_MANY_REDIRECTS"

**Cause:** Cloudflare proxy enabled (orange cloud)

**Solution:**
- Disable Cloudflare proxy for Amplify subdomains
- Set to "DNS only" (gray cloud)

### "Custom domain not showing in Amplify"

**Cause:** May need to refresh or redeploy

**Solution:**
```bash
# Trigger a new deployment
cd ui
git push origin main

# Or manual deploy in Amplify Console
```

---

## Multiple Environments

### Development vs Production

```typescript
// Different domains per environment
const domain = process.env.STAGE === 'prod'
  ? 'pdf.yourdomain.com'
  : 'pdf-dev.yourdomain.com';

const customDomain = new amplify.CfnDomain(this, 'AmplifyCustomDomain', {
  appId: amplifyApp.appId,
  domainName: 'yourdomain.com',
  subDomainSettings: [
    {
      branchName: mainBranch.branchName,
      prefix: process.env.STAGE === 'prod' ? 'pdf' : 'pdf-dev',
    },
  ],
});
```

---

## Cost Considerations

**Custom domains on Amplify:**
- ✅ **$0** for DNS and domain management
- ✅ **$0** for SSL certificates (ACM-managed)
- ✅ **Standard Amplify hosting costs** (~$0.15/GB transferred + $0.023/build minute)

**Route 53 (if using):**
- **$0.50/month** per hosted zone
- **$0.40/million** queries (first billion)

**External DNS (GoDaddy, Cloudflare, etc):**
- Varies by provider (usually free with domain purchase)

---

## Best Practices

### 1. Use Subdomains

✅ **Recommended:**
```
pdf.yourdomain.com
pdf-tool.yourdomain.com
```

❌ **Avoid:**
```
yourdomain.com  (root domain may have existing uses)
```

### 2. Use Short, Descriptive Names

✅ **Good:**
- `pdf.company.com`
- `accessibility.company.com`
- `pdf-tool.company.com`

❌ **Avoid:**
- `pdf-accessibility-remediation-tool.company.com` (too long)

### 3. Document Your Configuration

Keep record of:
- Domain name used
- DNS provider
- DNS records added
- Cognito callback URLs configured
- Date configured

### 4. Test Before Announcing

- Test from multiple networks
- Test login/logout flow
- Test file upload/download
- Test with IP restrictions (if enabled)

---

## Quick Reference

### Default URL Format
```
https://main.{app-id}.amplifyapp.com
```

### Custom Domain URL Format
```
https://subdomain.yourdomain.com
https://yourdomain.com  (root domain)
```

### Required DNS Record
```
TYPE: CNAME
NAME: subdomain  (or @ for root)
VALUE: main.{app-id}.amplifyapp.com
TTL: 300-3600
```

### Required Cognito Update
```
Callback URLs: https://subdomain.yourdomain.com/callback
Logout URLs: https://subdomain.yourdomain.com/
```

---

## Support

For questions or issues:
- **AWS Amplify Docs**: https://docs.aws.amazon.com/amplify/latest/userguide/custom-domains.html
- **ACM (Certificates)**: https://docs.aws.amazon.com/acm/latest/userguide/
- **Route 53**: https://docs.aws.amazon.com/route53/

---

## Summary

**Easiest Method:** Use AWS Console (Option 1)
- Add domain in Amplify Console
- Auto-configure DNS (if using Route 53)
- Update Cognito callback URLs
- Wait for verification (5-30 minutes)

**Most Flexible:** Use CDK (Option 3)
- Infrastructure as code
- Version controlled
- Repeatable deployments

**Choose based on your preference and deployment workflow!**
