import { AuthService as MedusaAuthService, Customer } from "@medusajs/medusa"
import { AuthenticateResult } from "@medusajs/medusa/dist/types/auth"
import { MedusaError } from "@medusajs/utils"

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

			if (customer.password_hash === "cognito") {
				if (await this.cognitoService.authenticateCustomer(email, password)) {
					customer = await this.customerService_.withTransaction(transactionManager).retrieveRegisteredByEmail(email)
					return {
						success: true,
						customer
					}
				} else {
					return {
						success: false,
						error: "Invalid email or password"
					}
				}

			} else { // convert legacy user to cognito user

				// check if password matches
				const passwordsMatch = await this.comparePassword_(password, customer.password_hash)
				if (!passwordsMatch) {
					return {
						success: false,
						error: "Invalid email or password"
					}
				}

				// create a cognito user with no password yet
				await this.cognitoService.createCustomer(email).catch(() => {
					throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Could not create customer in Cognito")
				})

				// set the medusa password_hash to "cognito" and set password in cognito
				await this.customerService_.update(customer.id, { password }).catch(async () => {
					// something went wrong, clean up user so they can try again
					await this.cognitoService.deleteCustomer(email)
					throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Could not set cognito password and update customer in Medusa")
				})

				customer = await this.customerService_.withTransaction(transactionManager).retrieveRegisteredByEmail(email)

				return {
					success: true,
					customer
				}
			}
		})
	}
}