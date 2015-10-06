$(function () {
    'use strict';

    let target = document.body;
    let observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            if (mutation.type === 'childList') {
                extract(mutation.target);
            }
        });
    });
    let observeConfig = {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true
    };
    observer.observe(target, observeConfig);

    let me = $('meta[name="user-login"]').attr('content');

    // based on octotree's config
    const GH_RESERVED_USER_NAMES = [
      'settings', 'orgs', 'organizations', 'site', 'blog', 'about',
      'explore', 'styleguide', 'showcases', 'trending', 'stars',
      'dashboard', 'notifications', 'search', 'developer', 'account',
      'pulls', 'issues', 'features', 'contact', 'security', 'join',
      'login', 'password_reset', 'watching', 'new', 'integrations'
    ];

    const GH_RESERVED_REPO_NAMES = [
        'followers', 'following', 'repositories'
    ];

    const GH_USER_NAME_PATTERN = /^[a-z0-9]$|^[a-z0-9](?:[a-z0-9](?!--)|-(?!-))*[a-z0-9]$/i;
    const GH_REPO_NAME_PATTERN = /^[a-z0-9-_.]$/i;

    const USER_KEY = 'hovercard-user-x';
    const REPO_KEY = 'hovercard-repo-x';
    const SKIP_KEY = 'hovercard-skip-x';
    const TOKEN_KEY = 'hovercard-token';

    const EXTRACTOR = {
        SLUG: 1,  // {{user}}/{{repo}}#{{issue}}
        TEXT_USER: 2,  // {{user}}
        TITLE_USER: 3, // title="{{user}}"
        ALT_USER: 4,   // alt="{{user}}"
        HREF_USER: 5,   // alt="{{user}}"
        URL: 6, // href="/{{user}}" or href="https://github.com/{{user}}"
        NEXT_TEXT_REPO: 7, // <span>...</span> {{repo}}
        ANCESTOR_URL_REPO: 8 // <a href="/{{user}}/{{repo}}">...{{elem}}...</a>
    };

    const URL_USER_PATTERN = /^https?:\/\/github.com\/([^\/\?#]+)[^\/]*$/;
    const URL_REPO_PATTERN = /^https?:\/\/github.com\/([^\/]+)\/([^\/\?#]+)[^\/]*$/;
    const SLUG_PATTERN = /([^\/\s]+)\/([^#@\s]+)(?:#\d+|@[\da-f]+)?/;

    const STRATEGIES = {
        '.explore-content .repo-list-name .prefix': EXTRACTOR.TEXT_USER,
        '.fork-flag a': EXTRACTOR.SLUG,
        '.avatar': EXTRACTOR.ALT_USER,
        '.gravatar': EXTRACTOR.ALT_USER,
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
        '.user-mention': EXTRACTOR.TEXT_USER,
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
        '.explore-content .repo-list-name .slash': EXTRACTOR.NEXT_TEXT_REPO,
        '.leaderboard-list-content .repo': EXTRACTOR.ANCESTOR_URL_REPO,
        '.profilecols .repo-list-name a': EXTRACTOR.ANCESTOR_URL_REPO,
        '.simple-conversation-list a': EXTRACTOR.SLUG,
        '.discussion-item-ref strong': EXTRACTOR.SLUG,
        'a:not(.hovercard a)': EXTRACTOR.URL
    };

    function trim(str) {
        if (!str) {
            return '';
        }
        return str.replace(/^\s+|\s+$/g, '');
    }

    function markExtracted(elem, key, value) {
        if (value) {
            elem.data(key, value);
            elem.addClass(key);
            elem.data(SKIP_KEY, null);
        }
        if (!key || !value) {
            elem.data(SKIP_KEY, '✓');
        }
    }

    function getExtracted(elem) {
        return elem.data(USER_KEY) || elem.data(REPO_KEY) || !!elem.data(SKIP_KEY)
            || elem.find('.' + USER_KEY + ', .' + REPO_KEY).length;
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

    function extract(context) {
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
        selectors.forEach(function (selector) {
            let strategy = STRATEGIES[selector];
            let elems = $(selector, context);
            elems.each(function () {
                let elem = $(this);
                if (getExtracted(elem)) {
                    // skip processed elements
                    return;
                }
                let username; // {{user}}
                let repo; // {{repo}}
                let fullRepo; // {{user}}/{{repo}}
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
                    case EXTRACTOR.HREF: {
                        username = trim(elem.attr('href').replace(/[@\/]/g, ''));
                        break;
                    }
                    case EXTRACTOR.SLUG: {
                        let slug = elem.text();
                        let match = slug.match(SLUG_PATTERN);
                        username = trim(match && match[1]);
                        repo = trim(match && match[2]);
                        if (username && repo) {
                            fullRepo = username + '/' + repo;
                            if (username === me || username === current) {
                                elem.html(slug.replace(fullRepo, username + '/<span>' + repo + '</span>'));
                                markExtracted(elem.children().first(), REPO_KEY, fullRepo);
                            } else {
                                elem.html(slug.replace(fullRepo, '<span>' + username + '</span>/<span>' + repo + '</span>'));
                                markExtracted(elem.children().first(), USER_KEY, username);
                                markExtracted(elem.children().first().next(), REPO_KEY, fullRepo);
                            }
                            markExtracted(elem);
                            elem = null;
                        }
                        break;
                    }
                    case EXTRACTOR.URL:{
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
                            if (username) {
                                if (GH_RESERVED_USER_NAMES.indexOf(username) !== -1
                                    || !GH_USER_NAME_PATTERN.test(username)) {
                                    username = null;
                                    repo = null;
                                }
                            }
                            if (repo) {
                                fullRepo = username + '/' + repo;
                                if (GH_RESERVED_REPO_NAMES.indexOf(repo) !== -1
                                    || !GH_REPO_NAME_PATTERN.test(repo)) {
                                    fullRepo = null;
                                    username = null;
                                }
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
                            elem.after(' <span>' + repo + '</span>');
                            markExtracted(elem);
                            markExtracted(elem.next(), REPO_KEY, fullRepo);
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
                if (username && username !== me && username !== current) {
                    markExtracted(elem, USER_KEY, username);
                }
                if (fullRepo) {
                    markExtracted(elem, REPO_KEY, fullRepo);
                }
                if (!username && !fullRepo) {
                    markExtracted(elem);
                }
            });
        });

        const CARD_TPL = {
            user:
                '<address class="hovercard">\
                    <img src="{{avatar}}&s=32" class="hovercard-avatar">\
                    <div class="hovercard-person">\
                        <p><strong><a href="{{userUrl}}">{{loginName}}</a></strong>{{#isAdmin}} <small>(Administrator)</small>{{/isAdmin}}{{#isOrg}} <small>(Organization)</small>{{/isOrg}}</p>\
                        {{#realName}}<p>{{realName}}</p>{{/realName}}\
                    </div>\
                    <div class="hovercard-more">\
                        {{^isOrg}}<div class="hovercard-stats">\
                            <a href="{{followersUrl}}">\
                                <strong>{{followers}}</strong>\
                                <span>Followers</span>\
                            </a>\
                            <a href="{{followingUrl}}">\
                                <strong>{{following}}</strong>\
                                <span>Following</span>\
                            </a>\
                            <a href="{{reposUrl}}">\
                                <strong>{{repos}}</strong>\
                                <span>Repos</span>\
                            </a>\
                        </div>{{/isOrg}}\
                        {{#location}}<p><span class="octicon octicon-location"></span>{{location}}</p>{{/location}}\
                        {{#company}}<p><span class="octicon octicon-organization"></span>{{company}}</p>{{/company}}\
                    </div>\
                </address>',
            repo:
                '<div class="hovercard">\
                    <div class="hovercard-repo">\
                        <span class="octicon octicon-repo{{#parent}}-forked{{/parent}}"></span>\
                        <p><a href="{{ownerUrl}}">{{owner}}</a> / <strong><a href="{{repoUrl}}">{{repo}}</a></strong></p>\
                        <p>{{#parent}}<span>forked from <a href="{{url}}">{{repo}}</a></span>{{/parent}}</p>\
                    </div>\
                    <div class="hovercard-more">\
                        <div class="hovercard-stats">\
                            <a href="{{starsUrl}}">\
                                <strong>{{stars}}</strong>\
                                <span>Stars</span>\
                            </a>\
                            <a href="{{forksUrl}}">\
                                <strong>{{forks}}</strong>\
                                <span>Forks</span>\
                            </a>\
                            {{#hasIssues}}<a href="{{issuesUrl}}">\
                                <strong>{{issues}}</strong>\
                                <span>Issues</span>\
                            </a>{{/hasIssues}}\
                        </div>\
                        {{#desc}}<p class="hovercard-repo-desc"><span class="octicon octicon-info"></span>{{{desc}}}</p>{{/desc}}\
                        {{#language}}<p><span class="octicon octicon-code"></span>{{language}}</p>{{/language}}\
                        {{#homepage}}<p><span class="octicon octicon-link"></span><a href="{{homepage}}">{{homepage}}</a></p>{{/homepage}}\
                    </div>\
                </div>'
        };

        function formatNumber(num) {
            if (num >= 1000) {
                return (num / 1000).toFixed(1) + 'k';
            }
            return num;
        }

        function encodeHTML(raw){
            return $('<div/>').text(raw).html();
        }

        function replaceEmoji(text) {
            return text.replace(/:([a-z0-9+-_]+):/ig, function (match, key) {
                let url = emojiURLs[key];
                if (!url) {
                    return match;
                }
                return '<img class="emoji" title="' + match + '" alt="' + match + '"'
                    + ' src="' + url + '" width="18" height="18">';
            });
        }

        function getCardHTML(type, raw) {
            let data;
            if (type === 'user') {
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
                    followersUrl: '//github.com/' + raw.login + '/followers',
                    followingUrl: '//github.com/' + raw.login + '/following',
                    reposUrl: '//github.com/' + raw.login + '?tab=repositories'
                };
            } else if (type === 'repo') {
                data = {
                    owner: raw.owner.login,
                    ownerAvatar: raw.owner.avatar_url,
                    ownerUrl: raw.owner.html_url,
                    repo: raw.name,
                    repoUrl: raw.html_url,
                    desc: replaceEmoji(encodeHTML(raw.description)),
                    language: raw.language,
                    stars: formatNumber(raw.stargazers_count),
                    forks: formatNumber(raw.forks_count),
                    issues: formatNumber(raw.open_issues_count),
                    hasIssues: raw.has_issues,
                    homepage: raw.homepage,
                    starsUrl: '//github.com/' + raw.full_name + '/stargazers',
                    forksUrl: '//github.com/' + raw.full_name + '/network',
                    issuesUrl: '//github.com/' + raw.full_name + '/issues'
                };
                if (raw.parent) {
                    data.parent = {
                        repo: raw.parent.full_name,
                        url: raw.parent.html_url
                    };
                }
            }

            // https://developer.github.com/v3/users/#get-a-single-user
            let html = Mustache.render(CARD_TPL[type], data);

            return $(html);
        }

        const ERROR_TPL =
            '<div class="hovercard hovercard-error">\
                <p><strong><span class="octicon octicon-issue-opened"></span>{{title}}</strong></p>\
                {{#message}}<p>{{{message}}}</p>{{/message}}\
            </div>';

        function getErrorHTML(error) {
            let html = Mustache.render(ERROR_TPL, error);
            return $(html);
        }

        let cache = {
            user: {},
            repo: {}
        };
        const CREATE_TOKEN_PATH = '//github.com/settings/tokens/new';
        const API_PREFIX = {
            user: '//api.github.com/users/',
            repo: '//api.github.com/repos/'
        };

        let tipSelector = '.' + USER_KEY  + ':not(.tooltipstered), .' + REPO_KEY + ':not(.tooltipstered)';
        $(tipSelector).tooltipster({
            updateAnimation: false,
            functionBefore: function (elem, done) {
                elem.tooltipster('content', $('<span class="loading"></span>'));
                let username = elem.data(USER_KEY);
                let fullRepo = elem.data(REPO_KEY);
                let type = username ? 'user' : 'repo';
                let value = username || fullRepo;

                let raw = cache[type][value];
                if (raw) {
                    elem.tooltipster('content', getCardHTML(type, raw));
                } else {
                    let requestOptions = {
                        url: API_PREFIX[type] + value,
                        datatype: 'json'
                    };

                    let token = localStorage.getItem(TOKEN_KEY);
                    if (token) {
                        requestOptions.headers = {
                            Authorization: 'token ' + token
                        };
                    }
                    $.ajax(requestOptions)
                        .done(function (raw) {
                            cache[type][value] = raw;
                            elem.tooltipster('content', getCardHTML(type, raw));
                        })
                        .fail(function (xhr) {
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
                                    message = '<a href="' + CREATE_TOKEN_PATH + '" class="token-link" target="_blank">Create a new access token</a>, paste it back here and try again.';
                                    needToken = true;
                                    break;
                                case 403:
                                    if (xhr.getAllResponseHeaders().indexOf('X-RateLimit-Remaining: 0') !== -1) {
                                        title= 'API limit exceeded';
                                        if (!localStorage.getItem(TOKEN_KEY)) {
                                            message = 'API rate limit exceeded for current IP. <a href="' + CREATE_TOKEN_PATH + '" class="token-link" target="_blank">Create a new access token</a> and paste it back here to get a higher rate limit.';
                                        }
                                    } else {
                                        title = 'Forbidden';
                                        message = 'You are not allowed to access GitHub API. <a href="' + CREATE_TOKEN_PATH + '" class="token-link" target="_blank">Create a new access token</a>, paste it back here and try again.';
                                    }
                                    needToken = true;
                                    break;
                                default:
                                    title = 'Error';
                                    message = Mustache.escape(xhr.responseJSON.message || '');
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
                done();
            },
            interactive: true
        });
    }

    const FORM_TPL =
        '<div class="hovercard-overlay">\
            <form>\
                <p>\
                    <input class="hovercard-token" type="text" placeholder="Paste access token here..." size="40" />\
                    <button class="btn btn-primary hovercard-save">Save</button>\
                    <button class="btn hovercard-cancel">Cancel</button>\
                </p>\
            </form>\
        </div>';

    let tokenForm = $(FORM_TPL);
    let tokenField = tokenForm.find('.hovercard-token');
    tokenForm.find('button').on('click', function (e) {
        if ($(e.target).is('.hovercard-save') && tokenField.val()) {
            localStorage.setItem(TOKEN_KEY, tokenField.val());
        }
        tokenForm.detach();
        return false;
    });
    tokenForm.find('.hovercard-cancel').on('click')
    $('body').on('click', '.token-link', function () {
        tokenForm.appendTo($('body'));
    });

    let emojiURLs;
    $.getJSON(self.options.emojiURL).done(function (emojis) {
        emojiURLs = emojis;
        extract();
    });
});
