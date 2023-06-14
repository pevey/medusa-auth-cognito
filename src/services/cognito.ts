import { Lifetime } from "awilix"
import { TransactionBaseService } from "@medusajs/medusa"
import { MedusaError } from "@medusajs/utils"
import { 
	CognitoIdentityProviderClient, 
	AdminCreateUserCommand, 
	AdminInitiateAuthCommand, 
	AdminSetUserPasswordCommand, 
	AdminDeleteUserCommand 
} from '@aws-sdk/client-cognito-identity-provider'

export default class CognitoService extends TransactionBaseService {
	static LIFE_TIME = Lifetime.SINGLETON
	static identifier = "cognito"

	private client: CognitoIdentityProviderClient
	private options: any

	/**
	* @param {Object} options - options defined in `medusa-config.js`
	*    e.g.
	*    {
	*      region: process.env.COGNITO_REGION,
	*      accessKeyId: process.env.COGNITO_ACCESS_KEY_ID,
	*      secretAccessKey: process.env.COGNITO_SECRET_ACCESS_KEY,
	*      userPoolId: process.env.COGNITO_USER_POOL_ID,
	*      clientId: process.env.COGNITO_CLIENT_ID
	*    }
	*/

	constructor({}, options: any) {
		// @ts-ignore
		super(...arguments)
		this.options = options
		this.client = new CognitoIdentityProviderClient({
			region: this.options.region,
			credentials: {
				accessKeyId: this.options.accessKeyId,
				secretAccessKey: this.options.secretAccessKey
			}
		})
	}

	async createCustomer(email: string, password: string = '') {
		// returns true or false, based on success
		email = email.toLowerCase() // just to be sure
		if (!email ) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Email and password are required to create a new Cognito user")
		const command = new AdminCreateUserCommand({
			UserPoolId: this.options.userPoolId,
			Username: email,
			UserAttributes: [{
				Name: 'email',
				Value: email
			}],
			DesiredDeliveryMediums: [],
			MessageAction: 'SUPPRESS'
		})
		await this.client.send(command).catch(e => {
			if (e.__type === 'UsernameExistsException') throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, "Email already exists")
			else throw e
		})
		if (password) {
			await this.setPassword(email, password).catch(async (e) => { 
				// something went wrong, clean up user so they can try again
				await this.deleteCustomer(email)
				return false
			})
		}

		return true
	}

	async setPassword(email: string, password: string) {
		// returns true or false, based on success
		const command = new AdminSetUserPasswordCommand({
			UserPoolId: this.options.userPoolId,
			Username: email,
			Password: password,
			Permanent: true
		})
		await this.client.send(command).then((res:any) => { res.httpStatusCode === 200 }).catch(e => { throw e })
		return true
	}
	
	async deleteCustomer(email: string) {
		// returns true or false, based on success
		const command = new AdminDeleteUserCommand({
			UserPoolId: this.options.userPoolId,
			Username: email
		})
		await this.client.send(command).then((res:any) => { res.httpStatusCode === 200 }).catch(e => { throw e })
		return true
	}
	
	async authenticateCustomer(email: string, password: string) {

		const command = new AdminInitiateAuthCommand({
			UserPoolId: this.options.userPoolId,
			ClientId: this.options.clientId,
			AuthFlow: 'ADMIN_NO_SRP_AUTH',
			AuthParameters: {
				USERNAME: email,
				PASSWORD: password
			}
		})
		await this.client.send(command).then((res:any) => { res.httpStatusCode === 200 }).catch(e => { throw e })
		return true
	}
}