import { CustomerService as MedusaCustomerService, Customer } from "@medusajs/medusa"
import { CreateCustomerInput, UpdateCustomerInput } from "@medusajs/medusa/dist/types/customers"
import { MedusaError } from "@medusajs/utils"
import crypto from "crypto"

export default class CustomerService extends MedusaCustomerService {
	private cognitoService: any

	constructor({ cognitoService }) {
		// @ts-ignore
		super(...arguments)
		this.cognitoService = cognitoService
	}

	async create(customer: CreateCustomerInput): Promise<Customer> {
		return await this.atomicPhase_(async () => {
			const { email, password } = customer // save the actual password to use later
			customer.password = crypto.randomBytes(16).toString('hex') // dummy password to send to parent create method
			const savedCustomer = await super.create(customer)
			await this.cognitoService.createCustomer(email, password).catch(e => {
				if (e.__type === 'UsernameExistsException') throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, "Email already exists in Cognito")
				else throw e
			})
			return savedCustomer
		})
	}

	async update(customerId: string, update: UpdateCustomerInput): Promise<Customer> {
		return await this.atomicPhase_(async () => {
			const { email, password } = update // save the actual password to use later
			delete update.password // don't send password to parent update method
			const customer = await this.retrieve(customerId, { select: ["email"] })
			let savedCustomer = await super.update(customerId, update)
			if (password) {
				await this.cognitoService.setCustomerPassword(customer.email, password).then(async () => {
					update.password = crypto.randomBytes(16).toString('hex') // dummy password to send to parent update method
					savedCustomer = await super.update(customerId, { password: update.password })
				}).catch(async (e) => {
					if (e.__type === 'InvalidParameterException') throw new MedusaError(MedusaError.Types.INVALID_DATA, "Password does not meet requirements")
					else if (e.__type === 'UserNotFoundException') {
						await this.cognitoService.createCustomer(customer.email, password).catch(e => {
							throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Could not create Cognito user")
						})
					}
					else throw e
				})
			}
			if (email) {
				await this.cognitoService.updateCustomerEmail(customer.email, email).catch(e => {
					if (e.__type === 'UsernameExistsException') {
						throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, "Email already exists in Cognito")
					} else if (e.__type === 'UserNotFoundException') {
						this.cognitoService.createCustomer(customer.email, password).catch(e => {
							throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Could not find Cognito user and could not create new user")
						})
					} else throw e
				})
			}
			return savedCustomer
		})
	}

	async delete(customerId: string): Promise<Customer | void> {
		return await this.atomicPhase_(async () => {
			const customer = await this.retrieve(customerId, { select: ["email", "has_account"] })
			const deletedCustomer = await super.delete(customerId)
			if (customer.has_account) {
				try {
					await this.cognitoService.deleteCustomer(customer.email)
				} catch (e) {
					// don't throw error if customer not found in Cognito
					if (e.__type === 'UserNotFoundException') console.log("Customer not found in Cognito") 
				}
			}
			return deletedCustomer
		})
	}
}