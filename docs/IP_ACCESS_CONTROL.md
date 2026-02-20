# IP-Based Access Control for PDF Accessibility Solutions

This guide explains how to restrict access to your PDF Accessibility deployment by IP address or CIDR range.

## Table of Contents

- [Option 1: API Gateway Resource Policy (Recommended)](#option-1-api-gateway-resource-policy-recommended)
- [Option 2: AWS WAF with IP Sets](#option-2-aws-waf-with-ip-sets)
- [Option 3: CloudFront with Amplify (Advanced)](#option-3-cloudfront-with-amplify-advanced)
- [Option 4: Cognito Lambda Trigger](#option-4-cognito-lambda-trigger)
- [Option 5: S3 Bucket Policy](#option-5-s3-bucket-policy)
- [Comparison Matrix](#comparison-matrix)

---

## Option 1: API Gateway Resource Policy (Recommended)

**What it restricts:** Backend API calls (user management, quota checks)
**Frontend accessible:** Yes (Amplify still public, but API calls fail)
**Cost:** Free
**Complexity:** Low

### Implementation

Add this to your UI CDK stack (`cdk_backend/lib/cdk_backend-stack.ts`):

```typescript
// After creating the API Gateway (around line 422)
const updateAttributesApi = new apigateway.RestApi(this, 'UpdateAttributesApi', {
  restApiName: 'UpdateAttributesApi',
  description: 'API to update Cognito user attributes',
  defaultCorsPreflightOptions: {
    allowOrigins: apigateway.Cors.ALL_ORIGINS,
    allowMethods: apigateway.Cors.ALL_METHODS,
  },
  // Add resource policy for IP restriction
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
              '192.0.2.0/24',      // Your office network
              '198.51.100.0/24',   // Your VPN range
              '203.0.113.50/32',   // Specific IP address
            ],
          },
        },
      }),
    ],
  }),
});
```

### Testing

```bash
# From allowed IP - should work
curl https://your-api.execute-api.region.amazonaws.com/prod/upload-quota

# From blocked IP - should return 403 Forbidden
```

### Pros & Cons

✅ **Pros:**
- Simple to implement
- No additional cost
- Works immediately
- Easy to update IP ranges

❌ **Cons:**
- Frontend still loads (users see error when API calls fail)
- Max 20 CIDR blocks per policy
- Doesn't protect against authenticated users outside the IP range

---

## Option 2: AWS WAF with IP Sets

**What it restricts:** API Gateway and/or Amplify (via CloudFront)
**Frontend accessible:** No (if applied to CloudFront)
**Cost:** ~$5/month + $1/million requests
**Complexity:** Medium

### Implementation

Add this to your UI CDK stack:

```typescript
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';

// Define IP set
const allowedIpSet = new wafv2.CfnIPSet(this, 'AllowedIpSet', {
  name: 'pdf-ui-allowed-ips',
  scope: 'REGIONAL', // Use 'CLOUDFRONT' for Amplify
  ipAddressVersion: 'IPV4',
  addresses: [
    '192.0.2.0/24',      // Your office
    '198.51.100.0/24',   // Your VPN
    '203.0.113.50/32',   // Specific IP
  ],
});

// Create WAF Web ACL
const webAcl = new wafv2.CfnWebACL(this, 'ApiGatewayWebACL', {
  name: 'pdf-ui-api-waf',
  scope: 'REGIONAL',
  defaultAction: { block: {} }, // Block by default
  rules: [
    {
      name: 'AllowFromWhitelistedIPs',
      priority: 1,
      statement: {
        ipSetReferenceStatement: {
          arn: allowedIpSet.attrArn,
        },
      },
      action: { allow: {} },
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

// Associate WAF with API Gateway
new wafv2.CfnWebACLAssociation(this, 'ApiGatewayWafAssociation', {
  webAclArn: webAcl.attrArn,
  resourceArn: `arn:aws:apigateway:${this.region}::/restapis/${updateAttributesApi.restApiId}/stages/${updateAttributesApi.deploymentStage.stageName}`,
});
```

### Updating IP Addresses

```bash
# Update IP set without redeploying
aws wafv2 update-ip-set \
  --name pdf-ui-allowed-ips \
  --scope REGIONAL \
  --id <ip-set-id> \
  --addresses '192.0.2.0/24' '198.51.100.0/24' '203.0.113.50/32' \
  --lock-token <lock-token>
```

### Pros & Cons

✅ **Pros:**
- Can protect both API and frontend
- Support for up to 10,000 IP addresses per IP set
- DDoS protection included
- CloudWatch metrics and logging
- Can be updated without redeployment

❌ **Cons:**
- Additional cost (~$6/month minimum)
- More complex setup
- Regional scope means one per region

---

## Option 3: CloudFront with Amplify (Advanced)

**What it restricts:** Frontend and all traffic
**Frontend accessible:** No
**Cost:** CloudFront standard pricing
**Complexity:** High

### Implementation

This requires adding a CloudFront distribution in front of Amplify. Amplify uses CloudFront internally, but you can't directly modify those distributions.

**Approach A: Custom CloudFront + S3 (Replace Amplify)**

```typescript
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';

// Create S3 bucket for frontend
const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
  websiteIndexDocument: 'index.html',
  websiteErrorDocument: 'index.html',
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});

// CloudFront function for IP restriction
const ipRestrictionFunction = new cloudfront.Function(this, 'IpRestrictionFunction', {
  code: cloudfront.FunctionCode.fromInline(`
    function handler(event) {
      var request = event.request;
      var clientIP = event.viewer.ip;

      // Define allowed IP ranges
      var allowedRanges = [
        '192.0.2.0/24',
        '198.51.100.0/24',
        '203.0.113.50/32'
      ];

      // Check if IP is in allowed range
      var allowed = false;
      for (var i = 0; i < allowedRanges.length; i++) {
        if (isIPInRange(clientIP, allowedRanges[i])) {
          allowed = true;
          break;
        }
      }

      if (!allowed) {
        return {
          statusCode: 403,
          statusDescription: 'Forbidden',
          body: 'Access denied from your IP address'
        };
      }

      return request;
    }

    function isIPInRange(ip, range) {
      // IP range checking logic (CIDR)
      // Simplified - use full implementation for production
      return true; // Replace with actual CIDR check
    }
  `),
});

// CloudFront distribution
const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
  defaultBehavior: {
    origin: new origins.S3Origin(frontendBucket),
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    functionAssociations: [
      {
        function: ipRestrictionFunction,
        eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
      },
    ],
  },
  defaultRootObject: 'index.html',
  errorResponses: [
    {
      httpStatus: 404,
      responseHttpStatus: 200,
      responsePagePath: '/index.html',
    },
  ],
});
```

**Approach B: WAF with CloudFront (Easier)**

```typescript
// Create WAF for CloudFront (scope must be CLOUDFRONT, us-east-1 only)
const cloudfrontWebAcl = new wafv2.CfnWebACL(this, 'CloudFrontWebACL', {
  name: 'pdf-ui-cloudfront-waf',
  scope: 'CLOUDFRONT', // Must be CLOUDFRONT for CloudFront distributions
  defaultAction: { block: {} },
  rules: [
    {
      name: 'AllowFromWhitelistedIPs',
      priority: 1,
      statement: {
        ipSetReferenceStatement: {
          arn: allowedIpSet.attrArn,
        },
      },
      action: { allow: {} },
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
    metricName: 'pdf-ui-cloudfront-waf',
  },
});

// Note: Amplify's CloudFront distribution is managed by AWS
// You would need to migrate to custom CloudFront + S3 to use this
```

### Pros & Cons

✅ **Pros:**
- Complete frontend protection
- Professional-grade security
- Can add rate limiting, geo-blocking, etc.

❌ **Cons:**
- Requires replacing Amplify with custom solution
- Significant implementation effort
- More moving parts to maintain

---

## Option 4: Cognito Lambda Trigger

**What it restricts:** User authentication based on IP
**Frontend accessible:** Yes (but login fails)
**Cost:** Lambda invocations (~free)
**Complexity:** Low

### Implementation

Add a Pre-Authentication Lambda trigger:

```typescript
// In your CDK stack
const preAuthLambda = new lambda.Function(this, 'PreAuthIpCheck', {
  runtime: lambda.Runtime.PYTHON_3_12,
  handler: 'index.handler',
  code: lambda.Code.fromInline(`
import json

ALLOWED_IP_RANGES = [
    '192.0.2.0/24',
    '198.51.100.0/24',
    '203.0.113.50/32'
]

def handler(event, context):
    # Get client IP from Cognito event
    client_ip = event['request']['userContextData']['sourceIp'][0]

    # Check if IP is in allowed range
    allowed = False
    for ip_range in ALLOWED_IP_RANGES:
        if is_ip_in_range(client_ip, ip_range):
            allowed = True
            break

    if not allowed:
        raise Exception(f'Access denied from IP: {client_ip}')

    return event

def is_ip_in_range(ip, cidr):
    import ipaddress
    return ipaddress.ip_address(ip) in ipaddress.ip_network(cidr)
  `),
});

// Add to Cognito User Pool
const userPool = new cognito.UserPool(this, 'PDF-Accessability-User-Pool', {
  // ... existing config
  lambdaTriggers: {
    preAuthentication: preAuthLambda,
    postConfirmation: postConfirmationFn, // existing
  },
});
```

### Pros & Cons

✅ **Pros:**
- Simple implementation
- Blocks at authentication layer
- No additional AWS costs
- Users get clear error message

❌ **Cons:**
- Frontend still loads
- Only blocks authentication, not page access
- Users can see the UI but can't log in

---

## Option 5: S3 Bucket Policy

**What it restricts:** S3 bucket access for uploads/downloads
**Frontend accessible:** Yes
**Cost:** Free
**Complexity:** Low

### Implementation

Add this to your backend CDK stack (`app.py`):

```python
# Add to PDF processing bucket
pdf_processing_bucket = s3.Bucket(
    self, "pdfaccessibilitybucket1",
    encryption=s3.BucketEncryption.S3_MANAGED,
    enforce_ssl=True,
    versioned=True,
    removal_policy=cdk.RemovalPolicy.RETAIN
)

# Add bucket policy for IP restriction
pdf_processing_bucket.add_to_resource_policy(
    iam.PolicyStatement(
        effect=iam.Effect.DENY,
        principals=[iam.AnyPrincipal()],
        actions=["s3:*"],
        resources=[
            pdf_processing_bucket.bucket_arn,
            f"{pdf_processing_bucket.bucket_arn}/*"
        ],
        conditions={
            "NotIpAddress": {
                "aws:SourceIp": [
                    "192.0.2.0/24",
                    "198.51.100.0/24",
                    "203.0.113.50/32"
                ]
            }
        }
    )
)
```

### Important Notes

This will break uploads from Cognito Identity Pool users unless they're from the allowed IPs. You need to add an exception for the Identity Pool role:

```python
pdf_processing_bucket.add_to_resource_policy(
    iam.PolicyStatement(
        effect=iam.Effect.ALLOW,
        principals=[iam.ArnPrincipal(identity_pool_auth_role.role_arn)],
        actions=["s3:PutObject", "s3:GetObject"],
        resources=[f"{pdf_processing_bucket.bucket_arn}/*"],
    )
)
```

### Pros & Cons

✅ **Pros:**
- Protects data directly
- Free
- Easy to implement

❌ **Cons:**
- Breaks user uploads unless carefully configured
- Doesn't protect frontend or API
- Complex interaction with IAM roles

---

## Comparison Matrix

| Feature | API Gateway Policy | WAF | CloudFront Custom | Cognito Lambda | S3 Bucket Policy |
|---------|-------------------|-----|-------------------|----------------|------------------|
| **Protects Frontend** | ❌ | ✅ | ✅ | ❌ | ❌ |
| **Protects API** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Protects Data** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Cost** | Free | ~$6/mo | Standard CF | Free | Free |
| **Complexity** | Low | Medium | High | Low | Medium |
| **Max IPs** | 20 ranges | 10,000 | Unlimited | Unlimited | 1,000s |
| **Update Speed** | Redeploy | Instant | Redeploy | Redeploy | Instant |
| **Works with Amplify** | ✅ | ⚠️ | ❌ | ✅ | ✅ |

---

## Recommended Approach

### For Most Use Cases: **API Gateway Resource Policy + Cognito Lambda**

This combination provides:
- API protection (prevents unauthorized API calls)
- Authentication gating (blocks login from wrong IPs)
- No additional cost
- Simple implementation

```typescript
// 1. Add API Gateway resource policy (shown in Option 1)
// 2. Add Cognito pre-auth Lambda (shown in Option 4)
```

### For High Security: **WAF on API Gateway + Cognito Lambda**

Adds DDoS protection and advanced features:
- All benefits of recommended approach
- DDoS mitigation
- Rate limiting capabilities
- Advanced logging and metrics

### For Complete Lockdown: **Replace Amplify with Custom CloudFront + S3 + WAF**

Only if you need to hide the frontend entirely:
- Complete IP restriction
- Full control over CDN
- Significant implementation effort

---

## Implementation Steps

### Quick Start (API Gateway Policy)

1. **Edit the UI CDK stack:**
   ```bash
   cd ui/cdk_backend
   ```

2. **Add the policy to `lib/cdk_backend-stack.ts`:**
   ```typescript
   // Around line 422, modify the RestApi creation
   const updateAttributesApi = new apigateway.RestApi(this, 'UpdateAttributesApi', {
     restApiName: 'UpdateAttributesApi',
     description: 'API to update Cognito user attributes',
     defaultCorsPreflightOptions: {
       allowOrigins: apigateway.Cors.ALL_ORIGINS,
       allowMethods: apigateway.Cors.ALL_METHODS,
     },
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
                 'YOUR_IP_RANGE_HERE/24',  // Replace with your IP range
               ],
             },
           },
         }),
       ],
     }),
   });
   ```

3. **Deploy:**
   ```bash
   npx cdk deploy
   ```

4. **Test:**
   ```bash
   # From allowed IP
   curl https://your-api-id.execute-api.region.amazonaws.com/prod/upload-quota

   # Should return 403 from other IPs
   ```

---

## Getting Your Current IP

```bash
# Check your current public IP
curl https://checkip.amazonaws.com

# Or
curl https://ifconfig.me

# Get your IP in CIDR notation (single IP)
echo "$(curl -s https://checkip.amazonaws.com)/32"
```

---

## Troubleshooting

### "403 Forbidden" from allowed IP

- Check that your IP is in the allowed list
- Verify CIDR notation is correct (e.g., `/32` for single IP, `/24` for subnet)
- Clear browser cache and cookies
- Check if you're behind a proxy or NAT

### Users can't access from mobile/VPN

- Mobile carriers use dynamic IPs - consider allowing broader ranges
- VPN exit IPs may change - document this requirement for users
- Consider using Cognito Lambda trigger instead (checks at login, not every request)

### API Gateway policy not working

- Ensure the policy is in the correct format
- Check CloudWatch logs for `execute-api` errors
- Verify the API stage is deployed after adding the policy

### WAF blocking legitimate traffic

- Check WAF CloudWatch metrics
- Review sampled requests in WAF console
- Consider adding rate limiting rules instead of pure IP blocking

---

## Security Best Practices

1. **Use CIDR ranges, not individual IPs** - Easier to manage
2. **Document your IP ranges** - Keep a list of which IPs are for what
3. **Combine methods** - API Gateway policy + Cognito trigger is stronger
4. **Monitor access logs** - Set up CloudWatch alerts for blocked requests
5. **Review quarterly** - IP ranges change, audit access regularly
6. **Consider VPN** - May be easier than maintaining IP lists
7. **Don't expose Account IDs** - Be careful when sharing error messages

---

## Alternative: VPN/Private Access

Instead of IP whitelisting, consider:

### AWS Client VPN

```typescript
// Create VPN endpoint (not shown in current architecture)
const vpnEndpoint = new ec2.ClientVpnEndpoint(this, 'PdfUiVpn', {
  vpc: vpc,
  cidr: '10.0.0.0/22',
  serverCertificateArn: 'arn:aws:acm:region:account:certificate/id',
  clientCertificateArn: 'arn:aws:acm:region:account:certificate/id',
});
```

### AWS PrivateLink

- More complex but provides true private access
- Requires significant architecture changes
- Best for enterprise deployments

---

## Cost Estimate

| Method | Monthly Cost | Notes |
|--------|--------------|-------|
| API Gateway Policy | $0 | Free tier included |
| WAF (Regional) | ~$6 | $5 base + $1 per million requests |
| WAF (CloudFront) | ~$6 | Same pricing, us-east-1 only |
| Lambda Triggers | ~$0 | Free tier covers most use cases |
| CloudFront Custom | ~$10 | Depends on traffic |
| Client VPN | ~$74 | $0.10/hour endpoint + $0.05/hour per connection |

**Recommended:** Start with free options (API Gateway Policy + Cognito Lambda), add WAF if needed.
