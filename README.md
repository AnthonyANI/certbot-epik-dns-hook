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
> [!IMPORTANT]
> While this hook works with IPv6, Epik's API only supports IPv4 at this time. The hook will attempt to use IPv4 first where possible.

This script has been tested with the following versions:

#### Ubuntu 22.04.3 LTS
* certbot 1.21.0
* node v22.6.0
* npm 10.8.2

#### Microsoft Windows 11 23H2 (10.0.22631 Build 22631)
* certbot 2.1.1
* node v20.16.0
* npm 10.8.1


## Installing

```shell
cd /
mkdir certbot-epik-dns-hook
cd certbot-epik-dns-hook
git clone https://github.com/AnthonyANI/certbot-epik-dns-hook.git hook
cd hook
npm ci
```

### Additional Required Steps for Windows Use

You'll need to install a version of the `dig` command and add it to `PATH` for use on Windows. Otherwise the script fails when validating DNS records by using `dig-dns-node`.

Follow the instructions [here](https://www.configserverfirewall.com/windows-10/dig-command-windows/) to download and perform a "tools only" install of [BIND](https://www.isc.org/download/) and add it to `PATH`.

>Make sure you restart your terminal so your `PATH` is reloaded after adding `dig`.


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

**CLEANUP_ALL**

Options: `true` or `false`
Default: `false`

Set this to true to instruct the cleanup script to remove all challenge TXT records rather than only those used by `certbot` each time.

*Example:*
```ini
CLEANUP_ALL=true
```


## Usage


### Running Manually

To carry out domain certificate renewal, such domains need not be respecified as `certbot` keeps track of them 
and the settings that it created and will renew as required (unless you force it, it will not renew a certificate that 
isn't close enough to expiry so it is safe to automate without concern for timing it to run only months or so apart).

> Remove `--dry-run` when you're ready and it's working

If the script appears to hang, wait at least five minutes for it to continue. Validation of the new DNS records may have 
initially failed. The script will then wait for DNS records to expire in cache before it attempts to validate them again 
and allow `certbot` to continue. DNS records generally cache for a time-to-live (ttl) of 300 seconds (5 minutes).

```text
certbot renew --manual --manual-auth-hook "node.exe /certbot-epik-dns-hook/hook/auth_hook.js" --manual-cleanup-hook "node.exe /certbot-epik-dns-hook/hook/cleanup_hook.js" --dry-run
Saving debug log to C:\Certbot\log\letsencrypt.log

- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
Processing C:\Certbot\renewal\example.com.conf
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
Simulating renewal of an existing certificate for example.com and *.example.com
Hook '--manual-auth-hook' for example.com ran with output:
 /------------------- AUTH HOOK START -------------------/
 Adding new challenge Resource Record...
 /-------------------- AUTH HOOK END --------------------/
Hook '--manual-auth-hook' for example.com ran with error output:
 Error: Request failed with status code 400
 Bad request. It's possible that the TXT record already exists if debugging. Please run the cleanup script first.
Hook '--manual-auth-hook' for example.com ran with output:
 /------------------- AUTH HOOK START -------------------/
 Adding new challenge Resource Record...
 Validating challenge Resource Record...

 WARNING: No DNS TXT answers received.
 If this persists, DNS caching may be the cause.
 If so and all retries fail, wait and try again later.

 Waiting 310 seconds, then retrying up to 2 more time(s)...
 Validating challenge Resource Record...
 Challenge Resource Record successfully added and validated.
 /-------------------- AUTH HOOK END --------------------/
Hook '--manual-cleanup-hook' for example.com ran with output:
 /------------------- CLEANUP HOOK START -------------------/
 Removing challenge Resource Record...
 Challenge Resource Record(s) successfully cleaned up.
 /-------------------- CLEANUP HOOK END --------------------/
Hook '--manual-cleanup-hook' for example.com ran with output:
 /------------------- CLEANUP HOOK START -------------------/
 Removing challenge Resource Record...
 Challenge Resource Record(s) successfully cleaned up.
 /-------------------- CLEANUP HOOK END --------------------/

- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
Congratulations, all simulated renewals succeeded:
  C:\Certbot\live\example.com\fullchain.pem (success)
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

```


### Creating new certificates

While this script was written with renewals in mind, it turns out it does a nice job for creation as well. Please note 
however it only gets the certificates issued, you'll need to configure your software to use them manually.

> Remove `--dry-run` when you're ready and it's working. DON'T try running it verbatim with the example domains!

```shell
certbot certonly --manual --preferred-challenges dns --manual-auth-hook "node.exe /certbot-epik-dns-hook/hook/auth_hook.js" --manual-cleanup-hook "node.exe /certbot-epik-dns-hook/hook/cleanup_hook.js" -d example.com -d *.example.com --dry-run
```

It's worth noting that if you have created all your certificates this way (including specifying the hook) you don't 
actually need to re-specify the hook information at renewal time as they will be stored in the renewal config file for 
certbot (`C:\Certbot\renewal\example.com.conf` in my instance at least).


### Automation

Once you have the script configured and know it's functioning as expected with successful cert renewals, you can include it in an automated task. As mentioned above, if you initially used Certbot with the hooks, you may not need to do this step. The scheduled task is created after using `certbot` successfully on Windows is "Certbot Renew Task". By default, it runs twice a day: once at midnight and once at noon. It will only renew certs that need to be renewed each run. The existing "Start a program" action can be edited to run `Powershell.exe` with these arguments:

```text
-NoProfile -WindowStyle Hidden -Command "certbot renew --manual --manual-auth-hook 'node.exe /certbot-epik-dns-hook/hook/auth_hook.js' --manual-cleanup-hook 'node.exe /certbot-epik-dns-hook/hook/cleanup_hook.js'"
```

From there and as recommended for Certbot, you should point your webserver to the `fullchain.pem` and `privkey.pem` symlinks provided and updated by `certbot`. This way your webserver uses the latest cert as automatically provided. In my case, my Apache config includes these lines:

```ini
SSLCertificateFile "/Certbot/live/example.com/fullchain.pem"
SSLCertificateKeyFile "/Certbot/live/example.com/privkey.pem"
```

Following these steps, you have successfully automated SSL certificate renewals for your Epik domains using the `dns-01` challenge with `certbot`. Enjoy!


## Development / Contributing

To carry out development locally, two additional environment variables can be specified in your `.env` file that would 
normally be provided by running the `certbot` client. Once these are set, you can just use `npm start` to execute the auth script and `npm run cleanup` to execute the cleanup script.

**CERTBOT_DOMAIN**

This specifies which domain you want to work with in Epik. It would correlate to the domain you 
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

* **Anthony Nave** - [AN Invent](https://example.com)
* **Daniel Hopkirk** - *Initial work* - [Logical Route](https://logicalroute.co.nz)


## License

This project is licensed under the [MIT License](https://mit-license.org/).

Generally, use it and abuse it. Optional references to original authors would be appreciated.

## Acknowledgments

* This is but a helper to the great service from [LetsEncrypt](https://letsencrypt.org/). Much respect and thanks to 
them making SSL much more accessible.
* The [certbot-cloudflare-dns-hook](https://bitbucket.org/logicalroute/certbot-cloudflare-dns-hook) is the original script cloned and adapted for use with Epik DNS