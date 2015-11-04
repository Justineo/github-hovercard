Changelog
---

## 0.3.2

* Added "Merged" state in issue card.

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
