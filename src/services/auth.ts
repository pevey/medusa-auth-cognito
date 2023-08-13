import { AuthService as MedusaAuthService, Customer } from "@medusajs/medusa"
import { AuthenticateResult } from "@medusajs/medusa/dist/types/auth"

export default class AuthService extends MedusaAuthService {
   private cognitoService: any

   constructor({ cognitoService }) {
      // @ts-ignore
      super(...arguments)
      this.cognitoService = cognitoService
   }

   async authenticateCustomer(email: string, password: string): Promise<AuthenticateResult> {
      return await this.atomicPhase_(async (transactionManager) => {
         email = email.toLowerCase()
         let customer: Customer = await this.customerService_.withTransaction(transactionManager).retrieveRegisteredByEmail(email, {
            select: ["id", "password_hash"],
         })

         if (!customer.password_hash) {
            return {
               success: false,
               error: "Invalid email or password",
            }
         }

         const success: boolean = await this.cognitoService.authenticateCustomer(email, password).then(() => true).catch(async (e) => {
            if (e.__type === 'UserNotFoundException') {
               // user not found in cognito, check if legacy user with valid password
               if (await this.comparePassword_(password, customer.password_hash)) {
                  // valid, try to convert legacy user to cognito user
                  await this.cognitoService.createCustomer(email).then(async () => {
                     console.log("Valid legacy password, created customer in Cognito")
                     await this.customerService_.update(customer.id, { password }).catch(() => {
                        console.log("Valid legacy password, created customer in Cognito, but failed to update customer with new password. Deleting customer from Cognito")
                        this.cognitoService.deleteCustomer(email)
                     })
                  }).catch(async (e) => { 
                     console.log("Valid legacy password, but failed to add customer to Cognito")
                     console.log(e)
                  })
               } else {
                  return false
               }
            }
            if (e.__type === 'NotAuthorizedException') {
               return false
            }
         })
         if (!success) {
            return {
               success: false,
               error: "Invalid email or password"
            }
         } else {
            customer = await this.customerService_.withTransaction(transactionManager).retrieveRegisteredByEmail(email)
            return {
               success: true,
               customer
            }
         }
      })
   }
}