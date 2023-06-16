# Change Log

## 0.1.0

### Patch Changes

- Extension of the CustomerService was modified to conflict less with the underlying methods (Thank you, Adrien!)
- The password_hash stored in the Postgres database is no longer "cognito" for all cognito users.  The reason is that Medusa uses the password hash to sign jwt tokens generated as password reset tokens.  The signing secret must be unique for each user and not predictable based on other known parameters.  The secret must also be stored in the database to validate the token when a customer tries to use it to reset their password.  Therefore, the plugin now generates a random string that can be saved in the postgres database to use as the signing secret.  The random string is generated using the crypto base package from node, so a relatively recent version of node is probably now required.  Tested with node v18.
- Because of the change above, the authenticateCustomer() method was changed to not rely on whether the password hash is set to "cognito."  

## 0.0.3

### Patch Changes

- Handle change of email address in Cognito when customer changes email address in Medusa

## 0.0.1

### Patch Changes

- Initial release
