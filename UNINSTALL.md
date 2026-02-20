# Uninstall Guide for PDF Accessibility Solutions

This guide explains how to safely remove all deployed PDF accessibility resources from your AWS account.

## Quick Start

To uninstall all deployed resources:

```bash
cd PDF_Accessibility
./uninstall.sh
```

The script will:
1. Scan your AWS account for deployed resources (including UI if deployed)
2. Show you exactly what will be deleted
3. Ask for confirmation before proceeding
4. Remove all resources in the correct order

**Note:** The script automatically detects if you have the UI deployed (via the `CdkBackendStack` CloudFormation stack) and will include it in the cleanup. You don't need to run a separate uninstall for the UI.

## What Gets Deleted

### CloudFormation Stacks
- `PDFAccessibility` - PDF-to-PDF remediation infrastructure
- `Pdf2HtmlStack` - PDF-to-HTML remediation infrastructure
- `CdkBackendStack` - Frontend UI backend (if deployed)

### S3 Buckets (and all contents)
- `pdfaccessibility-*` - PDF-to-PDF processing bucket
- `pdf2html-bucket-*` - PDF-to-HTML processing bucket

### Backend AWS Resources
- **Lambda Functions**: All PDF processing functions
- **ECS Cluster**: PDF remediation cluster with task definitions
- **ECR Repository**: Docker images for Lambda functions
- **Step Functions**: PDF processing workflows
- **VPC Resources**: VPC, subnets, NAT gateways, VPC endpoints
- **IAM Roles & Policies**: Service roles and custom policies
- **CloudWatch**: Log groups and dashboards
- **Secrets Manager**: Adobe API credentials
- **Bedrock Data Automation**: BDA projects
- **CodeBuild Projects**: Deployment automation projects

### UI AWS Resources (if deployed)
- **Cognito User Pool**: User authentication and management
- **Cognito Identity Pool**: Federated identity access
- **API Gateway**: REST API for user management and quotas
- **Lambda Functions**: Quota management and user profile functions
- **Amplify App**: Frontend hosting and deployment
- **EventBridge Rules**: Automated quota refresh schedules
- **IAM Roles**: Amplify and Lambda execution roles
- **CodeBuild Project**: UI deployment automation (`pdf-ui-*`)

### What's NOT Deleted

The script intentionally **does not delete**:
- **CDKToolkit CloudFormation stack** - May be used by other CDK projects
- **CDK Bootstrap S3 buckets** (cdk-*) - May contain assets for other projects

To manually delete these (only if not used by other projects):

```bash
aws cloudformation delete-stack --stack-name CDKToolkit
```

## Safety Features

### Confirmation Required
The script requires you to type `DELETE` (exactly) to proceed. This prevents accidental deletions.

### Resource Detection
The script automatically detects what's deployed in your account:
- Searches for CloudFormation stacks
- Finds associated S3 buckets
- Locates CodeBuild projects
- Identifies IAM roles and policies

### Privacy Protection
The script minimizes sensitive information exposure:
- **Suppresses filenames**: Shows counts instead of actual S3 object names
- **Hides ARN details**: Shows only resource IDs where possible
- **Quiet output**: AWS CLI responses are suppressed to avoid leaking data
- **No credentials exposed**: Never outputs secrets or API keys

**Note:** Your AWS Account ID may still appear in some outputs (ARNs). This is not a secret credential but is minimized where possible.

### Order of Operations
Resources are deleted in the correct order to avoid dependency errors:
1. CloudFormation stacks (most infrastructure)
2. S3 buckets (data storage)
3. BDA projects (Bedrock resources)
4. ECR repositories (Docker images)
5. Secrets Manager secrets (credentials)
6. CodeBuild projects and IAM resources
7. CloudWatch dashboards (monitoring)

### Error Handling
- Continues even if some resources don't exist
- Provides clear status messages for each operation
- Reports errors but continues cleanup
- Handles race conditions (e.g., CloudFormation deleting resources first)

## Usage Examples

### Standard Uninstall
```bash
./uninstall.sh
```

This will:
- Detect all deployed solutions
- Show a summary of resources
- Ask for confirmation
- Delete everything

### Check What Would Be Deleted (Dry Run)
The script doesn't have a built-in dry run, but you can:

1. Run the script
2. Review the resource summary
3. Press `Ctrl+C` to cancel before typing DELETE

### Region-Specific Uninstall
If you need to uninstall from a specific region:

```bash
export AWS_DEFAULT_REGION=us-west-2
./uninstall.sh
```

## Important Warnings

### Data Loss
⚠️ **All S3 bucket contents will be permanently deleted**, including:
- Original PDF files
- Processed/remediated PDFs
- Temporary processing files
- HTML conversions
- Reports and logs

**Make sure you have backups before proceeding!**

### Cost Savings
After uninstallation completes, you will no longer be charged for:
- NAT Gateway ($0.045/hour + data transfer)
- VPC Endpoints ($0.01/hour per AZ)
- S3 storage
- CloudWatch log storage
- Any running ECS tasks or Lambda executions

### Cannot Be Undone
Once you confirm deletion and the script completes, **you cannot recover the deleted resources**. You would need to redeploy from scratch using `deploy.sh`.

## Troubleshooting

### "Stack deletion failed"
If a CloudFormation stack fails to delete:

1. Check the AWS Console for the specific error
2. Common causes:
   - Resources created outside CloudFormation need manual deletion
   - S3 buckets not empty (script handles this, but check manually)
   - IAM resources still in use

Manual fix:
```bash
# Check stack status
aws cloudformation describe-stacks --stack-name PDFAccessibility

# Check stack events for errors
aws cloudformation describe-stack-events --stack-name PDFAccessibility --max-items 20
```

### "Cannot delete bucket"
If S3 bucket deletion fails:

```bash
# Manually empty and delete
BUCKET_NAME="your-bucket-name"
aws s3 rm s3://$BUCKET_NAME --recursive
aws s3 rb s3://$BUCKET_NAME
```

### "IAM role cannot be deleted"
If IAM resources fail to delete:

```bash
# List and manually detach policies
ROLE_NAME="your-role-name"
aws iam list-attached-role-policies --role-name $ROLE_NAME

# Detach each policy
aws iam detach-role-policy --role-name $ROLE_NAME --policy-arn <policy-arn>

# Delete role
aws iam delete-role --role-name $ROLE_NAME
```

### "Access Denied" errors
Ensure your AWS credentials have sufficient permissions:
- CloudFormation full access
- S3 full access
- IAM role/policy management
- ECR repository management
- Bedrock Data Automation access
- CodeBuild project management
- Cognito user pool management (if UI is deployed)
- Amplify app management (if UI is deployed)
- API Gateway management (if UI is deployed)

### Script hangs during deletion
Stack deletion can take 10-20 minutes, especially for:
- VPC resources (NAT gateways, network interfaces)
- ECS clusters (draining tasks)

If it takes longer than 20 minutes:
1. Check AWS CloudFormation console for status
2. The script will timeout and continue with other resources
3. You can manually delete stuck stacks later

## Verification

After uninstallation, verify all resources are deleted:

```bash
# Check CloudFormation stacks
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE

# Check S3 buckets
aws s3 ls | grep -E 'pdfaccessibility|pdf2html'

# Check CodeBuild projects
aws codebuild list-projects

# Check ECR repositories
aws ecr describe-repositories
```

## Re-deployment

To redeploy after uninstallation:

```bash
./deploy.sh
```

The deployment script will create fresh resources with new names and configurations.

## Getting Help

If you encounter issues during uninstallation:

1. Check the AWS CloudFormation console for detailed error messages
2. Review CloudWatch logs for stuck resources
3. Contact support: **ai-cic@amazon.com**
4. Report issues: [GitHub Issues](https://github.com/umbc-eis/PDF_Accessibility/issues)

## Manual Uninstall Alternative

If the script doesn't work for any reason, you can manually delete the CloudFormation stacks:

```bash
# PDF-to-PDF Backend
aws cloudformation delete-stack --stack-name PDFAccessibility

# PDF-to-HTML Backend
aws cloudformation delete-stack --stack-name Pdf2HtmlStack

# UI (if deployed)
aws cloudformation delete-stack --stack-name CdkBackendStack

# Then manually delete remaining resources as needed:
# - S3 buckets (must be emptied first)
# - CodeBuild projects (pdfremediation-*, pdf-ui-*)
# - IAM roles and policies
# - Secrets Manager secrets
# - BDA projects
# - ECR repositories
```
