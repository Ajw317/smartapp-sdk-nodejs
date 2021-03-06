'use strict'

const i18n = require('i18n')
const {Mutex} = require('async-mutex')
const SmartThingsApi = require('../api')

module.exports = class SmartAppContext {
	constructor(app, data, apiMutex) {
		this.event = data
		this.app = app
		this.apiMutex = apiMutex

		/** @type { import('../api') } */
		this.api = {}
		let authToken
		let refreshToken
		const {messageType, lifecycle} = data
		switch (lifecycle || messageType) {
			case 'EVENT':
				authToken = data.eventData.authToken
				this.executionId = data.executionId
				this.installedAppId = data.eventData.installedApp.installedAppId
				this.locationId = data.eventData.installedApp.locationId
				this.config = data.eventData.installedApp.config
				this.locale = data.locale
				break

			case 'INSTALL':
				authToken = data.installData.authToken
				refreshToken = data.installData.refreshToken
				this.executionId = data.executionId
				this.installedAppId = data.installData.installedApp.installedAppId
				this.locationId = data.installData.installedApp.locationId
				this.config = data.installData.installedApp.config
				this.locale = (data.client && data.client.language) || data.locale
				break

			case 'UPDATE':
				data.client = undefined
				authToken = data.updateData.authToken
				refreshToken = data.updateData.refreshToken
				this.executionId = data.executionId
				this.installedAppId = data.updateData.installedApp.installedAppId
				this.locationId = data.updateData.installedApp.locationId
				this.config = data.updateData.installedApp.config
				this.locale = (data.client && data.client.language) || data.locale
				break

			case 'CONFIGURATION':
				this.executionId = data.executionId
				this.installedAppId = data.configurationData.installedAppId
				this.locationId = data.configurationData.locationId
				this.config = data.configurationData.config
				this.locale = (data.client && data.client.language) || data.locale
				break

			case 'UNINSTALL':
				this.executionId = data.executionId
				this.installedAppId = data.uninstallData.installedApp.installedAppId
				this.locationId = data.uninstallData.installedApp.locationId
				break

			case 'EXECUTE':
				authToken = data.executeData.authToken
				this.executionId = data.executionId
				this.installedAppId = data.executeData.installedApp.installedAppId
				this.locationId = data.executeData.installedApp.locationId
				this.config = data.executeData.installedApp.config
				this.locale = data.executeData.parameters.locale
				break

			// For constructing context for proactive API calls not in response to a lifecycle event
			default:
				authToken = data.authToken
				refreshToken = data.refreshToken
				this.executionId = ''
				this.installedAppId = data.installedAppId
				this.locationId = data.locationId
				this.config = data.config
				this.locale = data.locale
				break
		}

		if (app._localizationEnabled) {
			if (this.locale) {
				this.headers = {'accept-language': this.locale}
				i18n.init(this)
			}
		}

		if (authToken) {
			this.api = new SmartThingsApi({
				authToken,
				refreshToken,
				clientId: app._clientId,
				clientSecret: app._clientSecret,
				log: app._log,
				apiUrl: app._apiUrl,
				refreshUrl: app._refreshUrl,
				locationId: this.locationId,
				installedAppId: this.installedAppId,
				contextStore: app._contextStore,
				apiMutex
			})
		}
	}

	isAuthenticated() {
		if (this.api && this.api.client && this.api.client.authToken) {
			return true
		}

		return false
	}

	setLocationId(id) {
		this.locationId = id
		if (this.api) {
			this.api.locationId = id
		}
	}

	async retrieveTokens() {
		const {app} = this
		if (app._contextStore) {
			const data = await app._contextStore.get(this.installedAppId)
			if (data) {
				this.locationId = data.locationId
				this.api = new SmartThingsApi({
					authToken: data.authToken,
					refreshToken: data.refreshToken,
					clientId: app._clientId,
					clientSecret: app._clientSecret,
					log: app._log,
					apiUrl: app._apiUrl,
					refreshUrl: app._refreshUrl,
					locationId: this.locationId,
					installedAppId: this.installedAppId,
					contextStore: app._contextStore,
					apiMutex: this.apiMutex || new Mutex()
				})
			}
		}

		return this
	}

	async deleteContext() {
		if (this.app._contextStore) {
			await this.app._contextStore.delete(this.installedAppId)
		}
	}

	/**
	 * Retrieve a string value from the configuration map for the InstalledApp context
	 * @param {String} name The config key name
	 * @returns {?String}
	 */
	configStringValue(name) {
		const entry = this.config[name]
		if (!entry) {
			return
		}

		return entry[0].stringConfig.value
	}

	/**
	 * Retrieve a Boolean value from the configuration map for the InstalledApp context
	 * @param {String} name The config key name
	 * @returns {Boolean}
	 */
	configBooleanValue(name) {
		const entry = this.config[name]
		if (!entry) {
			return false
		}

		return entry[0].stringConfig.value === 'true'
	}

	/**
	 * Retrieve a Number value from the configuration map for the InstalledApp context
	 * @param {String} name The config key name
	 * @returns {?Number}
	 */
	configNumberValue(name) {
		const entry = this.config[name]
		if (!entry) {
			return
		}

		return Number(entry[0].stringConfig.value)
	}

	/**
	 * Retrieve a String value from the configuration map for the InstalledApp context
	 * @param {String} name The config key name
	 * @returns {?Date}
	 */
	configDateValue(name) {
		const entry = this.config[name]
		if (!entry) {
			return
		}

		return new Date(entry[0].stringConfig.value)
	}

	/**
	 * Retrieve a locale-base time string value from the configuration map for the InstalledApp context
	 * @param {String} name The config key name
	 * @param {object} [options={}] Optional [toLocaleTimeString()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toLocaleTimeString#Parameters) formatting options
	 * @returns {?String}
	 * @example
	 * // Override the hour field
	 * context.configTimeString('myKeyName', {hour: '2-digit'})
	 *
	 * // Override with advanced usage of toLocaleTimeString() options
	 * const options = {
	 *   hour: 'numeric',
	 *   minute: '2-digit',
	 *   second: 'numeric',
	 *   era: 'long'
	 * }
	 * context.configTimeString('myKeyName', options)
	 */
	configTimeString(name, options = {}) {
		const entry = this.configDateValue(name)
		if (!entry) {
			return
		}

		if (Object.entries(options).length === 0 && options.constructor === Object) {
			options.hour = '2-digit'
			options.minute = '2-digit'
		}

		return entry.toLocaleTimeString(this.locale, options)
	}

	/**
	 * Retrieve a `modeId` string value from the configuration map for the InstalledApp context
	 * @param {String} name The config key name
	 * @returns {?Array.<String>}
	 */
	configModeIds(name) {
		const entry = this.config[name]
		if (!entry) {
			return
		}

		return entry.map(it => it.modeConfig.modeId)
	}

	/**
	 * @typedef ConfigDevice
	 * @property {String} deviceId
	 * @property {String} name
	 * @property {String} label
	 * @property {String} componentId
	 */

	/**
	 * @typedef ConfigDeviceWithState
	 * @property {String} deviceId
	 * @property {String} name
	 * @property {String} label
	 * @property {String} componentId
	 * @property {Object} state
	 */

	/**
	 * Retrieve a `ConfigDevice` string value from the configuration map for the InstalledApp context
	 * @param {String} name The config key name
	 * @returns {Promise.<Array.<ConfigDevice>>}
	 */
	configDevices(name) {
		const list = []
		const entry = this.config[name]
		if (!entry) {
			return
		}

		entry.forEach(item => {
			const {componentId} = item.deviceConfig
			const promise = this.api.devices.get(item.deviceConfig.deviceId).then(device => {
				return {
					deviceId: device.deviceId,
					name: device.name,
					label: device.label,
					componentId
				}
			})
			list.push(promise)
		})
		return Promise.all(list)
	}

	/**
	 * Retrieve a `ConfigDevice` string value from the configuration map for the InstalledApp context
	 * @param {String} name The config key name
	 * @returns {Promise.<Array.<ConfigDeviceWithState>>}
	 */
	configDevicesWithState(name) {
		const list = []
		const entry = this.config[name]
		if (!entry) {
			return
		}

		entry.forEach(item => {
			const {componentId} = item.deviceConfig
			const promise = this.api.devices.get(item.deviceConfig.deviceId).then(device => {
				return {
					deviceId: device.deviceId,
					name: device.name,
					label: device.label,
					componentId
				}
			}).then(entry => {
				return this.api.devices.getState(entry.deviceId).then(state => {
					entry.state = state.components[componentId]
					return entry
				})
			})
			list.push(promise)
		})
		return Promise.all(list)
	}
}

