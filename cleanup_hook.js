'use strict';

const axios = require('axios').default;
const chalk = require('chalk');
const dotenv = require('dotenv');
const util = require('util');

// Setup dotenv
let result = dotenv.config({
	path: __dirname + '/../.env'
});

if (result.error) {
	result = dotenv.config({
		path: __dirname + '/.env'
	});
}

if (result.error) {
	throw new Error('Unable to find and load .env file.');
}

function requireEnv(variable) {
	const value = process.env[variable];

	if (value === undefined) {
		throw new Error('Unable to load required environment variable ' + variable);
	}

	return value;
}

// Output some of the JSON globs to aid debugging without the need for code changes.
const DEBUG = process.env.DEBUG || false;

/**
 * https://javascript.plainenglish.io/javascript-how-to-intercept-function-and-method-calls-b9fd6507ff02
 */
function getDebugConsole() {
	return new Proxy(console,
		{
			get(target, property) {
				if (typeof target[property] === 'function') {
					return new Proxy(target[property],
						{
							apply: (target, thisArg, argumentsList) => {
								return DEBUG ? Reflect.apply(target,
									thisArg,
									argumentsList) : false;
							}
						});
				} else {
					return Reflect.get(target,
						property);
				}
			}
		});
}

// Required environment variables
// (see all passed by Certbot: https://certbot.eff.org/docs/using.html#pre-and-post-validation-hooks)
const EPIK_SIGNATURE = requireEnv('EPIK_SIGNATURE');
const CERTBOT_DOMAIN = requireEnv('CERTBOT_DOMAIN');

// Optional environment variables
const CERTBOT_HOST = process.env.CERTBOT_HOST || '_acme-challenge';

// Setup proxy console for debug (will only output if DEBUG is true)
const debugConsole = getDebugConsole();

/**
 * Refer to https://docs.userapi.epik.com/v2/ for more information on Epik API calls
 */
const EpikApi = {
	init() {
		EpikApi.dnsHostRecords = axios.create({
			baseURL: EpikApi.URL.BASE,
			params: {
				SIGNATURE: EPIK_SIGNATURE
			},
			responseType: 'json',
			timeout: 10000 // milliseconds
		});
	},

	dnsHostRecords: null,

	URL: {
		BASE: 'https://usersapiv2.epik.com/v2',
		DOMAINS: {
			BASE: '/domains',
			RECORDS: '/domains/' + CERTBOT_DOMAIN + '/records'
		}
	}
};

const ChallengeResourceRecord = {
	getAll() {
		return EpikApi.dnsHostRecords.get(
			EpikApi.URL.DOMAINS.RECORDS
		)
			.then(response => {
				return response.data.data.records.filter(element => {
					return (element.name === CERTBOT_HOST && element.type === 'TXT');
				});
			});
	},

	removeById(id) {
		return EpikApi.dnsHostRecords.delete(
			EpikApi.URL.DOMAINS.RECORDS,
			{
				params: {
					ID: id
				}
			}
		);
	},

	removeAll() {
		console.log(
			'Removing existing challenge Resource Records...'
		);

		return ChallengeResourceRecord.getAll()
			.then(records => {
				const removals = [];

				records.forEach(record => {
					removals.push(ChallengeResourceRecord.removeById(record.id));
				});

				return Promise.all(removals);
			});
	}
};

function init() {
	console.log('/------------------- CLEANUP HOOK START -------------------/');

	debugConsole.warn(chalk.yellow.bold('Debugging enabled'));
	debugConsole.log('Epik API Signature:           ' + EPIK_SIGNATURE);
	debugConsole.log('Certbot Domain:               ' + CERTBOT_DOMAIN);
	debugConsole.log('Certbot Host:                 ' + CERTBOT_HOST);
	debugConsole.log('');

	EpikApi.init();

	ChallengeResourceRecord.removeAll()
		.then(result => {
			console.log(chalk.green.bold('Challenge Resource Records successfully cleaned up.'));

			result.forEach(promiseResult => {
				debugConsole.log(util.inspect(promiseResult.data));
			});
		})
		.catch(error => {
			console.error(chalk.red.bold('Caught Error: %s'),
				error.message);

			if (error.response && error.response.status === 401) {
				console.error(chalk.red('Unauthorized. Make sure your EPIK_SIGNATURE is correct.'));
			}
		})
		.finally(() => {
			console.log('/-------------------- CLEANUP HOOK END --------------------/');
		});
}

// Run main task
init();
