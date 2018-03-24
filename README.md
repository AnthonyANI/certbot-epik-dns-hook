# CloudFlare DNS-01 hook for certbot

> **NOTE:** It looks like as of cerbot 0.22.0 they have included their own DNS plugins including one for CloudFlare. 
Murphy, hard at work right there. I tried it personally bit the DNS plugins weren't published to the Ubunti repositories
yet so I'm still using this script. If you are able to run 0.22.0 and get their plugins working then that's probably a 
better option than my work, however this is tested as working with 0.22.2 as well. Certbot's new CloudFlare doco can be found 
[here](https://certbot-dns-cloudflare.readthedocs.io/en/latest/).

Hook for automating [certbot](https://certbot.eff.org/) (formally known as letsencrypt) certificate renwal or creation using DNS-01 
challenges with [CloudFlare](https://www.cloudflare.com).

## Background

I use `DNS-01` challenge method to validate my domains for a number of reasons. The downside is that there is no easy way 
to automate renewals using `certbot` since it doesn't know how to update your DNS server. It does however allow hooks to 
plug in to and we can use these to augment the automation we need.

I searched for something existing and but all I found was an [example](https://github.com/kappataumu/letsencrypt-cloudflare-hook) 
written in python for the [dehydrated](https://github.com/lukas2511/dehydrated) client. I wanted one for `certbot`, so I wrote this.

To be fair it was a little bit of a self-challenge too so I didn't necessarily do an exhaustive search...


## Prerequisites

It is also assumed you have the required domains enabled in CloudFlare and your account email and API key. We can create 
resource records but we're not creating domains.

This script has been tested with the following key versions:

* Ubuntu 16.04.4 LTS (Xenial Xerus)
* certbot 0.19.0 or 0.22.2
* node v8.10.0
* npm 5.6.0

At this time we don't provide any guides for installing these prerequisites. Google is your friend (and sometimes your enemy).


## Installing

```bash
cd ~
git clone https://bitbucket.org/logicalroute/certbot-cloudflare-dns-hook
cd certbot-cloudflare-dns-hook
npm i
```

## Configuration

Configuration of this script is done with environment variables. Our recommended way of handling this is to put the 
variables into a file `.env` in the checked out repository directory (`~/certbot-cloudflare-dns-hook/.env`). 

Mandatory variables are `CF_EMAIL` and `CP_KEY` relating to your CloudFlare login and API key respectively. 

```text
CF_EMAIL=your@email.here
CF_KEY=ThisIsNotMyRealAPIKey
```

Optionally you can also specify the following variables in your .env file also.


**CLOUDFLARE_ALLOWPENDING**

Options: `true` or `false`
Default: `false`

By default we will only check CloudFlare zones that are marked as active. Pending zones 
(those awaiting full cutover to the CF nameservers) can be included by setting this to `true` however 
results may vary as it will depend on what servers Letsencrypt attepts to validate against.

*Example:*
```text
CLOUDFLARE_ALLOWPENDING=false
```

**CLOUDFLARE_DEBUG**

Options: `true` or `false`
Default: `false`

Set this to true to see a bunch more debug information including the results of calls to CloudFlare API and 
the DNS DIG validation response.

*Example:*
```text
CLOUDFLARE_DEBUG=true
```

**CERTBOT_DNS**

Options: Any IP address or domain name of a NameServer you can query
Default: `aiden.ns.cloudflare.com`

I believe Letsencrypt will validate against the authoritative NS for your domain. By default we check against 
`aiden.ns.cloudflare.com` as the most likely candidate. Use this to set the NS you wish to use instead.

Note that this is used for the script to validate its changes are live against the NS we query, but we can't guarantee
that this means Letsencrypt will see the same value or control which server it queries. DNS caching and other factors 
may impact results.

*Example:*
```text
CERTBOT_DNS=8.8.8.8
```


## Usage

>Note: When this is run it's done as the `root` user. Don't expect any exported environment variables to work unless you 
have specifically accounted for this. And don't expect any ability to reference `~/` as a base for the script unless 
you checked it out into `/root/` (Don't do that by the way). 


### Running Manually

To carry out renewal for our domains, we don't need to respecify those domains as `certbot` keeps track of the domains 
and settings that it created and will renew as required (unless you force it, it will not renew a certificate that 
isn't close enough to expiry so it is safe to run as a cron job as detailed further down).

> Remove `--dry-run` when you're ready and it's working

```bash
sudo certbot renew --manual --manual-auth-hook "/path/to/node /home/ubuntu/certbot-cloudflare-dns-hook/hook.js" --dry-run
Saving debug log to /var/log/letsencrypt/letsencrypt.log

-------------------------------------------------------------------------------
Processing /etc/letsencrypt/renewal/example.conf
-------------------------------------------------------------------------------
Cert not due for renewal, but simulating renewal for dry run
Plugins selected: Authenticator manual, Installer None
Renewing an existing certificate
Performing the following challenges:
dns-01 challenge for example.com
Output from node:
/------------------- HOOK START -------------------/
Finding Zone ID from CloudFlare.
Found Zone ID. Now checking if Resource Record already exists or not.
Resource Record already exists. Updating it.
Validating RR after cache expiry
Update Failed or Pending - 2 more tries
Record has 300 seconds before update. Waiting 310
/-------------------- HOOK END --------------------/

Waiting for verification...
Cleaning up challenges

-------------------------------------------------------------------------------
new certificate deployed without reload, fullchain is
/etc/letsencrypt/live/example.com/fullchain.pem
-------------------------------------------------------------------------------


-------------------------------------------------------------------------------
** DRY RUN: simulating 'certbot renew' close to cert expiry
**          (The test certificates below have not been saved.)

Congratulations, all renewals succeeded. The following certs have been renewed:
  /etc/letsencrypt/live/example.com/fullchain.pem (success)
** DRY RUN: simulating 'certbot renew' close to cert expiry
**          (The test certificates above have not been saved.)
-------------------------------------------------------------------------------

```

Don't be put off if it seems to hang for a while. Once it does an update to the DNS, it waits until it sees that information
has taken effect and is likely to be available for validation. If you understand DNS caching, this is what it's tackling; 
if you don't, then don't worry, just know that it might wait a little while!

### Cron
I recommend adding it to a cron task once tested (automation was the point after all). We use a crontab entry like the following which uses python to randomise
the time renewals are triggered slightly (to help reduce load spikes on the letsencrypt servers).

```bash
0 0,12 * * * python -c 'import random; import time; time.sleep(random.random() * 3600)' && /usr/bin/certbot renew --manual --manual-auth-hook "/path/to/node /home/ubuntu/certbot-cloudflare-dns-hook/hook.js" 
```

### Creating new certificates

While this script was written with renewals in mind, it turns out it does a nice job for creation as well. Please note 
however it only gets the certificates issued, you'll need to configure your software to use them manually.

> Remove `--dry-run` when you're ready and it's working. DON'T try running it verbatim with the example domains!

```bash
sudo certbot certonly --manual --preferred-challenges dns --manual-auth-hook "/path/to/node /home/ubuntu/certbot-cloudflare-dns-hook/hook.js" -d example.com -d www.example.com --dry-run
```

It's worth noting that if you have created all your certificates this way (including specifying the hook) you don't 
actually need to re-specify the hook information at renewal time as they will be stored in the renewal config file for 
certbot (`/etc/letsencrypt/renwal/example.com.conf` in my instance at least). 


## Development / Contributing

To carry out development locally, two additional environment variables can be specified in your `.env` file that would 
normally be provided by running the `certbot` client. Once these are set, you can just use `npm run` to execute the script.

**CERTBOT_DOMAIN**

This specifies which domain you want to work with in CloudFlare. It would correlate to the domain you 
are updating.

*Example:*
```text
CERTBOT_DOMAIN=example.com
```

**CERTBOT_VALIDATION**

This is the validation string that the Letsencrypt server would specify that you have to set in your DNS for it to 
validate. For development it can be any string, as all we're doing is setting it in DNS and then testing it's there.

*Example:*
```text
CERTBOT_VALIDATION=ARandomStringToSetAndCompare
```

Pull requests will be looked at as time allows but are welcomed. I'm far from infallible and NodeJS isn't my strongest 
language so there's likely plenty of room for improvement.

There is an issue register at [BitBucket](https://bitbucket.org/logicalroute/certbot-cloudflare-dns-hook/issues) along with
the project. I'll try and keep an eye on it but I make no promises of lightning fast response.

## Versioning

I'm terrible at incrementing versions in package.json, however as the project is under git it's generally versioned that way.

If we have any major revisions, I'll endeavour to update package.json also. 

## Authors / Contributors

* **Daniel Hopkirk** - *Initial work* - [Logical Route](https://logicalroute.co.nz)


## License

This project is licensed under the MIT License.

Generally, use it and abuse it. If you maintain some reference back to the original repo or [Logical Route](https://logicalroute.co.nz) 
that would be appreciated.

## Acknowledgments

* This is but a helper to the great service from [LetsEncrypt](https://letsencrypt.org/). Much respect and thanks to 
them making SSL much more accessible.
* The [letsencrypt-cloudflare-hook](https://github.com/kappataumu/letsencrypt-cloudflare-hook) example was part of the 
inspiration for how I structured this script and I would have just used it if it worked with `certbot`.