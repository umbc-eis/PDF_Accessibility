import json

def handler(event, context):
    """
    PreSignUp Lambda Trigger
    Validates that only @umbc.edu email addresses can register
    """
    print('PreSignUp Trigger Event:', json.dumps(event, indent=2))

    # Get the user's email from the request
    user_email = event['request']['userAttributes'].get('email', '').lower()

    print(f'PreSignUp validation for email: {user_email}')

    # Validate email domain - only allow @umbc.edu
    if not user_email.endswith('@umbc.edu'):
        print(f'Registration rejected: {user_email} is not a @umbc.edu address')
        raise Exception('Registration is restricted to @umbc.edu email addresses only.')

    print(f'Email validation passed for: {user_email}')

    # Do NOT auto-confirm or auto-verify.
    # Cognito will send a verification code to the user's email.
    # After verification, the postConfirmation trigger will fire,
    # assign groups, and disable the user pending admin approval.

    return event
