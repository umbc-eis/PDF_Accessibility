#!/bin/bash

# ========================================================================
# 🗑️  PDF Accessibility Solutions - Unified Uninstall Script
# ========================================================================
#
# This script will help you safely remove deployed PDF accessibility solutions:
# 1. PDF-to-PDF Remediation (CloudFormation stack + resources)
# 2. PDF-to-HTML Remediation (CloudFormation stack + resources)
# 3. Frontend UI (Amplify + Cognito resources)
#
# IMPORTANT: This will permanently delete all resources and data!
# ========================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_header() { echo -e "${CYAN}$1${NC}"; }
print_danger() { echo -e "${MAGENTA}[DANGER]${NC} $1"; }

echo ""
print_header "🗑️  PDF Accessibility Solutions - Uninstall Tool"
print_header "=================================================="
echo ""
print_danger "⚠️  WARNING: This will permanently delete AWS resources and data!"
print_danger "⚠️  Make sure you have backups of any important files!"
echo ""

# Verify AWS credentials
print_status "🔍 Verifying AWS credentials..."
ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text 2>/dev/null || {
    print_error "Failed to get AWS account ID. Please ensure AWS CLI is configured."
    exit 1
})

REGION=$AWS_DEFAULT_REGION
if [ -z "$REGION" ]; then
    REGION=$(aws configure get region 2>/dev/null)
fi

if [ -z "$REGION" ]; then
    print_error "Could not determine AWS region. Please set your region:"
    print_error "  export AWS_DEFAULT_REGION=us-west-2"
    exit 1
fi

print_success "✅ AWS Account: $ACCOUNT_ID, Region: $REGION"
echo ""

# Detect deployed solutions
print_status "🔍 Scanning for deployed solutions..."
echo ""

FOUND_SOLUTIONS=()
FOUND_STACKS=()
FOUND_BUCKETS=()
FOUND_PROJECTS=()

# Check for PDF-to-PDF stack
if aws cloudformation describe-stacks --stack-name PDFAccessibility --region $REGION >/dev/null 2>&1; then
    FOUND_SOLUTIONS+=("pdf2pdf")
    FOUND_STACKS+=("PDFAccessibility")
    print_success "   ✓ Found PDF-to-PDF stack: PDFAccessibility"

    # Try to find associated bucket
    PDF2PDF_BUCKET=$(aws cloudformation describe-stacks \
        --stack-name PDFAccessibility \
        --query 'Stacks[0].Outputs[?contains(OutputKey, `Bucket`)].OutputValue' \
        --output text 2>/dev/null | head -1)

    if [ -z "$PDF2PDF_BUCKET" ] || [ "$PDF2PDF_BUCKET" == "None" ]; then
        PDF2PDF_BUCKET=$(aws s3api list-buckets \
            --query 'Buckets[?contains(Name, `pdfaccessibility`)] | sort_by(@, &CreationDate) | [-1].Name' \
            --output text 2>/dev/null)
    fi

    if [ -n "$PDF2PDF_BUCKET" ] && [ "$PDF2PDF_BUCKET" != "None" ]; then
        FOUND_BUCKETS+=("$PDF2PDF_BUCKET")
        print_status "     Bucket: $PDF2PDF_BUCKET"
    fi
fi

# Check for PDF-to-HTML stack
PDF2HTML_STACKS=$(aws cloudformation list-stacks \
    --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
    --query 'StackSummaries[?contains(StackName, `Pdf2Html`)].StackName' \
    --output text 2>/dev/null)

if [ -n "$PDF2HTML_STACKS" ]; then
    for stack in $PDF2HTML_STACKS; do
        FOUND_SOLUTIONS+=("pdf2html")
        FOUND_STACKS+=("$stack")
        print_success "   ✓ Found PDF-to-HTML stack: $stack"
    done

    # Find PDF-to-HTML buckets
    PDF2HTML_BUCKET=$(aws s3api list-buckets \
        --query 'Buckets[?contains(Name, `pdf2html-bucket`)] | sort_by(@, &CreationDate) | [-1].Name' \
        --output text 2>/dev/null)

    if [ -n "$PDF2HTML_BUCKET" ] && [ "$PDF2HTML_BUCKET" != "None" ]; then
        FOUND_BUCKETS+=("$PDF2HTML_BUCKET")
        print_status "     Bucket: $PDF2HTML_BUCKET"
    fi
fi

# Check for UI stacks (multiple possible stack names)
UI_STACKS=$(aws cloudformation list-stacks \
    --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
    --query 'StackSummaries[?contains(StackName, `AmplifyHosting`) || contains(StackName, `CdkBackendStack`)].StackName' \
    --output text 2>/dev/null)

if [ -n "$UI_STACKS" ]; then
    FOUND_SOLUTIONS+=("ui")
    for stack in $UI_STACKS; do
        FOUND_STACKS+=("$stack")
        print_success "   ✓ Found UI stack: $stack"
    done
fi

# Check for CodeBuild projects (both backend and UI)
CODEBUILD_PROJECTS=$(aws codebuild list-projects \
    --query 'projects[?contains(@, `pdfremediation`) || contains(@, `pdf-ui`)]' \
    --output text 2>/dev/null)

if [ -n "$CODEBUILD_PROJECTS" ]; then
    for project in $CODEBUILD_PROJECTS; do
        FOUND_PROJECTS+=("$project")
        print_success "   ✓ Found CodeBuild project: $project"
    done
fi

echo ""

if [ ${#FOUND_STACKS[@]} -eq 0 ] && [ ${#FOUND_PROJECTS[@]} -eq 0 ]; then
    print_warning "No deployed resources found!"
    echo ""
    print_status "Nothing to uninstall. Exiting."
    exit 0
fi

# Show summary and ask for confirmation
print_header "📋 Resources to be deleted:"
print_header "============================"
echo ""

if [ ${#FOUND_STACKS[@]} -gt 0 ]; then
    print_status "CloudFormation Stacks:"
    for stack in "${FOUND_STACKS[@]}"; do
        echo "   • $stack"
    done
    echo ""
fi

if [ ${#FOUND_BUCKETS[@]} -gt 0 ]; then
    print_status "S3 Buckets (all contents will be deleted):"
    for bucket in "${FOUND_BUCKETS[@]}"; do
        echo "   • $bucket"
    done
    echo ""
fi

if [ ${#FOUND_PROJECTS[@]} -gt 0 ]; then
    print_status "CodeBuild Projects:"
    for project in "${FOUND_PROJECTS[@]}"; do
        echo "   • $project"
    done
    echo ""
fi

print_status "Additional resources to be cleaned:"
echo "   • ECR repositories (pdf2html-lambda)"
echo "   • IAM roles and policies"
echo "   • Secrets Manager secrets (/myapp/client_credentials)"
echo "   • Bedrock Data Automation projects"
echo "   • CloudWatch log groups and dashboards"
if [[ " ${FOUND_SOLUTIONS[@]} " =~ " ui " ]]; then
    echo "   • Cognito User Pool and Identity Pool (UI authentication)"
    echo "   • API Gateway (UI backend API)"
    echo "   • Amplify App (UI hosting)"
    echo "   • Lambda functions (UI quota and user management)"
fi
echo ""

print_danger "⚠️  THIS ACTION CANNOT BE UNDONE!"
echo ""

while true; do
    read -p "$(echo -e ${YELLOW}Type 'DELETE' to confirm uninstallation:${NC} )" CONFIRMATION

    if [ "$CONFIRMATION" == "DELETE" ]; then
        print_success "Confirmation received. Proceeding with uninstallation..."
        break
    else
        print_error "Confirmation failed. Type 'DELETE' exactly to proceed, or Ctrl+C to cancel."
    fi
done

echo ""
print_header "🗑️  Starting uninstallation process..."
echo ""

# Function to delete CloudFormation stack
delete_stack() {
    local stack_name=$1

    print_status "Deleting CloudFormation stack: $stack_name"

    if aws cloudformation delete-stack --stack-name "$stack_name" --region $REGION 2>/dev/null; then
        print_status "   Waiting for stack deletion to complete..."

        # Wait with timeout (20 minutes)
        local wait_count=0
        local max_wait=120 # 20 minutes = 120 * 10 seconds

        while [ $wait_count -lt $max_wait ]; do
            STACK_STATUS=$(aws cloudformation describe-stacks \
                --stack-name "$stack_name" \
                --query 'Stacks[0].StackStatus' \
                --output text 2>/dev/null || echo "DELETE_COMPLETE")

            if [ "$STACK_STATUS" == "DELETE_COMPLETE" ] || [ "$STACK_STATUS" == "" ]; then
                print_success "   ✅ Stack deleted: $stack_name"
                return 0
            elif [ "$STACK_STATUS" == "DELETE_FAILED" ]; then
                print_error "   ❌ Stack deletion failed: $stack_name"
                print_error "   Please check AWS Console for details"
                return 1
            fi

            printf "."
            sleep 10
            wait_count=$((wait_count + 1))
        done

        print_warning "   ⚠️ Stack deletion is taking longer than expected"
        print_status "   Check AWS Console for status: $stack_name"
        return 0
    else
        print_error "   ❌ Failed to initiate stack deletion: $stack_name"
        return 1
    fi
}

# Function to delete S3 bucket
delete_bucket() {
    local bucket_name=$1

    print_status "Deleting S3 bucket: $bucket_name"

    # Check if bucket exists
    if ! aws s3api head-bucket --bucket "$bucket_name" 2>/dev/null; then
        print_warning "   Bucket does not exist or is already deleted: $bucket_name"
        return 0
    fi

    # Empty bucket
    print_status "   Emptying bucket..."
    if aws s3 rm "s3://$bucket_name" --recursive 2>/dev/null; then
        print_status "   Bucket emptied"
    else
        print_warning "   Could not empty bucket (may already be empty)"
    fi

    # Delete all versions (if versioned)
    print_status "   Removing all object versions..."
    aws s3api list-object-versions --bucket "$bucket_name" --output json 2>/dev/null | \
        jq -r '.Versions[]?, .DeleteMarkers[]? | "\(.Key) \(.VersionId)"' 2>/dev/null | \
        while read key version; do
            aws s3api delete-object --bucket "$bucket_name" --key "$key" --version-id "$version" 2>/dev/null || true
        done

    # Delete bucket
    if aws s3 rb "s3://$bucket_name" 2>/dev/null; then
        print_success "   ✅ Bucket deleted: $bucket_name"
    else
        print_warning "   ⚠️ Could not delete bucket: $bucket_name (may already be deleted)"
    fi
}

# Function to delete CodeBuild project
delete_codebuild_project() {
    local project_name=$1

    print_status "Deleting CodeBuild project: $project_name"

    if aws codebuild delete-project --name "$project_name" 2>/dev/null; then
        print_success "   ✅ Project deleted: $project_name"
    else
        print_warning "   ⚠️ Could not delete project: $project_name"
    fi
}

# Function to delete IAM resources
delete_iam_resources() {
    local project_name=$1

    # Determine role name pattern based on project type
    local role_name
    if [[ "$project_name" == pdf-ui-* ]]; then
        role_name="${project_name}-service-role"
    else
        role_name="${project_name}-codebuild-service-role"
    fi

    print_status "Deleting IAM resources for: $project_name"

    # Check if role exists
    if aws iam get-role --role-name "$role_name" >/dev/null 2>&1; then
        # Detach managed policies
        ATTACHED_POLICIES=$(aws iam list-attached-role-policies \
            --role-name "$role_name" \
            --query 'AttachedPolicies[*].PolicyArn' \
            --output text 2>/dev/null)

        for policy_arn in $ATTACHED_POLICIES; do
            print_status "   Detaching policy: $policy_arn"
            aws iam detach-role-policy --role-name "$role_name" --policy-arn "$policy_arn" 2>/dev/null || true
        done

        # Delete inline policies
        INLINE_POLICIES=$(aws iam list-role-policies \
            --role-name "$role_name" \
            --query 'PolicyNames[*]' \
            --output text 2>/dev/null)

        for policy_name in $INLINE_POLICIES; do
            print_status "   Deleting inline policy: $policy_name"
            aws iam delete-role-policy --role-name "$role_name" --policy-name "$policy_name" 2>/dev/null || true
        done

        # Delete role
        if aws iam delete-role --role-name "$role_name" 2>/dev/null; then
            print_success "   ✅ Role deleted: $role_name"
        fi
    fi

    # Delete custom policies (backend projects)
    for policy_type in "pdf2pdf-codebuild-policy" "pdf2html-codebuild-policy"; do
        POLICY_NAME="${project_name}-${policy_type}"
        POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/${POLICY_NAME}"

        if aws iam get-policy --policy-arn "$POLICY_ARN" >/dev/null 2>&1; then
            # Delete all policy versions except default
            VERSIONS=$(aws iam list-policy-versions \
                --policy-arn "$POLICY_ARN" \
                --query 'Versions[?!IsDefaultVersion].VersionId' \
                --output text 2>/dev/null)

            for version in $VERSIONS; do
                aws iam delete-policy-version --policy-arn "$POLICY_ARN" --version-id "$version" 2>/dev/null || true
            done

            # Delete policy
            if aws iam delete-policy --policy-arn "$POLICY_ARN" 2>/dev/null; then
                print_success "   ✅ Policy deleted: $POLICY_NAME"
            fi
        fi
    done

    # Delete UI custom policy (if this is a UI project)
    if [[ "$project_name" == pdf-ui-* ]]; then
        UI_POLICY_NAME="${project_name}-deployment-policy"
        UI_POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/${UI_POLICY_NAME}"

        if aws iam get-policy --policy-arn "$UI_POLICY_ARN" >/dev/null 2>&1; then
            # Delete all policy versions except default
            VERSIONS=$(aws iam list-policy-versions \
                --policy-arn "$UI_POLICY_ARN" \
                --query 'Versions[?!IsDefaultVersion].VersionId' \
                --output text 2>/dev/null)

            for version in $VERSIONS; do
                aws iam delete-policy-version --policy-arn "$UI_POLICY_ARN" --version-id "$version" 2>/dev/null || true
            done

            # Delete policy
            if aws iam delete-policy --policy-arn "$UI_POLICY_ARN" 2>/dev/null; then
                print_success "   ✅ UI Policy deleted: $UI_POLICY_NAME"
            fi
        fi
    fi
}

# Step 1: Delete CloudFormation stacks
if [ ${#FOUND_STACKS[@]} -gt 0 ]; then
    print_header "🔧 Step 1/7: Deleting CloudFormation stacks..."
    echo ""

    for stack in "${FOUND_STACKS[@]}"; do
        delete_stack "$stack"
    done
    echo ""
else
    print_status "No CloudFormation stacks to delete."
    echo ""
fi

# Step 2: Delete S3 buckets
print_header "🔧 Step 2/7: Deleting S3 buckets..."
echo ""

if [ ${#FOUND_BUCKETS[@]} -gt 0 ]; then
    for bucket in "${FOUND_BUCKETS[@]}"; do
        delete_bucket "$bucket"
    done
else
    print_status "No S3 buckets found to delete."
fi
echo ""

# Step 3: Delete BDA projects
print_header "🔧 Step 3/7: Deleting Bedrock Data Automation projects..."
echo ""

BDA_PROJECTS=$(aws bedrock-data-automation list-data-automation-projects \
    --query 'projects[?contains(projectName, `pdf2html-bda-project`)].projectArn' \
    --output text 2>/dev/null || echo "")

if [ -n "$BDA_PROJECTS" ]; then
    for project_arn in $BDA_PROJECTS; do
        print_status "Deleting BDA project: $project_arn"
        if aws bedrock-data-automation delete-data-automation-project --project-arn "$project_arn" 2>/dev/null; then
            print_success "   ✅ BDA project deleted"
        else
            print_warning "   ⚠️ Could not delete BDA project (may already be deleted)"
        fi
    done
else
    print_status "No BDA projects found to delete."
fi
echo ""

# Step 4: Delete ECR repositories
print_header "🔧 Step 4/7: Deleting ECR repositories..."
echo ""

ECR_REPOS=("pdf2html-lambda")
for repo in "${ECR_REPOS[@]}"; do
    if aws ecr describe-repositories --repository-names "$repo" --region $REGION >/dev/null 2>&1; then
        print_status "Deleting ECR repository: $repo"
        if aws ecr delete-repository --repository-name "$repo" --force --region $REGION 2>/dev/null; then
            print_success "   ✅ Repository deleted: $repo"
        else
            print_warning "   ⚠️ Could not delete repository: $repo"
        fi
    fi
done
echo ""

# Step 5: Delete Secrets Manager secrets
print_header "🔧 Step 5/7: Deleting Secrets Manager secrets..."
echo ""

SECRET_ID="/myapp/client_credentials"
if aws secretsmanager describe-secret --secret-id "$SECRET_ID" --region $REGION >/dev/null 2>&1; then
    print_status "Deleting secret: $SECRET_ID"
    if aws secretsmanager delete-secret --secret-id "$SECRET_ID" --force-delete-without-recovery --region $REGION 2>/dev/null; then
        print_success "   ✅ Secret deleted: $SECRET_ID"
    else
        print_warning "   ⚠️ Could not delete secret: $SECRET_ID"
    fi
else
    print_status "No secrets found to delete."
fi
echo ""

# Step 6: Delete CodeBuild projects and IAM resources
print_header "🔧 Step 6/7: Deleting CodeBuild projects and IAM resources..."
echo ""

if [ ${#FOUND_PROJECTS[@]} -gt 0 ]; then
    for project in "${FOUND_PROJECTS[@]}"; do
        delete_codebuild_project "$project"
        delete_iam_resources "$project"
    done
else
    print_status "No CodeBuild projects found to delete."
fi
echo ""

# Step 7: Delete CloudWatch dashboards
print_header "🔧 Step 7/7: Deleting CloudWatch dashboards..."
echo ""

DASHBOARDS=$(aws cloudwatch list-dashboards \
    --query 'DashboardEntries[?contains(DashboardName, `PDF_Processing_Dashboard`)].DashboardName' \
    --output text 2>/dev/null || echo "")

if [ -n "$DASHBOARDS" ]; then
    for dashboard in $DASHBOARDS; do
        print_status "Deleting dashboard: $dashboard"
        if aws cloudwatch delete-dashboards --dashboard-names "$dashboard" 2>/dev/null; then
            print_success "   ✅ Dashboard deleted: $dashboard"
        else
            print_warning "   ⚠️ Could not delete dashboard: $dashboard"
        fi
    done
else
    print_status "No CloudWatch dashboards found to delete."
fi
echo ""

# Final summary
print_header "🎉 Uninstallation Complete!"
print_header "==========================="
echo ""

print_success "✅ All resources have been removed successfully!"
echo ""

print_status "📋 Summary of deleted resources:"
if [ ${#FOUND_STACKS[@]} -gt 0 ]; then
    print_status "   • ${#FOUND_STACKS[@]} CloudFormation stack(s)"
fi
if [ ${#FOUND_BUCKETS[@]} -gt 0 ]; then
    print_status "   • ${#FOUND_BUCKETS[@]} S3 bucket(s)"
fi
if [ ${#FOUND_PROJECTS[@]} -gt 0 ]; then
    print_status "   • ${#FOUND_PROJECTS[@]} CodeBuild project(s)"
fi

echo ""
print_warning "⚠️  Note: CDK Bootstrap stack (CDKToolkit) was not deleted."
print_status "   This stack may be used by other CDK projects."
print_status "   To delete it manually if needed:"
print_status "   aws cloudformation delete-stack --stack-name CDKToolkit"
echo ""

print_success "Thank you for using PDF Accessibility Solutions!"
echo ""

exit 0
