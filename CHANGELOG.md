Changelog
---
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
* Added "Applicable Domains" options (which should support GitHun Enterprise).
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
