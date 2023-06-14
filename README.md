# medusa-auth-cognito

Use AWS Cognito to store customer credentials instead of the Postgres database

If you are not familiar with Medusa, you can learn more on [the project web site](https://www.medusajs.com/).

> Medusa is a set of commerce modules and tools that allow you to build rich, reliable, and performant commerce applications without reinventing core commerce logic. The modules can be customized and used to build advanced ecommerce stores, marketplaces, or any product that needs foundational commerce primitives. All modules are open-source and freely available on npm.

## Features

The goal of this plugin is to make the fewest changes needed to the Medusa core to have customer credentials (passwords) stored in Cognito instead of the Medusa database.  It uses Cognito for authentication only.  This plugin does not use Cognito for identity (user data) or authorization (session management).  Those functions continue to be handled by Medusa.

- Allows you to store customer credentials (passwords) in an AWS Cognito user pool instead of in your Medusa database
- Medusa still handles all session management after a user is authenticated.  
- Can be used by a store with existing customers.  Passwords for existing customers will be moved from the Medusa database to Cognito after a successful login.
- Supports only username/password auth flow.

## Installation

```bash
yarn add medusa-auth-cognito
```

## Configuration

Add the plugin to your plugins array in medusa.config.js:

```bash
const plugins = [
   ...
   {
      resolve: `medusa-auth-cognito`,
         options: {
            region: process.env.COGNITO_REGION,
            accessKeyId: process.env.COGNITO_ACCESS_KEY_ID,
            secretAccessKey: process.env.COGNITO_SECRET_ACCESS_KEY,
            userPoolId: process.env.COGNITO_USER_POOL_ID,
            clientId: process.env.COGNITO_CLIENT_ID
         }
   },
   ...
]
```

- COGNITO_REGION will be for example "us-east-1"
- Obtain the access key id and secret access key by creating an IAM user with permissions for the following Cognito operations:
	- AdminCreateUser
	- AdminInitiateAuth
	- AdminSetUserPassword
	- AdminDeleteUser  
- Obtain the userPoolId from the CLI or AWS console.  Be careful here.  The user pool id is not the same as the user pool name.
- Obtain the clientID add from creating an "App integration" for your user pool.  Be careful here.  When creating your app, be sure to NOT select the option to generate a client secret. The AWS javascript SDK does not support the use of client secrets.  That's okay.  We will be using our IAM credentials instead.

## AWS User Pool Setup

When you create your user pool, make sure you create an app integration with the ALLOW_ADMIN_USER_PASSWORD_AUTH authentication flow enabled.

## Revoking Customer Authorization

- As mentioned above, this plugin uses Cognito as a credentials provider only.  
- Once a user is logged in to an active Medusa session, that session is managed by Medusa in exactly the same way they would be managed without this plugin.
- Therefore, to revoke customer authorization, you must expire the session in the Medusa database, the same as you would now.  
- As an example, if you wanted to implement in your storefront the ability for a customer to "Sign out on all other devices," or similar functionality, you would do that by expiring the other active Medusa sessions.
- Changing token expiration times, refresh times, etc., via the AWS user pool settings will have no effect.  
- Revoking tokens via the AWS console or API will have no effect.  