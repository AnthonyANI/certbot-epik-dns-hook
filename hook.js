var request = require("request");
var _ = require("lodash");
var util = require("util");
var dns = require('dns');
var dig = require('node-dig-dns');
require('dotenv').config();


const CLOUDFLARE_USER = process.env.CF_EMAIL;
const CLOUDFLARE_APIKEY = process.env.CF_KEY;
const CERTBOT_DOMAIN = process.env.CERTBOT_DOMAIN;
const CERTBOT_VALIDATION = process.env.CERTBOT_VALIDATION;

// Debug block
console.log('/------------------- DEBUG -------------------/');
console.log('Cloudflare User:    '+CLOUDFLARE_USER);
console.log('Cloudflare Key:     '+CLOUDFLARE_APIKEY);
console.log('Certbot Domain:     '+CERTBOT_DOMAIN);
console.log('Certbot Validation: '+CERTBOT_VALIDATION);
console.log('/----------------- END DEBUG -----------------/');

/**
 * Refer to https://api.cloudflare.com for more information on CloudFlare API calls
 */
var cloudflare_url = "https://api.cloudflare.com/client/v4/";
var cloudflare_headers = {"X-Auth-Email": CLOUDFLARE_USER, "X-Auth-Key": CLOUDFLARE_APIKEY, "Content-Type": "application/json"};



function getZoneID() {
    console.log("Finding Zone ID from CloudFlare.");

    var cfListZones = {
        method: 'GET',
        url: cloudflare_url+"zones?status=active",
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
                //console.log(error);
                //console.log(response);
                //console.log(body);

                var matchedDomain = _.find(body.result, function(domain) {
                    //console.log("Checking domain: "+domain.name+" against "+CERTBOT_DOMAIN);
                    var domainRegex = new RegExp('.?'+domain.name+'');
                    return domainRegex.test(CERTBOT_DOMAIN);
                });

                if(matchedDomain === undefined) {
                    reject(new Error("Unable to find zone for domain "+CERTBOT_DOMAIN));
                }

                //console.log("Matched Domain: %j", matchedDomain.id);

                resolve(matchedDomain.id);
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
                //console.log(error);
                //console.log(response);
                //console.log(body);


                var matchedRR = _.find(body.result, {'type': 'TXT', 'name': '_acme-challenge.'+CERTBOT_DOMAIN });

                if(typeof matchedRR === "undefined") {
                    console.log("No RR Found");
                    resolve([zone_id, undefined]);
                } else {
                    console.log("Matched RR: %j", matchedRR.id);
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
            //checkDNS(resolve, reject, 10, 60*1000);
    });
}

function checkDNS(resolve, reject, retries, waitTimeout) {
    var count = retries || 5; // Default to 5 if we haven't been set.
    var timeout = waitTimeout || 60000;
    count--;


    dns.resolveTxt("_acme-challenge." + CERTBOT_DOMAIN, function (err, rr) {
        console.log('Expected: '+CERTBOT_VALIDATION);
        console.log('Received: '+rr);

        if (rr == CERTBOT_VALIDATION) {
            console.log("Update Complete");
            resolve("Update Complete");

        } else {

            console.log("Update Failed or Pending - "+count+" more tries");
            if(count > 0) {
                setTimeout(
                    function() {checkDNS(resolve, reject, count, timeout)},
                    timeout
                );
            } else {
                reject(new Error("Update Failed or Pending"));
            }
        }
    });


}


function digDNS(resolve, reject, retries) {
    var count = retries || 5; // Default to 5 if we haven't been set.
    count--;


    dig(["_acme-challenge." + CERTBOT_DOMAIN, 'TXT'])
        .then(function(result) {
            var answer = result.answer[0];
            console.log(answer);
            console.log('Expected: '+'"'+CERTBOT_VALIDATION+'"');
            console.log('Received: '+answer.value);
            if(answer.value == '"'+CERTBOT_VALIDATION+'"'){ // dig gives us the TXT record with quotes so we just live with it
                resolve("Update Complete");
            } else {
                console.log("Update Failed or Pending - "+count+" more tries");
                var ttl = answer.ttl;
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
        function(result) {console.log("Promise returned %s", result)}
        )
    .catch(function(err) {console.log('Caught Error: %s', err.message)});

