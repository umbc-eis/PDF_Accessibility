# Custom Domain Setup for PDF Accessibility UI

## Changes Made

The CDK stack now automatically configures your custom domain for:
- ✅ Cognito callback URLs (both with and without www)
- ✅ Cognito logout URLs (both with and without www)
- ✅ S3 CORS configuration
- ✅ Frontend environment variables
- ✅ Fixed: Cognito domain prefix is now stable (was causing deployment failures)

## How to Deploy with Custom Domain

### 1. Run the deployment script

```bash
cd ui
./deploy.sh
```

### 2. When prompted for custom domain, enter:

```
pdfaccessibility.aws.genai.umbc.edu
```

**Note:** Enter WITHOUT `https://` and WITHOUT `www.` prefix

### 3. The deployment will automatically configure:

- `https://pdfaccessibility.aws.genai.umbc.edu`
- `https://www.pdfaccessibility.aws.genai.umbc.edu` (automatically added)
- `https://main.d3him0c4b5kgwn.amplifyapp.com` (kept for backwards compatibility)
- `http://localhost:3000` (for local development)

## What Gets Updated

### Cognito User Pool Client
**Callback URLs:**
- https://pdfaccessibility.aws.genai.umbc.edu/callback
- https://www.pdfaccessibility.aws.genai.umbc.edu/callback
- https://main.d3him0c4b5kgwn.amplifyapp.com/callback
- http://localhost:3000/callback

**Logout URLs:**
- https://pdfaccessibility.aws.genai.umbc.edu/home
- https://www.pdfaccessibility.aws.genai.umbc.edu/home
- https://main.d3him0c4b5kgwn.amplifyapp.com/home
- http://localhost:3000/home

### S3 Bucket CORS
All configured domains are added to the CORS AllowedOrigins

### Frontend Environment Variables
`REACT_APP_HOSTED_UI_URL` will be set to your custom domain

## Important Notes

⚠️ **Your Amplify custom domain configuration is NOT touched**
- The domain mapping you set up in Amplify console is safe
- DNS records remain unchanged
- No re-verification needed

✅ **This only updates the backend services** to work with your custom domain

## Troubleshooting

If authentication still fails after deployment:
1. Check CloudFormation outputs for "ConfiguredDomains" to see what was configured
2. Verify in Cognito console that callback URLs match your custom domain
3. Clear browser cache and cookies
4. Try incognito/private browsing mode

## Future Deployments

The custom domain will be preserved in future deployments as long as you:
- Provide the same custom domain when running `deploy.sh`
- OR manually set the environment variable: `CUSTOM_DOMAIN=pdfaccessibility.aws.genai.umbc.edu ./deploy.sh`
