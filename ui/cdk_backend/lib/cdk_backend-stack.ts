import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as amplify from '@aws-cdk/aws-amplify-alpha';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as fs from 'fs';
import * as path from 'path';

export class CdkBackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =====================================================================
    // IP Restriction Configuration
    // =====================================================================
    // Read allowed IP ranges from file (if exists)
    // If file doesn't exist or is empty, no IP restrictions are applied
    const allowedIpsFile = path.join(__dirname, '..', 'allowed-ips.txt');
    let allowedIpRanges: string[] = [];

    try {
      if (fs.existsSync(allowedIpsFile)) {
        const fileContent = fs.readFileSync(allowedIpsFile, 'utf-8');
        allowedIpRanges = fileContent
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#')) // Remove comments and empty lines
          .filter(line => {
            // Basic CIDR validation
            const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
            if (!cidrRegex.test(line)) {
              console.warn(`⚠️  Invalid CIDR format, skipping: ${line}`);
              return false;
            }
            return true;
          });

        if (allowedIpRanges.length > 0) {
          console.log('🔒 IP Restrictions ENABLED');
          console.log(`   Allowed CIDR ranges (${allowedIpRanges.length}):`);
          allowedIpRanges.forEach(ip => console.log(`   - ${ip}`));
        } else {
          console.log('⚠️  allowed-ips.txt exists but contains no valid entries');
          console.log('   IP restrictions will NOT be applied');
        }
      } else {
        console.log('ℹ️  No allowed-ips.txt file found');
        console.log('   IP restrictions will NOT be applied (public access with auth)');
      }
    } catch (error) {
      console.warn('⚠️  Error reading allowed-ips.txt:', error);
      console.log('   IP restrictions will NOT be applied');
      allowedIpRanges = [];
    }

    const ipRestrictionsEnabled = allowedIpRanges.length > 0;
    // =====================================================================

    const PDF_TO_PDF_BUCKET = this.node.tryGetContext('PDF_TO_PDF_BUCKET') || "Null";
    const PDF_TO_HTML_BUCKET = this.node.tryGetContext('PDF_TO_HTML_BUCKET') || "Null";

    // Validate that at least one bucket is provided
    if (!PDF_TO_PDF_BUCKET && !PDF_TO_HTML_BUCKET) {
      throw new Error(
        "At least one bucket name is required! Pass using -c PDF_TO_PDF_BUCKET=<name> or -c PDF_TO_HTML_BUCKET=<name>"
      );
    }

    // Import buckets independently
    let pdfBucket: s3.IBucket | undefined;
    let htmlBucket: s3.IBucket | undefined;

    if (PDF_TO_PDF_BUCKET) {
      pdfBucket = s3.Bucket.fromBucketName(this, 'PDFBucket', PDF_TO_PDF_BUCKET);
      console.log(`Using PDF-to-PDF bucket: ${pdfBucket.bucketName}`);
    }

    if (PDF_TO_HTML_BUCKET) {
      htmlBucket = s3.Bucket.fromBucketName(this, 'HTMLBucket', PDF_TO_HTML_BUCKET);
      console.log(`Using PDF-to-HTML bucket: ${htmlBucket.bucketName}`);
    }

    // Use the first available bucket as the main bucket for other resources
    const mainBucket = pdfBucket || htmlBucket!;
    console.log(`Using main bucket for other resources: ${mainBucket.bucketName}`);

    // --------- Create Amplify App for Manual Deployment ----------
    const amplifyApp = new amplify.App(this, 'pdfui-amplify-app', {
      description: 'PDF Accessibility UI - Manual Deployment',
      // No sourceCodeProvider for manual deployment
    });

    // Create main branch for manual deployment
    const mainBranch = amplifyApp.addBranch('main', {
      autoBuild: false, // Manual deployment
      stage: 'PRODUCTION'
    });

    // Add redirect rules for SPA routing
    amplifyApp.addCustomRule(new amplify.CustomRule({
      source: '</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/>',
      target: '/index.html',
      status: amplify.RedirectStatus.REWRITE
    }));

    amplifyApp.addCustomRule(new amplify.CustomRule({
      source: '/home',
      target: '/index.html',
      status: amplify.RedirectStatus.REWRITE
    }));

    amplifyApp.addCustomRule(new amplify.CustomRule({
      source: '/callback',
      target: '/index.html',
      status: amplify.RedirectStatus.REWRITE
    }));

    amplifyApp.addCustomRule(new amplify.CustomRule({
      source: '/app',
      target: '/index.html',
      status: amplify.RedirectStatus.REWRITE
    }));

    const domainPrefix = `pdf-ui-auth${Math.random().toString(36).substring(2, 8)}`; // must be globally unique in that region
    const Default_Group = 'DefaultUsers';
    const Admin_Group = 'AdminUsers';
    const appUrl = `https://main.${amplifyApp.appId}.amplifyapp.com`;

    // --------- Set CORS on imported S3 buckets via custom resource ----------
    const corsConfiguration = {
      CORSRules: [
        {
          AllowedHeaders: ['*'],
          AllowedMethods: ['GET', 'PUT', 'POST', 'HEAD'],
          AllowedOrigins: [appUrl, 'http://localhost:3000'],
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3600,
        },
      ],
    };

    if (pdfBucket) {
      new cr.AwsCustomResource(this, 'PdfBucketCors', {
        onCreate: {
          service: 'S3',
          action: 'putBucketCors',
          parameters: {
            Bucket: pdfBucket.bucketName,
            CORSConfiguration: corsConfiguration,
          },
          physicalResourceId: cr.PhysicalResourceId.of('PdfBucketCorsConfig'),
        },
        onUpdate: {
          service: 'S3',
          action: 'putBucketCors',
          parameters: {
            Bucket: pdfBucket.bucketName,
            CORSConfiguration: corsConfiguration,
          },
          physicalResourceId: cr.PhysicalResourceId.of('PdfBucketCorsConfig'),
        },
        policy: cr.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            actions: ['s3:PutBucketCORS'],
            resources: [pdfBucket.bucketArn],
          }),
        ]),
      });
      console.log(`CORS configured for PDF bucket: ${pdfBucket.bucketName}`);
    }

    if (htmlBucket) {
      new cr.AwsCustomResource(this, 'HtmlBucketCors', {
        onCreate: {
          service: 'S3',
          action: 'putBucketCors',
          parameters: {
            Bucket: htmlBucket.bucketName,
            CORSConfiguration: corsConfiguration,
          },
          physicalResourceId: cr.PhysicalResourceId.of('HtmlBucketCorsConfig'),
        },
        onUpdate: {
          service: 'S3',
          action: 'putBucketCors',
          parameters: {
            Bucket: htmlBucket.bucketName,
            CORSConfiguration: corsConfiguration,
          },
          physicalResourceId: cr.PhysicalResourceId.of('HtmlBucketCorsConfig'),
        },
        policy: cr.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            actions: ['s3:PutBucketCORS'],
            resources: [htmlBucket.bucketArn],
          }),
        ]),
      });
      console.log(`CORS configured for HTML bucket: ${htmlBucket.bucketName}`);
    }
    
    // Create the Lambda role first with necessary permissions
    // =====================================================================
    // PreSignUp Lambda (Email Domain Validation)
    // =====================================================================
    const preSignUpFn = new lambda.Function(this, 'PreSignUpLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/preSignUp/'),
      timeout: cdk.Duration.seconds(30),
    });

    // =====================================================================
    // PostConfirmation Lambda (Group Assignment)
    // =====================================================================
    const postConfirmationLambdaRole = new iam.Role(this, 'PostConfirmationLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // Grant CloudWatch Logs permissions
    postConfirmationLambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );
    // NOTE: Cognito permissions are attached via CfnPolicy after user pool creation
    // to scope to exact ARN while avoiding circular dependency (see below)

    // Create the Lambda with the role
    const postConfirmationFn = new lambda.Function(this, 'PostConfirmationLambda', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/postConfirmation/'),
      timeout: cdk.Duration.seconds(30),
      role: postConfirmationLambdaRole,
      environment: {
        DEFAULT_GROUP_NAME: Default_Group,
        ADMIN_GROUP_NAME: Admin_Group,
      },
    });

    // =====================================================================
    // Pre-Authentication Lambda (IP Restriction Check)
    // =====================================================================
    let preAuthFn: lambda.Function | undefined;

    if (ipRestrictionsEnabled) {
      console.log('🔒 Creating Pre-Authentication Lambda for IP check at login');

      // Create inline Lambda code with the allowed IP ranges
      const preAuthCode = `
import ipaddress
import json

# Allowed IP ranges (configured during deployment)
ALLOWED_IP_RANGES = ${JSON.stringify(allowedIpRanges)}

def handler(event, context):
    """
    Pre-Authentication Trigger: Check if user's IP is in allowed range
    This runs BEFORE authentication completes, blocking unauthorized IPs at login
    """
    try:
        # Get client IP from Cognito event
        request_context = event.get('request', {})
        user_context = request_context.get('userContextData', {})
        source_ips = user_context.get('sourceIp', [])

        if not source_ips:
            print('WARNING: Unable to determine source IP address')
            raise Exception('Unable to verify network access. Please contact your administrator.')

        client_ip = source_ips[0]
        user_email = event.get('request', {}).get('userAttributes', {}).get('email', 'unknown')

        print(f'Login attempt - User: {user_email}, IP: {client_ip}')

        # Check if IP is in allowed range
        allowed = False
        matched_range = None

        for ip_range in ALLOWED_IP_RANGES:
            try:
                network = ipaddress.ip_network(ip_range, strict=False)
                if ipaddress.ip_address(client_ip) in network:
                    allowed = True
                    matched_range = ip_range
                    break
            except ValueError as e:
                print(f'ERROR: Invalid IP range {ip_range}: {e}')
                continue

        if allowed:
            print(f'✅ Access ALLOWED - IP {client_ip} matched range {matched_range}')
            return event
        else:
            print(f'❌ Access DENIED - IP {client_ip} not in allowed ranges')
            raise Exception(
                f'Access denied: Your IP address ({client_ip}) is not authorized to access this application. '
                f'Please connect to your organization\\'s VPN or network and try again. '
                f'If you believe this is an error, contact your administrator.'
            )

    except Exception as e:
        error_msg = str(e)
        print(f'Pre-authentication error: {error_msg}')
        raise Exception(error_msg)
`;

      preAuthFn = new lambda.Function(this, 'PreAuthIpCheckLambda', {
        runtime: lambda.Runtime.PYTHON_3_12,
        handler: 'index.handler',
        code: lambda.Code.fromInline(preAuthCode),
        timeout: cdk.Duration.seconds(30),
        description: 'Pre-authentication trigger to enforce IP-based access control',
      });

      // Grant CloudWatch Logs permissions
      preAuthFn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
          resources: ['*'],
        })
      );
    } else {
      console.log('ℹ️  No Pre-Authentication Lambda (no IP restrictions configured)');
    }
    // =====================================================================

    // ------------------- Cognito: User Pool, Domain, Client -------------------
    const userPoolTriggers: any = {
      preSignUp: preSignUpFn,
      postConfirmation: postConfirmationFn,
    };

    // Add preAuthentication trigger if IP restrictions are enabled
    if (preAuthFn) {
      userPoolTriggers.preAuthentication = preAuthFn;
    }

    const userPool = new cognito.UserPool(this, 'PDF-Accessability-User-Pool', {
      userPoolName: 'PDF-Accessability-User-Pool',
      selfSignUpEnabled: true,
      signInAliases: { email: true },

      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: false,
        requireUppercase: false,
      },
      standardAttributes: {
        email: { required: true, mutable: true },
        givenName: { required: true, mutable: true },
        familyName: { required: true, mutable: true },

      },
      customAttributes: {
        first_sign_in: new cognito.BooleanAttribute({ mutable: true }),
        total_files_uploaded: new cognito.NumberAttribute({ mutable: true }),
        max_files_allowed: new cognito.NumberAttribute({ mutable: true }),
        max_pages_allowed: new cognito.NumberAttribute({ mutable: true }),
        max_size_allowed_MB: new cognito.NumberAttribute({ mutable: true }),
        organization: new cognito.StringAttribute({ mutable: true }),
        country: new cognito.StringAttribute({ mutable: true }),
        state: new cognito.StringAttribute({ mutable: true }),
        city: new cognito.StringAttribute({ mutable: true }),
        pdf2pdf: new cognito.NumberAttribute({ mutable: true }),
        pdf2html: new cognito.NumberAttribute({ mutable: true }),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      lambdaTriggers: userPoolTriggers,
    });

    // --------- Scoped Cognito policies via L1 CfnPolicy (avoids circular dependency) ----------
    // Using CfnPolicy directly so CDK doesn't auto-add it as a Lambda dependency,
    // which would create a circular dep: Role Policy → UserPool → Lambda → Role
    new iam.CfnPolicy(this, 'PostConfirmationCognitoPolicy', {
      policyName: 'PostConfirmationCognitoAccess',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow',
          Action: [
            'cognito-idp:AdminUpdateUserAttributes',
            'cognito-idp:AdminAddUserToGroup',
          ],
          Resource: userPool.userPoolArn,
        }],
      },
      roles: [postConfirmationLambdaRole.roleName],
    });
    
    // ------------------- Cognito: User Groups -------------------
      const defaultUsersGroup = new cognito.CfnUserPoolGroup(this, 'Default_Group', {
        groupName: Default_Group,
        userPoolId: userPool.userPoolId,
        description: 'Group for default or normal users',
        precedence: 1, // Determines the priority of the group
      });

      // Admin Users Group
      const adminUsersGroup = new cognito.CfnUserPoolGroup(this, 'AdminUsersGroup', {
        groupName: Admin_Group,
        userPoolId: userPool.userPoolId,
        description: 'Group for admin users with elevated permissions',
        precedence: 0, // Higher precedence means higher priority
      });

    // Domain prefix is defined above with appUrl
    const userPoolDomain = new cognito.CfnUserPoolDomain(this, 'PDF-Accessability-User-Pool-Domain', {
      domain: domainPrefix,
      userPoolId: userPool.userPoolId,
      managedLoginVersion: 2,
    });

    const userPoolClient = userPool.addClient('PDF-Accessability-User-Pool-Client', {
      userPoolClientName: 'PDF-Accessability-User-Pool-Client',
      authFlows: {
        userSrp: true,
        userPassword: true,
        adminUserPassword: true
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: true
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PHONE,
          cognito.OAuthScope.PROFILE
        ],
        callbackUrls: [`${appUrl}/callback`,"http://localhost:3000/callback"],
        logoutUrls: [`${appUrl}/home`, "http://localhost:3000/home"],
      },
      generateSecret: false,
      preventUserExistenceErrors: true,
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
      ]
    });

    

    // (Optional) If CfnManagedLoginBranding is not critical, remove it or put it in a separate stack
    const managed_login = new cognito.CfnManagedLoginBranding(this, 'MyManagedLoginBranding', {
      userPoolId: userPool.userPoolId,
      clientId: userPoolClient.userPoolClientId,
      returnMergedResources: true,
      useCognitoProvidedValues: true,
      
    });

    // ------------- Identity Pool + IAM Roles for S3 Access --------------------
    const identityPool = new cognito.CfnIdentityPool(this, 'PDFIdentityPool', {
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: userPoolClient.userPoolClientId,
          providerName: userPool.userPoolProviderName,
        },
      ],
    });

    const authenticatedRole = new iam.Role(this, 'CognitoDefaultAuthenticatedRole', {
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: { 'cognito-identity.amazonaws.com:aud': identityPool.ref },
          'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'authenticated' },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
    });

    // Create S3 policy for both buckets
    const s3Resources: string[] = [];
    if (pdfBucket) {
      s3Resources.push(pdfBucket.bucketArn + '/*');
    }
    if (htmlBucket) {
      s3Resources.push(htmlBucket.bucketArn + '/*');
    }

    authenticatedRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3:PutObject',
          's3:PutObjectAcl',
          's3:GetObject',
        ],
        resources: s3Resources,
      }),
    );

    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn,
      },
    });



    // ------------------- Lambda Function for Post Confirmation -------------------
    const updateAttributesFn = new lambda.Function(this, 'UpdateAttributesFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/updateAttributes/'),
      timeout: cdk.Duration.seconds(30),
      role: postConfirmationLambdaRole,
      environment: {
        USER_POOL_ID: userPool.userPoolId, // used in index.py
      },
    });

    const checkUploadQuotaLambdaRole = new iam.Role(this, 'CheckUploadQuotaLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // Grant CloudWatch Logs via managed policy
    checkUploadQuotaLambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );
    // NOTE: Cognito permissions are attached via CfnPolicy after user pool creation
    // to scope to exact ARN while avoiding circular dependency (see below)

    // 3) Create the Lambda function
    const checkOrIncrementQuotaFn = new lambda.Function(this, 'checkOrIncrementQuotaFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('lambda/checkOrIncrementQuota'),  
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(30),
      role: checkUploadQuotaLambdaRole,
      environment: {
        USER_POOL_ID: userPool.userPoolId  
      }
    });

    // Scoped Cognito policy via L1 CfnPolicy (avoids circular dependency)
    new iam.CfnPolicy(this, 'CheckUploadQuotaCognitoPolicy', {
      policyName: 'CheckUploadQuotaCognitoAccess',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow',
          Action: [
            'cognito-idp:AdminGetUser',
            'cognito-idp:AdminUpdateUserAttributes',
          ],
          Resource: userPool.userPoolArn,
        }],
      },
      roles: [checkUploadQuotaLambdaRole.roleName],
    });

    // =====================================================================
    // API Gateway with Optional IP Restriction
    // =====================================================================
    const apiGatewayConfig: apigateway.RestApiProps = {
      restApiName: 'UpdateAttributesApi',
      description: 'API to update Cognito user attributes (org, first_sign_in,country, state, city, total_file_uploaded).',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    };

    // Add IP restriction policy if IP ranges are configured
    if (ipRestrictionsEnabled) {
      console.log('🔒 Applying IP restrictions to API Gateway');
      apiGatewayConfig.policy = new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            principals: [new iam.AnyPrincipal()],
            actions: ['execute-api:Invoke'],
            resources: ['execute-api:/*'],
            conditions: {
              IpAddress: {
                'aws:SourceIp': allowedIpRanges,
              },
            },
          }),
        ],
      });
    } else {
      console.log('ℹ️  No IP restrictions on API Gateway (requires authentication only)');
    }

    const updateAttributesApi = new apigateway.RestApi(this, 'UpdateAttributesApi', apiGatewayConfig);

    // 3) Create a Cognito Authorizer (User Pool Authorizer) referencing our user pool
    const userPoolAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'UserPoolAuthorizer', {
      cognitoUserPools: [userPool], // array of user pools
    });

    // 4) Add Resource & Method
    const UpdateFirstSignIn = updateAttributesApi.root.addResource('update-first-sign-in');
    const quotaResource = updateAttributesApi.root.addResource('upload-quota');
    // We attach the Cognito authorizer and set the authorizationType to COGNITO
    UpdateFirstSignIn.addMethod('POST', new apigateway.LambdaIntegration(updateAttributesFn), {
      authorizer: userPoolAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    quotaResource.addMethod('POST', new apigateway.LambdaIntegration(checkOrIncrementQuotaFn), {
      authorizer: userPoolAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });


    // const hostedUiDomain = `https://pdf-ui-auth.auth.${this.region}.amazoncognito.com/login/continue?client_id=${userPoolClient.userPoolClientId}&redirect_uri=https%3A%2F%2Fmain.${amplifyApp.appId}.amplifyapp.com&response_type=code&scope=email+openid+phone+profile`
    const Authority = `cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`;

    // ------------------ Pass environment variables to Amplify ------------------
    mainBranch.addEnvironment('REACT_APP_BUCKET_NAME', mainBucket.bucketName);
    mainBranch.addEnvironment('REACT_APP_BUCKET_REGION', this.region);
    mainBranch.addEnvironment('REACT_APP_AWS_REGION', this.region);

    // Separate buckets for different formats - use provided buckets independently
    if (PDF_TO_PDF_BUCKET) {
      mainBranch.addEnvironment('REACT_APP_PDF_BUCKET_NAME', PDF_TO_PDF_BUCKET);
    }
    if (PDF_TO_HTML_BUCKET) {
      mainBranch.addEnvironment('REACT_APP_HTML_BUCKET_NAME', PDF_TO_HTML_BUCKET);
    }
    
    mainBranch.addEnvironment('REACT_APP_USER_POOL_ID', userPool.userPoolId);
    mainBranch.addEnvironment('REACT_APP_AUTHORITY', Authority);

    mainBranch.addEnvironment('REACT_APP_USER_POOL_CLIENT_ID', userPoolClient.userPoolClientId);
    mainBranch.addEnvironment('REACT_APP_IDENTITY_POOL_ID', identityPool.ref);
    mainBranch.addEnvironment('REACT_APP_HOSTED_UI_URL', appUrl);
    mainBranch.addEnvironment('REACT_APP_DOMAIN_PREFIX', domainPrefix);

    mainBranch.addEnvironment('REACT_APP_UPDATE_FIRST_SIGN_IN', updateAttributesApi.urlForPath('/update-first-sign-in'));
    mainBranch.addEnvironment('REACT_APP_UPLOAD_QUOTA_API', updateAttributesApi.urlForPath('/upload-quota'));


     // ------------------- Integration of UpdateAttributesGroups Lambda -------------------
    // 1. Create IAM Role
    const updateAttributesGroupsLambdaRole = new iam.Role(this, 'UpdateAttributesGroupsLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM role for UpdateAttributesGroups Lambda function',
    });

    updateAttributesGroupsLambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:ListUsersInGroup',
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminUpdateUserAttributes',
        'cognito-idp:AdminListGroupsForUser',
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        //cloudwatch logs
      
      ],
      resources: [
        userPool.userPoolArn,
        `${userPool.userPoolArn}/*` // Allows access to all resources within the User Pool
      ],
    }));

    // 2. Create the Lambda function
    const updateAttributesGroupsFn = new lambda.Function(this, 'UpdateAttributesGroupsFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/UpdateAttributesGroups/'), // Ensure this path is correct
      timeout: cdk.Duration.seconds(900),
      role: updateAttributesGroupsLambdaRole,
      environment: {
        USER_POOL_ID: userPool.userPoolId,
      },
    });


    const cognitoTrail = new cloudtrail.Trail(this, 'CognitoTrail', {
      isMultiRegionTrail: true,
      includeGlobalServiceEvents: true,
    });
    
    // Remove the incorrect event selector
    // No need to add specific data resource for Cognito events
    
    const cognitoGroupChangeRule = new events.Rule(this, 'CognitoGroupChangeRule', {
      eventPattern: {
        source: ['aws.cognito-idp'],
        detailType: ['AWS API Call via CloudTrail'],
        detail: {
          eventName: ['AdminAddUserToGroup', 'AdminRemoveUserFromGroup'],
          requestParameters: {
            userPoolId: [userPool.userPoolId],
          },
        },
      },
    });
    
    cognitoGroupChangeRule.addTarget(new targets.LambdaFunction(updateAttributesGroupsFn));
    
    updateAttributesGroupsFn.addPermission('AllowEventBridgeInvoke', {
      principal: new iam.ServicePrincipal('events.amazonaws.com'),
      sourceArn: cognitoGroupChangeRule.ruleArn,
    });
    
    // --------------------------- Outputs ------------------------------
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'UserPoolDomain', { value: domainPrefix });
    new cdk.CfnOutput(this, 'IdentityPoolId', { value: identityPool.ref });
    new cdk.CfnOutput(this, 'AuthenticatedRole', { value: authenticatedRole.roleArn });
    new cdk.CfnOutput(this, 'AmplifyAppId', {
      value: amplifyApp.appId,
      description: 'Amplify Application ID',
    });

    new cdk.CfnOutput(this, 'AmplifyAppURL', {
      value: appUrl,
      description: 'Amplify Application URL',
    });
    new cdk.CfnOutput(this, 'UpdateFirstSignInEndpoint', {
      value: updateAttributesApi.urlForPath('/update-first-sign-in'),
      description: 'POST requests to this URL to update attributes.',
    });

    new cdk.CfnOutput(this, 'CheckUploadQuotaEndpoint', {
      value: updateAttributesApi.urlForPath('/upload-quota'),
    });


  }
}
