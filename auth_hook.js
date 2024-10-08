'use strict';

const axios = require('axios').default;
const axiosRetry = require('axios-retry');
const chalk = require('chalk');
const dig = require('node-dig-dns');
const dns = require('node:dns');
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
const CERTBOT_VALIDATION = requireEnv('CERTBOT_VALIDATION');

// Optional specific subdomain at which to store certbot challenge string
const CERTBOT_HOST = process.env.CERTBOT_HOST || '_acme-challenge';

// Optional specific DNS server to check against to see if challenge records exist
const DNSSERVER = process.env.CERTBOT_DNS || 'ns3.epik.com';

// Setup proxy console for debug (will only output if DEBUG is true)
const debugConsole = getDebugConsole();

/**
 * Refer to https://docs.userapi.epik.com/v2/ for more information on Epik API calls
 */
const EpikApi = {
	init() {
		// Epik API requires IPv4 currently, so default to that when available
		dns.setDefaultResultOrder('ipv4first');

		EpikApi.dnsHostRecords = axios.create({
			baseURL: EpikApi.URL.BASE,
			params: {
				SIGNATURE: EPIK_SIGNATURE
			},
			responseType: 'json',
			timeout: 10000 // milliseconds
		});

		axiosRetry(
			EpikApi.dnsHostRecords,
			{
				retryCondition(error) {
					return error.response === undefined ||
						![400, 401].includes(error.response.status);
				}
			}
		);
	},

	dnsHostRecords: null,

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

	URL: {
		BASE: 'https://usersapiv2.epik.com/v2',
		DOMAINS: {
			BASE: '/domains',
			RECORDS: '/domains/' + CERTBOT_DOMAIN + '/records'
		}
	}
};

const ChallengeResourceRecord = {
	add() {
		console.log('Adding new challenge Resource Record...');

		return EpikApi.dnsHostRecords.post(
			EpikApi.URL.DOMAINS.RECORDS,
			EpikApi.DATA.POST
		);
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
			debugConsole.log(chalk.cyan('Dig Result: %s') + '\n',
				util.inspect(digResult));

			if (digResult.answer === undefined) {
				ChallengeResourceRecord.digDns.error.throwNoAnswersError();
			}

			const match = ChallengeResourceRecord.digDns.getValidationMatch(digResult);

			if (match === undefined) {
				ChallengeResourceRecord.digDns.error.throwNoMatchError(digResult);
			}

			debugConsole.log(
				chalk.cyan('Match found: %s') + '\n',
				util.inspect(match)
			);

			return match;
		},

		getMaxTtl(digResult) {
			return digResult.answer.reduce((maxTtl, currentAnswer) => {
				return currentAnswer.ttl > maxTtl ? currentAnswer.ttl : maxTtl;
			}).ttl || 0;
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

		error: {
			throwNoAnswersError() {
				throw {
					message:
						chalk.red.bold('\nWARNING: ') +
						chalk.red('No DNS TXT answers received.\n') +
						chalk.red('If this persists, DNS caching may be the cause.\n') +
						chalk.red('If so and all retries fail, wait and try again later.\n'),
					ttl: 300 // wait 5 minutes by default
				};
			},

			throwNoMatchError(digResult) {
				throw {
					message: 'None of the DNS TXT records match validation\n',
					// Of the query answers, use the longest ttl for waiting before re-querying
					ttl: ChallengeResourceRecord.digDns.getMaxTtl(digResult)
				};
			}
		},

		/**
		 * Digs for direct TXT records only. CNAMEing to another record to use its TXT is not supported.
		 */
		validate(result, attempts = 3) {
			attempts--;

			console.log('Validating challenge Resource Record...');

			return dig(ChallengeResourceRecord.digDns.buildQuery())
				.then(ChallengeResourceRecord.digDns.checkAnswers)
				.catch(error => {
					if (attempts > 0) {
						console.log(chalk.yellow(error.message || 'Update Failed or Pending'));

						return ChallengeResourceRecord.digDns.waitThenRetryValidation(
							error.ttl,
							attempts
						);
					} else {
						throw new Error('Update Failed or Pending');
					}
				});
		},

		waitThenRetryValidation(seconds, attempts) {
			const wait = parseInt(seconds || 0) + 10;

			console.log(
				'Waiting %s seconds, then retrying up to %s more time(s)...',
				wait,
				attempts
			);

			return new Promise(resolve => {
				setTimeout(() => {
					resolve();
				},
				wait * 1000);
			}).then(() => {
				return ChallengeResourceRecord.digDns.validate(null, attempts);
			});
		}
	}
};

function init() {
	console.log('/------------------- AUTH HOOK START -------------------/');

	debugConsole.log(chalk.yellow.bold('Debugging enabled'));
	debugConsole.log('Epik API Signature:           ' + EPIK_SIGNATURE);
	debugConsole.log('Certbot Domain:               ' + CERTBOT_DOMAIN);
	debugConsole.log('Certbot Host:                 ' + CERTBOT_HOST);
	debugConsole.log('Certbot Validation:           ' + CERTBOT_VALIDATION);
	debugConsole.log('');

	EpikApi.init();

	ChallengeResourceRecord.add()
		.then(ChallengeResourceRecord.digDns.validate)
		.then(result => {
			console.log(chalk.green.bold('Challenge Resource Record successfully added and validated.'));
			debugConsole.log(util.inspect(result));
		})
		.catch(error => {
			console.error(chalk.red.bold('Error: %s'),
				error.message);

			if (error.response && error.response.status === 400) {
				console.error(
					chalk.red(
						'Bad request. It\'s possible that the TXT record already exists if debugging. ' +
						'Please run the cleanup script first.'
					)
				);
			}

			if (error.response && error.response.status === 401) {
				console.error(chalk.red('Unauthorized. Make sure your EPIK_SIGNATURE is correct.'));
			}
		})
		.finally(() => {
			console.log('/-------------------- AUTH HOOK END --------------------/');
		});
}

// Run main task
init();
