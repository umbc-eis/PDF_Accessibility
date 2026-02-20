import json
import os
import boto3

# Initialize Cognito client
cognito_client = boto3.client('cognito-idp')

def handler(event, context):
    """
    AWS Lambda handler to either:
    - Return the user's current total_files_uploaded and max limits (mode='check')
    - Or increment the user's total_files_uploaded by 1 if under their max limit (mode='increment')
    - Also handles incrementing pdf2pdf or pdf2html conversion counts

    Expects a POST request with a JSON body containing:
    {
      "sub": "<User's unique Cognito identifier>",
      "mode": "check" or "increment",
      "conversionType": "pdf" or "html" (required for increment mode)
    }

    Returns:
      {
        "currentUsage": <int>,        # Always returned for mode='check'
        "maxFilesAllowed": <int>,     # Always returned for mode='check'
        "maxPagesAllowed": <int>,     # Always returned for mode='check'
        "maxSizeAllowedMB": <int>,    # Always returned for mode='check'
        "newCount": <int>,            # Returned for mode='increment'
        "pdf2pdfCount": <int>,        # Current pdf2pdf conversion count
        "pdf2htmlCount": <int>        # Current pdf2html conversion count
      }
      or an error message, e.g., 403 if limit reached.
    """
    try:
        print("Received event:", json.dumps(event))

        # Ensure the HTTP method is POST
        if event.get("httpMethod") != "POST":
            print("Invalid HTTP method:", event.get("httpMethod"))
            return {
                "statusCode": 405,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST,OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type,Authorization",
                },
                "body": json.dumps({"message": "Method Not Allowed. Use POST."}),
            }

        # Handle CORS preflight request
        if event.get("resource") == "/upload-quota" and event.get("httpMethod") == "OPTIONS":
            return {
                "statusCode": 200,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST,OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type,Authorization",
                },
                "body": "",
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

        # Extract required fields
        user_sub = body.get("sub")
        mode = body.get("mode")
        conversion_type = body.get("conversionType")

        if not user_sub:
            print("Missing required field: sub")
            return {
                "statusCode": 400,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST,OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type,Authorization",
                },
                "body": json.dumps({"message": "Missing required field: sub"}),
            }
        if not mode or mode not in ["check", "increment"]:
            print("Missing or invalid mode. Must be 'check' or 'increment'.")
            return {
                "statusCode": 400,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST,OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type,Authorization",
                },
                "body": json.dumps({"message": "Missing or invalid mode. Use 'check' or 'increment'."}),
            }
        if mode == "increment" and (not conversion_type or conversion_type not in ["pdf", "html"]):
            print("Missing or invalid conversionType for increment mode. Must be 'pdf' or 'html'.")
            return {
                "statusCode": 400,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST,OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type,Authorization",
                },
                "body": json.dumps({"message": "Missing or invalid conversionType for increment mode. Use 'pdf' or 'html'."}),
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

        # 1) Fetch existing user to read current attributes
        try:
            response = cognito_client.admin_get_user(
                UserPoolId=user_pool_id,
                Username=user_sub
            )
        except cognito_client.exceptions.UserNotFoundException:
            print("User not found in Cognito:", user_sub)
            return {
                "statusCode": 404,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST,OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type,Authorization",
                },
                "body": json.dumps({"message": "User not found in Cognito."}),
            }
        except Exception as e:
            print("Error fetching user from Cognito:", str(e))
            return {
                "statusCode": 500,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST,OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type,Authorization",
                },
                "body": json.dumps({"message": "Failed to retrieve user from Cognito."}),
            }

        # 2) Parse the current attributes
        user_attributes = {attr["Name"]: attr["Value"] for attr in response.get("UserAttributes", [])}
        current_count_str = user_attributes.get("custom:total_files_uploaded", "0")
        max_files_allowed_str = user_attributes.get("custom:max_files_allowed", "3")
        max_pages_allowed_str = user_attributes.get("custom:max_pages_allowed", "10")
        max_size_allowed_mb_str = user_attributes.get("custom:max_size_allowed_MB", "25")
        pdf2pdf_count_str = user_attributes.get("custom:pdf2pdf", "0")
        pdf2html_count_str = user_attributes.get("custom:pdf2html", "0")

        try:
            current_count = int(current_count_str)
        except ValueError:
            current_count = 0

        try:
            max_files_allowed = int(max_files_allowed_str)
        except ValueError:
            max_files_allowed = 3  # Default value

        try:
            max_pages_allowed = int(max_pages_allowed_str)
        except ValueError:
            max_pages_allowed = 10  # Default value

        try:
            max_size_allowed_mb = int(max_size_allowed_mb_str)
        except ValueError:
            max_size_allowed_mb = 25  # Default value

        try:
            pdf2pdf_count = int(pdf2pdf_count_str)
        except ValueError:
            pdf2pdf_count = 0

        try:
            pdf2html_count = int(pdf2html_count_str)
        except ValueError:
            pdf2html_count = 0

        print(f"Mode: {mode}, Current Usage: {current_count}, Max Files: {max_files_allowed}, Max Pages: {max_pages_allowed}, Max Size: {max_size_allowed_mb} MB")
        print(f"PDF2PDF Count: {pdf2pdf_count}, PDF2HTML Count: {pdf2html_count}")

        # If mode == check, return current usage and limits
        if mode == "check":
            return {
                "statusCode": 200,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST,OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type,Authorization",
                },
                "body": json.dumps({
                    "currentUsage": current_count,
                    "maxFilesAllowed": max_files_allowed,
                    "maxPagesAllowed": max_pages_allowed,
                    "maxSizeAllowedMB": max_size_allowed_mb,
                    "pdf2pdfCount": pdf2pdf_count,
                    "pdf2htmlCount": pdf2html_count
                }),
            }

        # If mode == increment, enforce the limits and update conversion counts
        if mode == "increment":
            # 3) Check if user is already at or above limit
            if current_count >= max_files_allowed:
                print(f"User has already reached the {max_files_allowed} PDF upload limit.")
                return {
                    "statusCode": 403,
                    "headers": {
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "POST,OPTIONS",
                        "Access-Control-Allow-Headers": "Content-Type,Authorization",
                    },
                    "body": json.dumps({
                        "message": f"You have already reached the limit of {max_files_allowed} PDF uploads."
                    }),
                }

            # 4) If they have not reached the limit, increment usage and conversion count
            new_count = current_count + 1

            # Determine which conversion count to increment
            if conversion_type == "pdf":
                new_pdf2pdf_count = pdf2pdf_count + 1
                new_pdf2html_count = pdf2html_count
                print(f"Incrementing PDF2PDF count from {pdf2pdf_count} to {new_pdf2pdf_count}")
            else:  # conversion_type == "html"
                new_pdf2pdf_count = pdf2pdf_count
                new_pdf2html_count = pdf2html_count + 1
                print(f"Incrementing PDF2HTML count from {pdf2html_count} to {new_pdf2html_count}")

            try:
                cognito_client.admin_update_user_attributes(
                    UserPoolId=user_pool_id,
                    Username=user_sub,
                    UserAttributes=[
                        {
                            "Name": "custom:total_files_uploaded",
                            "Value": str(new_count)
                        },
                        {
                            "Name": "custom:pdf2pdf",
                            "Value": str(new_pdf2pdf_count)
                        },
                        {
                            "Name": "custom:pdf2html",
                            "Value": str(new_pdf2html_count)
                        }
                    ]
                )
                print(f"Successfully updated counts for user {user_sub}: total_files_uploaded={new_count}, pdf2pdf={new_pdf2pdf_count}, pdf2html={new_pdf2html_count}")
            except Exception as e:
                print("Error updating user attribute in Cognito:", str(e))
                return {
                    "statusCode": 500,
                    "headers": {
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "POST,OPTIONS",
                        "Access-Control-Allow-Headers": "Content-Type,Authorization",
                    },
                    "body": json.dumps({"message": "Failed to update user attribute."}),
                }

            # 5) Return success with the new usage count and limits
            return {
                "statusCode": 200,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST,OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type,Authorization",
                },
                "body": json.dumps({
                    "message": f"Upload allowed. New count = {new_count}.",
                    "newCount": new_count,
                    "currentUsage": new_count,
                    "maxFilesAllowed": max_files_allowed,
                    "maxPagesAllowed": max_pages_allowed,
                    "maxSizeAllowedMB": max_size_allowed_mb,
                    "pdf2pdfCount": new_pdf2pdf_count,
                    "pdf2htmlCount": new_pdf2html_count
                }),
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
