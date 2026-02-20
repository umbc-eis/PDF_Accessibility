/**
 * IP Restriction Example for PDF Accessibility UI
 *
 * This file shows how to add IP-based access control to your API Gateway.
 * Copy the relevant code into your cdk_backend-stack.ts file.
 */

import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';

// ============================================================================
// OPTION 1: API Gateway Resource Policy (Simplest - Recommended)
// ============================================================================

/**
 * Add this when creating your API Gateway RestApi
 * Location: cdk_backend/lib/cdk_backend-stack.ts, around line 422
 */

// REPLACE THIS:
const updateAttributesApi = new apigateway.RestApi(this, 'UpdateAttributesApi', {
  restApiName: 'UpdateAttributesApi',
  description: 'API to update Cognito user attributes',
  defaultCorsPreflightOptions: {
    allowOrigins: apigateway.Cors.ALL_ORIGINS,
    allowMethods: apigateway.Cors.ALL_METHODS,
  },
});

// WITH THIS:
const updateAttributesApi = new apigateway.RestApi(this, 'UpdateAttributesApi', {
  restApiName: 'UpdateAttributesApi',
  description: 'API to update Cognito user attributes',
  defaultCorsPreflightOptions: {
    allowOrigins: apigateway.Cors.ALL_ORIGINS,
    allowMethods: apigateway.Cors.ALL_METHODS,
  },
  // ✅ ADD IP RESTRICTION POLICY
  policy: new iam.PolicyDocument({
    statements: [
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.AnyPrincipal()],
        actions: ['execute-api:Invoke'],
        resources: ['execute-api:/*'],
        conditions: {
          IpAddress: {
            'aws:SourceIp': [
              // ⚠️ REPLACE WITH YOUR IP RANGES
              '192.0.2.0/24',      // Example: Office network
              '198.51.100.0/24',   // Example: VPN range
              '203.0.113.50/32',   // Example: Specific IP (/32 = single IP)
            ],
          },
        },
      }),
    ],
  }),
});

// ============================================================================
// OPTION 2: AWS WAF with IP Sets (More Features, Small Cost)
// ============================================================================

/**
 * Add this anywhere in your stack (after imports)
 * Cost: ~$5-6/month + $1 per million requests
 */

// Step 1: Create IP Set
const allowedIpSet = new wafv2.CfnIPSet(this, 'AllowedIpSet', {
  name: 'pdf-ui-allowed-ips',
  scope: 'REGIONAL', // Use 'REGIONAL' for API Gateway in any region
  ipAddressVersion: 'IPV4',
  addresses: [
    // ⚠️ REPLACE WITH YOUR IP RANGES
    '192.0.2.0/24',      // Example: Office network
    '198.51.100.0/24',   // Example: VPN range
    '203.0.113.50/32',   // Example: Specific IP
  ],
});

// Step 2: Create WAF Web ACL
const webAcl = new wafv2.CfnWebACL(this, 'ApiGatewayWebACL', {
  name: 'pdf-ui-api-waf',
  scope: 'REGIONAL',
  defaultAction: { block: {} }, // Block all by default
  rules: [
    {
      name: 'AllowFromWhitelistedIPs',
      priority: 1,
      statement: {
        ipSetReferenceStatement: {
          arn: allowedIpSet.attrArn,
        },
      },
      action: { allow: {} }, // Allow IPs in the set
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'AllowFromWhitelistedIPs',
      },
    },
  ],
  visibilityConfig: {
    sampledRequestsEnabled: true,
    cloudWatchMetricsEnabled: true,
    metricName: 'pdf-ui-api-waf',
  },
});

// Step 3: Associate WAF with API Gateway
// ⚠️ Add this AFTER creating updateAttributesApi
new wafv2.CfnWebACLAssociation(this, 'ApiGatewayWafAssociation', {
  webAclArn: webAcl.attrArn,
  resourceArn: `arn:aws:apigateway:${this.region}::/restapis/${updateAttributesApi.restApiId}/stages/${updateAttributesApi.deploymentStage.stageName}`,
});

// ============================================================================
// OPTION 3: Cognito Pre-Authentication Lambda Trigger
// ============================================================================

/**
 * Add this to block login from unauthorized IPs
 * This checks IP at authentication time, not every API call
 */

import * as lambda from 'aws-cdk-lib/aws-lambda';

// Create the Lambda function
const preAuthIpCheckLambda = new lambda.Function(this, 'PreAuthIpCheck', {
  runtime: lambda.Runtime.PYTHON_3_12,
  handler: 'index.handler',
  code: lambda.Code.fromInline(`
import ipaddress
import json

# ⚠️ REPLACE WITH YOUR IP RANGES
ALLOWED_IP_RANGES = [
    '192.0.2.0/24',
    '198.51.100.0/24',
    '203.0.113.50/32',
]

def handler(event, context):
    """Check if user's IP is in allowed range during login"""
    try:
        # Get client IP from Cognito event
        request_context = event.get('request', {})
        user_context = request_context.get('userContextData', {})

        # sourceIp is a list in the event
        source_ips = user_context.get('sourceIp', [])

        if not source_ips:
            raise Exception('Unable to determine source IP address')

        client_ip = source_ips[0]  # Get first IP
        print(f'Login attempt from IP: {client_ip}')

        # Check if IP is in allowed range
        allowed = False
        for ip_range in ALLOWED_IP_RANGES:
            try:
                network = ipaddress.ip_network(ip_range, strict=False)
                if ipaddress.ip_address(client_ip) in network:
                    allowed = True
                    print(f'IP {client_ip} allowed (matched {ip_range})')
                    break
            except ValueError as e:
                print(f'Invalid IP range {ip_range}: {e}')
                continue

        if not allowed:
            print(f'IP {client_ip} blocked - not in allowed ranges')
            raise Exception(f'Access denied: Your IP address ({client_ip}) is not authorized to access this application. Please contact your administrator.')

        return event

    except Exception as e:
        print(f'Pre-auth error: {str(e)}')
        raise Exception(str(e))
  `),
  timeout: cdk.Duration.seconds(30),
});

// Grant CloudWatch Logs permissions
preAuthIpCheckLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
    resources: ['*'],
  })
);

// ⚠️ Add to your existing Cognito User Pool
// MODIFY your existing userPool creation to include the trigger:
const userPool = new cognito.UserPool(this, 'PDF-Accessability-User-Pool', {
  // ... existing config ...
  lambdaTriggers: {
    preAuthentication: preAuthIpCheckLambda,  // ✅ ADD THIS
    postConfirmation: postConfirmationFn,      // Keep existing
  },
});

// ============================================================================
// HELPER: Get Your Current IP Address
// ============================================================================

/**
 * Run these commands to find your IP address:
 *
 * # Get your public IP
 * curl https://checkip.amazonaws.com
 *
 * # Get your IP in CIDR notation (single IP)
 * echo "$(curl -s https://checkip.amazonaws.com)/32"
 *
 * # Get your network range (common office setup)
 * # If your IP is 203.0.113.50, your network might be:
 * # 203.0.113.0/24 (allows 203.0.113.0 - 203.0.113.255)
 */

// ============================================================================
// TESTING YOUR IP RESTRICTIONS
// ============================================================================

/**
 * After deploying, test with:
 *
 * # From allowed IP (should work)
 * curl https://your-api-id.execute-api.region.amazonaws.com/prod/upload-quota
 *
 * # From blocked IP (should return 403 Forbidden)
 * # Use a proxy or VPN to test from different IP
 *
 * # Check CloudWatch logs for Lambda trigger
 * aws logs tail /aws/lambda/PreAuthIpCheck --follow
 */

// ============================================================================
// IMPORTANT NOTES
// ============================================================================

/**
 * 1. CIDR Notation:
 *    /32 = Single IP (e.g., 203.0.113.50/32)
 *    /24 = 256 IPs (e.g., 203.0.113.0/24 = 203.0.113.0 - 203.0.113.255)
 *    /16 = 65,536 IPs (e.g., 203.0.0.0/16 = 203.0.0.0 - 203.0.255.255)
 *
 * 2. IPv6 Support:
 *    - Use 'IPV6' for ipAddressVersion
 *    - Example: '2001:db8::/32'
 *
 * 3. Mobile Users:
 *    - Mobile carrier IPs change frequently
 *    - Consider broader ranges or skip IP restrictions for mobile
 *
 * 4. NAT/Proxy:
 *    - Users behind corporate NAT will have a different public IP
 *    - Get the NAT gateway IP, not individual workstation IPs
 *
 * 5. VPN Users:
 *    - VPN exit IPs may be different from office IPs
 *    - Document VPN requirements for remote workers
 *
 * 6. Cost Considerations:
 *    - Option 1 (API Gateway Policy): FREE
 *    - Option 2 (WAF): ~$6/month
 *    - Option 3 (Lambda Trigger): ~FREE (covered by free tier)
 *
 * 7. Combining Options:
 *    - You can use multiple options together
 *    - Recommended: Option 1 + Option 3 for defense in depth
 */

// ============================================================================
// UPDATING IP ADDRESSES WITHOUT REDEPLOYMENT
// ============================================================================

/**
 * For WAF IP Sets (Option 2 only):
 *
 * # Get IP set details
 * aws wafv2 list-ip-sets --scope REGIONAL --region us-east-1
 *
 * # Update IP set (requires lock token)
 * aws wafv2 get-ip-set --name pdf-ui-allowed-ips --scope REGIONAL --id <id> --region us-east-1
 *
 * # Update with new IPs
 * aws wafv2 update-ip-set \
 *   --name pdf-ui-allowed-ips \
 *   --scope REGIONAL \
 *   --id <ip-set-id> \
 *   --addresses '192.0.2.0/24' '198.51.100.0/24' '203.0.113.50/32' '10.0.0.0/8' \
 *   --lock-token <lock-token> \
 *   --region us-east-1
 *
 * For other options, you need to redeploy the stack.
 */
