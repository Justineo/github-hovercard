Changelog
---
## 1.5.0
* Merged contextual information provided by GitHub's own hovercards into our hovercards.
* Fixed extraction to align with GitHub's continuou UI refactor.
* Added more `403` error handling.

## 1.4.5
* Fixed options loading in Firefox.

## 1.4.4
* Increased `z-index` to stop being covered by Octotree's sidebar.

## 1.4.3
* Used `wheel` event for handling scroll more precisely.

## 1.4.2
* Added `<relative-time>` tags to the exclusion list to get better performance on release pages.

## 1.4.1
* Added more fixes for extraction rules.

## 1.4.0
* Fixed extraction failures due to GitHub's recent update.
* Fixed an XSS vulnerability on notification titles.

## 1.3.3
* Fix build script so that Firefox version can actually work.

## 1.3.2
* Automatically fill token field with bound token when editing.

## 1.3.1
* Hide review states after pull requests are merged.

## 1.3.0
* Disabled body scroll when hovering scrollable area in hovercards.
* Added review status to PR cards.

## 1.2.4
* Fix repo slug extraction on explore page.

## 1.2.3
* Added support for inline code referrals in issues.

## 1.2.2
* Added exception handling for URL resolving.

## 1.2.1
* Switched trigger event to show access token form from double click to triple click to prevent opening the form unintentionally.

## 1.2.0
* Now you can start to bind access token after double-clicking any card.
* Added an option to show user hovercard for logged in user him/herself.
* Fixed repo extraction on Profile page.

## 1.1.2
* Fixed extraction for repo slugs on Explore page.

## 1.1.1
* Fixed the problem that `marketplace` wasn't actually ignored since last version.

## 1.1.0
* Added new reserved keyword `marketplace`.
* Displayed commit tags now have a limit number of 10.
* Added topic information for repos.
* Added option to disable hovercards on projects.

## 1.0.3
* Fixed extraction for users from avatar in issue details.

## 1.0.2
* Fixed badge styles.

## 1.0.1
* Added error handling for actions lacking token scopes.

## 1.0.0
* Now you can see if a user is following you or not.
* Now it's possible to follow/unfollow a user in hovercards.
* Now it's possible to star/unstar a repo in hovercards.
* All features above are available after loggin in and attaching an access token with adequate scopes.
* Added verification badge for signed commits.

## 0.9.5
* Updated Octicons.

## 0.9.4
* Minor style tweaks.
* Added Safari version.

## 0.9.3
* Fixed the display of issues without body.
* Fixed extraction for repo lists (whose logic is quite complicated).

## 0.9.2
* Fixed organization repo list extraction.

## 0.9.1
* Fixed extraction problems for repo list everywhere caused by GitHub's continuous updates.
* Better image styling for in Markdown content.

## 0.9.0
* Added readme content for repos (with option to turn off).
* More fixes for extraction because GitHub updated thier UI implementation again (may continue to occur).

## 0.8.3
* Fixed that local anchors are not ignored.
* Better scrollbar styles for WebKit/Blink browsers in Windows.

## 0.8.2
* Fixed the problem that repo names are overlaping with slashes in trending.

## 0.8.1
* Supported in-page comment URL extraction.

## 0.8.0
* Rewrote selectors for extraction due to GitHub's major update.
* Supported comment hovercards.

## 0.7.2
* Fixed a performance issue on GitHub feed (the same problem was fixed in v0.6.5 for issue pages).

## 0.7.1
* Fixed that some commits are not associated with GitHub accounts.
* Fixed commit tag extraction.
* Updated extraction blacklist.
* Fixed some style bugs.
* Removed title attribute for emojis.

## 0.7.0
* Supported commit hovercards.
* Made error message clear again for DMCA takedowns since GitHub now gives status code `451` for DMCA takedowns.
* Updated extraction targets.

## 0.6.6
* Fixed that `avatar` be a class name on elements other than `<img>`s, which don't have `alt` property.
* Upgraded jQuery to v3.1.0.

## 0.6.5
* Fixed a performance issue caused by `MutationObserver` triggered by GitHub's timestamp update logic.

## 0.6.4
* Now organic tooltips on GitHub will be blocked if hovercards are going to show on same elements. (#30)
* Included jQuery for user script version (GitHub doesn't provide jQuery in global scope now).
* Moved assets into separate files for Firefox add-on.

## 0.6.3
* Fix code highlight styles (regression due to last version).

## 0.6.2
* Minor style update.
* Fix major break down due to GitHub's recent update which includes styles for `.hovercard`.

## 0.6.1
* Added ellipsis for branch labels to prevent clipping.

## 0.6.0
* Provide more information for pull request cards.
* Fixed a problem with `Authorization` header + CORS + `30x` results, now retry once without `Authorization` header if error occurs.

## 0.5.0

* Added delay option for extensions.
* Fixed endless loading for issue without body.

## 0.4.2

* Fixed token form style.
* Fixed wrongly generated GitHub API call arguments (which leads to incorrect result for merged pull requests with message).
* Replaced the spinner icon with GitHub's official version (which looks better).

## 0.4.1

* Fixed the problem that issue links were sometimes ignored.
* Fixed selector syntax error (caused by mistakenly copy pasted something into it).
* Added more reserved word for username.

## 0.4.0

* Switched Markdown rendering to GitHub API's Markdown service.
* Removed dependencies for Remarkable.js, xss.js and highlight.js (which are no longer required since GitHub has taken care of all related stuff).
* Now highlight code in issue card using theme "Tomorrow Night" from [GitHub-Dark](https://github.com/StylishThemes/GitHub-Dark).
* Show better error message for issue card when visiting a private repo without access tokens.
* Some minor style updates.

## 0.3.7

* Use SVG version of Octicons to cope with GitHub's recent update which removed icon font version of Octicons.
* Fixed the display of GitHub's original CSS tooltip for Chrome.
* Removed jQuery from user script to prevent conflict.

## 0.3.6

* Added Opera support.
* Added user script support.
* Fixed repo homepage URLs when protocals are not provided.
* Rearrange the order of issue body handlers to make results correct.
* Reverted token storage to `localStorage` because the options page lacks proper design for GitHub Enterprise tokens.
* Fixed the problem that closed pull requests were displayed as merged.
* Fixed a display problem for Tooltipster on Microsoft Edge (though it doesn't support extensions or user scripts).
* Fixed the problem that directories were recognized as repo when searching a repo.

## 0.3.5

* Fixed the problem that styles and inputs are filtered by XSS protection module.

## 0.3.4

* Tokens can be set in options page prefer `chrome.storage.sync` over `localStorage` now.
* Fixed incorrect result in repo search results.
* Fixed a XSS vulnerability for issue body (GitHub API returns the original code user wrote, unfiltered).

## 0.3.3

* Improved table styling in issue card.
* Fixed the problem that code search highlights are lost during slug extraction.
* Fixed a WebKit related bug that might break tooltip positioning for inline elements.
* Fixed unhandled elements after GitHub UI updates.
* Fixed a severe problem that the add-on didn't work for Firefox on Windows due to different default pref value datatypes.

## 0.3.2

* Added "Merged" state in issue card.
* Replaced marked with Remarkable.
* Added task list support.

## 0.3.1

* Fixed several potential XSS vulnerabilities.

## 0.3.0

* Upgraded Tooltipster to v4 and enhanced its inline element support when break into multiple lines
* Added issue extraction (with Markdown conversion and syntax highlight).
* Added options page for Chrome and preferences for Firefox.
* Added "Applicable Domains" options (which should support GitHub Enterprise).
* Supported auto link for repo descriptions.
* Moved homepage before language.

## 0.2.0

* Refactored and applied more ES6 syntax (template string, arrow functions).
* Supported DMCA notice for repos.

## 0.1.2

* Fixed the problem that loading emoji always fails which leads to initialization problems in Firefox.

## 0.1.1

* Fixed reserved repository name check.
* Added repo description and emoji handling.
* Skip hovercard on user profile page for the said user.

## 0.1.0

* Adjusted tooltip styles to conform with GitHub tooltips.
* Added hovercard for repos.

## 0.0.10

* Switched main element lookup to `<body>` to prevent future GitHub updates breaking current logic.

## 0.0.9

* Corrected main element lookup to attach `MutationObserver`.

## 0.0.8

* Fixed an XSS vulnerability.
* Add administrator notice.
* Add stats section on hovercard.

## 0.0.7

* Add more selectors.
* Add source code comments for extractors.

## 0.0.6

* Fix username pattern and add reserved username.

## 0.0.5

* Fix a typo.

## 0.0.4

* Fix more reserved usernames.

## 0.0.3

* Fix reserved username 'pulls' and 'issues'.

## 0.0.2

* Fix the problem that multiple tooltip may popup at the same time.

## 0.0.1

* First version.
