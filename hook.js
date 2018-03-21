var request = require("request");
var _ = require("lodash");
var util = require("util");
require('dotenv').config();


const CLOUDFLARE_USER = process.env.CF_EMAIL;
const CLOUDFLARE_APIKEY = process.env.CF_KEY;
const CERTBOT_DOMAIN = process.env.CERTBOT_DOMAIN;
const CERTBOT_VALIDATION = process.env.CERTBOT_VALIDATION;



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



getZoneID()
    .then(getRRID)
    .then(updateRRID)
    .then(
        function(result) {console.log("Promise returned %s", result)}
        )
    .catch(function(err) {console.log('Caught Error: %s', err.message)});

