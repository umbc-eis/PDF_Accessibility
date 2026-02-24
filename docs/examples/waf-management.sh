#!/usr/bin/env bash
# =============================================================================
# WAF Management Examples
#
# The WAF for the PDF Accessibility UI is configured automatically during
# deployment (via deploy.sh → setup-waf.py). Use these examples to inspect
# or update WAF settings after deployment without a full redeploy.
#
# All WAFv2 commands use --region us-east-1 because CloudFront-scoped
# WebACLs must reside in us-east-1 regardless of your deployment region.
# =============================================================================

# ---------------------------------------------------------------------------
# 1. Find your WAF and Amplify app IDs
# ---------------------------------------------------------------------------

# List all PDF UI WAFs
aws wafv2 list-web-acls --scope CLOUDFRONT --region us-east-1 \
  --query 'WebACLs[?starts_with(Name, `PdfUiWAF-`)].[Name,Id,ARN]' \
  --output table

# Get Amplify app ID from CloudFormation
aws cloudformation describe-stacks --stack-name CdkBackendStack \
  --query 'Stacks[0].Outputs[?OutputKey==`AmplifyAppId`].OutputValue' \
  --output text

# ---------------------------------------------------------------------------
# 2. View current WAF configuration
# ---------------------------------------------------------------------------

WAF_NAME="PdfUiWAF-<your-amplify-app-id>"
WAF_ID="<your-waf-id>"

# See default action and rule names
aws wafv2 get-web-acl --scope CLOUDFRONT --region us-east-1 \
  --name "$WAF_NAME" --id "$WAF_ID" \
  --query '{DefaultAction:WebACL.DefaultAction, Rules:WebACL.Rules[*].{Name:Name,Priority:Priority,Action:Action,Override:OverrideAction}}'

# ---------------------------------------------------------------------------
# 3. View / update the IP allowlist
# ---------------------------------------------------------------------------

IPSET_NAME="PdfUiIPSet-<your-amplify-app-id>"
IPSET_ID="<your-ipset-id>"

# Find the IP set
aws wafv2 list-ip-sets --scope CLOUDFRONT --region us-east-1 \
  --query 'IPSets[?starts_with(Name, `PdfUiIPSet-`)].[Name,Id]' \
  --output table

# View current allowed IPs
aws wafv2 get-ip-set --scope CLOUDFRONT --region us-east-1 \
  --name "$IPSET_NAME" --id "$IPSET_ID" \
  --query 'IPSet.Addresses'

# Update the IP allowlist (lock token required for every update)
LOCK_TOKEN=$(aws wafv2 get-ip-set --scope CLOUDFRONT --region us-east-1 \
  --name "$IPSET_NAME" --id "$IPSET_ID" \
  --query 'LockToken' --output text)

aws wafv2 update-ip-set --scope CLOUDFRONT --region us-east-1 \
  --name "$IPSET_NAME" --id "$IPSET_ID" \
  --lock-token "$LOCK_TOKEN" \
  --addresses "130.85.0.0/16" "198.51.100.0/24"

# ---------------------------------------------------------------------------
# 4. Re-run WAF setup directly (no full CDK redeploy needed)
#
# setup-waf.py reads WAF_ALLOWED_IPS and WAF_ALLOWED_COUNTRIES from env.
# Run it from the repo root with your AWS credentials active.
# ---------------------------------------------------------------------------

# Apply IP restriction
WAF_ALLOWED_IPS="130.85.0.0/16" python3 ui/setup-waf.py

# Apply country restriction
WAF_ALLOWED_COUNTRIES="US,CA,GB" python3 ui/setup-waf.py

# Managed rules only — no IP/country restriction (default action: Allow)
python3 ui/setup-waf.py

# ---------------------------------------------------------------------------
# 5. Find your public IP address
# ---------------------------------------------------------------------------

# Current public IP
curl -s https://checkip.amazonaws.com

# As a /32 CIDR (single host)
echo "$(curl -s https://checkip.amazonaws.com)/32"

# For an organization's network block, check with your network team or:
# https://search.arin.net/

# ---------------------------------------------------------------------------
# 6. Verify WAF is associated with your Amplify app
# ---------------------------------------------------------------------------

AMPLIFY_APP_ID="<your-amplify-app-id>"

aws amplify get-app --app-id "$AMPLIFY_APP_ID" \
  --query 'app.wafConfiguration'

# ---------------------------------------------------------------------------
# 7. ISO 3166-1 country code reference
#
# Use these two-letter codes with WAF_ALLOWED_COUNTRIES.
# Full list: https://www.iso.org/obp/ui/#search/code/
#
# Common codes:
#   US - United States
#   CA - Canada
#   GB - United Kingdom
#   AU - Australia
#   DE - Germany
#   FR - France
#   JP - Japan
# ---------------------------------------------------------------------------
