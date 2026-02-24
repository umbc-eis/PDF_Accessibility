import json
import os
import boto3

ADMIN_EMAILS = ['champ@umbc.edu']

def handler(event, context):
    print('Post Confirmation Trigger Event:', json.dumps(event, indent=2))
    if event['triggerSource'] != 'PostConfirmation_ConfirmSignUp':
        print(f"Skipping initialization - trigger source is {event['triggerSource']}")
        return event

    # Retrieve group names from environment variables
    DEFAULT_GROUP = str(os.environ.get('DEFAULT_GROUP_NAME'))
    ADMIN_GROUP = str(os.environ.get('ADMIN_GROUP_NAME'))
    SNS_TOPIC_ARN = os.environ.get('SNS_TOPIC_ARN', '')

    # Define attribute defaults based on group
    group_attributes = {
        DEFAULT_GROUP: {
            'custom:total_files_uploaded': '0',
            'custom:max_files_allowed': '1000',
            'custom:max_pages_allowed': '100',
            'custom:max_size_allowed_MB': '50'
        },
        ADMIN_GROUP: {
            'custom:total_files_uploaded': '0',
            'custom:max_files_allowed': '1000',
            'custom:max_pages_allowed': '100',
            'custom:max_size_allowed_MB': '50'
        }
    }

    try:
        cognito_idp = boto3.client('cognito-idp')
        user_pool_id = event['userPoolId']
        username = event['userName']

        # Get user email
        user_email = event['request']['userAttributes'].get('email', '').lower()

        # Validate email domain - only allow @umbc.edu
        if not user_email.endswith('@umbc.edu'):
            print(f'Rejected user with non-UMBC email: {user_email}')
            raise Exception('Only @umbc.edu email addresses are allowed to register.')

        # Determine the group to assign the user to
        if user_email in ADMIN_EMAILS:
            assigned_group = ADMIN_GROUP
        else:
            assigned_group = DEFAULT_GROUP

        # Add user to the assigned group
        cognito_idp.admin_add_user_to_group(
            UserPoolId=user_pool_id,
            Username=username,
            GroupName=assigned_group
        )
        print(f'User {username} added to group {assigned_group}.')

        # Initialize custom attributes based on the assigned group
        attributes = group_attributes.get(assigned_group, {})
        user_attributes = [{'Name': key, 'Value': value} for key, value in attributes.items()]

        if user_attributes:
            cognito_idp.admin_update_user_attributes(
                UserPoolId=user_pool_id,
                Username=username,
                UserAttributes=user_attributes
            )
            print(f'Successfully initialized attributes for group {assigned_group}.')

        # Disable non-admin users until an admin approves them
        if user_email not in ADMIN_EMAILS:
            cognito_idp.admin_disable_user(
                UserPoolId=user_pool_id,
                Username=username
            )
            print(f'User {username} ({user_email}) has been disabled pending admin approval.')

            # Send SNS notification to admins
            if SNS_TOPIC_ARN:
                sns = boto3.client('sns')
                given_name = event['request']['userAttributes'].get('given_name', '')
                family_name = event['request']['userAttributes'].get('family_name', '')
                sns.publish(
                    TopicArn=SNS_TOPIC_ARN,
                    Subject='New PDF Accessibility UI Signup - Approval Required',
                    Message=(
                        f'A new user has signed up and requires admin approval:\n\n'
                        f'  Name: {given_name} {family_name}\n'
                        f'  Email: {user_email}\n'
                        f'  Username: {username}\n\n'
                        f'The user has been disabled and cannot log in until enabled.\n\n'
                        f'To approve this user, go to the Cognito Console:\n'
                        f'  1. Navigate to the User Pool\n'
                        f'  2. Find the user by email\n'
                        f'  3. Click "Enable user"\n'
                    )
                )
                print(f'Admin notification sent for user {user_email}.')
        else:
            print(f'Admin user {user_email} auto-approved (not disabled).')

    except Exception as error:
        print(f'Error in post confirmation trigger: {error}')

    return event
