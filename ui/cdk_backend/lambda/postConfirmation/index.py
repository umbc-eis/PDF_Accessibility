import json
import os
import boto3

def handler(event, context):
    print('Post Confirmation Trigger Event:', json.dumps(event, indent=2))
    if event['triggerSource'] != 'PostConfirmation_ConfirmSignUp':
        print(f"Skipping initialization - trigger source is {event['triggerSource']}")
        return event
    
    # Retrieve group names from environment variables
    DEFAULT_GROUP = str(os.environ.get('DEFAULT_GROUP_NAME'))
    AMAZON_GROUP = str(os.environ.get('AMAZON_GROUP_NAME'))
    ADMIN_GROUP = str(os.environ.get('ADMIN_GROUP_NAME'))

    # Define attribute defaults based on group
    group_attributes = {
        DEFAULT_GROUP: {
            'custom:first_sign_in': 'true',
            'custom:total_files_uploaded': '0',
            'custom:max_files_allowed': '8',
            'custom:max_pages_allowed': '10',
            'custom:max_size_allowed_MB': '25'
        },
        AMAZON_GROUP: {
            'custom:first_sign_in': 'true',
            'custom:total_files_uploaded': '0',
            'custom:max_files_allowed': '15',
            'custom:max_pages_allowed': '10',
            'custom:max_size_allowed_MB': '25'
        },
        ADMIN_GROUP: {
            'custom:first_sign_in': 'true',
            'custom:total_files_uploaded': '0',
            'custom:max_files_allowed': '100',
            'custom:max_pages_allowed': '2500',
            'custom:max_size_allowed_MB': '1000'
        }
    }

    try:
        cognito_idp = boto3.client('cognito-idp')
        user_pool_id = event['userPoolId']
        username = event['userName']

        # Determine the group to assign the user to
        # For demonstration, we'll assign all users to the Default group
        # You can implement your own logic here to assign to Amazon or Admin groups
        assigned_group = DEFAULT_GROUP

        # Example logic to assign to AmazonUsers based on email domain
        user_email = event['request']['userAttributes'].get('email', '')
        if user_email.endswith('@amazon.com'):
            assigned_group = AMAZON_GROUP
        # Example logic to assign to AdminUsers based on a specific condition
        # elif user_email.endswith('@admin.com'):
        #     assigned_group = ADMIN_GROUP

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

    except Exception as error:
        print(f'Error in post confirmation trigger: {error}')

    return event
