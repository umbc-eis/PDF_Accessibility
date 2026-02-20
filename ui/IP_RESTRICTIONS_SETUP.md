# IP-Based Access Control Setup Guide

This guide explains how to configure and manage IP-based access restrictions for the PDF Accessibility UI.

## Overview

The UI supports optional IP-based access control to restrict access to users connecting from specific networks (e.g., corporate VPN, office network). This implements a defense-in-depth security model:

1. **API Gateway Resource Policy** - Blocks API calls from unauthorized IPs (returns 403 Forbidden)
2. **Cognito Pre-Authentication Lambda** - Blocks login attempts from unauthorized IPs (user-friendly error message)

**Default Behavior:** If no IP restrictions are configured, the application works as normal (publicly accessible with Cognito authentication required).

---

## Quick Start

### 1. Enable IP Restrictions

```bash
# Navigate to the CDK directory
cd cdk_backend

# Copy the example file
cp allowed-ips.txt.example allowed-ips.txt

# Edit and add your IP ranges
nano allowed-ips.txt  # or use your preferred editor
```

### 2. Configure Your IP Ranges

Edit `cdk_backend/allowed-ips.txt`:

```text
# Add your VPN or office network CIDR ranges
10.0.0.0/16         # Corporate VPN range
192.168.1.0/24      # Office network
203.0.113.50/32     # Specific admin IP
```

### 3. Deploy

```bash
npx cdk deploy
```

### 4. Verify

**From inside your VPN/network:**
- Navigate to your Amplify URL
- Login should work normally ✅

**From outside your VPN/network:**
- Navigate to your Amplify URL (page loads)
- Attempt login → Get error message ❌

```
Access denied: Your IP address (X.X.X.X) is not authorized to access this application.
Please connect to your organization's VPN or network and try again.
```

---

## File Format: allowed-ips.txt

```text
# Lines starting with # are comments
# Empty lines are ignored
# One CIDR range per line

# Examples:
10.0.0.0/16          # Allows 10.0.0.0 - 10.0.255.255 (65,536 IPs)
192.168.1.0/24       # Allows 192.168.1.0 - 192.168.1.255 (256 IPs)
203.0.113.50/32      # Single IP address
```

**CIDR Notation Quick Reference:**
- `/32` = Single IP (e.g., 203.0.113.50/32)
- `/24` = 256 IPs (e.g., 192.168.1.0/24)
- `/16` = 65,536 IPs (e.g., 10.0.0.0/16)
- `/8` = 16,777,216 IPs (e.g., 10.0.0.0/8)

---

## Disabling IP Restrictions

**Option 1: Delete the file**
```bash
cd cdk_backend
rm allowed-ips.txt
npx cdk deploy
```

**Option 2: Empty the file**
```bash
cd cdk_backend
> allowed-ips.txt  # Creates empty file
npx cdk deploy
```

After deployment, all IP restrictions are removed and the application returns to public access (with authentication).

---

## Security Model

### What's Protected

✅ **API Endpoints** - All backend API calls require authorized IP
✅ **User Authentication** - Login blocked from unauthorized IPs
✅ **File Operations** - S3 access requires successful authentication (which requires authorized IP)

### What's NOT Protected

⚠️ **Static Frontend** - Amplify-hosted HTML/CSS/JS files are still publicly accessible
- Users can see the login page
- Page loads normally
- No functionality works without authentication

**This is by design** - Similar to how Gmail shows a login page publicly, but you can't access emails without logging in.

### User Experience

**Authorized IP (Inside VPN):**
```
1. Visit site → ✅ Page loads
2. Login → ✅ Success
3. Use application → ✅ Full access
```

**Unauthorized IP (Outside VPN):**
```
1. Visit site → ✅ Page loads (static files)
2. Login → ❌ "Access denied: Your IP address (X.X.X.X) is not authorized..."
3. Try API → ❌ 403 Forbidden
```

---

## Finding Your IP Address

### Get Your Current IP
```bash
# Option 1
curl https://checkip.amazonaws.com

# Option 2
curl https://ifconfig.me

# Option 3 (with CIDR notation for single IP)
echo "$(curl -s https://checkip.amazonaws.com)/32"
```

### Get Your Network Range

**Scenario 1: Office Network**
If your office has a static IP block, ask your network administrator for the CIDR range.

Example: If your office uses IPs 192.168.1.1 to 192.168.1.254:
```
192.168.1.0/24
```

**Scenario 2: Corporate VPN**
Your VPN administrator can provide the exit IP ranges. VPNs typically use a dedicated CIDR block.

Example:
```
10.0.0.0/16
```

**Scenario 3: Multiple Locations**
Add one CIDR range per line:
```
10.0.0.0/16         # Corporate VPN
10.1.0.0/16         # Backup VPN
192.168.1.0/24      # Main office
192.168.2.0/24      # Branch office
```

---

## Updating IP Ranges (Manual - AWS Console)

### Option 1: Update API Gateway Resource Policy

1. **Open AWS Console** → API Gateway
2. **Select** "UpdateAttributesApi"
3. **Click** "Resource Policy" in left sidebar
4. **Edit** the `aws:SourceIp` condition:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Principal": "*",
       "Action": "execute-api:Invoke",
       "Resource": "execute-api:/*",
       "Condition": {
         "IpAddress": {
           "aws:SourceIp": [
             "10.0.0.0/16",
             "192.168.1.0/24",
             "NEW_IP_RANGE_HERE"
           ]
         }
       }
     }]
   }
   ```
5. **Click** "Save"
6. **Deploy** changes to stage "prod"

**Note:** This only updates API restrictions, not the Cognito Lambda.

### Option 2: Update Cognito Lambda (IP Check at Login)

1. **Open AWS Console** → Lambda
2. **Select** "PreAuthIpCheckLambda"
3. **Edit** the inline code and update the `ALLOWED_IP_RANGES` list:
   ```python
   ALLOWED_IP_RANGES = [
       '10.0.0.0/16',
       '192.168.1.0/24',
       'NEW_IP_RANGE_HERE',
   ]
   ```
4. **Click** "Deploy"

**Changes are immediate** - no deployment required.

---

## Updating IP Ranges (AWS CLI)

### Update API Gateway Resource Policy

```bash
# Set variables
API_ID="your-api-gateway-id"
REGION="us-east-1"

# Create new policy (update IPs as needed)
cat > policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "execute-api:Invoke",
    "Resource": "execute-api:/*",
    "Condition": {
      "IpAddress": {
        "aws:SourceIp": [
          "10.0.0.0/16",
          "192.168.1.0/24"
        ]
      }
    }
  }]
}
EOF

# Update the policy
aws apigateway update-rest-api \
  --rest-api-id $API_ID \
  --region $REGION \
  --patch-operations op=replace,path=/policy,value="$(cat policy.json | jq -c .)"

# Deploy changes
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod \
  --region $REGION
```

### Update Lambda Function Code

```bash
# Set variables
FUNCTION_NAME="PreAuthIpCheckLambda"
REGION="us-east-1"

# Get current function code
aws lambda get-function --function-name $FUNCTION_NAME --region $REGION

# Update inline code with new IPs
cat > lambda_code.py << 'EOF'
import ipaddress

ALLOWED_IP_RANGES = [
    '10.0.0.0/16',
    '192.168.1.0/24',
]

def handler(event, context):
    # ... rest of Lambda code (get from console)
EOF

# Update function (requires full code)
zip function.zip lambda_code.py
aws lambda update-function-code \
  --function-name $FUNCTION_NAME \
  --zip-file fileb://function.zip \
  --region $REGION
```

**Easier approach:** Update via allowed-ips.txt and redeploy CDK stack.

---

## Troubleshooting

### Issue: "Access denied" from authorized IP

**Possible causes:**
1. IP address is not in `allowed-ips.txt`
2. CIDR notation is incorrect
3. You're behind a NAT/proxy with different external IP
4. VPN not connected

**Solution:**
```bash
# Check your actual external IP
curl https://checkip.amazonaws.com

# Verify it's in your allowed ranges
# If not, add it to allowed-ips.txt and redeploy
```

### Issue: Changes not taking effect

**Possible causes:**
1. Forgot to run `npx cdk deploy`
2. Deployment failed (check CloudFormation console)
3. Browser cached old Cognito tokens

**Solution:**
```bash
# Redeploy
cd cdk_backend
npx cdk deploy

# Clear browser cache and Cognito tokens
# Logout and login again
```

### Issue: Mobile users can't access

**Problem:** Mobile carrier IPs are dynamic and change frequently.

**Solutions:**
1. Require VPN for mobile access
2. Use broader IP ranges (but less secure)
3. Consider alternative authentication (certificate-based, device trust)

### Issue: Remote workers can't access

**Problem:** Home IPs are typically dynamic.

**Solution:** Require corporate VPN connection:
- Document in user onboarding
- Add VPN CIDR ranges to allowed-ips.txt
- Provide clear error messages (already included)

### Issue: "Unable to determine source IP"

**Possible causes:**
1. Cognito event format changed (rare)
2. User behind multiple proxies
3. Network configuration issue

**Solution:**
Check Lambda logs:
```bash
aws logs tail /aws/lambda/PreAuthIpCheckLambda --follow
```

---

## Best Practices

### 1. Use Network Ranges, Not Individual IPs

❌ **Bad:**
```text
203.0.113.50/32
203.0.113.51/32
203.0.113.52/32
...
```

✅ **Good:**
```text
203.0.113.0/24
```

### 2. Document Your IP Ranges

Add comments to `allowed-ips.txt`:
```text
# Corporate VPN (managed by IT)
10.0.0.0/16

# Main office network (static IP block)
192.168.1.0/24

# Admin emergency access (John Doe's home IP, expires 2026-03-01)
203.0.113.50/32
```

### 3. Regular Audits

- Review `allowed-ips.txt` quarterly
- Remove temporary access grants
- Verify all ranges are still in use
- Update documentation when networks change

### 4. Test Before Deploying

```bash
# Always test from inside your network first
# Then test from outside (mobile data, home network)
# Verify error messages are clear and helpful
```

### 5. Monitor Failed Login Attempts

```bash
# Check Lambda logs for blocked attempts
aws logs tail /aws/lambda/PreAuthIpCheckLambda --follow

# Look for patterns:
# - Multiple attempts from same IP = potential attack
# - Authorized user from wrong IP = needs VPN instructions
```

### 6. Keep allowed-ips.txt Out of Git

✅ Already configured in `.gitignore`
```text
cdk_backend/allowed-ips.txt
```

Only commit `allowed-ips.txt.example` with sample ranges.

---

## Integration with CI/CD

If deploying via CI/CD pipeline:

### Option 1: Store IPs in Secrets Manager

```bash
# Store IP ranges in Secrets Manager
aws secretsmanager create-secret \
  --name pdf-ui-allowed-ips \
  --secret-string '["10.0.0.0/16", "192.168.1.0/24"]'

# Modify CDK to read from Secrets Manager instead of file
```

### Option 2: Environment Variable

```bash
# Set during deployment
export ALLOWED_IP_RANGES="10.0.0.0/16,192.168.1.0/24"
npx cdk deploy
```

### Option 3: Parameter Store

```bash
# Store in Parameter Store
aws ssm put-parameter \
  --name /pdf-ui/allowed-ips \
  --value "10.0.0.0/16,192.168.1.0/24" \
  --type StringList
```

---

## Cost Impact

**IP Restrictions add NO additional cost:**
- ✅ API Gateway Resource Policy: FREE
- ✅ Cognito Lambda Trigger: FREE (covered by Lambda free tier)
- ✅ CloudWatch Logs: Minimal (a few KB per login)

---

## Support

For questions or issues:
- Check this documentation first
- Review CloudWatch logs for Lambda and API Gateway
- Contact your administrator or AWS support
