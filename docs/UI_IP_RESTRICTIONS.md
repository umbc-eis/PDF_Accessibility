# IP-Based Access Restrictions for UI

The PDF Accessibility UI supports optional IP-based access control to restrict access to specific networks (VPN, office, etc.).

## Quick Overview

**Location:** This feature is configured in the UI subdirectory within this repository.

**Directory:** `ui/`

**Full Documentation:** See `ui/IP_RESTRICTIONS_SETUP.md`

---

## Quick Start

```bash
# Navigate to UI repository
cd ui/cdk_backend

# Copy example configuration
cp allowed-ips.txt.example allowed-ips.txt

# Edit and add your IP ranges
nano allowed-ips.txt

# Deploy
npx cdk deploy
```

---

## What Gets Restricted

When IP restrictions are enabled:

✅ **API Gateway** - Backend API calls return 403 Forbidden from unauthorized IPs
✅ **Cognito Login** - Authentication fails with clear error message from unauthorized IPs
✅ **All Application Features** - Require successful authentication (which requires authorized IP)

⚠️ **Amplify Frontend** - Static HTML/CSS/JS files remain publicly accessible (by design)

---

## Configuration File Format

File: `ui/cdk_backend/allowed-ips.txt`

```text
# Corporate VPN
10.0.0.0/16

# Office network
192.168.1.0/24

# Admin access
203.0.113.50/32
```

**Important:** This file is in `.gitignore` and should NOT be committed to version control.

---

## Default Behavior

If `allowed-ips.txt` doesn't exist or is empty:
- ✅ No IP restrictions applied
- ✅ Application accessible from any IP (with Cognito authentication)
- ✅ Current behavior maintained

---

## Security Model

This implements **defense in depth** with two layers:

1. **API Gateway Resource Policy**
   - Blocks all API calls from unauthorized IPs
   - Returns: HTTP 403 Forbidden

2. **Cognito Pre-Authentication Lambda**
   - Blocks login attempts from unauthorized IPs
   - Returns: User-friendly error message

**Result:** Users outside authorized networks cannot access the application.

---

## Updating IP Ranges

### Option 1: Update File and Redeploy (Recommended)

```bash
cd ui/cdk_backend
nano allowed-ips.txt
npx cdk deploy
```

### Option 2: Update via AWS Console

**See full documentation:** `ui/IP_RESTRICTIONS_SETUP.md`

Steps include:
- Update API Gateway Resource Policy
- Update Lambda function inline code
- Changes can be made without full redeployment

### Option 3: AWS CLI

Commands for updating API Gateway and Lambda functions via CLI are documented in the full guide.

---

## Use Cases

### Corporate VPN Only
```text
# allowed-ips.txt
10.0.0.0/16
```

### Multiple Networks
```text
# allowed-ips.txt
10.0.0.0/16         # Corporate VPN
10.1.0.0/16         # Backup VPN
192.168.1.0/24      # Main office
192.168.2.0/24      # Branch office
```

### Temporary Admin Access
```text
# allowed-ips.txt
10.0.0.0/16                    # Corporate VPN
203.0.113.50/32                # Admin (expires 2026-03-01)
```

---

## Architecture Notes

### Why No IP Restrictions on Backend?

The **backend** (PDF processing - this repository) does not need IP restrictions because:

1. **Triggered by S3 events** - No direct public access
2. **Runs in private VPC** - ECS tasks in private subnets
3. **No public endpoints** - Only S3 buckets are externally accessible
4. **S3 access controlled by Cognito** - Users must authenticate via UI first

### Backend Security Model

```
User → UI (IP restricted) → Cognito Auth → Identity Pool → S3 (with IAM policies)
                                              ↓
                                          S3 Event
                                              ↓
                                      Lambda Trigger (private)
                                              ↓
                                    Step Functions (private)
                                              ↓
                                      ECS Tasks (private VPC)
```

**Key Point:** The UI is the only public entry point, so IP restrictions there protect the entire system.

---

## For More Information

**Complete Setup Guide:** `ui/IP_RESTRICTIONS_SETUP.md`

**Topics Covered:**
- Detailed setup instructions
- CIDR notation guide
- Troubleshooting common issues
- Manual update procedures (AWS Console and CLI)
- Best practices and security recommendations
- Integration with CI/CD pipelines
- Cost analysis

---

## Quick Reference: CIDR Notation

- `/32` = Single IP address (e.g., 203.0.113.50/32)
- `/24` = 256 IP addresses (e.g., 192.168.1.0/24)
- `/16` = 65,536 IP addresses (e.g., 10.0.0.0/16)
- `/8` = 16,777,216 IP addresses (e.g., 10.0.0.0/8)

**Find your IP:**
```bash
curl https://checkip.amazonaws.com
```

---

## Support

- **Full Documentation:** `ui/IP_RESTRICTIONS_SETUP.md`
- **Architecture:** See [docs/IP_ACCESS_CONTROL.md](IP_ACCESS_CONTROL.md) for detailed options
- **Example Code:** See [docs/examples/ip-restriction-example.ts](examples/ip-restriction-example.ts)
