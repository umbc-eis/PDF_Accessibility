# IP Access Control

Access control for the PDF Accessibility UI is enforced at the **Amplify/CloudFront layer** using AWS WAF. This provides the strongest possible enforcement point: blocked traffic never reaches the application, API Gateway, or Cognito.

---

## How It Works

Every deployment automatically creates or updates a WAFv2 WebACL (CloudFront-scoped, `us-east-1`) and associates it with the Amplify app. The WebACL always includes the three Amplify-recommended managed rule groups, plus optional IP or country restrictions that you configure during deployment.

### Always-on managed rules

| Rule | Purpose |
|------|---------|
| `AWSManagedRulesAmazonIpReputationList` | Blocks IPs known to be associated with bots, malware, and other threats |
| `AWSManagedRulesCommonRuleSet` | OWASP Top 10 protection (SQLi, XSS, etc.) |
| `AWSManagedRulesKnownBadInputsRuleSet` | Blocks requests with known-bad payloads and patterns |

### Optional access restrictions

You configure one of these during deployment:

| Mode | Default action | How it works |
|------|---------------|--------------|
| **IP allowlist** | Block | Only requests from your specified CIDR ranges are allowed through |
| **Country allowlist** | Block | Only requests from your specified countries are allowed through |
| **None** (default) | Allow | All traffic passes the managed rules; no additional restriction |

---

## Configuring at Deploy Time

When you run `deploy.sh`, you are prompted:

```
Firewall (WAF) Configuration:
   The following Amplify-recommended protections are always applied:
     - IP Reputation List  (blocks known malicious IPs)
     - Common Rule Set     (OWASP Top 10 protection)
     - Known Bad Inputs    (blocks common attack patterns)

Restrict access to specific IP ranges only? (yes/no) [no]:
```

**If you answer yes**, enter comma-separated CIDR ranges:
```
Enter allowed CIDR ranges (comma-separated, e.g. 130.85.0.0/16,10.0.0.0/8):
```

**If you answer no**, you are asked:
```
Restrict access to specific countries only? (yes/no) [no]:
```

If yes, you are shown the ISO country code reference and prompted for codes:
```
   Look up ISO 3166-1 alpha-2 country codes at:
   https://www.iso.org/obp/ui/#search/code/

Enter allowed country codes (comma-separated, e.g. US,CA,GB):
```

The values are passed to CodeBuild and applied by `ui/setup-waf.py` after the CDK stack is deployed.

---

## Updating After Deployment

### AWS Console (easiest)

1. Go to **AWS WAF & Shield** → **Web ACLs**
2. Select region **US East (N. Virginia)** — CloudFront-scoped WAFs are always here
3. Find `PdfUiWAF-<your-amplify-app-id>`
4. Select the **Rules** tab

**To update IP ranges:**
- Click the `IpAllowList` rule → Edit
- The associated IP set is `PdfUiIPSet-<app-id>` — edit its addresses there

**To add/remove country restrictions:**
- Edit the `GeoAllowList` rule and update the country code list

**To remove all restrictions** (keep only managed rules):
- Delete the `IpAllowList` or `GeoAllowList` rules
- Change the **Default action** from Block to Allow

### AWS CLI

**View current WAF and its rules:**
```bash
# Find your WAF
aws wafv2 list-web-acls --scope CLOUDFRONT --region us-east-1 \
  --query 'WebACLs[?starts_with(Name, `PdfUiWAF-`)].[Name,Id]' --output table

# Get full rule details (replace NAME and ID)
aws wafv2 get-web-acl --scope CLOUDFRONT --region us-east-1 \
  --name PdfUiWAF-<app-id> --id <waf-id> \
  --query '{DefaultAction:WebACL.DefaultAction, Rules:WebACL.Rules[*].Name}'
```

**View current IP allowlist:**
```bash
aws wafv2 list-ip-sets --scope CLOUDFRONT --region us-east-1 \
  --query 'IPSets[?starts_with(Name, `PdfUiIPSet-`)].[Name,Id]' --output table

aws wafv2 get-ip-set --scope CLOUDFRONT --region us-east-1 \
  --name PdfUiIPSet-<app-id> --id <ipset-id> \
  --query 'IPSet.Addresses'
```

**Update the IP allowlist in place:**
```bash
# 1. Get the current lock token
LOCK_TOKEN=$(aws wafv2 get-ip-set --scope CLOUDFRONT --region us-east-1 \
  --name PdfUiIPSet-<app-id> --id <ipset-id> \
  --query 'LockToken' --output text)

# 2. Update with new addresses
aws wafv2 update-ip-set --scope CLOUDFRONT --region us-east-1 \
  --name PdfUiIPSet-<app-id> --id <ipset-id> \
  --lock-token "$LOCK_TOKEN" \
  --addresses "130.85.0.0/16" "10.0.0.1/32"
```

**Re-run WAF setup without full redeployment:**

If you just want to change WAF settings without redeploying the CDK stack, you can run `setup-waf.py` directly with the desired configuration:

```bash
cd /path/to/PDF_Accessibility

# IP restriction
WAF_ALLOWED_IPS="130.85.0.0/16" python3 ui/setup-waf.py

# Country restriction
WAF_ALLOWED_COUNTRIES="US,CA" python3 ui/setup-waf.py

# No restrictions (managed rules only)
python3 ui/setup-waf.py
```

> The script requires AWS credentials with `wafv2:*` and `amplify:GetApp`, `amplify:UpdateApp` permissions, and expects the `CdkBackendStack` CloudFormation stack to be deployed in the current region.

---

## Viewing Your Current IP

To find the IP or CIDR range you need to allow:

```bash
# Your current public IP
curl -s https://checkip.amazonaws.com

# As a /32 CIDR (single host)
echo "$(curl -s https://checkip.amazonaws.com)/32"

# For a university or organization, use their network block (e.g. 130.85.0.0/16)
# Check with your network team or use: https://search.arin.net/
```

---

## Architecture Notes

- The WAF WebACL is **CloudFront-scoped** and must reside in `us-east-1` regardless of the deployment region of the rest of the stack.
- The WAF is named `PdfUiWAF-<amplify-app-id>` and the IP set `PdfUiIPSet-<amplify-app-id>`, making them easy to locate and idempotent across re-deployments.
- The `setup-waf.py` script is fully idempotent: re-running it updates existing resources rather than creating duplicates.
- The Cognito `preSignUp` trigger still independently enforces **`@umbc.edu` email addresses** at registration. The WAF and Cognito restrictions are complementary layers.
