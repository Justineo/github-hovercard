$(() => {
    'use strict';

    const GH_DOMAIN = location.host;

    const TOOLTIP_RELATED = '.tooltipster-base, .tooltipster-sizer';
    const DEFAULT_TARGET = document.body;
    let isExtracting = false;
    let observer = new MutationObserver((mutations) => {
        if (isExtracting) {
            return;
        }
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                let target = mutation.target;
                if (!$(target).is(TOOLTIP_RELATED)
                    && !$(target).parents(TOOLTIP_RELATED).length
                    && !$(target).is(DEFAULT_TARGET)) {
                    extract(target);
                }
            }
        });
    });
    let observeConfig = {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true
    };
    observer.observe(DEFAULT_TARGET, observeConfig);

    let me = $('meta[name="user-login"]').attr('content');

    // based on octotree's config
    const GH_RESERVED_USER_NAMES = [
      'settings', 'orgs', 'organizations', 'site', 'blog', 'about',
      'explore', 'styleguide', 'showcases', 'trending', 'stars',
      'dashboard', 'notifications', 'search', 'developer', 'account',
      'pulls', 'issues', 'features', 'contact', 'security', 'join',
      'login', 'watching', 'new', 'integrations', 'pricing'
    ];

    const GH_RESERVED_REPO_NAMES = [
        'followers', 'following', 'repositories'
    ];

    const GH_USER_NAME_PATTERN = /^[a-z0-9]+$|^[a-z0-9](?:[a-z0-9](?!--)|-(?!-))*[a-z0-9]$/i;
    const GH_REPO_NAME_PATTERN = /^[a-z0-9\-_\.]+$/i;

    const TYPE_KEY = 'hovercard-type';
    const VALUE_KEY = 'hovercard-value';
    const EXTRACT_TYPE = {
        USER: 'user',
        REPO: 'repo',
        ISSUE: 'issue',
        SKIP: 'skip'
    };
    const TOKEN_KEY = 'hovercard-token';

    const EXTRACTOR = {
        SLUG: 1, // {{user}}/{{repo}}#{{issue}}
        TEXT_USER: 2, // {{user}}
        TITLE_USER: 3, // title="{{user}}"
        ALT_USER: 4, // alt="{{user}}"
        HREF_USER: 5, // href="{{user}}"
        URL: 6, // href="/{{user}}" or href="https://{{GH_DOMAIN}}/{{user}}"
        NEXT_TEXT_REPO: 7, // <span>...</span> {{repo}}
        ANCESTOR_URL_REPO: 8 // <a href="/{{user}}/{{repo}}">...{{elem}}...</a>
    };

    const GH_DOMAIN_PATTERN = GH_DOMAIN.replace(/\./g, '\\.');
    const URL_USER_PATTERN = `^https?:\\/\\/${GH_DOMAIN_PATTERN}\\/([^\\/\\?#]+)(?:[^\\/]*$|\\/(?:[\\?#]|$))`;
    const URL_REPO_PATTERN = `^https?:\\/\\/${GH_DOMAIN_PATTERN}\\/([^\\/\\?#]+)\\/([^\\/\\?#]+)(?:[^\\/]*$|\\/(?:[\\?#]|$))`;
    const URL_ISSUE_PATTERN = `^https?:\\/\\/${GH_DOMAIN_PATTERN}\\/([^\\/\\?#]+)\\/([^\\/\\?#]+)\\/(?:issues|pull)\\/(\\d+)(?:[^\\/]*$|(?:[\\?#]|$))`;
    const SLUG_PATTERN = /([^\/\s]+)\/([^#@\s]+)(?:#(\d+)|@[\da-f]+)?/;

    const STRATEGIES = {
        '.repo-list-name .prefix': EXTRACTOR.TEXT_USER,
        '.fork-flag a': EXTRACTOR.SLUG,
        '.avatar': EXTRACTOR.ALT_USER,
        '.gravatar': EXTRACTOR.ALT_USER,
        '.leaderboard-gravatar': EXTRACTOR.ALT_USER,
        '.author-gravatar': EXTRACTOR.ALT_USER,
        '.author-avatar': EXTRACTOR.ALT_USER,
        '.timeline-comment-avatar': EXTRACTOR.ALT_USER,
        '[data-ga-click~="target:actor"]': EXTRACTOR.TEXT_USER,
        '[data-ga-click~="target:repository"]': EXTRACTOR.SLUG,
        '[data-ga-click~="target:repo"]': EXTRACTOR.SLUG,
        '[data-ga-click~="target:parent"]': EXTRACTOR.SLUG,
        '[data-ga-click~="target:issue"]': EXTRACTOR.SLUG,
        '[data-ga-click~="target:issue-comment"]': EXTRACTOR.SLUG,
        '[data-ga-click~="target:pull"]': EXTRACTOR.SLUG,
        '[data-ga-click~="target:pull-comment"]': EXTRACTOR.SLUG,
        '[data-ga-click~="target:commit-comment"]': EXTRACTOR.SLUG,
        // '.user-mention': EXTRACTOR.TEXT_USER,
        '.opened-by a': EXTRACTOR.TEXT_USER,
        '.table-list-issues .issue-nwo-link': EXTRACTOR.SLUG,
        '.filter-list .repo-and-owner': EXTRACTOR.SLUG,
        '.repo-list a span:first-child': EXTRACTOR.TEXT_USER,
        '.repo-list .repo-name': EXTRACTOR.ANCESTOR_URL_REPO,
        '.repo-list-info a': EXTRACTOR.SLUG,
        '.repo-and-owner .owner': EXTRACTOR.TEXT_USER,
        '.repo-and-owner .repo': EXTRACTOR.ANCESTOR_URL_REPO,
        '.capped-card .aname': EXTRACTOR.TEXT_USER,
        '.team-member-username a': EXTRACTOR.TEXT_USER,
        '.member-username': EXTRACTOR.TEXT_USER,
        '.repo a:first-of-type': EXTRACTOR.TEXT_USER,
        '.repo a:last-of-type': EXTRACTOR.ANCESTOR_URL_REPO,
        '.repo-collection .repo-name': EXTRACTOR.SLUG,
        '.branch-meta a': EXTRACTOR.TEXT_USER,
        '.commit-meta .commit-author': EXTRACTOR.TEXT_USER,
        '.author-name a': EXTRACTOR.TEXT_USER,
        '.author-name span': EXTRACTOR.TEXT_USER,
        '.release-authorship a:first-of-type': EXTRACTOR.TEXT_USER,
        '.table-list-cell-avatar img': EXTRACTOR.ALT_USER,
        '.author': EXTRACTOR.TEXT_USER,
        '.codesearch-results .repo-list-name a': EXTRACTOR.SLUG,
        '.code-list-item a:first-child': EXTRACTOR.SLUG,
        '.issue-list-meta li:first-child a': EXTRACTOR.SLUG,
        '.issue-list-meta li:nth-child(2) a': EXTRACTOR.TEXT_USER,
        '.user-list-info a:first-child': EXTRACTOR.TEXT_USER,
        '.commits li span': EXTRACTOR.TITLE_USER,
        '.follow-list-name a': EXTRACTOR.HREF_USER,
        '.sidebar-assignee .assignee': EXTRACTOR.TEXT_USER,
        '.contribution .cmeta': EXTRACTOR.SLUG,
        '.select-menu-item-gravatar img': EXTRACTOR.ALT_USER,
        '.notifications-repo-link': EXTRACTOR.SLUG,
        '.explore-page .repo-list-name .slash': EXTRACTOR.NEXT_TEXT_REPO,
        '.collection-page .repo-list-name .slash': EXTRACTOR.NEXT_TEXT_REPO,
        '.leaderboard-list-content .repo': EXTRACTOR.ANCESTOR_URL_REPO,
        '.profilecols .repo-list-name a': EXTRACTOR.ANCESTOR_URL_REPO,
        '.conversation-list-heading:has(.octicon-git-commit) + .simple-conversation-list a': EXTRACTOR.SLUG,
        '.discussion-item-ref strong': EXTRACTOR.SLUG,
        'a': EXTRACTOR.URL
    };

    const BLACK_LIST_SELECTOR = [
        '.hovercard a',
        '.repo-nav a',
        '.tabnav-tab',
        '.discussion-item .timestamp',
        '.file-wrap a'
    ].join(', ');

    const CARD_TPL = {
        user: `
            <address class="hovercard">
                <img src="{{avatar}}&s=32" class="hovercard-avatar">
                <div class="hovercard-person">
                    <p><strong><a href="{{userUrl}}">{{loginName}}</a></strong>{{#isAdmin}} <small>(Administrator)</small>{{/isAdmin}}{{#isOrg}} <small>(Organization)</small>{{/isOrg}}</p>
                    {{#realName}}<p>{{realName}}</p>{{/realName}}
                </div>
                <div class="hovercard-more">
                    {{^isOrg}}<div class="hovercard-stats">
                        <a href="{{followersUrl}}">
                            <strong>{{followers}}</strong>
                            <span>Followers</span>
                        </a>
                        <a href="{{followingUrl}}">
                            <strong>{{following}}</strong>
                            <span>Following</span>
                        </a>
                        <a href="{{reposUrl}}">
                            <strong>{{repos}}</strong>
                            <span>Repos</span>
                        </a>
                    </div>{{/isOrg}}
                    {{#location}}<p><span class="octicon octicon-location"></span>{{location}}</p>{{/location}}
                    {{#company}}<p><span class="octicon octicon-organization"></span>{{company}}</p>{{/company}}
                </div>
            </address>`,
        repo: `
            <div class="hovercard">
                <div class="hovercard-repo">
                    <span class="octicon octicon-repo{{#parent}}-forked{{/parent}}"></span>
                    <p><a href="{{ownerUrl}}">{{owner}}</a> / <strong><a href="{{repoUrl}}">{{repo}}</a></strong></p>
                    {{#parent}}<p><span>forked from <a href="{{url}}">{{repo}}</a></span></p>{{/parent}}
                </div>
                <div class="hovercard-more">
                    <div class="hovercard-stats">
                        <a href="{{starsUrl}}">
                            <strong>{{stars}}</strong>
                            <span>Stars</span>
                        </a>
                        <a href="{{forksUrl}}">
                            <strong>{{forks}}</strong>
                            <span>Forks</span>
                        </a>
                        {{#hasIssues}}<a href="{{issuesUrl}}">
                            <strong>{{issues}}</strong>
                            <span>Issues</span>
                        </a>{{/hasIssues}}
                    </div>
                    {{#desc}}<p class="hovercard-repo-desc"><span class="octicon octicon-info"></span>{{{.}}}</p>{{/desc}}
                    {{#homepage}}<p><span class="octicon octicon-link"></span><a href="{{.}}">{{.}}</a></p>{{/homepage}}
                    {{#language}}<p><span class="octicon octicon-code"></span>{{.}}</p>{{/language}}
                </div>
            </div>`,
        issue: `
            <div class="hovercard">
                <div class="hovercard-issue">
                    <p><small>#{{number}}</small> <a href="{{issueUrl}}"><strong>{{title}}</strong></a></p>
                </div>
                <div class="hovercard-issue-meta">
                    <p><span class="state state-{{state}}"><span class="octicon octicon-{{#isPullRequest}}git-pull-request{{/isPullRequest}}{{^isPullRequest}}{{^isClosed}}issue-opened{{/isClosed}}{{#isClosed}}issue-closed{{/isClosed}}{{/isPullRequest}}"></span>{{state}}</span><a href="{{userUrl}}">{{user}}</a> created on {{{createTime}}}</p>
                </div>
                {{#body}}<div class="hovercard-issue-body">{{{.}}}</div>{{/body}}
            </div>`,
        error: `
            <div class="hovercard hovercard-error">
                <p><strong><span class="octicon octicon-alert"></span>{{title}}</strong></p>
                {{#message}}<p>{{{message}}}</p>{{/message}}
            </div>`,
        form: `
            <div class="hovercard-overlay">
                <form>
                    <p>
                        <input class="hovercard-token" type="text" placeholder="Paste access token here..." size="40" />
                        <button class="btn btn-primary hovercard-save">Save</button>
                        <button class="btn hovercard-cancel">Cancel</button>
                    </p>
                </form>
            </div>`
    };

    const CREATE_TOKEN_PATH = `//${GH_DOMAIN}/settings/tokens/new`;
    const IS_ENTERPRISE = GH_DOMAIN !== 'github.com';
    const API_PREFIX = IS_ENTERPRISE ? `//${GH_DOMAIN}/api/v3/` : `//api.${GH_DOMAIN}/`;

    function trim(str) {
        if (!str) {
            return '';
        }
        return str.replace(/^\s+|\s+$/g, '');
    }

    function markExtracted(elem, type, value) {
        if (value) {
            elem.data(TYPE_KEY, type);
            elem.data(VALUE_KEY, value);
            elem.addClass(getTypeClass(type));
        }
        if (!type || !value) {
            elem.data(TYPE_KEY, EXTRACT_TYPE.SKIP);
        }
    }

    function getExtracted(elem) {
        let extractedSelector = Object.keys(EXTRACT_TYPE)
            .map(key => EXTRACT_TYPE[key])
            .map(getTypeClass)
            .map(className => `.${className}`)
            .join(',');
        return elem.data(VALUE_KEY) || elem.data(TYPE_KEY) === EXTRACT_TYPE.SKIP
            || elem.find(extractedSelector).length;
    }

    function getTypeClass(type) {
        return `hovercard-${type}-x`;
    }

    function getFullRepoFromAncestorLink(elem) {
        let href = elem.closest('a').prop('href');
        let fullRepo = null;
        if (href) {
            let match = href.match(URL_REPO_PATTERN);
            fullRepo = match && (match[1] + '/' + match[2]);
        }
        return fullRepo;
    }

    function formatNumber(num) {
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'k';
        }
        return num;
    }

    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                         'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function formatTime(time) {
        var t = new Date(time);
        var formatted = MONTH_NAMES[t.getMonth()] + ' ' + t.getDate() + ', ' + t.getFullYear();
        return encodeHTML`<time datetime="${time}">${formatted}</time>`;
    }

    function replaceEmoji(text) {
        return text.replace(/:([a-z0-9+\-_]+):/ig, (match, key) => {
            let url = emojiURLs[key];
            if (!url) {
                return match;
            }
            return `<img class="emoji" title="${match}" alt="${match}"
                src="${url}" width="18" height="18">`;
        });
    }

    function replaceLink(text) {
        return text.replace(/\b(https?:\/\/[^\s]+)/ig, `<a href="$1">$1</a>`);
    }

    // Code via https://developers.google.com/web/updates/2015/01/ES6-Template-Strings
    // HTML Escape helper utility
    let htmlUtil = (function () {
        // Thanks to Andrea Giammarchi
        let reEscape = /[&<>'"]/g;
        let reUnescape = /&(?:amp|#38|lt|#60|gt|#62|apos|#39|quot|#34);/g;
        let oEscape = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        };
        let oUnescape = {
            '&amp;': '&',
            '&#38;': '&',
            '&lt;': '<',
            '&#60;': '<',
            '&gt;': '>',
            '&#62;': '>',
            '&apos;': "'",
            '&#39;': "'",
            '&quot;': '"',
            '&#34;': '"'
        };
        let fnEscape = function (m) {
            return oEscape[m];
        };
        let fnUnescape = function (m) {
            return oUnescape[m];
        };
        let replace = String.prototype.replace;

        return (Object.freeze || Object)({
            escape: function escape(s) {
                return replace.call(s, reEscape, fnEscape);
            },
            unescape: function unescape(s) {
                return replace.call(s, reUnescape, fnUnescape);
            }
        });
    }());

    // Tagged template function
    function encodeHTML(pieces) {
        var result = pieces[0];
        var substitutions = [].slice.call(arguments, 1);
        for (var i = 0; i < substitutions.length; ++i) {
            result += htmlUtil.escape(substitutions[i]) + pieces[i + 1];
        }

        return result;
    }

    function getCardHTML(type, raw) {
        let data;
        if (type === EXTRACT_TYPE.USER) {
            data = {
                avatar: raw.avatar_url,
                userUrl: raw.html_url,
                loginName: raw.login,
                realName: raw.name,
                location: raw.location,
                isAdmin: raw.site_admin,
                isOrg: raw.type === 'Organization',
                company: raw.company,
                followers: formatNumber(raw.followers),
                following: formatNumber(raw.following),
                repos: formatNumber(raw.public_repos),
                followersUrl: `//${GH_DOMAIN}/${raw.login}/followers`,
                followingUrl: `//${GH_DOMAIN}/${raw.login}/following`,
                reposUrl: `//${GH_DOMAIN}/${raw.login}?tab=repositories`
            };
        } else if (type === EXTRACT_TYPE.REPO) {
            data = {
                owner: raw.owner.login,
                ownerAvatar: raw.owner.avatar_url,
                ownerUrl: raw.owner.html_url,
                repo: raw.name,
                repoUrl: raw.html_url,
                desc: raw.description ? replaceEmoji(replaceLink(encodeHTML`${raw.description}`)) : '',
                language: raw.language,
                stars: formatNumber(raw.stargazers_count),
                forks: formatNumber(raw.forks_count),
                issues: formatNumber(raw.open_issues_count),
                hasIssues: raw.has_issues,
                homepage: raw.homepage,
                starsUrl: `//${GH_DOMAIN}/${raw.full_name}/stargazers`,
                forksUrl: `//${GH_DOMAIN}/${raw.full_name}/network`,
                issuesUrl: `//${GH_DOMAIN}/${raw.full_name}/issues`
            };
            if (raw.parent) {
                data.parent = {
                    repo: raw.parent.full_name,
                    url: raw.parent.html_url
                };
            }
        } else if (type === EXTRACT_TYPE.ISSUE) {
            data = {
                title: raw.title,
                body: raw.body ? marked(replaceEmoji(raw.body)) : '',
                issueUrl: raw.html_url,
                number: raw.number,
                isPullRequest: !!raw.pull_request,
                isClosed: raw.state === 'closed',
                userUrl: raw.user.html_url,
                user: raw.user.login,
                state: !!raw.pull_request && raw.state === 'closed' ? 'merged' : raw.state,
                avatar: raw.user.avatar_url,
                createTime: formatTime(raw.created_at)
            };
        }

        let html = Mustache.render(CARD_TPL[type], data);
        let result = $(html);
        const LANG_PATTERN = /lang-(.+)/;
        if (type === EXTRACT_TYPE.ISSUE) {
            result.find('pre code').each(function () {
                let code = $(this);
                let className = code.attr('class');
                let match;
                if (className) {
                    match = className.match(LANG_PATTERN);
                }
                if (match) {
                    code.html(hljs.highlight(match[1], code.text()).value);
                } else {
                    code.html(hljs.highlightAuto(code.text()).value);
                }
            });
        }

        return result;
    }

    function getErrorHTML(error) {
        let html = Mustache.render(CARD_TPL.error, error);
        return $(html);
    }

    // prepare token form
    let tokenForm = $(CARD_TPL.form);
    let tokenField = tokenForm.find('.hovercard-token');
    tokenForm.find('button').on('click', (e) => {
        if ($(e.target).is('.hovercard-save') && tokenField.val()) {
            localStorage.setItem(TOKEN_KEY, tokenField.val());
        }
        tokenForm.detach();
        return false;
    });
    tokenForm.find('.hovercard-cancel').on('click')
    $('body').on('click', '.token-link', () => {
        tokenForm.appendTo($('body'));
    });

    // prepare cache objects
    let cache = {
        user: {},
        repo: {},
        issue: {}
    };

    function extract(context) {
        isExtracting = true;

        // if on user profile page, we should not show user
        // hovercard for the said user
        let current = location.href.match(URL_USER_PATTERN);
        if (current) {
            current = current[1];
            if (GH_RESERVED_USER_NAMES.indexOf(current) !== -1
                || !GH_USER_NAME_PATTERN.test(current)) {
                current = null;
            }
        }

        let selectors = Object.keys(STRATEGIES);
        selectors.forEach((selector) => {
            let strategy = STRATEGIES[selector];
            let elems = $(selector, context);
            elems.each(function () {
                let elem = $(this);
                if (getExtracted(elem) || elem.is(BLACK_LIST_SELECTOR)) {
                    // skip processed elements
                    return;
                }
                let username; // {{user}}
                let repo; // {{repo}}
                let fullRepo; // {{user}}/{{repo}}
                let issue; // {{issue}}
                let fullIssue; // {{user}}/{{repo}}#{{issue}}
                switch (strategy) {
                    case EXTRACTOR.TEXT_USER: {
                        username = trim(elem.text().replace(/[@\/]/g, ''));
                        break;
                    }
                    case EXTRACTOR.TITLE_USER: {
                        username = trim(elem.attr('title').replace(/[@\/]/g, ''));
                        break;
                    }
                    case EXTRACTOR.ALT_USER: {
                        username = trim(elem.attr('alt').replace(/[@\/]/g, ''));
                        break;
                    }
                    case EXTRACTOR.HREF_USER: {
                        username = trim(elem.attr('href').replace(/[@\/]/g, ''));
                        break;
                    }
                    case EXTRACTOR.SLUG: {
                        let slug = elem.text();
                        let match = slug.match(SLUG_PATTERN);
                        username = trim(match && match[1]);
                        repo = trim(match && match[2]);
                        issue = trim(match && match[3]);
                        if (username && repo) {
                            fullRepo = username + '/' + repo;
                            if (issue) {
                                elem.html(slug.replace('#' + issue, encodeHTML`#<span>${issue}</span>`));
                                slug = elem.html();
                            }
                            if (username === me || username === current) {
                                elem.html(slug.replace(fullRepo, encodeHTML`${username}/<span>${repo}</span>`));
                                markExtracted(elem.children().first(), EXTRACT_TYPE.REPO, fullRepo);
                            } else {
                                elem.html(slug.replace(fullRepo, encodeHTML`<span>${username}</span>/<span>${repo}</span>`));
                                markExtracted(elem.children().first(), EXTRACT_TYPE.USER, username);
                                markExtracted(elem.children().first().next(), EXTRACT_TYPE.REPO, fullRepo);
                            }
                            if (issue) {
                                markExtracted(elem.children().last(), EXTRACT_TYPE.ISSUE, fullRepo + '#' + issue);
                            }

                            // if not marked earlier, mark as nothing extracted
                            if (!getExtracted(elem)) {
                                markExtracted(elem);
                            }
                            elem = null;
                        }
                        break;
                    }
                    case EXTRACTOR.URL: {
                        let attr = elem.attr('href');
                        if (attr && attr.charAt(0) === '#') {
                            // ignore local anchors
                            return;
                        }
                        let href = elem.prop('href'); // absolute path via prop
                        if (href) {
                            let match = href.match(URL_USER_PATTERN);
                            username = trim(match && match[1]);
                            if (!username) {
                                match = href.match(URL_REPO_PATTERN);
                                username = trim(match && match[1]);
                                repo = trim(match && match[2]);
                            }
                            if (!username) {
                                match = href.match(URL_ISSUE_PATTERN);
                                username = trim(match && match[1]);
                                repo = trim(match && match[2]);
                                issue = trim(match && match[3]);
                            }
                            if (username) {
                                if (GH_RESERVED_USER_NAMES.indexOf(username) !== -1
                                    || !GH_USER_NAME_PATTERN.test(username)) {
                                    username = null;
                                    repo = null;
                                    issue = null;
                                }
                            }
                            if (repo) {
                                fullRepo = `${username}/${repo}`;
                                if (GH_RESERVED_REPO_NAMES.indexOf(repo) !== -1
                                    || !GH_REPO_NAME_PATTERN.test(repo)) {
                                    fullRepo = null;
                                    username = null;
                                    issue = null;
                                }
                            }
                            if (issue) {
                                fullIssue = `${username}/${repo}#${issue}`;
                            }
                            // skip hovercard on myself or current profile page owner
                            if ((username === me || username === current) && !repo) {
                                username = null;
                            }
                        }
                        break;
                    }
                    case EXTRACTOR.NEXT_TEXT_REPO: {
                        fullRepo = getFullRepoFromAncestorLink(elem);
                        repo = fullRepo.split('/')[1];
                        let textNode = elem[0].nextSibling;
                        if (fullRepo && textNode) {
                            textNode.parentNode.removeChild(textNode);
                            elem.after(` <span>${repo}</span>`);
                            markExtracted(elem);
                            markExtracted(elem.next(), EXTRACT_TYPE.REPO, fullRepo);
                        }
                        elem = null;
                        break;
                    }
                    case EXTRACTOR.ANCESTOR_URL_REPO: {
                        fullRepo = getFullRepoFromAncestorLink(elem);
                        break;
                    }
                    default:
                        break;
                }

                // elem === null means already marked in extractors
                if (!elem) {
                    return;
                }
                if (fullIssue) {
                    markExtracted(elem, EXTRACT_TYPE.ISSUE, fullIssue);
                } else if (fullRepo) {
                    markExtracted(elem, EXTRACT_TYPE.REPO, fullRepo);
                } else if (username && username !== me && username !== current) {
                    markExtracted(elem, EXTRACT_TYPE.USER, username);
                }
                if (!username && !fullRepo && !fullIssue) {
                    markExtracted(elem);
                }
            });
        });

        setTimeout(() => {
            isExtracting = false;
        }, 0);

        let tipSelector = Object.keys(EXTRACT_TYPE)
            .map(key => EXTRACT_TYPE[key])
            .map(getTypeClass)
            .map(className => `.${className}`)
            .join(',');

        $(tipSelector).tooltipster({
            updateAnimation: false,
            contentAsHTML: true,
            debug: false,
            functionBefore: (me, event) => {
                let elem = $(event.origin);
                elem.tooltipster('content', $('<span class="loading"></span>'));
                let type = elem.data(TYPE_KEY);
                let value = elem.data(VALUE_KEY);

                let raw = cache[type][value];
                if (raw) {
                    elem.tooltipster('content', getCardHTML(type, raw));
                } else {
                    var apiPath;
                    switch (type) {
                        case EXTRACT_TYPE.USER:
                            apiPath = `users/${value}`;
                            break;
                        case EXTRACT_TYPE.REPO:
                            apiPath = `repos/${value}`;
                            break;
                        case EXTRACT_TYPE.ISSUE: {
                            let values = value.split('#');
                            let fullRepo = values[0];
                            let issue = values[1];
                            apiPath = `repos/${fullRepo}/issues/${issue}`;
                            break;
                        }
                    }
                    let requestOptions = {
                        url: API_PREFIX + apiPath,
                        datatype: 'json'
                    };

                    let token = localStorage.getItem(TOKEN_KEY);
                    if (token) {
                        requestOptions.headers = {
                            Authorization: `token ${token}`
                        };
                    }
                    $.ajax(requestOptions)
                        .done((raw) => {
                            cache[type][value] = raw;
                            elem.tooltipster('content', getCardHTML(type, raw));
                        })
                        .fail((xhr) => {
                            let status = xhr.status;
                            let title = '';
                            let message = '';
                            let needToken = false;

                            switch (status) {
                                case 0:
                                    title = 'Connection error';
                                    message = 'Please try again later.';
                                    break;
                                case 401:
                                    title = 'Invalid token';
                                    message = encodeHTML`<a href="${CREATE_TOKEN_PATH}" class="token-link" target="_blank">Create a new access token</a>, paste it back here and try again.`;
                                    needToken = true;
                                    break;
                                case 403:
                                    if (xhr.getAllResponseHeaders().indexOf('X-RateLimit-Remaining: 0') !== -1) {
                                        title = 'API limit exceeded';
                                        if (!localStorage.getItem(TOKEN_KEY)) {
                                            message = encodeHTML`API rate limit exceeded for current IP. <a href="${CREATE_TOKEN_PATH}" class="token-link" target="_blank">Create a new access token</a> and paste it back here to get a higher rate limit.`;
                                        }
                                    } else {
                                        let response = xhr.responseJSON;
                                        if (type === EXTRACT_TYPE.REPO && response.block && response.block.reason === 'dmca') {
                                            title = 'Access blocked';
                                            message = 'Repository unavailable due to DMCA takedown.';
                                        } else {
                                            title = 'Forbidden';
                                            message = encodeHTML`You are not allowed to access GitHub API. <a href="${CREATE_TOKEN_PATH}" class="token-link" target="_blank">Create a new access token</a>, paste it back here and try again.`;
                                        }
                                    }
                                    needToken = true;
                                    break;
                                case 404:
                                    title = 'Not found';
                                    if (type === EXTRACT_TYPE.REPO) {
                                        message = encodeHTML`The repository doesn\'t exist or is private. <a href="${CREATE_TOKEN_PATH}" class="token-link" target="_blank">Create a new access token</a>, paste it back here and try again.`;
                                        needToken = true;
                                    } else if (type === EXTRACT_TYPE.USER) {
                                        message = 'The user doesn\'t exist.';
                                    }
                                    break;
                                default:
                                    title = 'Error';
                                    let response = xhr.responseJSON;
                                    if (response) {
                                        message = encodeHTML`${response.message}` || '';
                                    }
                                    break;
                            }

                            let error = {
                                title: title,
                                message: message,
                                needToken: needToken
                            };
                            elem.tooltipster('content', getErrorHTML(error));
                        });
                }
            },
            interactive: true
        });

        // Listen for future mutations but not ones happens
        // in current extraction process
        setTimeout(() => {
            isExtracting = false;
        }, 0);
    }

    // self.options.emojiURLs will be replaced after build
    // JSON resource URL in Chrome, JSON data in Firefox
    let emojiURLs = self.options.emojiURLs;
    if (typeof emojiURLs === 'string') {
        $.getJSON(emojiURLs).done((emojis) => {
            emojiURLs = emojis;
            extract();
        });
    } else {
        extract();
    }
});
