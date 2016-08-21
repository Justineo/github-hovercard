$(() => {
    'use strict';

    const GH_DOMAIN = location.host;

    const EXCLUDES = '.tooltipster-base, .tooltipster-sizer, .timestamp, .time';
    const DEFAULT_TARGET = document.body;
    let isExtracting = false;
    let observer = new MutationObserver(mutations => {
        if (isExtracting) {
            return;
        }
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                let target = mutation.target;
                if (!$(target).is(EXCLUDES)
                    && !$(target).parents(EXCLUDES).length
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
      'login', 'watching', 'new', 'integrations', 'pricing',
      'personal', 'business', 'open-source'
    ];

    const GH_RESERVED_REPO_NAMES = [
        'followers', 'following', 'repositories'
    ];

    const GH_USER_NAME_PATTERN = /^[a-z0-9]+$|^[a-z0-9](?:[a-z0-9](?!--)|-(?!-))*[a-z0-9]$/i;
    const GH_REPO_NAME_PATTERN = /^[a-z0-9\-_\.]+$/i;

    const TYPE_KEY = 'ghh-type';
    const VALUE_KEY = 'ghh-value';
    const EXTRACT_TYPE = {
        USER: 'user',
        REPO: 'repo',
        ISSUE: 'issue',
        COMMIT: 'commit',
        SKIP: 'skip'
    };

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
    const URL_COMMIT_PATTERN = `^https?:\\/\\/${GH_DOMAIN_PATTERN}\\/([^\\/\\?#]+)\\/([^\\/\\?#]+)\\/(?:pull\\/\\d+\\/commits|commit)\\/([0-9a-f]+)(?:[^\\/]*$|(?:[\\?#]|$))`;
    const SLUG_PATTERN = /([^\/\s]+)\/([^#@\s]+)(?:#(\d+)|@([0-9a-f]+))?/;

    const STRATEGIES = {
        '.repo-list-name .prefix': EXTRACTOR.TEXT_USER,
        '.fork-flag a': EXTRACTOR.SLUG,
        'img.avatar': EXTRACTOR.ALT_USER,
        'img.from-avatar': EXTRACTOR.ALT_USER,
        'img.gravatar': EXTRACTOR.ALT_USER,
        '.leaderboard-gravatar': EXTRACTOR.ALT_USER,
        'img.author-gravatar': EXTRACTOR.ALT_USER,
        'img.author-avatar': EXTRACTOR.ALT_USER,
        'img.avatar-child': EXTRACTOR.ALT_USER,
        'img.timeline-comment-avatar': EXTRACTOR.ALT_USER,
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
        '.commit-meta a.commit-author': EXTRACTOR.TEXT_USER,
        '.author-name a': EXTRACTOR.TEXT_USER,
        '.author-name span': EXTRACTOR.TEXT_USER,
        '.release-authorship a:first-of-type': EXTRACTOR.TEXT_USER,
        '.table-list-cell-avatar img': EXTRACTOR.ALT_USER,
        '.author': EXTRACTOR.TEXT_USER,
        '.codesearch-results .repo-list-name a': EXTRACTOR.SLUG,
        '.code-list-item > a ~ .title a:first-child': EXTRACTOR.SLUG,
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
        '.ghh a',
        '.repo-nav a',
        '.tabnav-tab',
        '.discussion-item .timestamp',
        '.file-wrap .content a',
        '.reponav-item',
        '.issue-pr-status a',
        '.commits-comments-link',
        '.issues-listing .d-table-cell:last-child a'
    ].join(', ');

    // Octicons in SVG
    const OCTICONS = '__OCTICONS__';

    function getIcon(type, scale) {
        scale = scale || 1;
        var icon = OCTICONS[type];
        return `<svg class="octicon" width="${icon.width * scale}" height="${icon.height * scale}"
            viewBox="0 0 ${icon.width} ${icon.height}"><path d="${icon.d}" /></svg>`;
    }

    const CARD_TPL = {
        user: `
            <address class="ghh">
                <img src="{{avatar}}&s=32" class="ghh-avatar">
                <div class="ghh-person">
                    <p><strong><a href="{{userUrl}}">{{loginName}}</a></strong>{{#isAdmin}} (Staff){{/isAdmin}}{{#isOrg}} <small>(Organization)</small>{{/isOrg}}</p>
                    {{#realName}}<p>{{realName}}</p>{{/realName}}
                </div>
                <div class="ghh-more">
                    {{^isOrg}}<div class="ghh-stats">
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
                    {{#location}}<p>{{{icons.location}}}</span>{{location}}</p>{{/location}}
                    {{#company}}<p>{{{icons.organization}}}{{company}}</p>{{/company}}
                </div>
            </address>`,
        repo: `
            <div class="ghh">
                <div class="ghh-repo">
                    {{{icons.repo}}}
                    <p><a href="{{ownerUrl}}">{{owner}}</a> / <strong><a href="{{repoUrl}}">{{repo}}</a></strong></p>
                    {{#parent}}<p><span>forked from <a href="{{url}}">{{repo}}</a></span></p>{{/parent}}
                </div>
                <div class="ghh-more">
                    <div class="ghh-stats">
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
                    {{#desc}}<p class="ghh-repo-desc">{{{icons.info}}}{{{.}}}</p>{{/desc}}
                    {{#homepage}}<p>{{{icons.link}}}<a href="{{.}}">{{.}}</a></p>{{/homepage}}
                    {{#language}}<p>{{{icons.code}}}{{.}}</p>{{/language}}
                </div>
            </div>`,
        issue: `
            <div class="ghh">
                <div class="ghh-issue">
                    <p><span class="issue-number">#{{number}}</span> <a href="{{issueUrl}}" title="{{title}}"><strong>{{title}}</strong></a></p>
                </div>
                <div class="ghh-issue-meta">
                    <p><span class="state state-{{state}}">{{{icons.state}}}{{state}}</span><a href="{{userUrl}}">{{user}}</a> created on {{{createTime}}}</p>
                </div>
                {{#isPullRequest}}<div class="ghh-pull-meta">
                    <p>{{{icons.commit}}} {{commits}} commit{{^isSingleCommit}}s{{/isSingleCommit}}{{{icons.diff}}} {{changedFiles}} file{{^isSingleFile}}s{{/isSingleFile}} changed
                        <span class="diffstat">
                            <span class="text-diff-added">+{{additions}}</span>
                            <span class="text-diff-deleted">−{{deletions}}</span>
                        </span>
                    </p>
                    <p class="ghh-branch"><span class="commit-ref" title="{{headUser}}:{{headRef}}"><span class="user">{{headUser}}</span>:{{headRef}}</span><span>{{{icons.arrow}}}</span><span class="commit-ref" title="{{baseUser}}:{{baseRef}}"><span class="user">{{baseUser}}</span>:{{baseRef}}</span></p>
                </div>{{/isPullRequest}}
                {{#body}}<div class="ghh-issue-body">{{{.}}}</div>{{/body}}
            </div>`,
        commit: `
            <div class="ghh">
                <div class="ghh-commit">
                    <p><a href="{{commitUrl}}" title="{{title}}"><strong>{{title}}</strong></a></p>
                </div>
                {{#body}}<pre class="ghh-commit-body">{{.}}</pre>{{/body}}
                <p class="ghh-commit-author">{{#authorUrl}}<a href="{{.}}"><strong>{{author}}</strong></a>{{/authorUrl}}{{^authorUrl}}<strong title="{{authorEmail}}">{{author}}</strong>{{/authorUrl}} committed{{#isGitHub}} on <strong>GitHub</strong>{{/isGitHub}}{{^isGitHub}}{{#committer}} with {{#committerUrl}}<a href="{{.}}"><strong>{{committer}}</strong></a>{{/committerUrl}}{{^committerUrl}}<strong title="{{committerEmail}}">{{committer}}</strong>{{/committerUrl}}{{/committer}}{{/isGitHub}} on {{{authorTime}}}</p>
                <div class="ghh-more">
                    <p class="ghh-commit-sha">{{{icons.commit}}} <code>{{sha}}</code></p>
                    {{#branch}}<p>{{{icons.branch}}} <a href="/{{fullRepo}}/tree/{{branch}}"><strong>{{branch}}</strong></a>{{#pull}} (<a href="/{{fullRepo}}/pull/{{.}}">#{{.}}</a>){{/pull}}</p>
                    {{#mainTag}}<p class="ghh-tags">{{{icons.tag}}} <a href="/{{fullRepo}}/releases/tag/{{.}}"><strong>{{.}}</strong></a>{{#otherTags}}, <a href="/{{fullRepo}}/releases/tag/{{.}}">{{.}}</a>{{/otherTags}}</p>{{/mainTag}}{{/branch}}
                    <p class="ghh-commit-meta">{{{icons.diff}}} {{changedFiles}} file{{^isSingleFile}}s{{/isSingleFile}} changed
                        <span class="diffstat">
                            <span class="text-diff-added">+{{additions}}</span>
                            <span class="text-diff-deleted">−{{deletions}}</span>
                        </span>
                    </p>
                </div>
            </div>`,
        error: `
            <div class="ghh ghh-error">
                <p><strong>{{{icons.alert}}}{{title}}</strong></p>
                {{#message}}<p>{{{message}}}</p>{{/message}}
            </div>`,
        form: `
            <div class="ghh-overlay">
                <form>
                    <p>
                        <input class="ghh-token" type="text" placeholder="Paste access token here..." size="40" />
                        <button class="btn btn-primary ghh-save">Save</button>
                        <button class="btn ghh-cancel">Cancel</button>
                    </p>
                </form>
            </div>`
    };

    const CREATE_TOKEN_PATH = `//${GH_DOMAIN}/settings/tokens/new`;
    const IS_ENTERPRISE = GH_DOMAIN !== 'github.com';
    const API_PREFIX = IS_ENTERPRISE ? `//${GH_DOMAIN}/api/v3/` : `//api.${GH_DOMAIN}/`;
    const SITE_PREFIX = `//${GH_DOMAIN}/`;

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
        return `ghh-${type}-x`;
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
        let t = new Date(time);
        let formatted = MONTH_NAMES[t.getMonth()] + ' ' + t.getDate() + ', ' + t.getFullYear();
        return encodeHTML`<time datetime="${time}">${formatted}</time>`;
    }

    function replaceEmoji(text) {
        return text.replace(/:([a-z0-9+\-_]+):/ig, (match, key) => {
            let url = emojiMap[key];
            if (!url) {
                return match;
            }
            return `<img class="emoji" title="${match}" alt="${match}"
                src="${url}" width="18" height="18">`;
        });
    }

    function replaceCheckbox(html) {
        const TASK_PATTERN = /^\[([ x])\] (.*)/;
        let fragment = $('<div>').html(html);
        fragment.find('li').each(function () {
            let content = $(this).html();
            if (TASK_PATTERN.test(content)) {
                $(this)
                    .html(content.replace(TASK_PATTERN, (match, checked, remaining) => {
                        return `
                            <input class="ghh-task-checker"
                                type="checkbox"${checked === 'x' ? ' checked' : ''}
                                disabled> ${remaining}`;
                    }))
                    .addClass('ghh-task');
            }
        });

        return fragment.html();
    }

    function replacePlugins(text) {
        const BOUNTYSOURCE_PATTERN = /<\/?bountysource-plugin>/g;
        var result = text;

        // deal with Bountysource
        result = result.replace(BOUNTYSOURCE_PATTERN, '');

        return result;
    }

    function replaceLink(text) {
        return text.replace(/\b(https?:\/\/[^\s]+)/ig, `<a href="$1">$1</a>`);
    }

    // Code via underscore's _.compose
    function compose() {
        var args = arguments;
        var start = args.length - 1;
        return function() {
            var i = start;
            var result = args[start].apply(this, arguments);
            while (i--) {
                result = args[i].call(this, result);
            }
            return result;
        };
    };

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
        let result = pieces[0];
        let substitutions = [].slice.call(arguments, 1);
        for (let i = 0; i < substitutions.length; ++i) {
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
                reposUrl: `//${GH_DOMAIN}/${raw.login}?tab=repositories`,
                icons: {
                    location: getIcon('location', 0.875),
                    organization: getIcon('organization', 0.875)
                }
            };
        } else if (type === EXTRACT_TYPE.REPO) {
            data = {
                owner: raw.owner.login,
                ownerAvatar: raw.owner.avatar_url,
                ownerUrl: raw.owner.html_url,
                repo: raw.name,
                repoUrl: raw.html_url,
                desc: raw.description ? compose(replaceEmoji, replaceLink)(encodeHTML`${raw.description}`) : '',
                language: raw.language,
                stars: formatNumber(raw.stargazers_count),
                forks: formatNumber(raw.forks_count),
                issues: formatNumber(raw.open_issues_count),
                hasIssues: raw.has_issues,
                homepage: raw.homepage
                    ? raw.homepage.match(/^https?:\/\//) ? raw.homepage : `http://${raw.homepage}`
                    : null,
                starsUrl: `//${GH_DOMAIN}/${raw.full_name}/stargazers`,
                forksUrl: `//${GH_DOMAIN}/${raw.full_name}/network`,
                issuesUrl: `//${GH_DOMAIN}/${raw.full_name}/issues`,
                icons: {
                    repo: getIcon(raw.parent ? 'repo-forked' : 'repo', 1.5),
                    info: getIcon('info', 0.875),
                    link: getIcon('link', 0.875),
                    code: getIcon('code', 0.875)
                }
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
                body: raw.bodyHTML,
                issueUrl: raw.html_url,
                number: raw.number,
                isPullRequest: !!raw.pull_request,
                isClosed: raw.state === 'closed',
                userUrl: raw.user.html_url,
                user: raw.user.login,
                state: raw.state,
                avatar: raw.user.avatar_url,
                createTime: formatTime(raw.created_at),
                icons: {
                    state: getIcon(raw.pull_request ? 'git-pull-request' : (raw.state === 'closed' ? 'issue-closed' : 'issue-opened'), 0.875),
                    commit: getIcon('git-commit', 0.875),
                    arrow: getIcon('arrow-right', 0.875),
                    diff: getIcon('diff', 0.875)
                }
            };
            if (raw.pull_request) {
                Object.assign(data, {
                    headRef: raw.head.ref,
                    headUser: raw.head.user.login,
                    baseRef: raw.base.ref,
                    baseUser: raw.base.user.login,
                    commits: raw.commits,
                    additions: raw.additions,
                    deletions: raw.deletions,
                    changedFiles: raw.changed_files,
                    isSingleCommit: raw.commits === 1,
                    isSingleFile: raw.changed_files === 1
                })
            }
        } else if (type === EXTRACT_TYPE.COMMIT) {
            let lines = raw.commit.message.split('\n\n');
            let committer;
            if (raw.committer.login && raw.author.login) {
                committer = raw.committer.login === raw.author.login ? null : raw.committer.login;
            } else if (!raw.committer.login && !raw.author.login) {
                committer = (raw.committer.name === raw.author.name && raw.committer.email === raw.author.email)
                    ? null : raw.committer.name;
            } else {
                committer = raw.committer.login || raw.committer.name;
            }
            data = {
                sha: raw.sha,
                title: lines[0],
                body: lines.slice(1).join('\n\n'),
                commitUrl: raw.html_url,
                author: raw.author.login || raw.author.name,
                authorUrl: raw.author.html_url,
                authorEmail: raw.author.email,
                authorTime: formatTime(raw.commit.author.date),
                committer: committer,
                committerUrl: raw.committer.html_url,
                committerEmail: raw.committer.email,
                additions: raw.stats.additions,
                deletions: raw.stats.deletions,
                changedFiles: raw.files.length,
                isSingleFile: raw.files.length === 1,
                isGitHub: raw.committer.login === 'web-flow',
                branch: raw.branch,
                pull: raw.pull,
                mainTag: raw.mainTag,
                otherTags: raw.otherTags,
                fullRepo: raw.fullRepo,
                icons: {
                    branch: getIcon('git-branch', 0.875),
                    tag: getIcon('tag', 0.875),
                    commit: getIcon('git-commit', 0.875),
                    diff: getIcon('diff', 0.875)
                }
            }
        }

        let html = Mustache.render(CARD_TPL[type], data);
        return $(html);
    }

    function getErrorHTML(error) {
        let html = Mustache.render(CARD_TPL.error, error);
        return $(html);
    }

    // prepare token form
    let tokenForm = $(CARD_TPL.form);
    let tokenField = tokenForm.find('.ghh-token');
    tokenForm.find('.ghh-save').on('click', () => {
        let newToken = tokenField.val().trim();
        if (newToken) {
            localStorage.setItem(TOKEN_KEY, newToken);
            token = newToken;
        }
        tokenForm.detach();
        return false;
    });
    tokenForm.find('.ghh-cancel').on('click', () => {
        tokenForm.detach();
        return false;
    });
    $('body').on('click', '.token-link', () => {
        tokenForm.appendTo($('body'));
        tokenField.focus();
    });

    // prepare cache objects
    let cache = {
        user: {},
        repo: {},
        issue: {},
        commit: {}
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
        selectors.forEach(selector => {
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
                let commit; // {{commit}}
                let fullCommit; // {{user}}/{{repo}}@{{commit}}
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
                        commit = trim(match && match[4]);
                        if (username && repo) {
                            fullRepo = username + '/' + repo;

                            // special case for code search highlight
                            // save contents before replacing
                            let contents = elem.find('em').length
                                ? elem.contents().map(function (i) {
                                    let text = i === 0 ? (this.textContent.split('/')[1] || '') : this.textContent;
                                    // whitelisting <em>s for safety
                                    return this.nodeName.toLowerCase() === 'em'
                                        ? `<em>${text}</em>`
                                        : text;
                                }).toArray().join('')
                                : null;

                            if (issue) {
                                elem.html(slug.replace('#' + issue, encodeHTML`#<span>${issue}</span>`));
                                slug = elem.html();
                            }
                            if (commit) {
                                elem.html(slug.replace('@' + commit, encodeHTML`@<span>${commit}</span>`));
                                slug = elem.html();
                            }

                            let repoContents = contents || repo; // safe HTML or plain text
                            if (username === me || username === current) {
                                elem.html(slug.replace(fullRepo, encodeHTML`${username}/<span>` + repoContents + '</span>'));
                                markExtracted(elem.children().first(), EXTRACT_TYPE.REPO, fullRepo);
                            } else {
                                elem.html(slug.replace(fullRepo, encodeHTML`<span>${username}</span>/<span>` + repoContents + '</span>'));
                                markExtracted(elem.children().first(), EXTRACT_TYPE.USER, username);
                                markExtracted(elem.children().first().next(), EXTRACT_TYPE.REPO, fullRepo);
                            }
                            if (issue) {
                                markExtracted(elem.children().last(), EXTRACT_TYPE.ISSUE, fullRepo + '#' + issue);
                            }
                            if (commit) {
                                markExtracted(elem.children().last(), EXTRACT_TYPE.COMMIT, fullRepo + '@' + commit);
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
                            if (!username) {
                                match = href.match(URL_COMMIT_PATTERN);
                                username = trim(match && match[1]);
                                repo = trim(match && match[2]);
                                commit = trim(match && match[3]);
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
                            if (commit) {
                                fullCommit = `${username}/${repo}@${commit}`;
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
                if (fullCommit) {
                    markExtracted(elem, EXTRACT_TYPE.COMMIT, fullCommit);
                } else if (fullIssue) {
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

        let tipped = $(tipSelector);
        tipped.tooltipster({
            updateAnimation: false,
            contentAsHTML: true,
            debug: false,
            delay: cardOptions.delay,
            // trigger: 'click',
            functionBefore: (me, event) => {
                let elem = $(event.origin);
                elem.tooltipster('content', $('<span class="loading"></span>'));
                let type = elem.data(TYPE_KEY);
                let value = elem.data(VALUE_KEY);

                let raw = cache[type][value];
                if (raw) {
                    elem.tooltipster('content', getCardHTML(type, raw));
                } else {
                    let apiPath;
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
                        case EXTRACT_TYPE.COMMIT: {
                            let values = value.split('@');
                            let fullRepo = values[0];
                            let commit = values[1];
                            apiPath = `repos/${fullRepo}/commits/${commit}`;
                            break;
                        }
                    }
                    let baseOptions = {
                        url: API_PREFIX + apiPath,
                        dataType: 'json'
                    };

                    let isRetry = false;
                    let handleError = function (xhr) {
                        let status = xhr.status;
                        let title = '';
                        let message = '';
                        let needToken = false;

                        switch (status) {
                            case 0:
                                if (isRetry) {
                                    title = 'Connection error';
                                    message = 'Please try again later.';
                                } else {
                                    // next request should be retry
                                    isRetry = true;
                                    request();
                                    return;
                                }
                                break;
                            case 401:
                                title = 'Invalid token';
                                message = encodeHTML`<a href="${CREATE_TOKEN_PATH}" class="token-link" target="_blank">Create a new access token</a>, <a href="#" class="token-link">paste it back here</a> and try again.`;
                                needToken = true;
                                break;
                            case 403:
                                if (xhr.getAllResponseHeaders().indexOf('X-RateLimit-Remaining: 0') !== -1) {
                                    title = 'API limit exceeded';
                                    if (!localStorage.getItem(TOKEN_KEY)) {
                                        message = encodeHTML`API rate limit exceeded for current IP. <a href="${CREATE_TOKEN_PATH}" class="token-link" target="_blank">Create a new access token</a> and <a href="#" class="token-link">paste it back here</a> to get a higher rate limit.`;
                                    }
                                } else {
                                    title = 'Forbidden';
                                    message = encodeHTML`You are not allowed to access GitHub API. <a href="${CREATE_TOKEN_PATH}" class="token-link" target="_blank">Create a new access token</a>, <a href="#" class="token-link">paste it back here</a> and try again.`;
                                }
                                needToken = true;
                                break;
                            case 404:
                                title = 'Not found';
                                if (type === EXTRACT_TYPE.REPO || type === EXTRACT_TYPE.ISSUE) {
                                    message = encodeHTML`The repository doesn\'t exist or is private. <a href="${CREATE_TOKEN_PATH}" class="token-link" target="_blank">Create a new access token</a>, <a href="#" class="token-link">paste it back here</a> and try again.`;
                                    needToken = true;
                                } else if (type === EXTRACT_TYPE.USER) {
                                    message = `The user doesn't exist.`;
                                }
                                break;
                            case 451: {
                                let response = xhr.responseJSON;
                                if (type === EXTRACT_TYPE.REPO && response.block && response.block.reason === 'dmca') {
                                    title = 'Access blocked';
                                    message = encodeHTML`Repository access blocked due to DMCA takedown. See the <a href="${response.block.html_url}" target="_blank">takedown notice</a>.`;
                                }
                                break;
                            }
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
                            needToken: needToken,
                            icons: {
                                alert: getIcon('alert')
                            }
                        };
                        elem.tooltipster('content', getErrorHTML(error));
                    }

                    let request = function () {
                        let authOptions = {};
                        if (token && !isRetry) {
                            authOptions = {
                                headers: {
                                    Authorization: `token ${token}`
                                }
                            };
                        }

                        let requestOptions = Object.assign({}, baseOptions, authOptions);

                        $.ajax(requestOptions)
                            .done(raw => {
                                cache[type][value] = raw;

                                // further requests if necessary
                                switch (type) {
                                    case EXTRACT_TYPE.ISSUE: {
                                        let todo = 0;
                                        if (raw.body) {
                                            todo++;
                                            let options = {
                                                url: API_PREFIX + 'markdown',
                                                method: 'POST',
                                                contentType: 'application/json',
                                                dataType: 'text',
                                                data: JSON.stringify({
                                                    text: raw.body,
                                                    mode: 'gfm',
                                                    context: value.split('#')[0]
                                                })
                                            };
                                            $.ajax(Object.assign({}, requestOptions, options))
                                                .done(html => {
                                                    raw.bodyHTML = html;
                                                    if (!--todo) {
                                                        elem.tooltipster('content', getCardHTML(type, raw));
                                                    }
                                                })
                                                .fail(handleError);
                                        }
                                        if (raw.pull_request) {
                                            todo++;
                                            let prPath = apiPath.replace(/\/issues\/(\d+)$/, '/pulls/$1');
                                            let options = {
                                                url: API_PREFIX + prPath,
                                                dataType: 'json'
                                            };
                                            $.ajax(Object.assign({}, requestOptions, options))
                                                .done(pull => {
                                                    let extra = {
                                                        commits: pull.commits,
                                                        additions: pull.additions,
                                                        deletions: pull.deletions,
                                                        changed_files: pull.changed_files,
                                                        head: pull.head,
                                                        base: pull.base
                                                    };
                                                    if (pull.merged) {
                                                        extra.state = 'merged';
                                                    }
                                                    Object.assign(raw, extra);
                                                    Object.assign(cache[type][value], extra);
                                                    if (!--todo) {
                                                        elem.tooltipster('content', getCardHTML(type, raw));
                                                    }
                                                })
                                                .fail(handleError);
                                        }

                                        return;
                                    }
                                    case EXTRACT_TYPE.COMMIT: {
                                        let [fullRepo, commit] = value.split('@');
                                        let commitPagePath = `${fullRepo}/branch_commits/${commit}`;
                                        raw.fullRepo = fullRepo;
                                        raw.author = raw.author || raw.commit.author;
                                        raw.committer = raw.committer || raw.commit.committer;
                                        let options = {
                                            url: SITE_PREFIX + commitPagePath,
                                            headers: {
                                                'X-PJAX': 'true'
                                            },
                                            dataType: 'html'
                                        };
                                        $.ajax(Object.assign(options))
                                            .done(html => {
                                                let branches = $(`<div>${html}</div>`);
                                                raw.branch = branches.find('.branch a').text();
                                                raw.pull = branches.find('.pull-request a').text().substring(1);
                                                let tags = branches.find('.branches-tag-list a').map(function () {
                                                    return this.textContent;
                                                }).get();
                                                if (tags.length) {
                                                    raw.mainTag = tags[0];
                                                    raw.otherTags = tags.slice(1);
                                                }

                                                elem.tooltipster('content', getCardHTML(type, raw));
                                            });

                                        return;
                                    }
                                }

                                elem.tooltipster('content', getCardHTML(type, raw));
                            })
                            .fail(handleError);
                    };
                    request();
                }
            },
            interactive: true
        });

        if ('webkitTransform' in document.body.style) {
            // why? see https://github.com/iamceege/tooltipster/issues/491
            // use box-shadow instead to prevent weirder problem...
            tipped.css('box-shadow', '0 0 transparent');
        }

        // disable original title tooltips
        tipped.attr('title', '');

        // block original tooltips
        // see https://github.com/Justineo/github-hovercard/issues/30
        const ORGANIC_TOOLTIP_CLASS = 'tooltipped';
        tipped.filter(`.${ORGANIC_TOOLTIP_CLASS}`).removeClass(ORGANIC_TOOLTIP_CLASS);
        tipped.parents(`.${ORGANIC_TOOLTIP_CLASS}`).removeClass(ORGANIC_TOOLTIP_CLASS);

        // Listen for future mutations but not ones happens
        // in current extraction process
        setTimeout(() => {
            isExtracting = false;
        }, 0);
    }

    let emojiMap = '__EMOJI_DATA__';

    const TOKEN_KEY = 'hovercard-token';
    let token = '';
    let chrome = window.chrome;

    let cardOptions = {
        delay: 200
    };

    // Revert to localStorage
    // May switch back to chrome.storage when options are properly designed
    // In Firefox options are not so flexible so keep tokens in localStorage
    if (chrome && chrome.storage) {
        let storage = chrome.storage.sync || chrome.storage.local;
        storage.get({token: '', delay: 0}, item => {
            token = item.token;
            if (token) {
                localStorage.setItem(TOKEN_KEY, token);
                storage.remove('token');
            } else {
                token = localStorage.getItem(TOKEN_KEY);
            }

            // Other options
            let delay = parseFloat(item.delay);
            if (!isNaN(delay)) {
                cardOptions.delay = delay;
            }
            extract();
        });
    } else {
        token = localStorage.getItem(TOKEN_KEY);

        // Firefox options
        if (self.port) {
            self.port.on('prefs', ({ delay }) => {
                if (!isNaN(delay)) {
                    cardOptions.delay = delay;
                }
                extract();
            });
        } else {
            extract();
        }

    }
});
