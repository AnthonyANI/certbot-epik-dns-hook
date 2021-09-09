'use strict';

const axios = require('axios').default;
const chalk = require('chalk');
const dig = require('node-dig-dns');
const dotenv = require('dotenv');
const util = require('util');

const ChallengeResourceRecord = {
	add() {
		console.log('Adding new challenge Resource Record');

		return EpikApi.dnsHostRecords.request({
			method: 'post',
			data: EpikApi.DATA.POST
		});
	},

	digDns: {
		buildQuery() {
			const query = [CERTBOT_HOST + '.' + CERTBOT_DOMAIN, 'TXT'];

			/*
			@TODO: At some point it would be good to default to checking and using the authoritative NS automagically.
			*/
			if (DNSSERVER) {
				query.unshift('@' + DNSSERVER);

				debugConsole.log(
					chalk.yellow('Forcing Dig to test from DNS server: %s') + '\n',
					DNSSERVER
				);
			}

			return query;
		},

		checkAnswers(digResult) {
			debugConsole.log(chalk.cyan('Dig Result: %s') + '\n', util.inspect(digResult));

			if (digResult.answer === undefined) {
				return ChallengeResourceRecord.digDns.promise.rejectWithNoAnswers();
			}

			const match = ChallengeResourceRecord.digDns.getValidationMatch(digResult);

			if (match === undefined) {
				return ChallengeResourceRecord.digDns.promise.rejectWithNoMatch(digResult);
			}

			debugConsole.log(
				chalk.cyan('Match found: %s') + '\n',
				util.inspect(match)
			);

			Promise.resolve(match);
		},

		getMaxTtl(digResult) {
			return digResult.answer.reduce((maxTtl, currentAnswer) => {
				return currentAnswer.ttl > maxTtl ? currentAnswer.ttl : maxTtl;
			});
		},

		getValidationMatch(digResult) {
			return digResult.answer.find(record => {
				return (
					record.type === 'TXT' &&
					record.domain === CERTBOT_HOST + '.' + CERTBOT_DOMAIN + '.' &&
					record.value === '"' + CERTBOT_VALIDATION + '"'
				);
			});
		},

		promise: {
			rejectWithNoAnswers() {
				return Promise.reject({
					message:
						chalk.red.bold('\nWARNING: ') +
						chalk.red('No DNS TXT answers received.\n') +
						chalk.red('If this persists, DNS caching may be the cause.\n') +
						chalk.red('If so and all retries fail, wait and try again later.\n'),
					ttl: 300 // wait 5 minutes by default
				});
			},

			rejectWithNoMatch(digResult) {
				return Promise.reject({
					message: 'None of the DNS TXT records match validation\n',
					// Of the query answers, use the longest ttl for waiting before re-querying
					ttl: ChallengeResourceRecord.digDns.getMaxTtl(digResult)
				});
			}
		},

		/**
		 * Digs for direct TXT records only. CNAMEing to another record to use its TXT is not supported.
		 */
		validate(attempts = 1) {
			attempts--;

			console.log('Validating challenge Resource Record...');

			return dig(ChallengeResourceRecord.digDns.buildQuery())
				.then(ChallengeResourceRecord.digDns.checkAnswers)
				.catch(error => {
					if (attempts > 0) {
						console.warn(error.message || 'Update Failed or Pending');

						return ChallengeResourceRecord.digDns.waitThenRetryValidation(error.ttl, attempts);
					} else {
						throw new Error('Update Failed or Pending');
					}
				});
		},

		waitThenRetryValidation(seconds, attempts) {
			const wait = parseInt(seconds) + 10;

			console.log(
				'Record has %s seconds before update. Waiting %s, then retrying up to %s more time(s)...',
				seconds,
				wait,
				attempts
			);

			return new Promise(resolve => {
				setTimeout(() => {
					resolve();
				}, wait * 1000);
			}).then(() => {
				return ChallengeResourceRecord.digDns.validate(attempts);
			});
		}
	}
};

/**
 * Refer to https://docs.userapi.epik.com/v2/ for more information on Epik API calls
 */
const EpikApi = {
	DATA: {
		POST: {
			'create_host_records_payload': {
				'HOST': CERTBOT_HOST,
				'TYPE': 'TXT',
				'DATA': CERTBOT_VALIDATION,
				'AUX': 0,
				'TTL': 300
			}
		}
	},
	dnsHostRecords: axios.create({
		url: EpikApi.URL.DOMAINS.RECORDS,
		params: {
			SIGNATURE: EPIK_SIGNATURE
		},
		responseType: 'json',
		timeout: 10000 // milliseconds
	}),
	URL: {
		BASE: 'https://usersapiv2.epik.com/v2/',
		DOMAINS: {
			BASE: EpikApi.URL.BASE + '/domains/',
			RECORDS: EpikApi.URL.DOMAINS.BASE + CERTBOT_DOMAIN + '/records'
		}
	}
};

/**
 * https://javascript.plainenglish.io/javascript-how-to-intercept-function-and-method-calls-b9fd6507ff02
 */
function getDebugConsole() {
	return new Proxy(console, {
		get(target, property) {
			if (typeof target[property] === 'function') {
				return new Proxy(target[property], {
					apply: (target, thisArg, argumentsList) => {
						return DEBUG ? Reflect.apply(target, thisArg, argumentsList) : false;
					}
				});
			} else {
				return Reflect.get(target, property);
			}
		}
	});
}

function init() {
	console.log('/------------------- AUTH HOOK START -------------------/');

	debugConsole.log('Epik API Signature:           ' + EPIK_SIGNATURE);
	debugConsole.log('Certbot Domain:               ' + CERTBOT_DOMAIN);
	debugConsole.log('Certbot Host:                 ' + CERTBOT_HOST);
	debugConsole.log('Certbot Validation:           ' + CERTBOT_VALIDATION);
	debugConsole.log('');

	ChallengeResourceRecord.add()
		.then(ChallengeResourceRecord.digDns.validate)
		.then(result => {
			console.log(chalk.green.bold('Result: %s'), result);
		})
		.catch(error => {
			console.error(chalk.red.bold('Caught Error: %s'), error.message);
		})
		.finally(() => {
			console.log('/-------------------- AUTH HOOK END --------------------/');
		});
}

function requireEnv(variable) {
	const value = process.env[variable];

	if (value === undefined) {
		throw new Error('Unable to load required environment variable ' + variable);
	}

	return value;
}

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

// Required environment variables (see all passed by Certbot: https://certbot.eff.org/docs/using.html#pre-and-post-validation-hooks)
const EPIK_SIGNATURE = requireEnv('EPIK_SIGNATURE');
const CERTBOT_DOMAIN = requireEnv('CERTBOT_DOMAIN');
const CERTBOT_VALIDATION = requireEnv('CERTBOT_VALIDATION');

// Optional environment variables
const CERTBOT_HOST = process.env.CERTBOT_HOST || '_acme-challenge';

// Output some of the JSON globs to aid debugging without the need for code changes.
const DEBUG = process.env.DEBUG || false;

// Optional specific DNS server to check against to see if challenge records exist
const DNSSERVER = process.env.CERTBOT_DNS || 'ns3.epik.com';

// Setup proxy console for debug (will only output if DEBUG is true)
const debugConsole = getDebugConsole();

// Run main task
init();
