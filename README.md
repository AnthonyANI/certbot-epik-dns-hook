# Epik DNS-01 hook for certbot

Hook for automating [certbot](https://certbot.eff.org/) (formally known as letsencrypt) certificate renwal or creation using DNS-01 
challenges with [Epik](https://www.epik.com).

## Cloned and Modified From

[certbot-cloudflare-dns-hook](https://bitbucket.org/logicalroute/certbot-cloudflare-dns-hook)


## Background

I use the `DNS-01` challenge method with `certbot` to validate my domains because port 80 is blocked by my ISP. 
My DNS is hosted on Epik, and I hadn't found a hook for it yet. So I found one written for NodeJS by Daniel Hopkirk for Cloudflare 
that I modified for use with Epik's API.


## Prerequisites

You'll need to get your [Epik API signature](https://registrar.epik.com/account/api-settings/) by adding an IP address from which 
you'll use this script. This will be used to query, modify, and remove the DNS TXT records for your domains being used with `certbot`.

This script has been tested with the following key versions:

* Microsoft Windows 10 21H1 (10.0.19043.1165)
* certbot 1.18.0
* node v16.8.0
* npm 7.21.1


## Installing

```shell
cd /
git clone GIT_CLONE_URL_HERE
cd certbot-cloudflare-dns-hook
npm i
```


## Configuration

Configuration of this script is done with environment variables. Such variables should be set in a permissions-restricted file `.env` 
in the parent directory of the directory for the hook script (`certbot-epik-dns-hook/../.env`), up one level so that it stays outside 
of the git repo. 

The mandatory variable `EPIK_SIGNATURE` should be set to your [Epik API signature](https://registrar.epik.com/account/api-settings/). 

```ini
EPIK_SIGNATURE=xxxx-xxxx-xxxx-xxxx
```

The following variables may be specified in your `.env` file also:

**DEBUG**

Options: `true` or `false`
Default: `false`

Set this to true to see a bunch more debug information including the results of calls to Epik API and 
the DNS DIG validation response.

*Example:*
```ini
DEBUG=true
```

**CERTBOT_DNS**

Options: Any IP address or domain name of a NameServer you can query

Default: `ns3.epik.com`

Letsencrypt may validate against the authoritative NS for your domain. By default `ns3.epik.com` is used as the most likely candidate. 
Use this to set the NS you wish to use instead.

>This is used for the script to validate its changes as live at the NS it queries, but it's not guaranteed
that this means Letsencrypt will see the same value or control which server it queries. DNS caching and other factors 
may impact results.

*Example:*
```ini
CERTBOT_DNS=8.8.8.8
```

**CERTBOT_HOST**

Options: Subdomain of the domain for which the cert is being retrieved where the validation string will be stored

Default: `_acme-challenge`

>This is where `certbot` says to store a TXT record by default. However, it can be configured for the script alone here should that change via this `.env` variable.

*Example:*
```ini
CERTBOT_HOST=certbotchallenge
```


## Usage


### Running Manually

To carry out domain certificate renewal, such domains need not be respecified as `certbot` keeps track of them 
and the settings that it created and will renew as required (unless you force it, it will not renew a certificate that 
isn't close enough to expiry so it is safe to automate without concern for timing it to run only months or so apart).

> Remove `--dry-run` when you're ready and it's working

```text
certbot renew --manual --manual-auth-hook "/path/to/node /certbot-epik-dns-hook/auth_hook.js" --manual-cleanup-hook "/path/to/node /certbot-epik-dns-hook/cleanup_hook.js" --dry-run
Saving debug log to C:\Certbot\log\letsencrypt.log

-------------------------------------------------------------------------------
Processing C:\Certbot\renewal\example.com.conf
-------------------------------------------------------------------------------
Cert not due for renewal, but simulating renewal for dry run
Plugins selected: Authenticator manual, Installer None
Renewing an existing certificate
Performing the following challenges:
dns-01 challenge for example.com
Output from node:
/------------------- AUTH HOOK START -------------------/
Adding new Resource Record
Validating RR after cache expiry
Update Failed or Pending - 2 more tries
Record has 300 seconds before update. Waiting 310
/-------------------- AUTH HOOK END --------------------/

Waiting for verification...
Cleaning up challenges

-------------------------------------------------------------------------------
new certificate deployed without reload, fullchain is
C:\Certbot\live\example.com\fullchain.pem
-------------------------------------------------------------------------------


-------------------------------------------------------------------------------
** DRY RUN: simulating 'certbot renew' close to cert expiry
**          (The test certificates below have not been saved.)

Congratulations, all renewals succeeded. The following certs have been renewed:
  C:\Certbot\live\example.com\fullchain.pem (success)
** DRY RUN: simulating 'certbot renew' close to cert expiry
**          (The test certificates above have not been saved.)
-------------------------------------------------------------------------------

```

>Don't be put off if it seems to hang for a while. Once it does an update to the DNS, it waits until it sees that information
has taken effect and is likely to be available for validation. If you understand DNS caching, this is what it's tackling; 
if you don't, then don't worry, just know that it might wait a little while!


### Creating new certificates

While this script was written with renewals in mind, it turns out it does a nice job for creation as well. Please note 
however it only gets the certificates issued, you'll need to configure your software to use them manually.

> Remove `--dry-run` when you're ready and it's working. DON'T try running it verbatim with the example domains!

```shell
certbot certonly --manual --preferred-challenges dns --manual-auth-hook "/path/to/node /certbot-epik-dns-hook/auth_hook.js" --manual-cleanup-hook "/path/to/node /certbot-epik-dns-hook/cleanup_hook.js" -d example.com -d *.example.com --dry-run
```

It's worth noting that if you have created all your certificates this way (including specifying the hook) you don't 
actually need to re-specify the hook information at renewal time as they will be stored in the renewal config file for 
certbot (`C:\Certbot\renewal\example.com.conf` in my instance at least). 


## Development / Contributing

To carry out development locally, two additional environment variables can be specified in your `.env` file that would 
normally be provided by running the `certbot` client. Once these are set, you can just use `npm start` to execute the auth script and `npm run cleanup` to execute the cleanup script.

**CERTBOT_DOMAIN**

This specifies which domain you want to work with in CloudFlare. It would correlate to the domain you 
are updating.

*Example:*
```ini
CERTBOT_DOMAIN=example.com
```

**CERTBOT_VALIDATION**

This is the validation string that the Letsencrypt server would specify that you have to set in your DNS for it to 
validate. For development it can be any string, as all we're doing is setting it in DNS and then testing it's there.

*Example:*
```ini
CERTBOT_VALIDATION=ARandomStringToSetAndCompare
```


## Authors / Contributors

* **Anthony Nave** - [AN Invent](https://aninvent.net)
* **Daniel Hopkirk** - *Initial work* - [Logical Route](https://logicalroute.co.nz)


## License

This project is licensed under the [MIT License](https://mit-license.org/).

Generally, use it and abuse it. Optional references to original authors would be appreciated.

## Acknowledgments

* This is but a helper to the great service from [LetsEncrypt](https://letsencrypt.org/). Much respect and thanks to 
them making SSL much more accessible.
* The [certbot-cloudflare-dns-hook](https://bitbucket.org/logicalroute/certbot-cloudflare-dns-hook) was the original script cloned and adapted for use with Epik DNS