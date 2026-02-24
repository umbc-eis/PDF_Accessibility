#!/usr/bin/env python3
"""
WAF Setup for Amplify App

Creates or updates a WAFv2 WebACL (CloudFront-scoped, us-east-1) with:
  - Amplify-recommended managed rules (always applied)
  - Optional IP allowlist   (WAF_ALLOWED_IPS env var, comma-separated CIDRs)
  - Optional geo allowlist  (WAF_ALLOWED_COUNTRIES env var, comma-separated ISO codes)

When IP or country restrictions are set the default action is Block;
otherwise the default action is Allow (managed rules still block known-bad traffic).
"""

import boto3
import os
import sys

STACK_NAME = "CdkBackendStack"
WAF_REGION = "us-east-1"   # CloudFront-scoped WAF must always be in us-east-1


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_amplify_app_id():
    region = os.environ.get("AWS_DEFAULT_REGION") or os.environ.get("AWS_REGION", "us-east-1")
    cf = boto3.client("cloudformation", region_name=region)
    resp = cf.describe_stacks(StackName=STACK_NAME)
    for output in resp["Stacks"][0].get("Outputs", []):
        if output["OutputKey"] == "AmplifyAppId":
            return output["OutputValue"]
    raise RuntimeError(f"AmplifyAppId not found in CloudFormation stack '{STACK_NAME}' outputs")


def find_web_acl(waf_client, name):
    paginator = waf_client.get_paginator("list_web_acls")
    for page in paginator.paginate(Scope="CLOUDFRONT"):
        for acl in page["WebACLs"]:
            if acl["Name"] == name:
                return acl
    return None


def find_ip_set(waf_client, name):
    paginator = waf_client.get_paginator("list_ip_sets")
    for page in paginator.paginate(Scope="CLOUDFRONT"):
        for ip_set in page["IPSets"]:
            if ip_set["Name"] == name:
                return ip_set
    return None


# ---------------------------------------------------------------------------
# Rule builder
# ---------------------------------------------------------------------------

def build_rules(ip_set_arn=None, country_codes=None):
    rules = [
        {
            "Name": "AWS-AWSManagedRulesAmazonIpReputationList",
            "Priority": 0,
            "Statement": {
                "ManagedRuleGroupStatement": {
                    "VendorName": "AWS",
                    "Name": "AWSManagedRulesAmazonIpReputationList",
                }
            },
            "OverrideAction": {"None": {}},
            "VisibilityConfig": {
                "SampledRequestsEnabled": True,
                "CloudWatchMetricsEnabled": True,
                "MetricName": "AWS-AWSManagedRulesAmazonIpReputationList",
            },
        },
        {
            "Name": "AWS-AWSManagedRulesCommonRuleSet",
            "Priority": 1,
            "Statement": {
                "ManagedRuleGroupStatement": {
                    "VendorName": "AWS",
                    "Name": "AWSManagedRulesCommonRuleSet",
                }
            },
            "OverrideAction": {"None": {}},
            "VisibilityConfig": {
                "SampledRequestsEnabled": True,
                "CloudWatchMetricsEnabled": True,
                "MetricName": "AWS-AWSManagedRulesCommonRuleSet",
            },
        },
        {
            "Name": "AWS-AWSManagedRulesKnownBadInputsRuleSet",
            "Priority": 2,
            "Statement": {
                "ManagedRuleGroupStatement": {
                    "VendorName": "AWS",
                    "Name": "AWSManagedRulesKnownBadInputsRuleSet",
                }
            },
            "OverrideAction": {"None": {}},
            "VisibilityConfig": {
                "SampledRequestsEnabled": True,
                "CloudWatchMetricsEnabled": True,
                "MetricName": "AWS-AWSManagedRulesKnownBadInputsRuleSet",
            },
        },
    ]

    next_priority = 3

    if ip_set_arn:
        rules.append(
            {
                "Name": "IpAllowList",
                "Priority": next_priority,
                "Statement": {"IPSetReferenceStatement": {"ARN": ip_set_arn}},
                "Action": {"Allow": {}},
                "VisibilityConfig": {
                    "SampledRequestsEnabled": True,
                    "CloudWatchMetricsEnabled": True,
                    "MetricName": "IpAllowList",
                },
            }
        )
        next_priority += 1

    if country_codes:
        rules.append(
            {
                "Name": "GeoAllowList",
                "Priority": next_priority,
                "Statement": {"GeoMatchStatement": {"CountryCodes": country_codes}},
                "Action": {"Allow": {}},
                "VisibilityConfig": {
                    "SampledRequestsEnabled": True,
                    "CloudWatchMetricsEnabled": True,
                    "MetricName": "GeoAllowList",
                },
            }
        )

    return rules


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("Setting up WAF...")

    # Parse env vars
    allowed_ips = [
        ip.strip()
        for ip in os.environ.get("WAF_ALLOWED_IPS", "").split(",")
        if ip.strip()
    ]
    allowed_countries = [
        c.strip().upper()
        for c in os.environ.get("WAF_ALLOWED_COUNTRIES", "").split(",")
        if c.strip()
    ]

    has_restrictions = bool(allowed_ips or allowed_countries)
    default_action = {"Block": {}} if has_restrictions else {"Allow": {}}

    if allowed_ips:
        print(f"  IP allowlist:      {', '.join(allowed_ips)}")
    if allowed_countries:
        print(f"  Country allowlist: {', '.join(allowed_countries)}")
    if not has_restrictions:
        print("  Mode: Amplify-recommended protection only (no IP/geo restrictions)")

    # Discover Amplify app
    amplify_app_id = get_amplify_app_id()
    print(f"  Amplify App ID: {amplify_app_id}")

    waf_name    = f"PdfUiWAF-{amplify_app_id}"
    ip_set_name = f"PdfUiIPSet-{amplify_app_id}"

    waf = boto3.client("wafv2", region_name=WAF_REGION)
    deploy_region = os.environ.get("AWS_DEFAULT_REGION") or os.environ.get("AWS_REGION", "us-east-1")
    amplify_client = boto3.client("amplify", region_name=deploy_region)

    visibility_config = {
        "SampledRequestsEnabled": True,
        "CloudWatchMetricsEnabled": True,
        "MetricName": "PdfUiWAF",
    }

    # ------------------------------------------------------------------
    # Manage IP set
    # ------------------------------------------------------------------
    ip_set_arn = None
    if allowed_ips:
        existing = find_ip_set(waf, ip_set_name)
        if existing:
            detail = waf.get_ip_set(Scope="CLOUDFRONT", Id=existing["Id"], Name=ip_set_name)
            waf.update_ip_set(
                Scope="CLOUDFRONT",
                Id=existing["Id"],
                Name=ip_set_name,
                LockToken=detail["LockToken"],
                Addresses=allowed_ips,
            )
            ip_set_arn = existing["ARN"]
            print(f"  Updated IP set: {ip_set_arn}")
        else:
            result = waf.create_ip_set(
                Scope="CLOUDFRONT",
                Name=ip_set_name,
                IPAddressVersion="IPV4",
                Addresses=allowed_ips,
            )
            ip_set_arn = result["Summary"]["ARN"]
            print(f"  Created IP set: {ip_set_arn}")

    # ------------------------------------------------------------------
    # Create or update WAF WebACL
    # ------------------------------------------------------------------
    rules = build_rules(
        ip_set_arn=ip_set_arn,
        country_codes=allowed_countries if allowed_countries else None,
    )

    existing_acl = find_web_acl(waf, waf_name)
    if existing_acl:
        detail = waf.get_web_acl(Scope="CLOUDFRONT", Id=existing_acl["Id"], Name=waf_name)
        waf.update_web_acl(
            Scope="CLOUDFRONT",
            Id=existing_acl["Id"],
            Name=waf_name,
            LockToken=detail["LockToken"],
            DefaultAction=default_action,
            Rules=rules,
            VisibilityConfig=visibility_config,
        )
        waf_arn = existing_acl["ARN"]
        print(f"  Updated WAF WebACL: {waf_arn}")
    else:
        result = waf.create_web_acl(
            Scope="CLOUDFRONT",
            Name=waf_name,
            DefaultAction=default_action,
            Rules=rules,
            VisibilityConfig=visibility_config,
        )
        waf_arn = result["Summary"]["ARN"]
        print(f"  Created WAF WebACL: {waf_arn}")

    # ------------------------------------------------------------------
    # Associate WAF with Amplify app
    # ------------------------------------------------------------------
    app_detail = amplify_client.get_app(appId=amplify_app_id)
    current_waf_arn = app_detail["app"].get("wafConfiguration", {}).get("webAclArn", "")

    if current_waf_arn != waf_arn:
        amplify_client.update_app(
            appId=amplify_app_id,
            wafConfiguration={"webAclArn": waf_arn},
        )
        print("  Associated WAF with Amplify app")
    else:
        print("  WAF already associated with Amplify app (no change)")

    print("WAF setup complete!")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: WAF setup failed: {exc}", file=sys.stderr)
        sys.exit(1)
