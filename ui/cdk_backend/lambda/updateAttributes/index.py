import json
import os
import boto3

# Initialize Cognito client
cognito_client = boto3.client('cognito-idp')

def handler(event, context):
    """
    AWS Lambda handler to update Cognito user attributes upon first sign-in.

    Expects a POST request with a JSON body containing:
    - sub: User's unique identifier in Cognito
    - organization: User's organization name
    - country: User's country
    - state: User's state
    - city: User's city

    Returns a JSON response indicating success or error details.
    """
    try:
        print("Received event:", json.dumps(event))
        
        # Ensure the HTTP method is POST
        if event.get("httpMethod") != "POST":
            print("Invalid HTTP method:", event.get("httpMethod"))
            return {
                "statusCode": 405,
                "headers": {
                    "Access-Control-Allow-Origin": "*",  # Adjust as needed
                    "Access-Control-Allow-Methods": "POST,OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type,Authorization",
                },
                "body": json.dumps({"message": "Method Not Allowed. Use POST."}),
            }

        # Parse the request body
        try:
            body = json.loads(event.get("body", "{}"))
            print("Parsed body:", body)
        except json.JSONDecodeError:
            print("Invalid JSON in request body.")
            return {
                "statusCode": 400,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST,OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type,Authorization",
                },
                "body": json.dumps({"message": "Invalid JSON in request body."}),
            }

        # Extract fields
        user_sub = body.get("sub")
        organization = body.get("organization")
        country = body.get("country")
        state = body.get("state")
        city = body.get("city")

        print("Extracted fields - sub:", user_sub, "organization:", organization, "country:", country, "state:", state, "city:", city)

        # Validate required fields
        required_fields = {
            "sub": user_sub,
            "organization": organization,
            "country": country,
            "state": state,
            "city": city
        }

        missing_fields = [field for field, value in required_fields.items() if not value]
        if missing_fields:
            print("Missing required fields:", ", ".join(missing_fields))
            return {
                "statusCode": 400,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST,OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type,Authorization",
                },
                "body": json.dumps({
                    "message": f"Missing required fields: {', '.join(missing_fields)}"
                }),
            }


        # Retrieve User Pool ID from environment variables
        user_pool_id = os.environ.get("USER_POOL_ID")
        if not user_pool_id:
            print("Environment variable USER_POOL_ID is not set.")
            return {
                "statusCode": 500,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST,OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type,Authorization",
                },
                "body": json.dumps({"message": "Server configuration error."}),
            }

        print("User Pool ID:", user_pool_id)

        # Update user attributes in Cognito
        try:
            cognito_client.admin_update_user_attributes(
                UserPoolId=user_pool_id,
                Username=user_sub,
                UserAttributes=[
                    {"Name": "custom:organization", "Value": organization},
                    {"Name": "custom:first_sign_in", "Value": "false"},
                    {"Name": "custom:country", "Value": country},
                    {"Name": "custom:state", "Value": state},
                    {"Name": "custom:city", "Value": city},
                ]
            )
            print("Successfully updated attributes for user", user_sub)
        except cognito_client.exceptions.InvalidParameterException as e:
            print("Invalid parameters when updating user:", str(e))
            return {
                "statusCode": 400,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST,OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type,Authorization",
                },
                "body": json.dumps({"message": "Invalid parameters provided."}),
            }
        except cognito_client.exceptions.UserNotFoundException:
            print("User", user_sub, "not found during update.")
            return {
                "statusCode": 404,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST,OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type,Authorization",
                },
                "body": json.dumps({"message": "User not found during update."}),
            }
        except Exception as e:
            print("Unexpected error during attribute update:", str(e))
            return {
                "statusCode": 500,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST,OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type,Authorization",
                },
                "body": json.dumps({"message": "Internal server error during update."}),
            }

        # Return success response
        print("User attributes updated successfully.")
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST,OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type,Authorization",
            },
            "body": json.dumps({"message": "User attributes updated successfully."}),
        }

    except Exception as e:
        # Catch any unexpected errors
        print("Unhandled exception:", str(e))
        return {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST,OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type,Authorization",
            },
            "body": json.dumps({"message": "Internal server error."}),
        }
