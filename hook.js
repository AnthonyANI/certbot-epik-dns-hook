#!/usr/bin/env node
var request = require("request");
var _ = require("lodash");
var dig = require('node-dig-dns');
var colors = require('colors');
const util = require('util');

require('dotenv').config({path: (require('path').dirname(require.main.filename))+"/.env"});

function getOrDie(variable, variable_name) {
    if(variable === undefined) {
        throw new Error("Unable to load variable "+variable_name+" with value "+variable);
    }

    return variable;
}

const CLOUDFLARE_USER       = getOrDie(process.env.CF_EMAIL, "process.env.CF_EMAIL");
const CLOUDFLARE_APIKEY     = getOrDie(process.env.CF_KEY, "process.env.CF_KEY");
const CERTBOT_DOMAIN        = getOrDie(process.env.CERTBOT_DOMAIN, "process.env.CERTBOT_DOMAIN");
const CERTBOT_VALIDATION    = getOrDie(process.env.CERTBOT_VALIDATION, "process.env.CERTBOT_VALIDATION");

// Allow pending tells the scipt to try with CloudFlare zones that aren't marked active yet.
// Depending on where Letsencrypt servers look this may or may not work for you while your domain is awaiting activation in CF.
const ALLOWPENDING     = process.env.CLOUDFLARE_ALLOWPENDING || false;

// Output some of the JSON globs to aid debugging without the need for code changes.
const DEBUG = process.env.CLOUDFLARE_DEBUG || true;

// Allows us to specify which DNS server to check against to see if we're live.
const DNSSERVER = process.env.CERTBOT_DNS || false;


console.log('/------------------- HOOK START -------------------/');
if(DEBUG) {
    console.log('Cloudflare User:          ' + CLOUDFLARE_USER);
    console.log('Cloudflare Key:           ' + CLOUDFLARE_APIKEY);
    console.log('Cloudflare Allow Pending: ' + ALLOWPENDING);
    console.log('Certbot Domain:           ' + CERTBOT_DOMAIN);
    console.log('Certbot Validation:       ' + CERTBOT_VALIDATION);
    console.log('');
}

/**
 * Refer to https://api.cloudflare.com for more information on CloudFlare API calls
 */
var cloudflare_url = "https://api.cloudflare.com/client/v4/";
var cloudflare_headers = {"X-Auth-Email": CLOUDFLARE_USER, "X-Auth-Key": CLOUDFLARE_APIKEY, "Content-Type": "application/json"};




function getZoneID() {
    console.log("Finding Zone ID from CloudFlare.");

    var options = '';
    if(!ALLOWPENDING) {
        options = '?status=active';
    }

    var cfListZones = {
        method: 'GET',
        url: cloudflare_url+"zones"+options,
        headers: cloudflare_headers,
        json: true
    };

    return new Promise(
        function(resolve,reject) {
            request(cfListZones, function (error, response, body) {
                if(error) reject(error);
                if(body.success.toString() !== "true") {
                    reject(new Error(body.errors[0].message));
                }

                var matchedDomain = _.find(body.result, function(domain) {
                    //console.log("Checking domain: "+domain.name+" against "+CERTBOT_DOMAIN);
                    var domainRegex = new RegExp('.?'+domain.name+'');
                    return domainRegex.test(CERTBOT_DOMAIN);
                });

                if(matchedDomain === undefined) {
                    reject(new Error("Unable to find zone for domain "+CERTBOT_DOMAIN));
                } else {
                    if(DEBUG) {console.log("Matched Domain: %s".cyan+"\n", util.inspect(matchedDomain));}
                    resolve(matchedDomain.id);
                }
            });
        }
    )
}

function getRRID(zone_id) {
    console.log("Found Zone ID. Now checking if Resource Record already exists or not.");

    var cfListRR = {
        method: 'GET',
        url: cloudflare_url+"zones/"+zone_id+"/dns_records?status=active",
        headers: cloudflare_headers,
        json: true
    };
    return new Promise(
        function(resolve,reject) {
            request(cfListRR, function (error, response, body) {
                if(error) reject(error);
                if(body.success.toString() !== "true") {
                    reject(new Error(body.errors[0].message));
                }

                var matchedRR = _.find(body.result, {'type': 'TXT', 'name': '_acme-challenge.'+CERTBOT_DOMAIN });

                if(typeof matchedRR === "undefined") {
                    resolve([zone_id, undefined]);
                } else {

                    if(DEBUG) {console.log("Matched RR: %s".cyan+"\n", util.inspect(matchedRR));}
                    resolve([zone_id, matchedRR.id]);
                }
            });

        }
    )
}

function updateRRID(vars) {

    if(vars[1] === undefined) {
        console.log("Resource Record does not exist yet. Creating it.");
        zone_id = vars[0];

        var cfCreateRR = {
            method: 'POST',
            url: cloudflare_url+"zones/"+zone_id+"/dns_records/",
            headers: cloudflare_headers,
            json: true,
            body: {"type":"TXT","name":"_acme-challenge."+CERTBOT_DOMAIN,"content":CERTBOT_VALIDATION}
        };

        return new Promise(
            function(resolve,reject) {
                request(cfCreateRR, function (error, response, body) {
                    //console.log(body);
                    if(error) reject(error);
                    if(body.success.toString() !== "true") {
                        reject(new Error(body.errors[0].message));
                    }

                    resolve(JSON.stringify(body.success));
                });

            }
        )
    } else {
        console.log("Resource Record already exists. Updating it.");
        zone_id = vars[0];
        rr_id = vars[1];

        var cfUpdateRR = {
            method: 'PUT',
            url: cloudflare_url+"zones/"+zone_id+"/dns_records/"+rr_id,
            headers: cloudflare_headers,
            json: true,
            body: {"type":"TXT","name":"_acme-challenge."+CERTBOT_DOMAIN,"content":CERTBOT_VALIDATION}
        };

        return new Promise(
            function(resolve,reject) {
                request(cfUpdateRR, function (error, response, body) {
                    if(error) reject(error);
                    if(body.success.toString() !== "true") {
                        reject(new Error(body.errors[0].message));
                    }

                    resolve(JSON.stringify(body.success));
                });

            }
        )
    }

}

function waitForUpdate() {
    return new Promise(
        function(resolve,reject) {
            console.log("Validating RR after for cache expiry");
            digDNS(resolve, reject,3);
    });
}

function digDNS(resolve, reject, retries) {
    var count = retries || 5; // Default to 5 if we haven't been set.
    count--;


    /*
        Note: We are looking for TXT only. We don't support CNAMEing to another record to use its TXT.
        I did consider trying to support that, but given this makes it much easier to maintain domains
        directly it makes little sense and has a number of other pitfalls as an approach.
     */

    var query = ["_acme-challenge." + CERTBOT_DOMAIN, 'TXT'];

    /*
        @TODO: At some point it would be good to default to checking and using the authoritative NS automagically.
     */
    if(DNSSERVER) {
        query.unshift('@'+DNSSERVER);
        if(DEBUG) {console.log("Forcing Dig to test from DNS server: %s".yellow+"\n", DNSSERVER);}
    }

    dig(query)
        .then(function(result) {
            if(DEBUG) {console.log("Dig Result: %s".cyan+"\n", util.inspect(result));}

            // We're going to assume we have not got a match and are using a ttl of 500.
            // If we get results, then we worry about being more accurate (and it is an IF).
            var match_found = false;
            var ttl = 300; // Default 5 minutes

            if(result.answer !== undefined) {
                // We got SOME answers. We'll check if we have an exact match or not.

                /*
                    This is a bit of a convoluted setup but I'm trying to support a condition that may occur when
                    we get into the land of wildcard domains where there may be two records, one for the root domain
                    and one for the wildcard subdomain. It's something I haven't tested but based purely on the description
                    of a challenge someone ran into on the forums. If you try it out, let me know how it works!!
                 */

                // We only want to try this if we have answers, otherwise it complains. Note the "." on the end of
                // the domain value as a trick for young players (and old ones like me that took too long to realise
                // that's why matching wasn't working initially
                var matches = _.find(result.answer, {'type': 'TXT', 'domain': '_acme-challenge.'+CERTBOT_DOMAIN+'.', "value": '"'+CERTBOT_VALIDATION+'"' });

                if(matches !== undefined) {
                    if(DEBUG) {console.log("Match found: %s".cyan+"\n", util.inspect(matches));}
                    match_found = true;
                } else {
                    // Okay, so we have the correct Resource Record, but not the correct validation code.
                    if(DEBUG) {console.log("No match found: %s", util.inspect(matches));}
                    match_found = false;

                    // We'll use the longest ttl in lieu of a better idea.
                    // We probably only have one, but since we're trying to account for more...
                    ttl = Math.max.apply(Math,result.answer.map(function(o){return parseInt(o.ttl);}));
                }


            } else {
                console.log(
                    "\n" +
                    "WARNING: ".red.bold +
                    "We got no records when looking for validation.\n".red +
                    "We will retry but if you get impacted by caching we may not be able to wait long enough.\n".red +
                    "If that happens, try again later.".red +
                    "\n".red
                );
            }

            if(match_found){ // dig gives us the TXT record with quotes so we just live with it
                resolve("Update Complete");
            } else {
                console.log("Update Failed or Pending - "+count+" more tries");
                var wait = parseInt(ttl) + 10;
                console.log("Record has %s seconds before update. Waiting %s", ttl, wait);
                if(count > 0) {
                    setTimeout(
                        function() {digDNS(resolve, reject, count)},
                        wait*1000
                    );
                } else {
                    reject(new Error("Update Failed or Pending"));
                }
            }
        })
        .catch(function(err) {
            console.log('Error:', err);
            reject(new Error('Error:', err));
        });
}



getZoneID()
    .then(getRRID)
    .then(updateRRID)
    .then(waitForUpdate)
    .then(
        function(result) {
            console.log("Result: %s".bold.green, result);
            console.log('/-------------------- HOOK END --------------------/');
        })
    .catch(function(err) {
        console.log('Caught Error: %s'.bold.red, err.message);
        console.log('/-------------------- HOOK END --------------------/');
    });





