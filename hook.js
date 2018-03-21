var request = require("request");
var _ = require("lodash");
var util = require("util");
var dns = dns = require('dns');
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
                    console.log("Checking domain: "+domain.name+" against "+CERTBOT_DOMAIN);
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
        console.log("Creating RR");
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
        console.log("Updating RR");
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

            dns.resolveTxt("_acme-challenge."+CERTBOT_DOMAIN, function(err,rr) {
                if (rr == CERTBOT_VALIDATION) {
                    console.log("Update Complete");
                    resolve("Update Complete");

                } else {
                    console.log("Update Failed or Pending - 5 more tries");
                    setTimeout(function () {

                        dns.resolveTxt("_acme-challenge." + CERTBOT_DOMAIN, function (err, rr) {
                            if (rr == CERTBOT_VALIDATION) {
                                console.log("Update Complete");
                                resolve("Update Complete");

                            } else {
                                console.log("Update Failed or Pending - 4 more tries");
                                setTimeout(function () {

                                    dns.resolveTxt("_acme-challenge." + CERTBOT_DOMAIN, function (err, rr) {
                                        if (rr == CERTBOT_VALIDATION) {
                                            console.log("Update Complete");
                                            resolve("Update Complete");

                                        } else {
                                            console.log("Update Failed or Pending - 3 more tries");
                                            setTimeout(function () {

                                                dns.resolveTxt("_acme-challenge." + CERTBOT_DOMAIN, function (err, rr) {
                                                    if (rr == CERTBOT_VALIDATION) {
                                                        console.log("Update Complete");
                                                        resolve("Update Complete");

                                                    } else {
                                                        console.log("Update Failed or Pending - 2 more tries");
                                                        setTimeout(function () {

                                                            dns.resolveTxt("_acme-challenge." + CERTBOT_DOMAIN, function (err, rr) {
                                                                if (rr == CERTBOT_VALIDATION) {
                                                                    console.log("Update Complete");
                                                                    resolve("Update Complete");

                                                                } else {
                                                                    console.log("Update Failed or Pending - 1 more tries");
                                                                    setTimeout(function () {

                                                                        dns.resolveTxt("_acme-challenge." + CERTBOT_DOMAIN, function (err, rr) {
                                                                            if (rr == CERTBOT_VALIDATION) {
                                                                                console.log("Update Complete");
                                                                                resolve("Update Complete");

                                                                            } else {
                                                                                console.log("Update Failed or Pending - 0 more tries");
                                                                                reject(new Error("Update Failed or Pending"));
                                                                            }
                                                                        });

                                                                    }, 60000);
                                                                }
                                                            });

                                                        }, 60000);
                                                    }
                                                });

                                            }, 60000);
                                        }
                                    });

                                }, 60000);
                            }
                        });

                    }, 60000);
                }
            });
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

