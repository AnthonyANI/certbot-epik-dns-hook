# Certbot CloudFlare DNS Hook

Hook for automating certbot (formally known as letsencrypt) certificate renwal using DNS-01 challenges with CloudFlare.

## Getting Started

This project was started with the goal of being able to automatically renew certificates that were issued using DNS-01 challenge.
At present, the certbot client does not have native support for this.

We use CloudFlare for our DNS provider, and fortunately CloudFlare provide a nice API to work with.

### Prerequisites

This script has been tested with the following key versions:

* Ubuntu 16.04.4 LTS (Xenial Xerus)
* certbot 0.19.0
* node v8.10.0 (Installed via NVM)
* npm 5.6.0

At this time we don't provide any guides for installing these prerequisites. Google is your friend (and sometimes your enemy).

It is assumed you have already installed certificates using certbot manual plugin; this script is tested on renewals only.

It is also assumed you have the required domains enabled in CloudFlare. We can create resource records but we're not creating domains.

As we installed `node` using `nvm` our node path is currently `/home/ubuntu/.nvm/versions/node/v8.10.0/bin/node`; yours may differ.

### Installing

Provided all the necessary applications are installed, clone the repository to a location of your choice.
Once cloned, `cd` into the directory and run `npm i` to install the node modules required.

You need to provide your CloudFlare username and API key as environment variables (respectively `CF_USER` and `CF_KEY`).
You can do this by many methods but the one me use is creating a file called `.env` in the project directory with contents like

```
CF_EMAIL=your@email.here
CF_KEY=ThisIsNotMyRealAPIKey
```

We cloned to `/home/ubuntu` and all examples are based on that.

## Running

An example of running manually:
```bash
sudo certbot renew --manual --manual-auth-hook "/home/ubuntu/.nvm/versions/node/v8.10.0/bin/node /home/ubuntu/certbot-cloudflare-dns-hook/hook.js"
```

Don't be put off if it seems to hang for a while. Once it does an update to the DNS, it waits until it sees that information
has taken effect and is likely to be available for validation. If you understand DNS caching, this is what it's tackling; 
if you don't, then don't worry, just know that it might wait a little while, but it tells you when it's doing it!

### Cron
We recommend adding it to a cron task once tested. We use a crontab entry like the following which uses python to randomise
the time renewals are triggered slightly (to help reduce load spikes on the letsencrypt servers).

```bash
0 0,12 * * * python -c 'import random; import time; time.sleep(random.random() * 3600)' && /usr/bin/certbot renew --manual --manual-auth-hook "/home/ubuntu/.nvm/versions/node/v8.10.0/bin/node /home/ubuntu/certbot-cloudflare-dns-hook/hook.js" 
```


## Contributing

Pull requests will be looked at as time allows but are welcomed. I'm far from infallible and NodeJS isn't my strongest 
language so there's likely plenty of room for improvement.

There is an issue register at [BitBucket](https://bitbucket.org/logicalroute/certbot-cloudflare-dns-hook/issues) along with
the project. I'll try and keep an eye on it but I make no promises of lightning fast response.

## Versioning

I'm terrible at incrementing versions in package.json, however as the project is under git, it's generally versioned that way.

If we have any major revisions, I'll endeavour to update package.json also. 

## Authors

* **Daniel Hopkirk** - *Initial work* - [Logical Route](https://logicalroute.co.nz)


## License

This project is licensed under the MIT License.

Generally, use it and abuse it. If you maintain some reference back to [Logical Route](https://logicalroute.co.nz) 
that would be appreciated.

## Acknowledgments

* This is but a helper to the great service from [LetsEncrypt](https://letsencrypt.org/). Much respect and thanks to them making SSL much more accessible.
