# GitHub Hovercard

Neat user/repo/issue/commit hovercards for GitHub.

## Installation

* [Chrome extension](https://chrome.google.com/webstore/detail/github-hovercard/mmoahbbnojgkclgceahhakhnccimnplk)
* [Firefox add-on](https://addons.mozilla.org/en-US/firefox/addon/github-hovercard/)
* [Opera extension](https://addons.opera.com/extensions/details/github-hovercard/)
* [Userscript](https://justineo.github.io/github-hovercard/userscript/dist/github-hovercard.user.js)

## FAQ

* Why Chrome warns me the extension might read my browser history?

    It's because GitHub Hovercard uses `webNavigation` module to dynamically inject content scripts (to support GitHub Enterprise). See [#34](https://github.com/Justineo/github-hovercard/issues/34).

* Why access token doesn't work?

    Now GitHub Hovercard is saving user's private access token into `localStorage`. `localStorage` has a limit of 5MB and the problem might be other extensions have consumed too much storage that GitHub Hovercard failed to save access tokens.

## Options

For browser extension versions, GitHub Hovercard provide following options:

* Domain

    Use this option to set custom domains for your GitHub Enterprise service. Note that you don't need to set `github.com` because it's always included. You may be asked to grant additional permissions for those domains.

* Delay

    If you don't want the hovercards to pop up instantly, you may set a delay before they try to retrieve data and appear.

## Screenshots

![Avatars in trending repos](screenshots/1.png)

![Repo names in activity messages](screenshots/2.png)

![Users/organizations in repo title](screenshots/3.png)

![Repo names in activity feed](screenshots/4.png)

![Forked repos](screenshots/5.png)

![User/organization links in any place](screenshots/6.png)

![Repo links in any place](screenshots/7.png)

![Issue in news feed](screenshots/8.png)

## Known issues

For unauthenticated requests, GitHub API has a fairly low request limit.

~~In later versions I might introduce access tokens to increase this limit.~~

~~Working on it.~~

Authentication is supported from v0.0.7.

## Acknowledgements

* Thank [Tooltipster](https://github.com/iamceege/tooltipster/) for the awesome tooltip component.
* Thank [jQuery](https://github.com/jquery/jquery) for basic operations.
* Thank [Mustache.js](https://github.com/janl/mustache.js) for templating.
