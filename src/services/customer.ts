import { CustomerService as MedusaCustomerService, Customer, CustomerGroup, setMetadata } from "@medusajs/medusa"
import { CreateCustomerInput, UpdateCustomerInput } from "@medusajs/medusa/dist/types/customers"
import { isDefined, MedusaError } from "@medusajs/utils"

export default class CustomerService extends MedusaCustomerService {
	private cognitoService: any

	constructor({ cognitoService }) {
		// @ts-ignore
		super(...arguments)
		this.cognitoService = cognitoService
	}

	async create(customer: CreateCustomerInput): Promise<Customer> {
		return await this.atomicPhase_(async (manager) => {
			const customerRepository = manager.withRepository(this.customerRepository_)

			customer.email = customer.email.toLowerCase()	
			const { email, password } = customer

			// should be a list of customers at this point
			const existing = await this.listByEmail(email).catch(() => undefined)

			// should validate that "existing.some(acc => acc.has_account) && password"
			if (existing) {
				if (existing.some((customer) => customer.has_account) && password) {
					throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, "A customer with the given email already has an account. Log in instead")
				} else if (existing?.some((customer) => !customer.has_account) && !password) {
					throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, "Guest customer with email already exists")
				}
			}
			
			// ===============================================================
			// THIS SECTION IS MODIFIED FROM THE CORE
			// if password is set, create cognito user and then delete password from object in memory
			if (password) {
				if (await this.cognitoService.createCustomer(email, password)) {
					customer.password_hash = "cognito"
					customer.has_account = true
					delete customer.password
				} else {
					throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Could not create customer in Cognito")
				}
			}
			// END CHANGED SECTION
			// ===============================================================

			const created = customerRepository.create(customer)
			const result = await customerRepository.save(created)

			await this.eventBusService_
				.withTransaction(manager)
				.emit(CustomerService.Events.CREATED, result)

			return result
		})
	}

	async update(customerId: string, update: UpdateCustomerInput): Promise<Customer> {
		return await this.atomicPhase_(async (manager) => {
			const customerRepository = manager.withRepository(this.customerRepository_)

			const customer = await this.retrieve(customerId)

			// ===============================================================
			// THIS SECTION IS MODIFIED FROM THE CORE
			// Seems like this should be in the core
			const email = update.email?.toLowerCase()
			if (email) {
				const existing = await this.listByEmail(email).catch(() => undefined)
				if (existing) {
					if (existing.some((customer) => customer.has_account)) {
						throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, "A customer with the given email already has an account.")
					}
				}
			}
			// END CHANGED SECTION
			// ===============================================================


			const {
				password,
				metadata,
				billing_address,
				billing_address_id,
				groups,
				...rest
			} = update

			if (metadata) {
				customer.metadata = setMetadata(customer, metadata)
			}

			if ("billing_address_id" in update || "billing_address" in update) {
				const address = billing_address_id || billing_address
				if (isDefined(address)) {
					await this.updateBillingAddress_(customer, address)
				}
			}
			
			// MOVE PASSWORD UPDATE DOWN TO ONLY RUN AFTER REST OF UPDATE??
			// ===============================================================
			// THIS SECTION IS MODIFIED FROM THE CORE
			if (password) {
				await this.cognitoService.setCustomerPassword(customer.email, password).catch(() => { 
					throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Could not update customer password in Cognito") 
				})
				customer.password_hash = "cognito"
			}
			if (email) {
				await this.cognitoService.updateCustomerEmail(customer.email, email).catch(() => {
					throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Could not update customer email in Cognito")
				})
			}
			// END CHANGED SECTION
			// ===============================================================

			for (const [key, value] of Object.entries(rest)) {
				customer[key] = value
			}
			
			if (groups) {
				customer.groups = groups as CustomerGroup[]
			}
			
			const updated = await customerRepository.save(customer)
			
			await this.eventBusService_
			.withTransaction(manager)
			.emit(CustomerService.Events.UPDATED, updated)

			return updated
		})
	}

	async delete(customerId: string): Promise<Customer | void> {
		return await this.atomicPhase_(async (manager) => {
			const customerRepo = manager.withRepository(this.customerRepository_)

			// Should not fail, if user does not exist, since delete is idempotent
			const customer = await customerRepo.findOne({ where: { id: customerId } })

			if (!customer) {
				return
			}

			// ===============================================================
			// THIS SECTION IS THE ONLY PART MODIFIED FROM THE CORE
			await this.cognitoService.deleteCustomer(customer.email).catch(() => {
				throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Could not delete customer in Cognito")
			})
			// END CHANGED SECTION
			// ===============================================================

			return await customerRepo.softRemove(customer)
		})
	}
}