$(() => {
    'use strict';

    const GH_DOMAIN = location.host;

    const TOOLTIP_RELATED = '.tooltipster-base, .tooltipster-sizer';
    const DEFAULT_TARGET = document.body;
    let isExtracting = false;
    let observer = new MutationObserver(mutations => {
        if (isExtracting) {
            return;
        }
        mutations.forEach(mutation => {
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
      'login', 'watching', 'new', 'integrations', 'pricing',
      'personal', 'business', 'open-source'
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
        '.hovercard a',
        '.repo-nav a',
        '.tabnav-tab',
        '.discussion-item .timestamp',
        '.file-wrap a',
        '.reponav-item' // new UI
    ].join(', ');

    // Octicons in SVG
    const OCTICONS = {"alert":{"width":"16","height":"16","d":"M15.72 12.5l-6.85-11.98C8.69 0.21 8.36 0.02 8 0.02s-0.69 0.19-0.87 0.5l-6.85 11.98c-0.18 0.31-0.18 0.69 0 1C0.47 13.81 0.8 14 1.15 14h13.7c0.36 0 0.69-0.19 0.86-0.5S15.89 12.81 15.72 12.5zM9 12H7V10h2V12zM9 9H7V5h2V9z"},"code":{"width":"14","height":"16","d":"M9.5 3l-1.5 1.5 3.5 3.5L8 11.5l1.5 1.5 4.5-5L9.5 3zM4.5 3L0 8l4.5 5 1.5-1.5L2.5 8l3.5-3.5L4.5 3z"},"pull":{"width":"12","height":"16","d":"M11 11.28c0-1.73 0-6.28 0-6.28-0.03-0.78-0.34-1.47-0.94-2.06s-1.28-0.91-2.06-0.94c0 0-1.02 0-1 0V0L4 3l3 3V4h1c0.27 0.02 0.48 0.11 0.69 0.31s0.3 0.42 0.31 0.69v6.28c-0.59 0.34-1 0.98-1 1.72 0 1.11 0.89 2 2 2s2-0.89 2-2c0-0.73-0.41-1.38-1-1.72z m-1 2.92c-0.66 0-1.2-0.55-1.2-1.2s0.55-1.2 1.2-1.2 1.2 0.55 1.2 1.2-0.55 1.2-1.2 1.2zM4 3c0-1.11-0.89-2-2-2S0 1.89 0 3c0 0.73 0.41 1.38 1 1.72 0 1.55 0 5.56 0 6.56-0.59 0.34-1 0.98-1 1.72 0 1.11 0.89 2 2 2s2-0.89 2-2c0-0.73-0.41-1.38-1-1.72V4.72c0.59-0.34 1-0.98 1-1.72z m-0.8 10c0 0.66-0.55 1.2-1.2 1.2s-1.2-0.55-1.2-1.2 0.55-1.2 1.2-1.2 1.2 0.55 1.2 1.2z m-1.2-8.8c-0.66 0-1.2-0.55-1.2-1.2s0.55-1.2 1.2-1.2 1.2 0.55 1.2 1.2-0.55 1.2-1.2 1.2z"},"info":{"width":"14","height":"16","d":"M6.3 5.69c-0.19-0.19-0.28-0.42-0.28-0.7s0.09-0.52 0.28-0.7 0.42-0.28 0.7-0.28 0.52 0.09 0.7 0.28 0.28 0.42 0.28 0.7-0.09 0.52-0.28 0.7-0.42 0.3-0.7 0.3-0.52-0.11-0.7-0.3z m1.7 2.3c-0.02-0.25-0.11-0.48-0.31-0.69-0.2-0.19-0.42-0.3-0.69-0.31h-1c-0.27 0.02-0.48 0.13-0.69 0.31-0.2 0.2-0.3 0.44-0.31 0.69h1v3c0.02 0.27 0.11 0.5 0.31 0.69 0.2 0.2 0.42 0.31 0.69 0.31h1c0.27 0 0.48-0.11 0.69-0.31 0.2-0.19 0.3-0.42 0.31-0.69h-1V7.98z m-1-5.69C3.86 2.3 1.3 4.84 1.3 7.98s2.56 5.7 5.7 5.7 5.7-2.55 5.7-5.7-2.56-5.69-5.7-5.69m0-1.31c3.86 0 7 3.14 7 7S10.86 14.98 7 14.98 0 11.86 0 7.98 3.14 0.98 7 0.98z"},"closed":{"width":"16","height":"16","d":"M7 10h2v2H7V10z m2-6H7v5h2V4z m1.5 1.5l-1 1 2.5 2.5 4-4.5-1-1-3 3.5-1.5-1.5zM8 13.7c-3.14 0-5.7-2.56-5.7-5.7s2.56-5.7 5.7-5.7c1.83 0 3.45 0.88 4.5 2.2l0.92-0.92C12.14 2 10.19 1 8 1 4.14 1 1 4.14 1 8s3.14 7 7 7 7-3.14 7-7l-1.52 1.52c-0.66 2.41-2.86 4.19-5.48 4.19z"},"opened":{"width":"14","height":"16","d":"M7 2.3c3.14 0 5.7 2.56 5.7 5.7S10.14 13.7 7 13.7 1.3 11.14 1.3 8s2.56-5.7 5.7-5.7m0-1.3C3.14 1 0 4.14 0 8s3.14 7 7 7 7-3.14 7-7S10.86 1 7 1z m1 3H6v5h2V4z m0 6H6v2h2V10z"},"link":{"width":"16","height":"16","d":"M4 9h1v1h-1c-1.5 0-3-1.69-3-3.5s1.55-3.5 3-3.5h4c1.45 0 3 1.69 3 3.5 0 1.41-0.91 2.72-2 3.25v-1.16c0.58-0.45 1-1.27 1-2.09 0-1.28-1.02-2.5-2-2.5H4c-0.98 0-2 1.22-2 2.5s1 2.5 2 2.5z m9-3h-1v1h1c1 0 2 1.22 2 2.5s-1.02 2.5-2 2.5H9c-0.98 0-2-1.22-2-2.5 0-0.83 0.42-1.64 1-2.09v-1.16c-1.09 0.53-2 1.84-2 3.25 0 1.81 1.55 3.5 3 3.5h4c1.45 0 3-1.69 3-3.5s-1.5-3.5-3-3.5z"},"location":{"width":"12","height":"16","d":"M6 0C2.69 0 0 2.5 0 5.5c0 4.52 6 10.5 6 10.5s6-5.98 6-10.5C12 2.5 9.31 0 6 0z m0 14.55C4.14 12.52 1 8.44 1 5.5 1 3.02 3.25 1 6 1c1.34 0 2.61 0.48 3.56 1.36 0.92 0.86 1.44 1.97 1.44 3.14 0 2.94-3.14 7.02-5 9.05z m2-9.05c0 1.11-0.89 2-2 2s-2-0.89-2-2 0.89-2 2-2 2 0.89 2 2z"},"organization":{"width":"14","height":"16","d":"M4.75 4.95c0.55 0.64 1.34 1.05 2.25 1.05s1.7-0.41 2.25-1.05c0.34 0.63 1 1.05 1.75 1.05 1.11 0 2-0.89 2-2s-0.89-2-2-2c-0.41 0-0.77 0.13-1.08 0.33C9.61 1 8.42 0 7 0S4.39 1 4.08 2.33c-0.31-0.2-0.67-0.33-1.08-0.33-1.11 0-2 0.89-2 2s0.89 2 2 2c0.75 0 1.41-0.42 1.75-1.05z m5.2-1.52c0.2-0.38 0.59-0.64 1.05-0.64 0.66 0 1.2 0.55 1.2 1.2s-0.55 1.2-1.2 1.2-1.17-0.53-1.19-1.17c0.06-0.19 0.11-0.39 0.14-0.59zM7 0.98c1.11 0 2.02 0.91 2.02 2.02s-0.91 2.02-2.02 2.02-2.02-0.91-2.02-2.02S5.89 0.98 7 0.98zM3 5.2c-0.66 0-1.2-0.55-1.2-1.2s0.55-1.2 1.2-1.2c0.45 0 0.84 0.27 1.05 0.64 0.03 0.2 0.08 0.41 0.14 0.59-0.02 0.64-0.53 1.17-1.19 1.17z m10 0.8H1c-0.55 0-1 0.45-1 1v3c0 0.55 0.45 1 1 1v2c0 0.55 0.45 1 1 1h1c0.55 0 1-0.45 1-1v-1h1v3c0 0.55 0.45 1 1 1h2c0.55 0 1-0.45 1-1V12h1v1c0 0.55 0.45 1 1 1h1c0.55 0 1-0.45 1-1V11c0.55 0 1-0.45 1-1V7c0-0.55-0.45-1-1-1zM3 13h-1V10H1V7h2v6z m7-2h-1V9h-1v6H6V9h-1v2h-1V7h6v4z m3-1h-1v3h-1V7h2v3z"},"forked":{"width":"10","height":"16","d":"M8 1c-1.11 0-2 0.89-2 2 0 0.73 0.41 1.38 1 1.72v1.28L5 8 3 6v-1.28c0.59-0.34 1-0.98 1-1.72 0-1.11-0.89-2-2-2S0 1.89 0 3c0 0.73 0.41 1.38 1 1.72v1.78l3 3v1.78c-0.59 0.34-1 0.98-1 1.72 0 1.11 0.89 2 2 2s2-0.89 2-2c0-0.73-0.41-1.38-1-1.72V9.5l3-3V4.72c0.59-0.34 1-0.98 1-1.72 0-1.11-0.89-2-2-2zM2 4.2c-0.66 0-1.2-0.55-1.2-1.2s0.55-1.2 1.2-1.2 1.2 0.55 1.2 1.2-0.55 1.2-1.2 1.2z m3 10c-0.66 0-1.2-0.55-1.2-1.2s0.55-1.2 1.2-1.2 1.2 0.55 1.2 1.2-0.55 1.2-1.2 1.2z m3-10c-0.66 0-1.2-0.55-1.2-1.2s0.55-1.2 1.2-1.2 1.2 0.55 1.2 1.2-0.55 1.2-1.2 1.2z"},"repo":{"width":"12","height":"16","d":"M4 9h-1v-1h1v1z m0-3h-1v1h1v-1z m0-2h-1v1h1v-1z m0-2h-1v1h1v-1z m8-1v12c0 0.55-0.45 1-1 1H6v2l-1.5-1.5-1.5 1.5V14H1c-0.55 0-1-0.45-1-1V1C0 0.45 0.45 0 1 0h10c0.55 0 1 0.45 1 1z m-1 10H1v2h2v-1h3v1h5V11z m0-10H2v9h9V1z"}};

    function getIcon(type, scale) {
        scale = scale || 1;
        var icon = OCTICONS[type];
        return `<svg class="octicon" width="${icon.width * scale}" height="${icon.height * scale}"
            viewBox="0 0 ${icon.width} ${icon.height}"><path d="${icon.d}" /></svg>`;
    }

    const CARD_TPL = {
        user: `
            <address class="hovercard">
                <img src="{{avatar}}&s=32" class="hovercard-avatar">
                <div class="hovercard-person">
                    <p><strong><a href="{{userUrl}}">{{loginName}}</a></strong>{{#isAdmin}} (Staff){{/isAdmin}}{{#isOrg}} <small>(Organization)</small>{{/isOrg}}</p>
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
                    {{#location}}<p>{{{icons.location}}}</span>{{location}}</p>{{/location}}
                    {{#company}}<p>{{{icons.organization}}}{{company}}</p>{{/company}}
                </div>
            </address>`,
        repo: `
            <div class="hovercard">
                <div class="hovercard-repo">
                    {{{icons.repo}}}
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
                    {{#desc}}<p class="hovercard-repo-desc">{{{icons.info}}}{{{.}}}</p>{{/desc}}
                    {{#homepage}}<p>{{{icons.link}}}<a href="{{.}}">{{.}}</a></p>{{/homepage}}
                    {{#language}}<p>{{{icons.code}}}{{.}}</p>{{/language}}
                </div>
            </div>`,
        issue: `
            <div class="hovercard">
                <div class="hovercard-issue">
                    <p><small>#{{number}}</small> <a href="{{issueUrl}}"><strong>{{title}}</strong></a></p>
                </div>
                <div class="hovercard-issue-meta">
                    <p><span class="state state-{{state}}">{{{icons.state}}}{{state}}</span><a href="{{userUrl}}">{{user}}</a> created on {{{createTime}}}</p>
                </div>
                {{#body}}<div class="hovercard-issue-body">{{{.}}}</div>{{/body}}
            </div>`,
        error: `
            <div class="hovercard hovercard-error">
                <p><strong>{{{icons.alert}}}{{title}}</strong></p>
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
                            <input class="hovercard-task-checker"
                                type="checkbox"${checked === 'x' ? ' checked' : ''}
                                disabled> ${remaining}`;
                    }))
                    .addClass('hovercard-task');
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
                    repo: getIcon(raw.parent ? 'forked' : 'repo', 1.5),
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
                    state: getIcon(raw.pull_request ? 'pull' : (raw.state === 'closed' ? 'closed' : 'opened'), 0.875)
                }
            };
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
    let tokenField = tokenForm.find('.hovercard-token');
    tokenForm.find('.hovercard-save').on('click', () => {
        let newToken = tokenField.val().trim();
        if (newToken) {
            localStorage.setItem(TOKEN_KEY, newToken);
            token = newToken;
        }
        tokenForm.detach();
        return false;
    });
    tokenForm.find('.hovercard-cancel').on('click', () => {
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
                    }
                    let requestOptions = {
                        url: API_PREFIX + apiPath,
                        dataType: 'json'
                    };

                    let authOptions = {};
                    if (token) {
                        authOptions = {
                            headers: {
                                Authorization: `token ${token}`
                            }
                        };
                    }

                    let handleError = function (xhr) {
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
                                    let response = xhr.responseJSON;
                                    if (type === EXTRACT_TYPE.REPO && response.block && response.block.reason === 'dmca') {
                                        title = 'Access blocked';
                                        message = 'Repository unavailable due to DMCA takedown.';
                                    } else {
                                        title = 'Forbidden';
                                        message = encodeHTML`You are not allowed to access GitHub API. <a href="${CREATE_TOKEN_PATH}" class="token-link" target="_blank">Create a new access token</a>, <a href="#" class="token-link">paste it back here</a> and try again.`;
                                    }
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

                    $.ajax(Object.assign(requestOptions, authOptions))
                        .done(raw => {
                            cache[type][value] = raw;

                            // further requests if necessary
                            switch(type) {
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
                                        }
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
                                                if (raw.state === 'closed' && pull.merged_at) {
                                                    raw.state = cache[type][value].state = 'merged';
                                                }
                                                if (!--todo) {
                                                    elem.tooltipster('content', getCardHTML(type, raw));
                                                }
                                            })
                                            .fail(handleError);
                                    }

                                    // wait for async handler
                                    if (todo) {
                                        return;
                                    }
                                }
                            }

                            elem.tooltipster('content', getCardHTML(type, raw));
                        })
                        .fail(handleError);
                }
            },
            interactive: true
        });

        if ('webkitTransform' in document.body.style) {
            // why? see https://github.com/iamceege/tooltipster/issues/491
            // use box-shadow instead to prevent weirder problem...
            tipped.css('box-shadow', '0 0 transparent');
        }

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
            })
        } else {
            extract();
        }

    }
});
