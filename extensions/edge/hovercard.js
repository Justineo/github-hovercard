document.addEventListener('DOMContentLoaded', () => {
  'use strict'

  const GH_DOMAIN = location.host
  const MAX_MUTATIONS = 3

  const EXCLUDES = [
    '.tooltipster-base',
    '.tooltipster-sizer',
    '.timestamp',
    '.time',
    '.octotree_sidebar',
    'time-ago',
    'relative-time',
    '.user-status-container',
    '#files_bucket',
    '.changed_href',
    '.added_href'
  ].join(',')

  const DEFAULT_TARGET = document.body

  function isExclude(target) {
    return (
      $(target).is(EXCLUDES) ||
      $(target).parents(EXCLUDES).length ||
      $(target).is(DEFAULT_TARGET)
    )
  }

  let taskQueue = []

  function queueTask (fn) {
    if (!taskQueue.length) {
      scheduleRunTaskQueue()
    }

    taskQueue.push(fn)
  }

  function runTaskQueue (deadline) {
    while (deadline.timeRemaining() > 0 && taskQueue.length) {
      let fn = taskQueue.shift()
      fn()
    }

    if (taskQueue.length) {
      scheduleRunTaskQueue()
    } else {
      extractSilent(tooltipster)
    }
  }

  function scheduleRunTaskQueue () {
    requestIdleCallback(runTaskQueue)
  }

  function nextTick (fn) {
    let p = Promise.resolve()
    p.then(fn)
  }

  function extractSilent(fn) {
    pauseObserve()
    fn()

    // nextTick will run **after** MutationObserver callbacks
    nextTick(startObserve)
  }

  let observer = new MutationObserver(mutations => {
    mutations.slice(0, MAX_MUTATIONS).forEach(mutation => {
      let target = mutation.target
      if (!isExclude(target)) {
        extract(target)
      }
    })
  })

  function startObserve () {
    observer.observe(DEFAULT_TARGET, {
      childList: true,
      subtree: true
    })
  }

  function pauseObserve () {
    observer.disconnect()
  }

  queueTask(startObserve)

  // based on octotree's config
  const GH_RESERVED_USER_NAMES = [
    'settings',
    'orgs',
    'organizations',
    'site',
    'blog',
    'about',
    'explore',
    'styleguide',
    'showcases',
    'trending',
    'stars',
    'dashboard',
    'notifications',
    'search',
    'developer',
    'account',
    'pulls',
    'issues',
    'features',
    'contact',
    'security',
    'join',
    'login',
    'watching',
    'new',
    'integration',
    'pricing',
    'topics',
    'personal',
    'business',
    'open-source',
    'marketplace',
    'collections',
    'hovercards',
    'discover',
    'case-studies',
    'sponsors'
  ]

  const GH_RESERVED_REPO_NAMES = ['followers', 'following', 'repositories']

  const GH_USER_NAME_PATTERN = /^[a-z0-9]+$|^[a-z0-9](?:[a-z0-9](?!--)|-(?!-))*[a-z0-9]$/i
  const GH_REPO_NAME_PATTERN = /^[a-z0-9\-_.]+$/i

  const TYPE_KEY = 'ghh-type'
  const VALUE_KEY = 'ghh-value'
  const EXTRACT_TYPE = {
    USER: 'user',
    REPO: 'repo',
    ISSUE: 'issue',
    COMMENT: 'comment',
    COMMIT: 'commit',
    SKIP: 'skip'
  }

  const EXTRACTOR = {
    SLUG: 1, // {{user}}/{{repo}}#{{issue}}
    TEXT_USER: 2, // {{user}}
    TITLE_USER: 3, // title="{{user}}"
    ALT_USER: 4, // alt="{{user}}"
    HREF_USER: 5, // href="{{user}}"
    URL: 6, // href="/{{user}}" or href="https://{{GH_DOMAIN}}/{{user}}"
    NEXT_TEXT_REPO: 7, // <span>...</span> {{repo}}
    ANCESTOR_URL_REPO: 8, // <a href="/{{user}}/{{repo}}">...{{elem}}...</a>
    NEXT_LINK_TEXT_USER: 9, // <span>...</span>...<a>{{user}}</a>
    TEXT_MY_REPO: 10, // {{repo}}
    TEXT_NODE_USER: 11, // {{user}} <span>...</span>
    NEXT_TEXT_USER: 12, // <img alt> {{user}}
    REPO_LIST_SLUG: 13 // <span>{{user}} / </span>{{repo}}
  }

  const GH_DOMAIN_PATTERN = GH_DOMAIN.replace(/\./g, '\\.')
  const URL_USER_PATTERN = `^https?:\\/\\/${GH_DOMAIN_PATTERN}\\/(?:([^/?#]+)(?:\\/$|[^/]*$)|orgs\\/[^/]+\\/people\\/([^/?#]+))`
  const URL_REPO_PATTERN = `^https?:\\/\\/${GH_DOMAIN_PATTERN}\\/([^/?#]+)\\/([^/?#]+)(?:\\/$|[^/]*$)`
  const URL_PROJECT_PATTERN = `^https?:\\/\\/${GH_DOMAIN_PATTERN}\\/([^/?#]+)\\/([^/?#]+)\\/projects\\/(\\d+)`
  const URL_ISSUE_PATTERN = `^https?:\\/\\/${GH_DOMAIN_PATTERN}\\/([^/?#]+)\\/([^/?#]+)\\/(?:issues|pull)\\/(\\d+)(?:\\/?(?:[?#](?!issuecomment).*)?$)`
  const URL_COMMENT_PATTERN = `^https?:\\/\\/${GH_DOMAIN_PATTERN}\\/([^/?#]+)\\/([^/?#]+)\\/(?:issues|pull)\\/(\\d+)#issuecomment-(\\d+)$`
  const URL_COMMIT_PATTERN = `^https?:\\/\\/${GH_DOMAIN_PATTERN}\\/([^/?#]+)\\/([^/?#]+)\\/(?:pull\\/\\d+\\/commits|commit)\\/([0-9a-f]+)(?:\\/?[^/]*$)`
  const SLUG_PATTERN = /([^/\s]+)\/([^#@\s]+)(?:#(\d+)|@([0-9a-f]+))?/

  const STRATEGIES = {
    // @ mentions
    '.user-mention': EXTRACTOR.TEXT_USER,

    /* Dashboard */
    // [β] Discover repositories
    '.team-left-column:last-child h4 ~ div a': EXTRACTOR.SLUG,

    // News feeds
    'img[alt^="@"]': EXTRACTOR.ALT_USER,
    '[data-hydro-click*="\\"action_target\\":\\"actor\\""]':
      EXTRACTOR.TEXT_USER,
    '[data-hydro-click*="\\"action_target\\":\\"issue\\""]': EXTRACTOR.URL,
    '[data-hydro-click*="\\"action_target\\":\\"followee\\""]': EXTRACTOR.URL,
    '[data-hydro-click*="\\"action_target\\":\\"repo\\""]': EXTRACTOR.SLUG,
    '[data-hydro-click*="\\"action_target\\":\\"repository\\""]':
      EXTRACTOR.SLUG,
    '[data-hydro-click*="\\"type\\":\\"ForkEvent\\""]': EXTRACTOR.SLUG,
    '[data-hydro-click*="\\"action_target\\":\\"sha\\""]': EXTRACTOR.URL,
    '[data-hydro-click*="\\"target\\":\\"ISSUE\\""]': EXTRACTOR.URL,
    '[data-hydro-click*="\\"target\\":\\"PULL_REQUEST\\""]': EXTRACTOR.URL,
    '.js-recent-activity-container [data-hovercard-type="repository"]':
      EXTRACTOR.SLUG,

    // Sidebar
    '.dashboard-sidebar [data-hydro-click*="\\"target\\":\\"REPOSITORY\\""] [title]:first-of-type':
      EXTRACTOR.TEXT_USER,
    '.dashboard-sidebar [data-hydro-click*="\\"target\\":\\"REPOSITORY\\""] [title]:last-of-type':
      EXTRACTOR.ANCESTOR_URL_REPO,
    '[aria-label="Explore"] [data-hydro-click*="\\"target\\":\\"REPOSITORY\\""]': EXTRACTOR.SLUG,

    /* Explore */
    // Trending
    '.explore-content .repo-list h3 > a': EXTRACTOR.REPO_LIST_SLUG,
    '.Story h1 > a': EXTRACTOR.REPO_LIST_SLUG,

    // Topics
    '.topic h3 > a': EXTRACTOR.REPO_LIST_SLUG,

    // Collections
    '[data-ga-click^="Repository"]': EXTRACTOR.REPO_LIST_SLUG,

    /* User profile */
    // Pinned repos
    '.pinned-repo-item-content .owner': EXTRACTOR.TEXT_USER,
    '.pinned-repo-item-content .repo': EXTRACTOR.ANCESTOR_URL_REPO,
    '.pinned-repo-item-content .d-block + p:not(.pinned-repo-desc) a':
      EXTRACTOR.SLUG,

    // Customize pinned repos
    '.pinned-repos-selection-list .pinned-repo-name span':
      EXTRACTOR.TEXT_MY_REPO,

    // Contribution activities
    '.profile-rollup-content > li > div:first-child a:first-child':
      EXTRACTOR.SLUG,
    '.profile-rollup-summarized button > span:first-child': EXTRACTOR.SLUG,
    '.profile-rollup-content .profile-rollup-icon:has(.octicon-repo, .octicon-repo-forked) + a':
      EXTRACTOR.SLUG,

    '.profile-timeline-card h3 a': EXTRACTOR.URL,

    // Repos
    '#user-repositories-list [itemprop$="owns"] h3 > a': EXTRACTOR.URL,
    '#user-repositories-list [itemprop$="owns"] h3 + span a': EXTRACTOR.SLUG,

    // Stars
    '.user-profile-nav + div h3 > a': EXTRACTOR.REPO_LIST_SLUG,

    /* Organization profile */
    // Invite member suggestion info
    '.member-suggestion-info .member-login': EXTRACTOR.TEXT_USER,

    // People
    '.member-info-content .member-link': EXTRACTOR.TEXT_USER,

    // People manage
    '.member-list-avatar + strong': EXTRACTOR.TEXT_USER,
    '.org-person-repo-header .table-list-heading strong': EXTRACTOR.TEXT_USER,
    '.org-repo-name .repo-prefix': EXTRACTOR.TEXT_USER,
    '.org-repo-name .repo-slash': EXTRACTOR.NEXT_TEXT_REPO,

    // Teams
    // - Team
    '.team-member-username a': EXTRACTOR.TEXT_USER,

    // Settings
    // - Audit log
    '.member-username .member-link': EXTRACTOR.TEXT_USER,

    // - Repositories details
    '.org-higher-access-member': EXTRACTOR.TEXT_NODE_USER,

    /* Repo */
    // Issues
    '.opened-by a': EXTRACTOR.TEXT_USER,
    'img.from-avatar:not([alt=""])': EXTRACTOR.ALT_USER,
    '.fork-flag a': EXTRACTOR.SLUG,
    '.merge-pr-more-commits a:last-child': EXTRACTOR.SLUG,
    '.select-menu-list[data-filter="author"] .select-menu-item-text':
      EXTRACTOR.TEXT_NODE_USER,
    '.select-menu-list[data-filter="assignee"] .select-menu-item-text':
      EXTRACTOR.TEXT_NODE_USER,

    // Insights
    // - Pulse
    '.pulse-authors-graph .bar image': EXTRACTOR.ALT_USER,

    // - Contributors
    '.contrib-person .avatar': EXTRACTOR.NEXT_LINK_TEXT_USER,
    '.contrib-person .avatar ~ a': EXTRACTOR.TEXT_USER,

    // - Dependency graph
    '.js-dependency .avatar': EXTRACTOR.NEXT_TEXT_USER,
    '.js-dependency button + a + span > a': EXTRACTOR.REPO_LIST_SLUG,

    /* New/import repo */
    '.select-menu-item-gravatar img': EXTRACTOR.NEXT_TEXT_USER,
    '.select-menu-item-gravatar + .select-menu-item-text .js-username':
      EXTRACTOR.TEXT_USER,
    '.select-menu-item-gravatar + .select-menu-item-text': EXTRACTOR.TEXT_USER,
    '.select-menu-button-gravatar + .js-select-button': EXTRACTOR.TEXT_USER,

    /* Notifications */
    '.filter-item .repo-and-owner': EXTRACTOR.SLUG,
    '.notifications-repo-link': EXTRACTOR.SLUG,
    '.list-group-item-link': EXTRACTOR.TEXT_NODE_URL,

    // Watching
    '.notifications-list .repo-icon + a': EXTRACTOR.SLUG,

    /* Pulls/Issues */
    '.issues-listing .js-issue-row .muted-link:first-child': EXTRACTOR.SLUG,

    /* Search */
    '.codesearch-results .repo-list h3 > a': EXTRACTOR.REPO_LIST_SLUG,
    '.code-list-item a:has(.avatar) ~ div a:first-child': EXTRACTOR.SLUG, // rule out repo code search title
    '.commits-list-item .commit-author + a': EXTRACTOR.SLUG,
    '.issue-list-item li:first-child > a': EXTRACTOR.SLUG,
    '.wiki-list-item a:first-child': EXTRACTOR.SLUG,

    /* Common */
    // Avatars
    'img.avatar:not([alt=""])': EXTRACTOR.ALT_USER,
    'img.gravatar:not([alt=""])': EXTRACTOR.ALT_USER,

    /* All links */
    a: EXTRACTOR.URL
  }

  const BLACK_LIST_SELECTOR = [
    '.ghh a',
    '.repo-nav a',
    '.tabnav-tab',
    '.discussion-item .timestamp',
    '.file-wrap .content a',
    '.reponav-item',
    '.intgrs-lstng-logo', // integrations icon
    '.issues-listing .float-right:last-child > a', // issue/pr list comment icon
    '.commit-links-cell > a:first-child', // commit list comment icon
    '.user-nav details .dropdown-item'
  ].join(', ')

  let me = $('meta[name="user-login"]').attr('content')
  // if on user profile page, we should not show user
  // hovercard for the said user
  let current = location.href.match(URL_USER_PATTERN)
  if (current) {
    current = current[1] || current[2]
    if (
      GH_RESERVED_USER_NAMES.indexOf(current) !== -1 ||
      !GH_USER_NAME_PATTERN.test(current)
    ) {
      current = null
    }
  }

  // Octicons in SVG
  const OCTICONS = {"alert":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M8.22 1.754a.25.25 0 00-.44 0L1.698 13.132a.25.25 0 00.22.368h12.164a.25.25 0 00.22-.368L8.22 1.754zm-1.763-.707c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0114.082 15H1.918a1.75 1.75 0 01-1.543-2.575L6.457 1.047zM9 11a1 1 0 11-2 0 1 1 0 012 0zm-.25-5.25a.75.75 0 00-1.5 0v2.5a.75.75 0 001.5 0v-2.5z\"></path>"},"arrow-right":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.03a.75.75 0 010-1.06z\"></path>"},"code":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M4.72 3.22a.75.75 0 011.06 1.06L2.06 8l3.72 3.72a.75.75 0 11-1.06 1.06L.47 8.53a.75.75 0 010-1.06l4.25-4.25zm6.56 0a.75.75 0 10-1.06 1.06L13.94 8l-3.72 3.72a.75.75 0 101.06 1.06l4.25-4.25a.75.75 0 000-1.06l-4.25-4.25z\"></path>"},"diff":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M8.75 1.75a.75.75 0 00-1.5 0V5H4a.75.75 0 000 1.5h3.25v3.25a.75.75 0 001.5 0V6.5H12A.75.75 0 0012 5H8.75V1.75zM4 13a.75.75 0 000 1.5h8a.75.75 0 100-1.5H4z\"></path>"},"git-commit":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M10.5 7.75a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zm1.43.75a4.002 4.002 0 01-7.86 0H.75a.75.75 0 110-1.5h3.32a4.001 4.001 0 017.86 0h3.32a.75.75 0 110 1.5h-3.32z\"></path>"},"git-pull-request":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z\"></path>"},"info":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm6.5-.25A.75.75 0 017.25 7h1a.75.75 0 01.75.75v2.75h.25a.75.75 0 010 1.5h-2a.75.75 0 010-1.5h.25v-2h-.25a.75.75 0 01-.75-.75zM8 6a1 1 0 100-2 1 1 0 000 2z\"></path>"},"issue-closed":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M1.5 8a6.5 6.5 0 0110.65-5.003.75.75 0 00.959-1.153 8 8 0 102.592 8.33.75.75 0 10-1.444-.407A6.5 6.5 0 011.5 8zM8 12a1 1 0 100-2 1 1 0 000 2zm0-8a.75.75 0 01.75.75v3.5a.75.75 0 11-1.5 0v-3.5A.75.75 0 018 4zm4.78 4.28l3-3a.75.75 0 00-1.06-1.06l-2.47 2.47-.97-.97a.749.749 0 10-1.06 1.06l1.5 1.5a.75.75 0 001.06 0z\"></path>"},"issue-opened":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm9 3a1 1 0 11-2 0 1 1 0 012 0zm-.25-6.25a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z\"></path>"},"link":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z\"></path>"},"location":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M11.536 3.464a5 5 0 010 7.072L8 14.07l-3.536-3.535a5 5 0 117.072-7.072v.001zm1.06 8.132a6.5 6.5 0 10-9.192 0l3.535 3.536a1.5 1.5 0 002.122 0l3.535-3.536zM8 9a2 2 0 100-4 2 2 0 000 4z\"></path>"},"organization":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M1.5 14.25c0 .138.112.25.25.25H4v-1.25a.75.75 0 01.75-.75h2.5a.75.75 0 01.75.75v1.25h2.25a.25.25 0 00.25-.25V1.75a.25.25 0 00-.25-.25h-8.5a.25.25 0 00-.25.25v12.5zM1.75 16A1.75 1.75 0 010 14.25V1.75C0 .784.784 0 1.75 0h8.5C11.216 0 12 .784 12 1.75v12.5c0 .085-.006.168-.018.25h2.268a.25.25 0 00.25-.25V8.285a.25.25 0 00-.111-.208l-1.055-.703a.75.75 0 11.832-1.248l1.055.703c.487.325.779.871.779 1.456v5.965A1.75 1.75 0 0114.25 16h-3.5a.75.75 0 01-.197-.026c-.099.017-.2.026-.303.026h-3a.75.75 0 01-.75-.75V14h-1v1.25a.75.75 0 01-.75.75h-3zM3 3.75A.75.75 0 013.75 3h.5a.75.75 0 010 1.5h-.5A.75.75 0 013 3.75zM3.75 6a.75.75 0 000 1.5h.5a.75.75 0 000-1.5h-.5zM3 9.75A.75.75 0 013.75 9h.5a.75.75 0 010 1.5h-.5A.75.75 0 013 9.75zM7.75 9a.75.75 0 000 1.5h.5a.75.75 0 000-1.5h-.5zM7 6.75A.75.75 0 017.75 6h.5a.75.75 0 010 1.5h-.5A.75.75 0 017 6.75zM7.75 3a.75.75 0 000 1.5h.5a.75.75 0 000-1.5h-.5z\"></path>"},"person":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M10.5 5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zm.061 3.073a4 4 0 10-5.123 0 6.004 6.004 0 00-3.431 5.142.75.75 0 001.498.07 4.5 4.5 0 018.99 0 .75.75 0 101.498-.07 6.005 6.005 0 00-3.432-5.142z\"></path>"},"repo-forked":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M5 3.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0 2.122a2.25 2.25 0 10-1.5 0v.878A2.25 2.25 0 005.75 8.5h1.5v2.128a2.251 2.251 0 101.5 0V8.5h1.5a2.25 2.25 0 002.25-2.25v-.878a2.25 2.25 0 10-1.5 0v.878a.75.75 0 01-.75.75h-4.5A.75.75 0 015 6.25v-.878zm3.75 7.378a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3-8.75a.75.75 0 100-1.5.75.75 0 000 1.5z\"></path>"},"repo":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z\"></path>"},"git-branch":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z\"></path>"},"tag":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M2.5 7.775V2.75a.25.25 0 01.25-.25h5.025a.25.25 0 01.177.073l6.25 6.25a.25.25 0 010 .354l-5.025 5.025a.25.25 0 01-.354 0l-6.25-6.25a.25.25 0 01-.073-.177zm-1.5 0V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 010 2.474l-5.026 5.026a1.75 1.75 0 01-2.474 0l-6.25-6.25A1.75 1.75 0 011 7.775zM6 5a1 1 0 100 2 1 1 0 000-2z\"></path>"},"bookmark":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M4.75 2.5a.25.25 0 00-.25.25v9.91l3.023-2.489a.75.75 0 01.954 0l3.023 2.49V2.75a.25.25 0 00-.25-.25h-6.5zM3 2.75C3 1.784 3.784 1 4.75 1h6.5c.966 0 1.75.784 1.75 1.75v11.5a.75.75 0 01-1.227.579L8 11.722l-3.773 3.107A.75.75 0 013 14.25V2.75z\"></path>"},"star":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25zm0 2.445L6.615 5.5a.75.75 0 01-.564.41l-3.097.45 2.24 2.184a.75.75 0 01.216.664l-.528 3.084 2.769-1.456a.75.75 0 01.698 0l2.77 1.456-.53-3.084a.75.75 0 01.216-.664l2.24-2.183-3.096-.45a.75.75 0 01-.564-.41L8 2.694v.001z\"></path>"},"verified":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M9.585.52a2.678 2.678 0 00-3.17 0l-.928.68a1.178 1.178 0 01-.518.215L3.83 1.59a2.678 2.678 0 00-2.24 2.24l-.175 1.14a1.178 1.178 0 01-.215.518l-.68.928a2.678 2.678 0 000 3.17l.68.928c.113.153.186.33.215.518l.175 1.138a2.678 2.678 0 002.24 2.24l1.138.175c.187.029.365.102.518.215l.928.68a2.678 2.678 0 003.17 0l.928-.68a1.17 1.17 0 01.518-.215l1.138-.175a2.678 2.678 0 002.241-2.241l.175-1.138c.029-.187.102-.365.215-.518l.68-.928a2.678 2.678 0 000-3.17l-.68-.928a1.179 1.179 0 01-.215-.518L14.41 3.83a2.678 2.678 0 00-2.24-2.24l-1.138-.175a1.179 1.179 0 01-.518-.215L9.585.52zM7.303 1.728c.415-.305.98-.305 1.394 0l.928.68c.348.256.752.423 1.18.489l1.136.174c.51.078.909.478.987.987l.174 1.137c.066.427.233.831.489 1.18l.68.927c.305.415.305.98 0 1.394l-.68.928a2.678 2.678 0 00-.489 1.18l-.174 1.136a1.178 1.178 0 01-.987.987l-1.137.174a2.678 2.678 0 00-1.18.489l-.927.68c-.415.305-.98.305-1.394 0l-.928-.68a2.678 2.678 0 00-1.18-.489l-1.136-.174a1.178 1.178 0 01-.987-.987l-.174-1.137a2.678 2.678 0 00-.489-1.18l-.68-.927a1.178 1.178 0 010-1.394l.68-.928c.256-.348.423-.752.489-1.18l.174-1.136c.078-.51.478-.909.987-.987l1.137-.174a2.678 2.678 0 001.18-.489l.927-.68zM11.28 6.78a.75.75 0 00-1.06-1.06L7 8.94 5.78 7.72a.75.75 0 00-1.06 1.06l1.75 1.75a.75.75 0 001.06 0l3.75-3.75z\"></path>"},"key":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M6.5 5.5a4 4 0 112.731 3.795.75.75 0 00-.768.18L7.44 10.5H6.25a.75.75 0 00-.75.75v1.19l-.06.06H4.25a.75.75 0 00-.75.75v1.19l-.06.06H1.75a.25.25 0 01-.25-.25v-1.69l5.024-5.023a.75.75 0 00.181-.768A3.995 3.995 0 016.5 5.5zm4-5.5a5.5 5.5 0 00-5.348 6.788L.22 11.72a.75.75 0 00-.22.53v2C0 15.216.784 16 1.75 16h2a.75.75 0 00.53-.22l.5-.5a.75.75 0 00.22-.53V14h.75a.75.75 0 00.53-.22l.5-.5a.75.75 0 00.22-.53V12h.75a.75.75 0 00.53-.22l.932-.932A5.5 5.5 0 1010.5 0zm.5 6a1 1 0 100-2 1 1 0 000 2z\"></path>"},"check":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z\"></path>"},"dot-fill":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M8 4a4 4 0 100 8 4 4 0 000-8z\"></path>"},"comment":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M2.75 2.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 01.75.75v2.19l2.72-2.72a.75.75 0 01.53-.22h4.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25H2.75zM1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0113.25 12H9.06l-2.573 2.573A1.457 1.457 0 014 13.543V12H2.75A1.75 1.75 0 011 10.25v-7.5z\"></path>"},"comment-discussion":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M1.5 2.75a.25.25 0 01.25-.25h8.5a.25.25 0 01.25.25v5.5a.25.25 0 01-.25.25h-3.5a.75.75 0 00-.53.22L3.5 11.44V9.25a.75.75 0 00-.75-.75h-1a.25.25 0 01-.25-.25v-5.5zM1.75 1A1.75 1.75 0 000 2.75v5.5C0 9.216.784 10 1.75 10H2v1.543a1.457 1.457 0 002.487 1.03L7.061 10h3.189A1.75 1.75 0 0012 8.25v-5.5A1.75 1.75 0 0010.25 1h-8.5zM14.5 4.75a.25.25 0 00-.25-.25h-.5a.75.75 0 110-1.5h.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0114.25 12H14v1.543a1.457 1.457 0 01-2.487 1.03L9.22 12.28a.75.75 0 111.06-1.06l2.22 2.22v-2.19a.75.75 0 01.75-.75h1a.25.25 0 00.25-.25v-5.5z\"></path>"},"clock":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 0a8 8 0 100 16A8 8 0 008 0zm.5 4.75a.75.75 0 00-1.5 0v3.5a.75.75 0 00.471.696l2.5 1a.75.75 0 00.557-1.392L8.5 7.742V4.75z\"></path>"},"rocket":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M14.064 0a8.75 8.75 0 00-6.187 2.563l-.459.458c-.314.314-.616.641-.904.979H3.31a1.75 1.75 0 00-1.49.833L.11 7.607a.75.75 0 00.418 1.11l3.102.954c.037.051.079.1.124.145l2.429 2.428c.046.046.094.088.145.125l.954 3.102a.75.75 0 001.11.418l2.774-1.707a1.75 1.75 0 00.833-1.49V9.485c.338-.288.665-.59.979-.904l.458-.459A8.75 8.75 0 0016 1.936V1.75A1.75 1.75 0 0014.25 0h-.186zM10.5 10.625c-.088.06-.177.118-.266.175l-2.35 1.521.548 1.783 1.949-1.2a.25.25 0 00.119-.213v-2.066zM3.678 8.116L5.2 5.766c.058-.09.117-.178.176-.266H3.309a.25.25 0 00-.213.119l-1.2 1.95 1.782.547zm5.26-4.493A7.25 7.25 0 0114.063 1.5h.186a.25.25 0 01.25.25v.186a7.25 7.25 0 01-2.123 5.127l-.459.458a15.21 15.21 0 01-2.499 2.02l-2.317 1.5-2.143-2.143 1.5-2.317a15.25 15.25 0 012.02-2.5l.458-.458h.002zM12 5a1 1 0 11-2 0 1 1 0 012 0zm-8.44 9.56a1.5 1.5 0 10-2.12-2.12c-.734.73-1.047 2.332-1.15 3.003a.23.23 0 00.265.265c.671-.103 2.273-.416 3.005-1.148z\"></path>"},"star-fill":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z\"></path>"},"people":{"width":16,"height":16,"path":"<path fill-rule=\"evenodd\" d=\"M5.5 3.5a2 2 0 100 4 2 2 0 000-4zM2 5.5a3.5 3.5 0 115.898 2.549 5.507 5.507 0 013.034 4.084.75.75 0 11-1.482.235 4.001 4.001 0 00-7.9 0 .75.75 0 01-1.482-.236A5.507 5.507 0 013.102 8.05 3.49 3.49 0 012 5.5zM11 4a.75.75 0 100 1.5 1.5 1.5 0 01.666 2.844.75.75 0 00-.416.672v.352a.75.75 0 00.574.73c1.2.289 2.162 1.2 2.522 2.372a.75.75 0 101.434-.44 5.01 5.01 0 00-2.56-3.012A3 3 0 0011 4z\"></path>"}}

  function getIcon(type, scale = 1) {
    let icon = OCTICONS[type]
    return `<svg class="octicon" width="${icon.width *
      scale}" height="${icon.height * scale}"
      viewBox="0 0 ${icon.width} ${icon.height}">${icon.path}</svg>`
  }

  const CREATE_TOKEN_PATH = `//${GH_DOMAIN}/settings/tokens/new?scopes=repo,user:follow`
  const EDIT_TOKEN_PATH = `//${GH_DOMAIN}/settings/tokens`
  const IS_ENTERPRISE = GH_DOMAIN !== 'github.com'
  const API_PREFIX = IS_ENTERPRISE
    ? `//${GH_DOMAIN}/api/v3`
    : `//api.${GH_DOMAIN}`
  const SITE_PREFIX = `//${GH_DOMAIN}/`

  const CARD_TPL = {
    user: `
      <address class="ghh">
        <div class="ghh-person">
          <img src="{{avatar}}&s=64" class="ghh-avatar">
          <p class="ghh-title-row">
            <span class="ghh-title{{^hasMeta}} no-meta{{/hasMeta}}"><strong><a href="{{userUrl}}">{{loginName}}</a></strong></span>
            {{#isAdmin}}<small class="ghh-meta">(Staff)</small>{{/isAdmin}}
            {{#isOrg}}<small class="ghh-meta">(Organization)</small>{{/isOrg}}
            {{^isSelf}}{{#hasToken}}${
              me
                ? '{{^isOrg}}{{#followedByMe}}<button class="ghh-aux" data-action="unfollow" data-args="{{loginName}}">Unfollow{{/followedByMe}}{{^followedByMe}}<button class="ghh-primary" data-action="follow" data-args="{{loginName}}">Follow{{/followedByMe}}</button>{{/isOrg}}'
                : ''
            }{{/hasToken}}{{/isSelf}}
          </p>
          {{#hasSubtitle}}<p>{{#realName}}{{realName}}{{/realName}}${
            me
              ? ' {{#followingMe}}<small>(Following you)</small>{{/followingMe}}'
              : ''
          }</p>{{/hasSubtitle}}
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
        {{#hasContexts}}<hr class="ghh-more-separator"/><div class="ghh-more">
          {{#contexts}}<p>{{{icon}}}{{message}}</p>{{/contexts}}
        </div>{{/hasContexts}}
      </address>`,
    repo: `
      <div class="ghh">
        <div class="ghh-repo">
          {{{icons.repo}}}
          <p class="ghh-title-row">
            <span class="ghh-title"><a href="{{ownerUrl}}">{{owner}}</a> / <strong><a href="{{repoUrl}}">{{repo}}</a></strong></span>
            {{#hasToken}}${
              me
                ? '{{#starredByMe}}<button class="ghh-aux" data-action="unstar" data-args="{{owner}}/{{repo}}">{{{icons.starFill}}} Unstar{{/starredByMe}}{{^starredByMe}}<button class="ghh-primary" data-action="star" data-args="{{owner}}/{{repo}}">{{{icons.star}}} Star{{/starredByMe}}</button>'
                : ''
            }{{/hasToken}}
          </p>
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
          {{#hasTopics}}<p>{{{icons.bookmark}}}{{#topics}}<a class="ghh-topic" href="https://github.com/search?q=topic%3A{{query}}&type=Repositories">{{name}}</a>{{/topics}}</p>{{/hasTopics}}
        </div>
        {{#readme}}<hr class="ghh-markdown-separator"/><div class="ghh-readme">{{{.}}}</div>{{/readme}}
      </div>`,
    issue: `
      <div class="ghh">
        <div class="ghh-issue">
          <p><span class="issue-number">#{{number}}</span> <a href="{{issueUrl}}" title="{{title}}"><strong>{{title}}</strong></a></p>
        </div>
        <div class="ghh-issue-meta">
          <p><span class="ghh-state ghh-state-{{state}}">{{{icons.state}}}{{state}}</span><a href="{{userUrl}}">{{user}}</a> created on {{{createTime}}}</p>
        </div>
        {{#isPullRequest}}<div class="ghh-pull-meta">
          <p>{{{icons.commit}}} {{commits}} commit{{^isSingleCommit}}s{{/isSingleCommit}}{{{icons.diff}}} {{changedFiles}} file{{^isSingleFile}}s{{/isSingleFile}} changed
            <span class="diffstat">
              <span class="text-diff-added">+{{additions}}</span>
              <span class="text-diff-deleted">−{{deletions}}</span>
            </span>
          </p>
          <p class="ghh-branch"><span class="commit-ref" title="{{headUser}}:{{headRef}}"><span class="user">{{headUser}}</span>:{{headRef}}</span><span>{{{icons.arrow}}}</span><span class="commit-ref" title="{{baseUser}}:{{baseRef}}"><span class="user">{{baseUser}}</span>:{{baseRef}}</span></p>
          {{^isMerged}}<ul class="ghh-reviews"><li title="{{mergeability.desc}}"><span class="ghh-state-icon ghh-state-icon-{{mergeability.type}}">{{{mergeability.icon}}}</span> {{mergeability.label}}</li>{{#hasReviews}}{{#reviews}}<li class="ghh-state-{{state.type}}" title="{{name}} {{state.desc}}">{{{state.icon}}} <a href="{{url}}">{{name}}</a></li>{{/reviews}}{{/hasReviews}}</ul>{{/isMerged}}
          </div>{{/isPullRequest}}
        {{#body}}<hr class="ghh-markdown-separator"/><div class="ghh-issue-body">{{{.}}}</div>{{/body}}
      </div>`,
    comment: `
      <div class="ghh">
        <div class="ghh-person">
          <img src="{{avatar}}&s=32" class="ghh-avatar">
          <p><strong><a href="{{userUrl}}">{{loginName}}</a></strong></p>
          <p>Commented on {{{createTime}}}{{#updatedTime}} • {{{.}}}{{/updatedTime}}</p>
        </div>
        <hr class="ghh-markdown-separator"/>
        <div class="ghh-issue-body">{{{body}}}</div>
      </div>`,
    commit: `
      <div class="ghh">
        <div class="ghh-commit">
          <p><a href="{{commitUrl}}" title="{{title}}"><strong>{{title}}</strong></a></p>
        </div>
        {{#body}}<pre class="ghh-commit-body">{{.}}</pre>{{/body}}
        <p class="ghh-commit-author">{{#authorUrl}}<a href="{{.}}"><strong>{{author}}</strong></a>{{/authorUrl}}{{^authorUrl}}<strong title="{{authorEmail}}">{{author}}</strong>{{/authorUrl}} committed{{#isGitHub}} on <strong>GitHub</strong>{{/isGitHub}}{{^isGitHub}}{{#committer}} with {{#committerUrl}}<a href="{{.}}"><strong>{{committer}}</strong></a>{{/committerUrl}}{{^committerUrl}}<strong title="{{committerEmail}}">{{committer}}</strong>{{/committerUrl}}{{/committer}}{{/isGitHub}} on {{{authorTime}}}{{#verified}} <span class="state ghh-state-verified" title="This commit was signed with a verified signature.">{{{icons.verified}}}Verified</span>{{/verified}}</p>
        <div class="ghh-more">
          <p class="ghh-commit-sha">{{{icons.commit}}} <code>{{sha}}</code></p>
          {{#branch}}<p>{{{icons.branch}}} <a href="/{{fullRepo}}/tree/{{branch}}"><strong>{{branch}}</strong></a>{{#pull}} (<a href="/{{fullRepo}}/pull/{{.}}">#{{.}}</a>){{/pull}}</p>
          {{#mainTag}}<p class="ghh-tags">{{{icons.tag}}} <a href="/{{fullRepo}}/releases/tag/{{.}}"><strong>{{.}}</strong></a>{{#otherTags}}, <a href="/{{fullRepo}}/releases/tag/{{.}}">{{.}}</a>{{/otherTags}}{{#truncatedTagNumber}} <span title="{{truncatedTagNumber}} more tag(s)">...</span>{{/truncatedTagNumber}}</p>{{/mainTag}}{{/branch}}
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
          <h3>${getIcon('key')} GitHub Access Token</h3>
          <p>GitHub limits unauthenticated API requests to 60 per hour, but after binding your access token you will be able to enjoy the rate limit of <strong>5,000</strong> requests per hour.</p>
          <p>You should at least add permission for <code>public_repo</code> to enable star/unstar, and <code>user:follow</code> to enable follow/unfollow.</p>
          <p><a href="${CREATE_TOKEN_PATH}" class="ghh-token-link" target="_blank">Create a new access token</a> if you don't have any.</p>
          <p>
            <input class="ghh-token form-control" type="text" placeholder="Paste access token here..." size="40">
            <button class="btn btn-primary ghh-save">Save</button>
            <button class="btn ghh-cancel">Cancel</button>
          </p>
        </form>
      </div>`
  }

  function trim(str, isCollapse) {
    if (!str) {
      return ''
    }
    return str.replace(/^\s+|\s+$/g, isCollapse ? ' ' : '')
  }

  function markExtracted(elem, type, value) {
    if (value) {
      elem
        .data(TYPE_KEY, type)
        .data(VALUE_KEY, value)
        .addClass(getTypeClass(type))
    }
    if (!type || !value) {
      elem.data(TYPE_KEY, EXTRACT_TYPE.SKIP)
    }
  }

  function getExtracted(elem) {
    let extractedSelector = Object.keys(EXTRACT_TYPE)
      .map(key => EXTRACT_TYPE[key])
      .map(getTypeClass)
      .map(className => `.${className}`)
      .join(',')
    return (
      elem.data(VALUE_KEY) ||
      elem.data(TYPE_KEY) === EXTRACT_TYPE.SKIP ||
      elem.find(extractedSelector).length
    )
  }

  function getTypeClass(type) {
    return `ghh-${type}-x`
  }

  function getFullRepoFromAncestorLink(elem) {
    let href = elem.closest('a').prop('href')
    let fullRepo = null
    if (href) {
      let match = href.match(URL_REPO_PATTERN)
      fullRepo = match && match[1] + '/' + match[2]
    }
    return fullRepo
  }

  function getNextTextNode(node, context) {
    let filter = NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT
    let walker = document.createTreeWalker(context || document.body, filter)
    while (walker.nextNode()) {
      if (walker.currentNode === node) {
        while (walker.nextNode()) {
          let current = walker.currentNode
          if (
            current.nodeType === Node.TEXT_NODE &&
            !(
              node.compareDocumentPosition(current) &
              Node.DOCUMENT_POSITION_CONTAINED_BY
            ) &&
            trim(current.nodeValue)
          ) {
            return current
          }
        }
      }
    }
    return null
  }

  // '<span>ecomfe/</span><em>ecomfe</em>.github.io'
  function fixRepoSlug(html) {
    let [, leading, content, ending] = html
      .replace(/\n/g, ' ')
      .match(/^(\s*)(.+?)(\s*)$/)

    let parts = content
      .replace(/<\//g, '${END}')
      .replace(/\//g, '${SLASH}')
      .replace(/</g, '${BEGIN}')
      .split('${SLASH}')

    return (
      leading +
      parts
        .map(part => {
          let [, leading, content, ending] = part.match(/^(\s*)(.+?)(\s*)$/)
          let marker = /\$\{(\w+)\}/g
          let open = []
          let close = []
          let position
          let result
          /* eslint-disable no-cond-assign */
          while ((result = marker.exec(content))) {
            position = marker.lastIndex - result[0].length
            if (result[1] === 'BEGIN') {
              open.push(position)
            } else {
              if (open.length) {
                open.pop()
              } else {
                close.push(position)
              }
            }
          }
          /* eslint-enable no-cond-assign */

          // <span>user/ -> <span><span>user</span>
          let begin = 0
          let end = content.length
          if (open[0] === 0 || close[0] === 0) {
            begin = content.indexOf('>') + 1
          } else if (open.length || close.length) {
            begin = 0
            end = open[0] || close[0]
          }

          content =
            content.slice(0, end) +
            '</span>' +
            content.slice(end, content.length)
          content =
            content.slice(0, begin) +
            '<span data-ghh>' +
            content.slice(begin, content.length)
          content = content
            .replace(/\$\{BEGIN\}/g, '<')
            .replace(/\$\{END\}/g, '</')

          return `${leading}${content}${ending}`
        })
        .join('/') +
      ending
    )
  }

  function formatNumber(num) {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k'
    }
    return num
  }

  const MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
  ]

  function formatTime(time, text) {
    let t = new Date(time)
    let formatted =
      MONTH_NAMES[t.getMonth()] + ' ' + t.getDate() + ', ' + t.getFullYear()

    return encodeHTML`<time datetime="${time}" title="${time}">${text ||
      formatted}</time>`
  }

  function getEmoji(unicode) {
    return unicode.split('-').map(code => String.fromCodePoint(parseInt(code, 16))).join('')
  }

  function replaceEmoji(text) {
    return text.replace(/:([a-z0-9+\-_]+):/gi, (match, key) => {
      let url = EMOJI_MAP[key]
      if (!url) {
        return match
      }
      let [, unicode] = url.match(/unicode\/([0-9a-z-]+).png/) || []
      return `<g-emoji class="g-emoji" alias="${key}" fallback-src="${url}">${getEmoji(
        unicode
      )}</g-emoji>`
    })
  }

  function replaceLink(text) {
    return text.replace(/\b(https?:\/\/[^\s]+)/gi, '<a href="$1">$1</a>')
  }

  // Code via underscore's _.compose
  function compose(...fns) {
    let start = fns.length - 1
    return function(...args) {
      let i = start
      let result = fns[start].apply(this, args)
      while (i--) {
        result = fns[i].call(this, result)
      }
      return result
    }
  }

  // Code via https://developers.google.com/web/updates/2015/01/ES6-Template-Strings
  // HTML Escape helper utility
  let htmlUtil = (function() {
    // Thanks to Andrea Giammarchi
    let reEscape = /[&<>'"]/g
    let reUnescape = /&(?:amp|#38|lt|#60|gt|#62|apos|#39|quot|#34);/g
    let oEscape = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }
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
    }
    let fnEscape = function(m) {
      return oEscape[m]
    }
    let fnUnescape = function(m) {
      return oUnescape[m]
    }
    let replace = String.prototype.replace

    return (Object.freeze || Object)({
      escape: function escape(s) {
        return replace.call(s, reEscape, fnEscape)
      },
      unescape: function unescape(s) {
        return replace.call(s, reUnescape, fnUnescape)
      }
    })
  })()

  // Tagged template function
  function encodeHTML(pieces, ...substitutions) {
    let result = pieces[0]
    for (let i = 0; i < substitutions.length; ++i) {
      result += htmlUtil.escape(substitutions[i]) + pieces[i + 1]
    }

    return result
  }

  function fixRef(elem, base, branch) {
    ['href', 'src'].forEach(attr => {
      let src = elem.attr(attr)
      if (src && src.indexOf('//') === -1 && src.indexOf('mailto:') === -1) {
        if (src.endsWith('.svg')) {
          src += '?sanitize=true'
        }
        elem.attr(attr, `${base}/raw/${branch}/${src}`)
      }
    })
  }

  function getHovercardSubject() {
    let [type, id] = (
      $('meta[name="hovercard-subject-tag"]').attr('content') || ''
    ).split(':')
    if (!type || !id) {
      return null
    }
    return { type, id }
  }

  function getCardContent(type, raw, target) {
    let content = $(getCardHTML(type, raw))
    content.attr('tabindex', '0')
    content.on('keydown', e => {
      if (e.key === 'Escape') {
        target.tooltipster('hide')
        target.focus()
        return false
      }
    })

    return content
  }

  function getCardHTML(type, raw) {
    let data
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
        followingMe: raw.following_me,
        followedByMe: raw.followed_by_me,
        repos: formatNumber(raw.public_repos),
        hasSubtitle: raw.name || raw.following_me,
        hasMeta: raw.site_admin || raw.type === 'Organization',
        hasToken: !!token,
        isSelf: raw.login === me,
        followersUrl: `//${GH_DOMAIN}/${raw.login}/followers`,
        followingUrl: `//${GH_DOMAIN}/${raw.login}/following`,
        reposUrl: `//${GH_DOMAIN}/${raw.login}?tab=repositories`,
        icons: {
          location: getIcon('location', 0.875),
          organization: getIcon('organization', 0.875)
        },
        hasContexts: raw.hovercard && raw.hovercard.length > 0,
        contexts: (raw.hovercard || []).map(({ message, octicon }) => {
          return {
            message,
            icon: getIcon(octicon, 0.875)
          }
        })
      }
    } else if (type === EXTRACT_TYPE.REPO) {
      data = {
        owner: raw.owner.login,
        ownerAvatar: raw.owner.avatar_url,
        ownerUrl: raw.owner.html_url,
        repo: raw.name,
        repoUrl: raw.html_url,
        desc: raw.description
          ? compose(
              replaceEmoji,
              replaceLink
            )(encodeHTML`${raw.description}`)
          : '',
        language: raw.language,
        stars: formatNumber(raw.stargazers_count),
        forks: formatNumber(raw.forks_count),
        issues: formatNumber(raw.open_issues_count),
        hasIssues: raw.has_issues,
        homepage: raw.homepage
          ? raw.homepage.match(/^https?:\/\//)
            ? raw.homepage
            : `http://${raw.homepage}`
          : null,
        readme: raw.readme,
        topics: raw.topics.map(topic => {
          return {
            name: topic,
            query: encodeURIComponent(topic)
          }
        }),
        hasTopics: raw.topics.length > 0,
        starredByMe: raw.starred_by_me,
        hasToken: !!token,
        starsUrl: `//${GH_DOMAIN}/${raw.full_name}/stargazers`,
        forksUrl: `//${GH_DOMAIN}/${raw.full_name}/network`,
        issuesUrl: `//${GH_DOMAIN}/${raw.full_name}/issues`,
        icons: {
          repo: getIcon(raw.parent ? 'repo-forked' : 'repo', 1.5),
          info: getIcon('info', 0.875),
          link: getIcon('link', 0.875),
          code: getIcon('code', 0.875),
          bookmark: getIcon('bookmark', 0.875),
          star: getIcon('star', 0.75),
          starFill: getIcon('star-fill', 0.75)
        }
      }
      if (raw.parent) {
        data.parent = {
          repo: raw.parent.full_name,
          url: raw.parent.html_url
        }
      }
    } else if (type === EXTRACT_TYPE.ISSUE) {
      data = {
        title: raw.title,
        body: raw.bodyHTML,
        issueUrl: raw.html_url,
        number: raw.number,
        isPullRequest: !!raw.pull_request,
        userUrl: raw.user.html_url,
        user: raw.user.login,
        state:
          raw.state === 'closed'
            ? 'closed'
            : raw.mergeable_state === 'draft'
            ? 'draft'
            : raw.state,
        avatar: raw.user.avatar_url,
        createTime: formatTime(raw.created_at),
        icons: {
          state: getIcon(
            raw.pull_request
              ? 'git-pull-request'
              : raw.state === 'closed'
              ? 'issue-closed'
              : 'issue-opened',
            0.875
          ),
          commit: getIcon('git-commit', 0.875),
          arrow: getIcon('arrow-right', 0.875),
          diff: getIcon('diff', 0.875)
        }
      }
      if (raw.pull_request) {
        const REVIEW_STATE_MAP = {
          COMMENTED: {
            icon: getIcon('comment', 0.75),
            type: 'normal',
            desc: 'left review comments'
          },
          CHANGES_REQUESTED: {
            icon: getIcon('diff', 0.75),
            type: 'alert',
            desc: 'requested changes'
          },
          APPROVED: {
            icon: getIcon('check', 0.75),
            type: 'success',
            desc: 'approved these changes'
          },
          PENDING: {
            icon: getIcon('dot-fill', 0.75),
            type: 'warning',
            desc: 'was requested for review'
          }
        }
        Object.assign(data, {
          headRef: raw.head.ref,
          headUser: raw.head.user.login,
          baseRef: raw.base.ref,
          baseUser: raw.base.user.login,
          commits: raw.commits,
          additions: raw.additions,
          deletions: raw.deletions,
          changedFiles: raw.changed_files,
          mergeability: {
            type:
              raw.mergeable && raw.mergeable_state !== 'draft'
                ? 'success'
                : 'problem',
            icon:
              raw.mergeable && raw.mergeable_state !== 'draft'
                ? getIcon('check', 0.5)
                : getIcon('alert', 0.5),
            label:
              raw.mergeable_state === 'draft'
                ? 'Work in progress'
                : raw.mergeable
                ? 'No conflicts'
                : 'Has conflicts',
            desc:
              raw.mergeable_state === 'draft'
                ? 'This pull request is still a work in progress.'
                : raw.mergeable
                ? 'This branch has no conflicts with the base branch.'
                : 'This branch has conflicts that must be resolved.'
          },
          isMerged: raw.merged,
          isSingleCommit: raw.commits === 1,
          isSingleFile: raw.changed_files === 1,
          hasReviews: raw.reviews.length > 0,
          reviews: raw.reviews.map(review => {
            return Object.assign({}, review, {
              state: REVIEW_STATE_MAP[review.state]
            })
          })
        })
      }
    } else if (type === EXTRACT_TYPE.COMMENT) {
      data = {
        avatar: raw.user.avatar_url,
        userUrl: raw.user.html_url,
        loginName: raw.user.login,
        createTime: formatTime(raw.created_at),
        updatedTime:
          raw.created_at !== raw.updated_at
            ? formatTime(raw.updated_at, 'edited')
            : null,
        body: raw.bodyHTML
      }
    } else if (type === EXTRACT_TYPE.COMMIT) {
      let lines = raw.commit.message.split('\n\n')
      let committer
      if (raw.committer.login && raw.author.login) {
        committer =
          raw.committer.login === raw.author.login ? null : raw.committer.login
      } else if (!raw.committer.login && !raw.author.login) {
        committer =
          raw.committer.name === raw.author.name &&
          raw.committer.email === raw.author.email
            ? null
            : raw.committer.name
      } else {
        committer = raw.committer.login || raw.committer.name
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
        truncatedTagNumber: raw.truncatedTagNumber,
        fullRepo: raw.fullRepo,
        verified: raw.commit.verification.verified,
        icons: {
          branch: getIcon('git-branch', 0.875),
          tag: getIcon('tag', 0.875),
          commit: getIcon('git-commit', 0.875),
          diff: getIcon('diff', 0.875),
          verified: `<svg class="octicon" width="16" height="16" viewBox="0 0 18 18">${OCTICONS.verified.path}</svg>`
        }
      }
    }

    let html = Mustache.render(CARD_TPL[type], data)
    return $(html)
  }

  function getErrorHTML(error) {
    let html = Mustache.render(CARD_TPL.error, error)
    return $(html)
  }

  // prepare token form
  let tokenForm = $(CARD_TPL.form).attr('tabindex', '0')
  let tokenField = tokenForm.find('.ghh-token')
  tokenForm.on('keydown', e => {
    if (e.key === 'Escape') {
      tokenForm.detach()
      return false
    }
  })
  tokenForm.find('.ghh-save').on('click', () => {
    let newToken = tokenField.val().trim()
    if (newToken) {
      localStorage.setItem(TOKEN_KEY, newToken)
      token = newToken
    }
    tokenForm.detach()
    return false
  })
  tokenForm.find('.ghh-cancel').on('click', () => {
    tokenForm.detach()
    return false
  })

  function showTokenForm() {
    tokenForm.appendTo($('body'))
    tokenField.val(token).select()
  }

  $('body')
    .on('click', '.ghh-token-link', showTokenForm)
    .on('tripleclick', '.ghh', showTokenForm)
    .on('wheel', '.ghh-readme, .ghh-issue-body, .ghh-commit-body', e => {
      if (
        this.scrollTop + e.originalEvent.deltaY + this.clientHeight >=
        this.scrollHeight
      ) {
        e.preventDefault()
        this.scrollTop = this.scrollHeight
      }
      if (this.scrollTop + e.originalEvent.deltaY <= 0) {
        e.preventDefault()
        this.scrollTop = 0
      }
    })

  // prepare cache objects
  let cache = {
    user: {},
    repo: {},
    issue: {},
    comment: {},
    commit: {},
    hovercard: {}
  }

  function extract(context) {
    if (
      cardOptions.disableProjects &&
      location.href.match(URL_PROJECT_PATTERN)
    ) {
      return
    }

    let selectors = Object.keys(STRATEGIES)
    selectors.forEach(selector => {
      let strategy = STRATEGIES[selector]
      let elems = $(selector)
      elems.each(function() {
        if (isExclude(this)) {
          return
        }

        queueTask(() => {
          extractSilent(() => {
            extractElem(context, this, strategy)
          })
        })
      })
    })
  }

  const TIP_SELECTOR = Object.keys(EXTRACT_TYPE)
  .map(key => EXTRACT_TYPE[key])
  .map(getTypeClass)
  .map(className => `.${className}`)
  .join(',')

  function tooltipster () {
    let tipped = $(TIP_SELECTOR)
    tipped.tooltipster({
      updateAnimation: false,
      contentAsHTML: true,
      debug: false,
      delay: cardOptions.delay,
      side: cardOptions.side || 'top',
      // trigger: 'click',
      zIndex: 2147483646,
      functionBefore(self, event) {
        let elem = $(event.origin)
        elem.tooltipster('content', $('<span class="loading"></span>'))
        let type = elem.data(TYPE_KEY)
        let value = elem.data(VALUE_KEY)

        let raw = cache[type][value]
        if (raw && type !== EXTRACT_TYPE.USER) {
          elem.tooltipster('content', getCardContent(type, raw, elem))
        } else {
          if (raw && type === EXTRACT_TYPE.USER) {
            let subject = getHovercardSubject() || {}
            // '@' for contextless
            let subjectSlug = subject ? `${subject.type}:${subject.id}` : '@'
            if (cache.hovercard[value] && cache.hovercard[value][subjectSlug]) {
              Object.assign(raw, {
                hovercard: cache.hovercard[value][subjectSlug]
              })
              elem.tooltipster('content', getCardContent(type, raw, elem))
              return
            }
          }

          let apiPath
          switch (type) {
            case EXTRACT_TYPE.USER:
              apiPath = `users/${value}`
              break
            case EXTRACT_TYPE.REPO:
              apiPath = `repos/${value}`
              break
            case EXTRACT_TYPE.ISSUE: {
              let [fullRepo, issue] = value.split('#')
              apiPath = `repos/${fullRepo}/issues/${issue}`
              break
            }
            case EXTRACT_TYPE.COMMENT: {
              let [fullRepo, comment] = value.split(':')
              apiPath = `repos/${fullRepo}/issues/comments/${comment}`
              break
            }
            case EXTRACT_TYPE.COMMIT: {
              let values = value.split('@')
              let fullRepo = values[0]
              let commit = values[1]
              apiPath = `repos/${fullRepo}/commits/${commit}`
              break
            }
          }

          let baseOptions = {
            url: `${API_PREFIX}/${apiPath}`,
            dataType: 'json'
          }

          let isRetry = false
          let handleError = function(xhr) {
            let { status } = xhr
            let title = ''
            let message = ''

            switch (status) {
              case 0:
                if (isRetry) {
                  title = 'Connection error'
                  message = 'Please try again later.'
                } else {
                  // next request should be retry
                  isRetry = true
                  request()
                  return
                }
                break
              case 401:
                title = 'Invalid token'
                message = encodeHTML`<a href="${CREATE_TOKEN_PATH}" class="ghh-token-link" target="_blank">Create a new access token</a>, <a href="#" class="ghh-token-link">paste it back here</a> and try again.`
                break
              case 403: {
                let response = xhr.responseJSON
                if (
                  xhr
                    .getAllResponseHeaders()
                    .indexOf('X-RateLimit-Remaining: 0') !== -1
                ) {
                  title = 'API rate limit exceeded'
                  if (!localStorage.getItem(TOKEN_KEY)) {
                    message = encodeHTML`API rate limit exceeded for current IP. <a href="${CREATE_TOKEN_PATH}" class="ghh-token-link" target="_blank">Create a new access token</a> and <a href="#" class="ghh-token-link">paste it back here</a> to get a higher rate limit.`
                  }
                } else if (
                  type === EXTRACT_TYPE.REPO &&
                  response.block &&
                  response.block.reason === 'tos'
                ) {
                  title = 'Access blocked'
                  message = encodeHTML`Access to this repository has been disabled by GitHub staff.`
                } else {
                  title = 'Forbidden'
                  message = encodeHTML`You are not allowed to access GitHub API. <a href="${CREATE_TOKEN_PATH}" class="ghh-token-link" target="_blank">Create a new access token</a>, <a href="#" class="ghh-token-link">paste it back here</a> and try again.`
                }
                break
              }
              case 404:
                title = 'Not found'
                if (type === EXTRACT_TYPE.REPO || type === EXTRACT_TYPE.ISSUE) {
                  message = encodeHTML`The repository doesn't exist or is private. <a href="${CREATE_TOKEN_PATH}" class="ghh-token-link" target="_blank">Create a new access token</a>, <a href="#" class="ghh-token-link">paste it back here</a> and try again.`
                } else if (type === EXTRACT_TYPE.USER) {
                  message = "The user doesn't exist."
                }
                break
              case 451: {
                let response = xhr.responseJSON
                if (
                  type === EXTRACT_TYPE.REPO &&
                  response.block &&
                  response.block.reason === 'dmca'
                ) {
                  title = 'Access blocked'
                  message = encodeHTML`Repository access blocked due to DMCA takedown. See the <a href="${
                    response.block.html_url
                  }" target="_blank">takedown notice</a>.`
                }
                break
              }
              default: {
                title = 'Error'
                let response = xhr.responseJSON
                if (response) {
                  message = encodeHTML`${response.message}` || ''
                }
                break
              }
            }

            let error = {
              title,
              message,
              icons: {
                alert: getIcon('alert')
              }
            }
            elem.tooltipster('content', getErrorHTML(error))
          }

          let request = function() {
            let headers = {}
            if (token && !isRetry) {
              headers.Authorization = `token ${token}`
            }
            if (type === EXTRACT_TYPE.COMMIT) {
              headers.Accept = 'application/vnd.github.cryptographer-preview'
            } else if (type === EXTRACT_TYPE.REPO) {
              headers.Accept = 'application/vnd.github.mercy-preview+json'
            }

            let requestOptions = Object.assign({}, baseOptions, { headers })

            function renderMarkdown(content, context) {
              let options = {
                url: `${API_PREFIX}/markdown`,
                method: 'POST',
                contentType: 'application/json',
                dataType: 'text',
                data: JSON.stringify({
                  text: content,
                  mode: 'gfm',
                  context: context
                })
              }
              return $.ajax(Object.assign({}, requestOptions, options))
            }

            $.ajax(requestOptions)
              .done(raw => {
                cache[type][value] = raw

                // further requests if necessary
                switch (type) {
                  case EXTRACT_TYPE.USER: {
                    if (raw.type !== 'Organization') {
                      let todo = 0
                      let extra = {}

                      if (value) {
                        if (!cache.hovercard[value]) {
                          cache.hovercard[value] = {}
                        }

                        let subject = getHovercardSubject() || {}
                        // '@' for contextless
                        let subjectSlug = subject
                          ? `${subject.type}:${subject.id}`
                          : '@'
                        if (cache.hovercard[value][subjectSlug]) {
                          extra.hovercard = cache.hovercard[value][subjectSlug]
                        } else if (token) {
                          // get hovercard contexts
                          todo++

                          let headers = {
                            Accept: 'application/vnd.github.hagar-preview+json'
                          }
                          if (token) {
                            Object.assign(headers, {
                              Authorization: `token ${token}`
                            })
                          }
                          let options = {
                            url: `${API_PREFIX}/users/${value}/hovercard`,
                            method: 'GET',
                            dataType: 'json',
                            headers,
                            data: {
                              subject_type: subject.type,
                              subject_id: subject.id
                            }
                          }
                          $.ajax(Object.assign({}, baseOptions, options))
                            .done(hovercard => {
                              extra.hovercard = cache.hovercard[value][
                                subjectSlug
                              ] = hovercard.contexts
                              Object.assign(raw, extra)
                            })
                            .always(() => {
                              if (!--todo) {
                                elem.tooltipster(
                                  'content',
                                  getCardContent(type, raw, elem)
                                )
                              }
                            })
                        } else if (!me || value === me) {
                          elem.tooltipster(
                            'content',
                            getCardContent(type, raw, elem)
                          )
                        }

                        // if the logged-in user is following the current user
                        if (me && value !== me) {
                          todo += 2
                          extra = {
                            following_me: false,
                            followed_by_me: false
                          }

                          $.ajax(
                            Object.assign({}, requestOptions, {
                              url: `${API_PREFIX}/user/following/${value}`
                            })
                          )
                            .done(() => {
                              extra.followed_by_me = true
                            })
                            .always(() => {
                              Object.assign(raw, extra)
                              if (!--todo) {
                                elem.tooltipster(
                                  'content',
                                  getCardContent(type, raw, elem)
                                )
                              }
                            })
                          // if the current user is following the logged-in user
                          $.ajax(
                            Object.assign({}, requestOptions, {
                              url: `${API_PREFIX}/users/${value}/following/${me}`,
                              dataType: 'json'
                            })
                          )
                            .done(() => {
                              extra.following_me = true
                            })
                            .always(() => {
                              Object.assign(raw, extra)
                              if (!--todo) {
                                elem.tooltipster(
                                  'content',
                                  getCardContent(type, raw, elem)
                                )
                              }
                            })
                        }
                      }

                      return
                    }
                    break
                  }
                  case EXTRACT_TYPE.REPO: {
                    let headers = {
                      Accept: 'application/vnd.github.v3.html'
                    }
                    if (token) {
                      Object.assign(headers, {
                        Authorization: `token ${token}`
                      })
                    }

                    let todo = 0

                    if (cardOptions.readme) {
                      todo++
                      let options = {
                        url: `${API_PREFIX}/${apiPath}/readme`,
                        method: 'GET',
                        dataType: 'html',
                        headers
                      }
                      $.ajax(Object.assign({}, baseOptions, options))
                        .done(html => {
                          let content = $(html).find('.entry-content')
                          $('.anchor', content).remove()
                          let base = raw.html_url
                          $('[href], [src]', content).each(function() {
                            fixRef($(this), base, raw.default_branch)
                          })
                          raw.readme = content.html()
                        })
                        .always(() => {
                          if (!--todo) {
                            elem.tooltipster('content', getCardContent(type, raw, elem))
                          }
                        })
                    }

                    if (me) {
                      todo++
                      let extra = {
                        starred_by_me: false
                      }
                      $.ajax(
                        Object.assign({}, requestOptions, {
                          url: `${API_PREFIX}/user/starred/${value}`
                        })
                      )
                        .done(() => {
                          extra.starred_by_me = true
                        })
                        .always(() => {
                          Object.assign(raw, extra)
                          if (!--todo) {
                            elem.tooltipster('content', getCardContent(type, raw, elem))
                          }
                        })
                    }

                    if (!todo) {
                      break
                    }

                    return
                  }
                  case EXTRACT_TYPE.ISSUE: {
                    let todo = 0
                    if (raw.body) {
                      todo++
                      renderMarkdown(raw.body, value.split('#')[0])
                        .done(html => {
                          raw.bodyHTML = html
                          if (!--todo) {
                            elem.tooltipster('content', getCardContent(type, raw, elem))
                          }
                        })
                        .fail(handleError)
                    }
                    if (raw.pull_request) {
                      // load PR
                      todo++
                      let prPath = apiPath.replace(
                        /\/issues\/(\d+)$/,
                        '/pulls/$1'
                      )
                      let prOptions = {
                        url: `${API_PREFIX}/${prPath}`,
                        dataType: 'json'
                      }
                      $.ajax(Object.assign({}, requestOptions, prOptions))
                        .done(pull => {
                          let extra = {
                            commits: pull.commits,
                            additions: pull.additions,
                            deletions: pull.deletions,
                            changed_files: pull.changed_files,
                            mergeable: pull.mergeable,
                            mergeable_state: pull.mergeable_state,
                            merged: pull.merged,
                            head: pull.head,
                            base: pull.base
                          }
                          if (pull.merged) {
                            extra.state = 'merged'
                          }
                          Object.assign(raw, extra)
                          Object.assign(cache[type][value], extra)
                          if (!--todo) {
                            elem.tooltipster('content', getCardContent(type, raw, elem))
                          }
                        })
                        .fail(handleError)

                      let allReviews = []
                      Object.assign(raw, { reviews: allReviews })
                      Object.assign(cache[type][value], { reviews: allReviews })

                      // load reviews
                      todo++
                      let reviewPath = `${prPath}/reviews`
                      let reviewOptions = {
                        url: `${API_PREFIX}/${reviewPath}`,
                        dataType: 'json'
                      }
                      $.ajax(Object.assign({}, requestOptions, reviewOptions))
                        .done(reviews => {
                          let logged = reviews.reduce(
                            (acc, { user, state }) => {
                              let record = acc[user.login]
                              if (
                                user.login !== raw.user.login && // not self
                                ((state !== 'COMMENTED' &&
                                  state !== 'DISMISSED') ||
                                  (!record && state === 'COMMENTED'))
                              ) {
                                acc[user.login] = {
                                  name: user.login,
                                  url: user.html_url,
                                  avatar: user.avatar_url,
                                  state: state
                                }
                              }
                              return acc
                            },
                            {}
                          )
                          let results = Object.keys(logged).map(
                            login => logged[login]
                          )
                          allReviews.unshift(...results)
                          if (!--todo) {
                            elem.tooltipster('content', getCardContent(type, raw, elem))
                          }
                        })
                        .fail(handleError)

                      // load reviews
                      todo++
                      let reviewReqPath = `${prPath}/requested_reviewers`
                      let reviewReqOptions = {
                        url: `${API_PREFIX}/${reviewReqPath}`,
                        dataType: 'json'
                      }
                      let opts = Object.assign(
                        {},
                        requestOptions,
                        reviewReqOptions
                      )
                      opts.headers.Accept =
                        'application/vnd.github.thor-preview+json'
                      $.ajax(opts)
                        .done(reqs => {
                          let [owner] = value.split('/')
                          let users = reqs.users || reqs
                          let reviewers = users.map(user => {
                            return {
                              name: user.login,
                              url: user.html_url,
                              avatar: user.avatar_url,
                              state: 'PENDING'
                            }
                          })
                          if (reqs.teams) {
                            reviewers.push(
                              ...reqs.teams.map(team => {
                                return {
                                  name: team.name,
                                  url: `${SITE_PREFIX}orgs/${owner}/teams/${
                                    team.slug
                                  }`,
                                  avatar: '',
                                  state: 'PENDING'
                                }
                              })
                            )
                          }

                          allReviews.push(...reviewers)
                          if (!--todo) {
                            elem.tooltipster('content', getCardContent(type, raw, elem))
                          }
                        })
                        .fail(handleError)
                    }
                    if (!todo) {
                      break
                    }
                    return
                  }
                  case EXTRACT_TYPE.COMMENT: {
                    renderMarkdown(raw.body, value.split(':')[0])
                      .done(html => {
                        raw.bodyHTML = html
                        elem.tooltipster('content', getCardContent(type, raw, elem))
                      })
                      .fail(handleError)

                    return
                  }
                  case EXTRACT_TYPE.COMMIT: {
                    let [fullRepo, commit] = value.split('@')
                    let commitPagePath = `${fullRepo}/branch_commits/${commit}`
                    raw.fullRepo = fullRepo
                    raw.author = raw.author || raw.commit.author
                    raw.committer = raw.committer || raw.commit.committer
                    let options = {
                      url: `${SITE_PREFIX}${commitPagePath}`,
                      headers: {
                        'X-PJAX': 'true'
                      },
                      dataType: 'html'
                    }
                    $.ajax(Object.assign(options)).done(html => {
                      let branches = $(`<div>${html}</div>`)
                      raw.branch = branches.find('.branch a').text()
                      raw.pull = branches
                        .find('.pull-request a')
                        .text()
                        .substring(1)
                      let tags = branches
                        .find('.branches-tag-list a')
                        .map(function() {
                          return this.textContent
                        })
                        .get()

                      let maxTags = 10
                      if (tags.length) {
                        if (tags.length > maxTags) {
                          raw.truncatedTagNumber = tags.length - maxTags
                          tags.splice(maxTags)
                        }
                        raw.mainTag = tags[0]
                        raw.otherTags = tags.slice(1)
                      }

                      elem.tooltipster('content', getCardContent(type, raw, elem))
                    })

                    return
                  }
                }

                elem.tooltipster('content', getCardContent(type, raw, elem))
              })
              .fail(handleError)
          }
          request()
        }
      },
      functionReady () {

      },
      interactive: true
    })

    if ('webkitTransform' in document.body.style) {
      // why? see https://github.com/iamceege/tooltipster/issues/491
      // use box-shadow instead to prevent weirder problem...
      tipped.css('box-shadow', '0 0 transparent')
    }

    // disable original title tooltips
    tipped
      .attr('title', null)
      .closest('[data-hovercard-url]')
      .attr('data-hovercard-url', null)

    // block original tooltips
    // see https://github.com/Justineo/github-hovercard/issues/30
    const ORGANIC_TOOLTIP_CLASS = 'tooltipped'
    tipped
      .filter(`.${ORGANIC_TOOLTIP_CLASS}`)
      .removeClass(ORGANIC_TOOLTIP_CLASS)
    tipped
      .parents(`.${ORGANIC_TOOLTIP_CLASS}`)
      .removeClass(ORGANIC_TOOLTIP_CLASS)
  }

  $('body').on('keydown', e => {
    if (!e.key || e.key.toLowerCase() !== 'h') {
      return
    }

    let tippedTarget
    let target = $(e.target)
    if (target.is(TIP_SELECTOR)) {
      tippedTarget = target
    } else {
      tippedTarget = target.find(TIP_SELECTOR).eq(0)
    }
    if (tippedTarget) {
      tippedTarget.tooltipster('show')

      target.one('blur', () => {
        tippedTarget.tooltipster('hide')
      })
    }
  })

  function toggleButtonState(action) {
    return {
      follow: {
        type: 'user',
        field: 'followed_by_me',
        value: true,
        className: 'ghh-aux',
        action: 'unfollow',
        content: `Unfollow`
      },
      unfollow: {
        type: 'user',
        field: 'followed_by_me',
        value: false,
        className: 'ghh-primary',
        action: 'follow',
        content: `Follow`
      },
      star: {
        type: 'repo',
        field: 'starred_by_me',
        value: true,
        className: 'ghh-aux',
        action: 'unstar',
        content: `${getIcon('star-fill', 0.75)} Unstar`
      },
      unstar: {
        type: 'repo',
        field: 'starred_by_me',
        value: false,
        className: 'ghh-primary',
        action: 'star',
        content: `${getIcon('star', 0.75)} Star`
      }
    }[action]
  }

  if (me) {
    $('body').on('click', '[data-action]', function() {
      let { action, args } = this.dataset
      let options
      if (action === 'follow' || action === 'unfollow') {
        options = {
          url: `${API_PREFIX}/user/following/${args}`,
          method: action === 'follow' ? 'PUT' : 'DELETE'
        }
      } else if (action === 'star' || action === 'unstar') {
        options = {
          url: `${API_PREFIX}/user/starred/${args}`,
          method: action === 'star' ? 'PUT' : 'DELETE'
        }
      }

      options.headers = {
        Authorization: `token ${token}`
      }

      this.disabled = true
      $.ajax(options)
        .done(() => {
          let state = toggleButtonState(action)
          this.innerHTML = state.content
          this.dataset.action = state.action
          this.className = state.className
          this.disabled = false
          cache[state.type][args][state.field] = state.value
        })
        .fail(() => {
          let error = {
            title: 'Forbidden',
            message: encodeHTML`Please ensure your access token contains these scopes: </p><ul><li><code>public_repo</code></li><li><code>user:follow</code></li></ul><p><a href="${EDIT_TOKEN_PATH}" target="_blank">Edit token scopes</a> and try again.`,
            icons: {
              alert: getIcon('alert')
            }
          }
          $(this)
            .closest('.tooltipster-content')
            .html(getErrorHTML(error))
        })
    })
  }

  const EMOJI_MAP = {"100":"https://github.githubassets.com/images/icons/emoji/unicode/1f4af.png?v8","1234":"https://github.githubassets.com/images/icons/emoji/unicode/1f522.png?v8","+1":"https://github.githubassets.com/images/icons/emoji/unicode/1f44d.png?v8","-1":"https://github.githubassets.com/images/icons/emoji/unicode/1f44e.png?v8","1st_place_medal":"https://github.githubassets.com/images/icons/emoji/unicode/1f947.png?v8","2nd_place_medal":"https://github.githubassets.com/images/icons/emoji/unicode/1f948.png?v8","3rd_place_medal":"https://github.githubassets.com/images/icons/emoji/unicode/1f949.png?v8","8ball":"https://github.githubassets.com/images/icons/emoji/unicode/1f3b1.png?v8","a":"https://github.githubassets.com/images/icons/emoji/unicode/1f170.png?v8","ab":"https://github.githubassets.com/images/icons/emoji/unicode/1f18e.png?v8","abc":"https://github.githubassets.com/images/icons/emoji/unicode/1f524.png?v8","abcd":"https://github.githubassets.com/images/icons/emoji/unicode/1f521.png?v8","accept":"https://github.githubassets.com/images/icons/emoji/unicode/1f251.png?v8","aerial_tramway":"https://github.githubassets.com/images/icons/emoji/unicode/1f6a1.png?v8","afghanistan":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e6-1f1eb.png?v8","airplane":"https://github.githubassets.com/images/icons/emoji/unicode/2708.png?v8","aland_islands":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e6-1f1fd.png?v8","alarm_clock":"https://github.githubassets.com/images/icons/emoji/unicode/23f0.png?v8","albania":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e6-1f1f1.png?v8","alembic":"https://github.githubassets.com/images/icons/emoji/unicode/2697.png?v8","algeria":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e9-1f1ff.png?v8","alien":"https://github.githubassets.com/images/icons/emoji/unicode/1f47d.png?v8","ambulance":"https://github.githubassets.com/images/icons/emoji/unicode/1f691.png?v8","american_samoa":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e6-1f1f8.png?v8","amphora":"https://github.githubassets.com/images/icons/emoji/unicode/1f3fa.png?v8","anchor":"https://github.githubassets.com/images/icons/emoji/unicode/2693.png?v8","andorra":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e6-1f1e9.png?v8","angel":"https://github.githubassets.com/images/icons/emoji/unicode/1f47c.png?v8","anger":"https://github.githubassets.com/images/icons/emoji/unicode/1f4a2.png?v8","angola":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e6-1f1f4.png?v8","angry":"https://github.githubassets.com/images/icons/emoji/unicode/1f620.png?v8","anguilla":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e6-1f1ee.png?v8","anguished":"https://github.githubassets.com/images/icons/emoji/unicode/1f627.png?v8","ant":"https://github.githubassets.com/images/icons/emoji/unicode/1f41c.png?v8","antarctica":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e6-1f1f6.png?v8","antigua_barbuda":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e6-1f1ec.png?v8","apple":"https://github.githubassets.com/images/icons/emoji/unicode/1f34e.png?v8","aquarius":"https://github.githubassets.com/images/icons/emoji/unicode/2652.png?v8","argentina":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e6-1f1f7.png?v8","aries":"https://github.githubassets.com/images/icons/emoji/unicode/2648.png?v8","armenia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e6-1f1f2.png?v8","arrow_backward":"https://github.githubassets.com/images/icons/emoji/unicode/25c0.png?v8","arrow_double_down":"https://github.githubassets.com/images/icons/emoji/unicode/23ec.png?v8","arrow_double_up":"https://github.githubassets.com/images/icons/emoji/unicode/23eb.png?v8","arrow_down":"https://github.githubassets.com/images/icons/emoji/unicode/2b07.png?v8","arrow_down_small":"https://github.githubassets.com/images/icons/emoji/unicode/1f53d.png?v8","arrow_forward":"https://github.githubassets.com/images/icons/emoji/unicode/25b6.png?v8","arrow_heading_down":"https://github.githubassets.com/images/icons/emoji/unicode/2935.png?v8","arrow_heading_up":"https://github.githubassets.com/images/icons/emoji/unicode/2934.png?v8","arrow_left":"https://github.githubassets.com/images/icons/emoji/unicode/2b05.png?v8","arrow_lower_left":"https://github.githubassets.com/images/icons/emoji/unicode/2199.png?v8","arrow_lower_right":"https://github.githubassets.com/images/icons/emoji/unicode/2198.png?v8","arrow_right":"https://github.githubassets.com/images/icons/emoji/unicode/27a1.png?v8","arrow_right_hook":"https://github.githubassets.com/images/icons/emoji/unicode/21aa.png?v8","arrow_up":"https://github.githubassets.com/images/icons/emoji/unicode/2b06.png?v8","arrow_up_down":"https://github.githubassets.com/images/icons/emoji/unicode/2195.png?v8","arrow_up_small":"https://github.githubassets.com/images/icons/emoji/unicode/1f53c.png?v8","arrow_upper_left":"https://github.githubassets.com/images/icons/emoji/unicode/2196.png?v8","arrow_upper_right":"https://github.githubassets.com/images/icons/emoji/unicode/2197.png?v8","arrows_clockwise":"https://github.githubassets.com/images/icons/emoji/unicode/1f503.png?v8","arrows_counterclockwise":"https://github.githubassets.com/images/icons/emoji/unicode/1f504.png?v8","art":"https://github.githubassets.com/images/icons/emoji/unicode/1f3a8.png?v8","articulated_lorry":"https://github.githubassets.com/images/icons/emoji/unicode/1f69b.png?v8","artificial_satellite":"https://github.githubassets.com/images/icons/emoji/unicode/1f6f0.png?v8","aruba":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e6-1f1fc.png?v8","asterisk":"https://github.githubassets.com/images/icons/emoji/unicode/002a-20e3.png?v8","astonished":"https://github.githubassets.com/images/icons/emoji/unicode/1f632.png?v8","athletic_shoe":"https://github.githubassets.com/images/icons/emoji/unicode/1f45f.png?v8","atm":"https://github.githubassets.com/images/icons/emoji/unicode/1f3e7.png?v8","atom":"https://github.githubassets.com/images/icons/emoji/atom.png?v8","atom_symbol":"https://github.githubassets.com/images/icons/emoji/unicode/269b.png?v8","australia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e6-1f1fa.png?v8","austria":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e6-1f1f9.png?v8","avocado":"https://github.githubassets.com/images/icons/emoji/unicode/1f951.png?v8","azerbaijan":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e6-1f1ff.png?v8","b":"https://github.githubassets.com/images/icons/emoji/unicode/1f171.png?v8","baby":"https://github.githubassets.com/images/icons/emoji/unicode/1f476.png?v8","baby_bottle":"https://github.githubassets.com/images/icons/emoji/unicode/1f37c.png?v8","baby_chick":"https://github.githubassets.com/images/icons/emoji/unicode/1f424.png?v8","baby_symbol":"https://github.githubassets.com/images/icons/emoji/unicode/1f6bc.png?v8","back":"https://github.githubassets.com/images/icons/emoji/unicode/1f519.png?v8","bacon":"https://github.githubassets.com/images/icons/emoji/unicode/1f953.png?v8","badminton":"https://github.githubassets.com/images/icons/emoji/unicode/1f3f8.png?v8","baggage_claim":"https://github.githubassets.com/images/icons/emoji/unicode/1f6c4.png?v8","baguette_bread":"https://github.githubassets.com/images/icons/emoji/unicode/1f956.png?v8","bahamas":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e7-1f1f8.png?v8","bahrain":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e7-1f1ed.png?v8","balance_scale":"https://github.githubassets.com/images/icons/emoji/unicode/2696.png?v8","balloon":"https://github.githubassets.com/images/icons/emoji/unicode/1f388.png?v8","ballot_box":"https://github.githubassets.com/images/icons/emoji/unicode/1f5f3.png?v8","ballot_box_with_check":"https://github.githubassets.com/images/icons/emoji/unicode/2611.png?v8","bamboo":"https://github.githubassets.com/images/icons/emoji/unicode/1f38d.png?v8","banana":"https://github.githubassets.com/images/icons/emoji/unicode/1f34c.png?v8","bangbang":"https://github.githubassets.com/images/icons/emoji/unicode/203c.png?v8","bangladesh":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e7-1f1e9.png?v8","bank":"https://github.githubassets.com/images/icons/emoji/unicode/1f3e6.png?v8","bar_chart":"https://github.githubassets.com/images/icons/emoji/unicode/1f4ca.png?v8","barbados":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e7-1f1e7.png?v8","barber":"https://github.githubassets.com/images/icons/emoji/unicode/1f488.png?v8","baseball":"https://github.githubassets.com/images/icons/emoji/unicode/26be.png?v8","basecamp":"https://github.githubassets.com/images/icons/emoji/basecamp.png?v8","basecampy":"https://github.githubassets.com/images/icons/emoji/basecampy.png?v8","basketball":"https://github.githubassets.com/images/icons/emoji/unicode/1f3c0.png?v8","basketball_man":"https://github.githubassets.com/images/icons/emoji/unicode/26f9.png?v8","basketball_woman":"https://github.githubassets.com/images/icons/emoji/unicode/26f9-2640.png?v8","bat":"https://github.githubassets.com/images/icons/emoji/unicode/1f987.png?v8","bath":"https://github.githubassets.com/images/icons/emoji/unicode/1f6c0.png?v8","bathtub":"https://github.githubassets.com/images/icons/emoji/unicode/1f6c1.png?v8","battery":"https://github.githubassets.com/images/icons/emoji/unicode/1f50b.png?v8","beach_umbrella":"https://github.githubassets.com/images/icons/emoji/unicode/1f3d6.png?v8","bear":"https://github.githubassets.com/images/icons/emoji/unicode/1f43b.png?v8","bed":"https://github.githubassets.com/images/icons/emoji/unicode/1f6cf.png?v8","bee":"https://github.githubassets.com/images/icons/emoji/unicode/1f41d.png?v8","beer":"https://github.githubassets.com/images/icons/emoji/unicode/1f37a.png?v8","beers":"https://github.githubassets.com/images/icons/emoji/unicode/1f37b.png?v8","beetle":"https://github.githubassets.com/images/icons/emoji/unicode/1f41e.png?v8","beginner":"https://github.githubassets.com/images/icons/emoji/unicode/1f530.png?v8","belarus":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e7-1f1fe.png?v8","belgium":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e7-1f1ea.png?v8","belize":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e7-1f1ff.png?v8","bell":"https://github.githubassets.com/images/icons/emoji/unicode/1f514.png?v8","bellhop_bell":"https://github.githubassets.com/images/icons/emoji/unicode/1f6ce.png?v8","benin":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e7-1f1ef.png?v8","bento":"https://github.githubassets.com/images/icons/emoji/unicode/1f371.png?v8","bermuda":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e7-1f1f2.png?v8","bhutan":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e7-1f1f9.png?v8","bicyclist":"https://github.githubassets.com/images/icons/emoji/unicode/1f6b4.png?v8","bike":"https://github.githubassets.com/images/icons/emoji/unicode/1f6b2.png?v8","biking_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f6b4.png?v8","biking_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f6b4-2640.png?v8","bikini":"https://github.githubassets.com/images/icons/emoji/unicode/1f459.png?v8","biohazard":"https://github.githubassets.com/images/icons/emoji/unicode/2623.png?v8","bird":"https://github.githubassets.com/images/icons/emoji/unicode/1f426.png?v8","birthday":"https://github.githubassets.com/images/icons/emoji/unicode/1f382.png?v8","black_circle":"https://github.githubassets.com/images/icons/emoji/unicode/26ab.png?v8","black_flag":"https://github.githubassets.com/images/icons/emoji/unicode/1f3f4.png?v8","black_heart":"https://github.githubassets.com/images/icons/emoji/unicode/1f5a4.png?v8","black_joker":"https://github.githubassets.com/images/icons/emoji/unicode/1f0cf.png?v8","black_large_square":"https://github.githubassets.com/images/icons/emoji/unicode/2b1b.png?v8","black_medium_small_square":"https://github.githubassets.com/images/icons/emoji/unicode/25fe.png?v8","black_medium_square":"https://github.githubassets.com/images/icons/emoji/unicode/25fc.png?v8","black_nib":"https://github.githubassets.com/images/icons/emoji/unicode/2712.png?v8","black_small_square":"https://github.githubassets.com/images/icons/emoji/unicode/25aa.png?v8","black_square_button":"https://github.githubassets.com/images/icons/emoji/unicode/1f532.png?v8","blonde_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f471.png?v8","blonde_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f471-2640.png?v8","blossom":"https://github.githubassets.com/images/icons/emoji/unicode/1f33c.png?v8","blowfish":"https://github.githubassets.com/images/icons/emoji/unicode/1f421.png?v8","blue_book":"https://github.githubassets.com/images/icons/emoji/unicode/1f4d8.png?v8","blue_car":"https://github.githubassets.com/images/icons/emoji/unicode/1f699.png?v8","blue_heart":"https://github.githubassets.com/images/icons/emoji/unicode/1f499.png?v8","blush":"https://github.githubassets.com/images/icons/emoji/unicode/1f60a.png?v8","boar":"https://github.githubassets.com/images/icons/emoji/unicode/1f417.png?v8","boat":"https://github.githubassets.com/images/icons/emoji/unicode/26f5.png?v8","bolivia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e7-1f1f4.png?v8","bomb":"https://github.githubassets.com/images/icons/emoji/unicode/1f4a3.png?v8","book":"https://github.githubassets.com/images/icons/emoji/unicode/1f4d6.png?v8","bookmark":"https://github.githubassets.com/images/icons/emoji/unicode/1f516.png?v8","bookmark_tabs":"https://github.githubassets.com/images/icons/emoji/unicode/1f4d1.png?v8","books":"https://github.githubassets.com/images/icons/emoji/unicode/1f4da.png?v8","boom":"https://github.githubassets.com/images/icons/emoji/unicode/1f4a5.png?v8","boot":"https://github.githubassets.com/images/icons/emoji/unicode/1f462.png?v8","bosnia_herzegovina":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e7-1f1e6.png?v8","botswana":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e7-1f1fc.png?v8","bouquet":"https://github.githubassets.com/images/icons/emoji/unicode/1f490.png?v8","bow":"https://github.githubassets.com/images/icons/emoji/unicode/1f647.png?v8","bow_and_arrow":"https://github.githubassets.com/images/icons/emoji/unicode/1f3f9.png?v8","bowing_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f647.png?v8","bowing_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f647-2640.png?v8","bowling":"https://github.githubassets.com/images/icons/emoji/unicode/1f3b3.png?v8","bowtie":"https://github.githubassets.com/images/icons/emoji/bowtie.png?v8","boxing_glove":"https://github.githubassets.com/images/icons/emoji/unicode/1f94a.png?v8","boy":"https://github.githubassets.com/images/icons/emoji/unicode/1f466.png?v8","brazil":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e7-1f1f7.png?v8","bread":"https://github.githubassets.com/images/icons/emoji/unicode/1f35e.png?v8","bride_with_veil":"https://github.githubassets.com/images/icons/emoji/unicode/1f470.png?v8","bridge_at_night":"https://github.githubassets.com/images/icons/emoji/unicode/1f309.png?v8","briefcase":"https://github.githubassets.com/images/icons/emoji/unicode/1f4bc.png?v8","british_indian_ocean_territory":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ee-1f1f4.png?v8","british_virgin_islands":"https://github.githubassets.com/images/icons/emoji/unicode/1f1fb-1f1ec.png?v8","broken_heart":"https://github.githubassets.com/images/icons/emoji/unicode/1f494.png?v8","brunei":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e7-1f1f3.png?v8","bug":"https://github.githubassets.com/images/icons/emoji/unicode/1f41b.png?v8","building_construction":"https://github.githubassets.com/images/icons/emoji/unicode/1f3d7.png?v8","bulb":"https://github.githubassets.com/images/icons/emoji/unicode/1f4a1.png?v8","bulgaria":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e7-1f1ec.png?v8","bullettrain_front":"https://github.githubassets.com/images/icons/emoji/unicode/1f685.png?v8","bullettrain_side":"https://github.githubassets.com/images/icons/emoji/unicode/1f684.png?v8","burkina_faso":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e7-1f1eb.png?v8","burrito":"https://github.githubassets.com/images/icons/emoji/unicode/1f32f.png?v8","burundi":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e7-1f1ee.png?v8","bus":"https://github.githubassets.com/images/icons/emoji/unicode/1f68c.png?v8","business_suit_levitating":"https://github.githubassets.com/images/icons/emoji/unicode/1f574.png?v8","busstop":"https://github.githubassets.com/images/icons/emoji/unicode/1f68f.png?v8","bust_in_silhouette":"https://github.githubassets.com/images/icons/emoji/unicode/1f464.png?v8","busts_in_silhouette":"https://github.githubassets.com/images/icons/emoji/unicode/1f465.png?v8","butterfly":"https://github.githubassets.com/images/icons/emoji/unicode/1f98b.png?v8","cactus":"https://github.githubassets.com/images/icons/emoji/unicode/1f335.png?v8","cake":"https://github.githubassets.com/images/icons/emoji/unicode/1f370.png?v8","calendar":"https://github.githubassets.com/images/icons/emoji/unicode/1f4c6.png?v8","call_me_hand":"https://github.githubassets.com/images/icons/emoji/unicode/1f919.png?v8","calling":"https://github.githubassets.com/images/icons/emoji/unicode/1f4f2.png?v8","cambodia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f0-1f1ed.png?v8","camel":"https://github.githubassets.com/images/icons/emoji/unicode/1f42b.png?v8","camera":"https://github.githubassets.com/images/icons/emoji/unicode/1f4f7.png?v8","camera_flash":"https://github.githubassets.com/images/icons/emoji/unicode/1f4f8.png?v8","cameroon":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e8-1f1f2.png?v8","camping":"https://github.githubassets.com/images/icons/emoji/unicode/1f3d5.png?v8","canada":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e8-1f1e6.png?v8","canary_islands":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ee-1f1e8.png?v8","cancer":"https://github.githubassets.com/images/icons/emoji/unicode/264b.png?v8","candle":"https://github.githubassets.com/images/icons/emoji/unicode/1f56f.png?v8","candy":"https://github.githubassets.com/images/icons/emoji/unicode/1f36c.png?v8","canoe":"https://github.githubassets.com/images/icons/emoji/unicode/1f6f6.png?v8","cape_verde":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e8-1f1fb.png?v8","capital_abcd":"https://github.githubassets.com/images/icons/emoji/unicode/1f520.png?v8","capricorn":"https://github.githubassets.com/images/icons/emoji/unicode/2651.png?v8","car":"https://github.githubassets.com/images/icons/emoji/unicode/1f697.png?v8","card_file_box":"https://github.githubassets.com/images/icons/emoji/unicode/1f5c3.png?v8","card_index":"https://github.githubassets.com/images/icons/emoji/unicode/1f4c7.png?v8","card_index_dividers":"https://github.githubassets.com/images/icons/emoji/unicode/1f5c2.png?v8","caribbean_netherlands":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e7-1f1f6.png?v8","carousel_horse":"https://github.githubassets.com/images/icons/emoji/unicode/1f3a0.png?v8","carrot":"https://github.githubassets.com/images/icons/emoji/unicode/1f955.png?v8","cat":"https://github.githubassets.com/images/icons/emoji/unicode/1f431.png?v8","cat2":"https://github.githubassets.com/images/icons/emoji/unicode/1f408.png?v8","cayman_islands":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f0-1f1fe.png?v8","cd":"https://github.githubassets.com/images/icons/emoji/unicode/1f4bf.png?v8","central_african_republic":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e8-1f1eb.png?v8","chad":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f9-1f1e9.png?v8","chains":"https://github.githubassets.com/images/icons/emoji/unicode/26d3.png?v8","champagne":"https://github.githubassets.com/images/icons/emoji/unicode/1f37e.png?v8","chart":"https://github.githubassets.com/images/icons/emoji/unicode/1f4b9.png?v8","chart_with_downwards_trend":"https://github.githubassets.com/images/icons/emoji/unicode/1f4c9.png?v8","chart_with_upwards_trend":"https://github.githubassets.com/images/icons/emoji/unicode/1f4c8.png?v8","checkered_flag":"https://github.githubassets.com/images/icons/emoji/unicode/1f3c1.png?v8","cheese":"https://github.githubassets.com/images/icons/emoji/unicode/1f9c0.png?v8","cherries":"https://github.githubassets.com/images/icons/emoji/unicode/1f352.png?v8","cherry_blossom":"https://github.githubassets.com/images/icons/emoji/unicode/1f338.png?v8","chestnut":"https://github.githubassets.com/images/icons/emoji/unicode/1f330.png?v8","chicken":"https://github.githubassets.com/images/icons/emoji/unicode/1f414.png?v8","children_crossing":"https://github.githubassets.com/images/icons/emoji/unicode/1f6b8.png?v8","chile":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e8-1f1f1.png?v8","chipmunk":"https://github.githubassets.com/images/icons/emoji/unicode/1f43f.png?v8","chocolate_bar":"https://github.githubassets.com/images/icons/emoji/unicode/1f36b.png?v8","christmas_island":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e8-1f1fd.png?v8","christmas_tree":"https://github.githubassets.com/images/icons/emoji/unicode/1f384.png?v8","church":"https://github.githubassets.com/images/icons/emoji/unicode/26ea.png?v8","cinema":"https://github.githubassets.com/images/icons/emoji/unicode/1f3a6.png?v8","circus_tent":"https://github.githubassets.com/images/icons/emoji/unicode/1f3aa.png?v8","city_sunrise":"https://github.githubassets.com/images/icons/emoji/unicode/1f307.png?v8","city_sunset":"https://github.githubassets.com/images/icons/emoji/unicode/1f306.png?v8","cityscape":"https://github.githubassets.com/images/icons/emoji/unicode/1f3d9.png?v8","cl":"https://github.githubassets.com/images/icons/emoji/unicode/1f191.png?v8","clamp":"https://github.githubassets.com/images/icons/emoji/unicode/1f5dc.png?v8","clap":"https://github.githubassets.com/images/icons/emoji/unicode/1f44f.png?v8","clapper":"https://github.githubassets.com/images/icons/emoji/unicode/1f3ac.png?v8","classical_building":"https://github.githubassets.com/images/icons/emoji/unicode/1f3db.png?v8","clinking_glasses":"https://github.githubassets.com/images/icons/emoji/unicode/1f942.png?v8","clipboard":"https://github.githubassets.com/images/icons/emoji/unicode/1f4cb.png?v8","clock1":"https://github.githubassets.com/images/icons/emoji/unicode/1f550.png?v8","clock10":"https://github.githubassets.com/images/icons/emoji/unicode/1f559.png?v8","clock1030":"https://github.githubassets.com/images/icons/emoji/unicode/1f565.png?v8","clock11":"https://github.githubassets.com/images/icons/emoji/unicode/1f55a.png?v8","clock1130":"https://github.githubassets.com/images/icons/emoji/unicode/1f566.png?v8","clock12":"https://github.githubassets.com/images/icons/emoji/unicode/1f55b.png?v8","clock1230":"https://github.githubassets.com/images/icons/emoji/unicode/1f567.png?v8","clock130":"https://github.githubassets.com/images/icons/emoji/unicode/1f55c.png?v8","clock2":"https://github.githubassets.com/images/icons/emoji/unicode/1f551.png?v8","clock230":"https://github.githubassets.com/images/icons/emoji/unicode/1f55d.png?v8","clock3":"https://github.githubassets.com/images/icons/emoji/unicode/1f552.png?v8","clock330":"https://github.githubassets.com/images/icons/emoji/unicode/1f55e.png?v8","clock4":"https://github.githubassets.com/images/icons/emoji/unicode/1f553.png?v8","clock430":"https://github.githubassets.com/images/icons/emoji/unicode/1f55f.png?v8","clock5":"https://github.githubassets.com/images/icons/emoji/unicode/1f554.png?v8","clock530":"https://github.githubassets.com/images/icons/emoji/unicode/1f560.png?v8","clock6":"https://github.githubassets.com/images/icons/emoji/unicode/1f555.png?v8","clock630":"https://github.githubassets.com/images/icons/emoji/unicode/1f561.png?v8","clock7":"https://github.githubassets.com/images/icons/emoji/unicode/1f556.png?v8","clock730":"https://github.githubassets.com/images/icons/emoji/unicode/1f562.png?v8","clock8":"https://github.githubassets.com/images/icons/emoji/unicode/1f557.png?v8","clock830":"https://github.githubassets.com/images/icons/emoji/unicode/1f563.png?v8","clock9":"https://github.githubassets.com/images/icons/emoji/unicode/1f558.png?v8","clock930":"https://github.githubassets.com/images/icons/emoji/unicode/1f564.png?v8","closed_book":"https://github.githubassets.com/images/icons/emoji/unicode/1f4d5.png?v8","closed_lock_with_key":"https://github.githubassets.com/images/icons/emoji/unicode/1f510.png?v8","closed_umbrella":"https://github.githubassets.com/images/icons/emoji/unicode/1f302.png?v8","cloud":"https://github.githubassets.com/images/icons/emoji/unicode/2601.png?v8","cloud_with_lightning":"https://github.githubassets.com/images/icons/emoji/unicode/1f329.png?v8","cloud_with_lightning_and_rain":"https://github.githubassets.com/images/icons/emoji/unicode/26c8.png?v8","cloud_with_rain":"https://github.githubassets.com/images/icons/emoji/unicode/1f327.png?v8","cloud_with_snow":"https://github.githubassets.com/images/icons/emoji/unicode/1f328.png?v8","clown_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f921.png?v8","clubs":"https://github.githubassets.com/images/icons/emoji/unicode/2663.png?v8","cn":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e8-1f1f3.png?v8","cocktail":"https://github.githubassets.com/images/icons/emoji/unicode/1f378.png?v8","cocos_islands":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e8-1f1e8.png?v8","coffee":"https://github.githubassets.com/images/icons/emoji/unicode/2615.png?v8","coffin":"https://github.githubassets.com/images/icons/emoji/unicode/26b0.png?v8","cold_sweat":"https://github.githubassets.com/images/icons/emoji/unicode/1f630.png?v8","collision":"https://github.githubassets.com/images/icons/emoji/unicode/1f4a5.png?v8","colombia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e8-1f1f4.png?v8","comet":"https://github.githubassets.com/images/icons/emoji/unicode/2604.png?v8","comoros":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f0-1f1f2.png?v8","computer":"https://github.githubassets.com/images/icons/emoji/unicode/1f4bb.png?v8","computer_mouse":"https://github.githubassets.com/images/icons/emoji/unicode/1f5b1.png?v8","confetti_ball":"https://github.githubassets.com/images/icons/emoji/unicode/1f38a.png?v8","confounded":"https://github.githubassets.com/images/icons/emoji/unicode/1f616.png?v8","confused":"https://github.githubassets.com/images/icons/emoji/unicode/1f615.png?v8","congo_brazzaville":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e8-1f1ec.png?v8","congo_kinshasa":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e8-1f1e9.png?v8","congratulations":"https://github.githubassets.com/images/icons/emoji/unicode/3297.png?v8","construction":"https://github.githubassets.com/images/icons/emoji/unicode/1f6a7.png?v8","construction_worker":"https://github.githubassets.com/images/icons/emoji/unicode/1f477.png?v8","construction_worker_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f477.png?v8","construction_worker_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f477-2640.png?v8","control_knobs":"https://github.githubassets.com/images/icons/emoji/unicode/1f39b.png?v8","convenience_store":"https://github.githubassets.com/images/icons/emoji/unicode/1f3ea.png?v8","cook_islands":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e8-1f1f0.png?v8","cookie":"https://github.githubassets.com/images/icons/emoji/unicode/1f36a.png?v8","cool":"https://github.githubassets.com/images/icons/emoji/unicode/1f192.png?v8","cop":"https://github.githubassets.com/images/icons/emoji/unicode/1f46e.png?v8","copyright":"https://github.githubassets.com/images/icons/emoji/unicode/00a9.png?v8","corn":"https://github.githubassets.com/images/icons/emoji/unicode/1f33d.png?v8","costa_rica":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e8-1f1f7.png?v8","cote_divoire":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e8-1f1ee.png?v8","couch_and_lamp":"https://github.githubassets.com/images/icons/emoji/unicode/1f6cb.png?v8","couple":"https://github.githubassets.com/images/icons/emoji/unicode/1f46b.png?v8","couple_with_heart":"https://github.githubassets.com/images/icons/emoji/unicode/1f491.png?v8","couple_with_heart_man_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-2764-1f468.png?v8","couple_with_heart_woman_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f491.png?v8","couple_with_heart_woman_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-2764-1f469.png?v8","couplekiss_man_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-2764-1f48b-1f468.png?v8","couplekiss_man_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f48f.png?v8","couplekiss_woman_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-2764-1f48b-1f469.png?v8","cow":"https://github.githubassets.com/images/icons/emoji/unicode/1f42e.png?v8","cow2":"https://github.githubassets.com/images/icons/emoji/unicode/1f404.png?v8","cowboy_hat_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f920.png?v8","crab":"https://github.githubassets.com/images/icons/emoji/unicode/1f980.png?v8","crayon":"https://github.githubassets.com/images/icons/emoji/unicode/1f58d.png?v8","credit_card":"https://github.githubassets.com/images/icons/emoji/unicode/1f4b3.png?v8","crescent_moon":"https://github.githubassets.com/images/icons/emoji/unicode/1f319.png?v8","cricket":"https://github.githubassets.com/images/icons/emoji/unicode/1f3cf.png?v8","croatia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ed-1f1f7.png?v8","crocodile":"https://github.githubassets.com/images/icons/emoji/unicode/1f40a.png?v8","croissant":"https://github.githubassets.com/images/icons/emoji/unicode/1f950.png?v8","crossed_fingers":"https://github.githubassets.com/images/icons/emoji/unicode/1f91e.png?v8","crossed_flags":"https://github.githubassets.com/images/icons/emoji/unicode/1f38c.png?v8","crossed_swords":"https://github.githubassets.com/images/icons/emoji/unicode/2694.png?v8","crown":"https://github.githubassets.com/images/icons/emoji/unicode/1f451.png?v8","cry":"https://github.githubassets.com/images/icons/emoji/unicode/1f622.png?v8","crying_cat_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f63f.png?v8","crystal_ball":"https://github.githubassets.com/images/icons/emoji/unicode/1f52e.png?v8","cuba":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e8-1f1fa.png?v8","cucumber":"https://github.githubassets.com/images/icons/emoji/unicode/1f952.png?v8","cupid":"https://github.githubassets.com/images/icons/emoji/unicode/1f498.png?v8","curacao":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e8-1f1fc.png?v8","curly_loop":"https://github.githubassets.com/images/icons/emoji/unicode/27b0.png?v8","currency_exchange":"https://github.githubassets.com/images/icons/emoji/unicode/1f4b1.png?v8","curry":"https://github.githubassets.com/images/icons/emoji/unicode/1f35b.png?v8","custard":"https://github.githubassets.com/images/icons/emoji/unicode/1f36e.png?v8","customs":"https://github.githubassets.com/images/icons/emoji/unicode/1f6c3.png?v8","cyclone":"https://github.githubassets.com/images/icons/emoji/unicode/1f300.png?v8","cyprus":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e8-1f1fe.png?v8","czech_republic":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e8-1f1ff.png?v8","dagger":"https://github.githubassets.com/images/icons/emoji/unicode/1f5e1.png?v8","dancer":"https://github.githubassets.com/images/icons/emoji/unicode/1f483.png?v8","dancers":"https://github.githubassets.com/images/icons/emoji/unicode/1f46f.png?v8","dancing_men":"https://github.githubassets.com/images/icons/emoji/unicode/1f46f-2642.png?v8","dancing_women":"https://github.githubassets.com/images/icons/emoji/unicode/1f46f.png?v8","dango":"https://github.githubassets.com/images/icons/emoji/unicode/1f361.png?v8","dark_sunglasses":"https://github.githubassets.com/images/icons/emoji/unicode/1f576.png?v8","dart":"https://github.githubassets.com/images/icons/emoji/unicode/1f3af.png?v8","dash":"https://github.githubassets.com/images/icons/emoji/unicode/1f4a8.png?v8","date":"https://github.githubassets.com/images/icons/emoji/unicode/1f4c5.png?v8","de":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e9-1f1ea.png?v8","deciduous_tree":"https://github.githubassets.com/images/icons/emoji/unicode/1f333.png?v8","deer":"https://github.githubassets.com/images/icons/emoji/unicode/1f98c.png?v8","denmark":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e9-1f1f0.png?v8","department_store":"https://github.githubassets.com/images/icons/emoji/unicode/1f3ec.png?v8","derelict_house":"https://github.githubassets.com/images/icons/emoji/unicode/1f3da.png?v8","desert":"https://github.githubassets.com/images/icons/emoji/unicode/1f3dc.png?v8","desert_island":"https://github.githubassets.com/images/icons/emoji/unicode/1f3dd.png?v8","desktop_computer":"https://github.githubassets.com/images/icons/emoji/unicode/1f5a5.png?v8","detective":"https://github.githubassets.com/images/icons/emoji/unicode/1f575.png?v8","diamond_shape_with_a_dot_inside":"https://github.githubassets.com/images/icons/emoji/unicode/1f4a0.png?v8","diamonds":"https://github.githubassets.com/images/icons/emoji/unicode/2666.png?v8","disappointed":"https://github.githubassets.com/images/icons/emoji/unicode/1f61e.png?v8","disappointed_relieved":"https://github.githubassets.com/images/icons/emoji/unicode/1f625.png?v8","dizzy":"https://github.githubassets.com/images/icons/emoji/unicode/1f4ab.png?v8","dizzy_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f635.png?v8","djibouti":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e9-1f1ef.png?v8","do_not_litter":"https://github.githubassets.com/images/icons/emoji/unicode/1f6af.png?v8","dog":"https://github.githubassets.com/images/icons/emoji/unicode/1f436.png?v8","dog2":"https://github.githubassets.com/images/icons/emoji/unicode/1f415.png?v8","dollar":"https://github.githubassets.com/images/icons/emoji/unicode/1f4b5.png?v8","dolls":"https://github.githubassets.com/images/icons/emoji/unicode/1f38e.png?v8","dolphin":"https://github.githubassets.com/images/icons/emoji/unicode/1f42c.png?v8","dominica":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e9-1f1f2.png?v8","dominican_republic":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e9-1f1f4.png?v8","door":"https://github.githubassets.com/images/icons/emoji/unicode/1f6aa.png?v8","doughnut":"https://github.githubassets.com/images/icons/emoji/unicode/1f369.png?v8","dove":"https://github.githubassets.com/images/icons/emoji/unicode/1f54a.png?v8","dragon":"https://github.githubassets.com/images/icons/emoji/unicode/1f409.png?v8","dragon_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f432.png?v8","dress":"https://github.githubassets.com/images/icons/emoji/unicode/1f457.png?v8","dromedary_camel":"https://github.githubassets.com/images/icons/emoji/unicode/1f42a.png?v8","drooling_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f924.png?v8","droplet":"https://github.githubassets.com/images/icons/emoji/unicode/1f4a7.png?v8","drum":"https://github.githubassets.com/images/icons/emoji/unicode/1f941.png?v8","duck":"https://github.githubassets.com/images/icons/emoji/unicode/1f986.png?v8","dvd":"https://github.githubassets.com/images/icons/emoji/unicode/1f4c0.png?v8","e-mail":"https://github.githubassets.com/images/icons/emoji/unicode/1f4e7.png?v8","eagle":"https://github.githubassets.com/images/icons/emoji/unicode/1f985.png?v8","ear":"https://github.githubassets.com/images/icons/emoji/unicode/1f442.png?v8","ear_of_rice":"https://github.githubassets.com/images/icons/emoji/unicode/1f33e.png?v8","earth_africa":"https://github.githubassets.com/images/icons/emoji/unicode/1f30d.png?v8","earth_americas":"https://github.githubassets.com/images/icons/emoji/unicode/1f30e.png?v8","earth_asia":"https://github.githubassets.com/images/icons/emoji/unicode/1f30f.png?v8","ecuador":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ea-1f1e8.png?v8","egg":"https://github.githubassets.com/images/icons/emoji/unicode/1f95a.png?v8","eggplant":"https://github.githubassets.com/images/icons/emoji/unicode/1f346.png?v8","egypt":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ea-1f1ec.png?v8","eight":"https://github.githubassets.com/images/icons/emoji/unicode/0038-20e3.png?v8","eight_pointed_black_star":"https://github.githubassets.com/images/icons/emoji/unicode/2734.png?v8","eight_spoked_asterisk":"https://github.githubassets.com/images/icons/emoji/unicode/2733.png?v8","el_salvador":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f8-1f1fb.png?v8","electric_plug":"https://github.githubassets.com/images/icons/emoji/unicode/1f50c.png?v8","electron":"https://github.githubassets.com/images/icons/emoji/electron.png?v8","elephant":"https://github.githubassets.com/images/icons/emoji/unicode/1f418.png?v8","email":"https://github.githubassets.com/images/icons/emoji/unicode/2709.png?v8","end":"https://github.githubassets.com/images/icons/emoji/unicode/1f51a.png?v8","envelope":"https://github.githubassets.com/images/icons/emoji/unicode/2709.png?v8","envelope_with_arrow":"https://github.githubassets.com/images/icons/emoji/unicode/1f4e9.png?v8","equatorial_guinea":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ec-1f1f6.png?v8","eritrea":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ea-1f1f7.png?v8","es":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ea-1f1f8.png?v8","estonia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ea-1f1ea.png?v8","ethiopia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ea-1f1f9.png?v8","eu":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ea-1f1fa.png?v8","euro":"https://github.githubassets.com/images/icons/emoji/unicode/1f4b6.png?v8","european_castle":"https://github.githubassets.com/images/icons/emoji/unicode/1f3f0.png?v8","european_post_office":"https://github.githubassets.com/images/icons/emoji/unicode/1f3e4.png?v8","european_union":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ea-1f1fa.png?v8","evergreen_tree":"https://github.githubassets.com/images/icons/emoji/unicode/1f332.png?v8","exclamation":"https://github.githubassets.com/images/icons/emoji/unicode/2757.png?v8","expressionless":"https://github.githubassets.com/images/icons/emoji/unicode/1f611.png?v8","eye":"https://github.githubassets.com/images/icons/emoji/unicode/1f441.png?v8","eye_speech_bubble":"https://github.githubassets.com/images/icons/emoji/unicode/1f441-1f5e8.png?v8","eyeglasses":"https://github.githubassets.com/images/icons/emoji/unicode/1f453.png?v8","eyes":"https://github.githubassets.com/images/icons/emoji/unicode/1f440.png?v8","face_with_head_bandage":"https://github.githubassets.com/images/icons/emoji/unicode/1f915.png?v8","face_with_thermometer":"https://github.githubassets.com/images/icons/emoji/unicode/1f912.png?v8","facepunch":"https://github.githubassets.com/images/icons/emoji/unicode/1f44a.png?v8","factory":"https://github.githubassets.com/images/icons/emoji/unicode/1f3ed.png?v8","falkland_islands":"https://github.githubassets.com/images/icons/emoji/unicode/1f1eb-1f1f0.png?v8","fallen_leaf":"https://github.githubassets.com/images/icons/emoji/unicode/1f342.png?v8","family":"https://github.githubassets.com/images/icons/emoji/unicode/1f46a.png?v8","family_man_boy":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f466.png?v8","family_man_boy_boy":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f466-1f466.png?v8","family_man_girl":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f467.png?v8","family_man_girl_boy":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f467-1f466.png?v8","family_man_girl_girl":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f467-1f467.png?v8","family_man_man_boy":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f468-1f466.png?v8","family_man_man_boy_boy":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f468-1f466-1f466.png?v8","family_man_man_girl":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f468-1f467.png?v8","family_man_man_girl_boy":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f468-1f467-1f466.png?v8","family_man_man_girl_girl":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f468-1f467-1f467.png?v8","family_man_woman_boy":"https://github.githubassets.com/images/icons/emoji/unicode/1f46a.png?v8","family_man_woman_boy_boy":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f469-1f466-1f466.png?v8","family_man_woman_girl":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f469-1f467.png?v8","family_man_woman_girl_boy":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f469-1f467-1f466.png?v8","family_man_woman_girl_girl":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f469-1f467-1f467.png?v8","family_woman_boy":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-1f466.png?v8","family_woman_boy_boy":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-1f466-1f466.png?v8","family_woman_girl":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-1f467.png?v8","family_woman_girl_boy":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-1f467-1f466.png?v8","family_woman_girl_girl":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-1f467-1f467.png?v8","family_woman_woman_boy":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-1f469-1f466.png?v8","family_woman_woman_boy_boy":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-1f469-1f466-1f466.png?v8","family_woman_woman_girl":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-1f469-1f467.png?v8","family_woman_woman_girl_boy":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-1f469-1f467-1f466.png?v8","family_woman_woman_girl_girl":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-1f469-1f467-1f467.png?v8","faroe_islands":"https://github.githubassets.com/images/icons/emoji/unicode/1f1eb-1f1f4.png?v8","fast_forward":"https://github.githubassets.com/images/icons/emoji/unicode/23e9.png?v8","fax":"https://github.githubassets.com/images/icons/emoji/unicode/1f4e0.png?v8","fearful":"https://github.githubassets.com/images/icons/emoji/unicode/1f628.png?v8","feelsgood":"https://github.githubassets.com/images/icons/emoji/feelsgood.png?v8","feet":"https://github.githubassets.com/images/icons/emoji/unicode/1f43e.png?v8","female_detective":"https://github.githubassets.com/images/icons/emoji/unicode/1f575-2640.png?v8","ferris_wheel":"https://github.githubassets.com/images/icons/emoji/unicode/1f3a1.png?v8","ferry":"https://github.githubassets.com/images/icons/emoji/unicode/26f4.png?v8","field_hockey":"https://github.githubassets.com/images/icons/emoji/unicode/1f3d1.png?v8","fiji":"https://github.githubassets.com/images/icons/emoji/unicode/1f1eb-1f1ef.png?v8","file_cabinet":"https://github.githubassets.com/images/icons/emoji/unicode/1f5c4.png?v8","file_folder":"https://github.githubassets.com/images/icons/emoji/unicode/1f4c1.png?v8","film_projector":"https://github.githubassets.com/images/icons/emoji/unicode/1f4fd.png?v8","film_strip":"https://github.githubassets.com/images/icons/emoji/unicode/1f39e.png?v8","finland":"https://github.githubassets.com/images/icons/emoji/unicode/1f1eb-1f1ee.png?v8","finnadie":"https://github.githubassets.com/images/icons/emoji/finnadie.png?v8","fire":"https://github.githubassets.com/images/icons/emoji/unicode/1f525.png?v8","fire_engine":"https://github.githubassets.com/images/icons/emoji/unicode/1f692.png?v8","fireworks":"https://github.githubassets.com/images/icons/emoji/unicode/1f386.png?v8","first_quarter_moon":"https://github.githubassets.com/images/icons/emoji/unicode/1f313.png?v8","first_quarter_moon_with_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f31b.png?v8","fish":"https://github.githubassets.com/images/icons/emoji/unicode/1f41f.png?v8","fish_cake":"https://github.githubassets.com/images/icons/emoji/unicode/1f365.png?v8","fishing_pole_and_fish":"https://github.githubassets.com/images/icons/emoji/unicode/1f3a3.png?v8","fist":"https://github.githubassets.com/images/icons/emoji/unicode/270a.png?v8","fist_left":"https://github.githubassets.com/images/icons/emoji/unicode/1f91b.png?v8","fist_oncoming":"https://github.githubassets.com/images/icons/emoji/unicode/1f44a.png?v8","fist_raised":"https://github.githubassets.com/images/icons/emoji/unicode/270a.png?v8","fist_right":"https://github.githubassets.com/images/icons/emoji/unicode/1f91c.png?v8","five":"https://github.githubassets.com/images/icons/emoji/unicode/0035-20e3.png?v8","flags":"https://github.githubassets.com/images/icons/emoji/unicode/1f38f.png?v8","flashlight":"https://github.githubassets.com/images/icons/emoji/unicode/1f526.png?v8","fleur_de_lis":"https://github.githubassets.com/images/icons/emoji/unicode/269c.png?v8","flight_arrival":"https://github.githubassets.com/images/icons/emoji/unicode/1f6ec.png?v8","flight_departure":"https://github.githubassets.com/images/icons/emoji/unicode/1f6eb.png?v8","flipper":"https://github.githubassets.com/images/icons/emoji/unicode/1f42c.png?v8","floppy_disk":"https://github.githubassets.com/images/icons/emoji/unicode/1f4be.png?v8","flower_playing_cards":"https://github.githubassets.com/images/icons/emoji/unicode/1f3b4.png?v8","flushed":"https://github.githubassets.com/images/icons/emoji/unicode/1f633.png?v8","fog":"https://github.githubassets.com/images/icons/emoji/unicode/1f32b.png?v8","foggy":"https://github.githubassets.com/images/icons/emoji/unicode/1f301.png?v8","football":"https://github.githubassets.com/images/icons/emoji/unicode/1f3c8.png?v8","footprints":"https://github.githubassets.com/images/icons/emoji/unicode/1f463.png?v8","fork_and_knife":"https://github.githubassets.com/images/icons/emoji/unicode/1f374.png?v8","fountain":"https://github.githubassets.com/images/icons/emoji/unicode/26f2.png?v8","fountain_pen":"https://github.githubassets.com/images/icons/emoji/unicode/1f58b.png?v8","four":"https://github.githubassets.com/images/icons/emoji/unicode/0034-20e3.png?v8","four_leaf_clover":"https://github.githubassets.com/images/icons/emoji/unicode/1f340.png?v8","fox_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f98a.png?v8","fr":"https://github.githubassets.com/images/icons/emoji/unicode/1f1eb-1f1f7.png?v8","framed_picture":"https://github.githubassets.com/images/icons/emoji/unicode/1f5bc.png?v8","free":"https://github.githubassets.com/images/icons/emoji/unicode/1f193.png?v8","french_guiana":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ec-1f1eb.png?v8","french_polynesia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f5-1f1eb.png?v8","french_southern_territories":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f9-1f1eb.png?v8","fried_egg":"https://github.githubassets.com/images/icons/emoji/unicode/1f373.png?v8","fried_shrimp":"https://github.githubassets.com/images/icons/emoji/unicode/1f364.png?v8","fries":"https://github.githubassets.com/images/icons/emoji/unicode/1f35f.png?v8","frog":"https://github.githubassets.com/images/icons/emoji/unicode/1f438.png?v8","frowning":"https://github.githubassets.com/images/icons/emoji/unicode/1f626.png?v8","frowning_face":"https://github.githubassets.com/images/icons/emoji/unicode/2639.png?v8","frowning_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f64d-2642.png?v8","frowning_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f64d.png?v8","fu":"https://github.githubassets.com/images/icons/emoji/unicode/1f595.png?v8","fuelpump":"https://github.githubassets.com/images/icons/emoji/unicode/26fd.png?v8","full_moon":"https://github.githubassets.com/images/icons/emoji/unicode/1f315.png?v8","full_moon_with_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f31d.png?v8","funeral_urn":"https://github.githubassets.com/images/icons/emoji/unicode/26b1.png?v8","gabon":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ec-1f1e6.png?v8","gambia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ec-1f1f2.png?v8","game_die":"https://github.githubassets.com/images/icons/emoji/unicode/1f3b2.png?v8","gb":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ec-1f1e7.png?v8","gear":"https://github.githubassets.com/images/icons/emoji/unicode/2699.png?v8","gem":"https://github.githubassets.com/images/icons/emoji/unicode/1f48e.png?v8","gemini":"https://github.githubassets.com/images/icons/emoji/unicode/264a.png?v8","georgia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ec-1f1ea.png?v8","ghana":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ec-1f1ed.png?v8","ghost":"https://github.githubassets.com/images/icons/emoji/unicode/1f47b.png?v8","gibraltar":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ec-1f1ee.png?v8","gift":"https://github.githubassets.com/images/icons/emoji/unicode/1f381.png?v8","gift_heart":"https://github.githubassets.com/images/icons/emoji/unicode/1f49d.png?v8","girl":"https://github.githubassets.com/images/icons/emoji/unicode/1f467.png?v8","globe_with_meridians":"https://github.githubassets.com/images/icons/emoji/unicode/1f310.png?v8","goal_net":"https://github.githubassets.com/images/icons/emoji/unicode/1f945.png?v8","goat":"https://github.githubassets.com/images/icons/emoji/unicode/1f410.png?v8","goberserk":"https://github.githubassets.com/images/icons/emoji/goberserk.png?v8","godmode":"https://github.githubassets.com/images/icons/emoji/godmode.png?v8","golf":"https://github.githubassets.com/images/icons/emoji/unicode/26f3.png?v8","golfing_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f3cc.png?v8","golfing_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f3cc-2640.png?v8","gorilla":"https://github.githubassets.com/images/icons/emoji/unicode/1f98d.png?v8","grapes":"https://github.githubassets.com/images/icons/emoji/unicode/1f347.png?v8","greece":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ec-1f1f7.png?v8","green_apple":"https://github.githubassets.com/images/icons/emoji/unicode/1f34f.png?v8","green_book":"https://github.githubassets.com/images/icons/emoji/unicode/1f4d7.png?v8","green_heart":"https://github.githubassets.com/images/icons/emoji/unicode/1f49a.png?v8","green_salad":"https://github.githubassets.com/images/icons/emoji/unicode/1f957.png?v8","greenland":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ec-1f1f1.png?v8","grenada":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ec-1f1e9.png?v8","grey_exclamation":"https://github.githubassets.com/images/icons/emoji/unicode/2755.png?v8","grey_question":"https://github.githubassets.com/images/icons/emoji/unicode/2754.png?v8","grimacing":"https://github.githubassets.com/images/icons/emoji/unicode/1f62c.png?v8","grin":"https://github.githubassets.com/images/icons/emoji/unicode/1f601.png?v8","grinning":"https://github.githubassets.com/images/icons/emoji/unicode/1f600.png?v8","guadeloupe":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ec-1f1f5.png?v8","guam":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ec-1f1fa.png?v8","guardsman":"https://github.githubassets.com/images/icons/emoji/unicode/1f482.png?v8","guardswoman":"https://github.githubassets.com/images/icons/emoji/unicode/1f482-2640.png?v8","guatemala":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ec-1f1f9.png?v8","guernsey":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ec-1f1ec.png?v8","guinea":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ec-1f1f3.png?v8","guinea_bissau":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ec-1f1fc.png?v8","guitar":"https://github.githubassets.com/images/icons/emoji/unicode/1f3b8.png?v8","gun":"https://github.githubassets.com/images/icons/emoji/unicode/1f52b.png?v8","guyana":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ec-1f1fe.png?v8","haircut":"https://github.githubassets.com/images/icons/emoji/unicode/1f487.png?v8","haircut_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f487-2642.png?v8","haircut_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f487.png?v8","haiti":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ed-1f1f9.png?v8","hamburger":"https://github.githubassets.com/images/icons/emoji/unicode/1f354.png?v8","hammer":"https://github.githubassets.com/images/icons/emoji/unicode/1f528.png?v8","hammer_and_pick":"https://github.githubassets.com/images/icons/emoji/unicode/2692.png?v8","hammer_and_wrench":"https://github.githubassets.com/images/icons/emoji/unicode/1f6e0.png?v8","hamster":"https://github.githubassets.com/images/icons/emoji/unicode/1f439.png?v8","hand":"https://github.githubassets.com/images/icons/emoji/unicode/270b.png?v8","handbag":"https://github.githubassets.com/images/icons/emoji/unicode/1f45c.png?v8","handshake":"https://github.githubassets.com/images/icons/emoji/unicode/1f91d.png?v8","hankey":"https://github.githubassets.com/images/icons/emoji/unicode/1f4a9.png?v8","hash":"https://github.githubassets.com/images/icons/emoji/unicode/0023-20e3.png?v8","hatched_chick":"https://github.githubassets.com/images/icons/emoji/unicode/1f425.png?v8","hatching_chick":"https://github.githubassets.com/images/icons/emoji/unicode/1f423.png?v8","headphones":"https://github.githubassets.com/images/icons/emoji/unicode/1f3a7.png?v8","hear_no_evil":"https://github.githubassets.com/images/icons/emoji/unicode/1f649.png?v8","heart":"https://github.githubassets.com/images/icons/emoji/unicode/2764.png?v8","heart_decoration":"https://github.githubassets.com/images/icons/emoji/unicode/1f49f.png?v8","heart_eyes":"https://github.githubassets.com/images/icons/emoji/unicode/1f60d.png?v8","heart_eyes_cat":"https://github.githubassets.com/images/icons/emoji/unicode/1f63b.png?v8","heartbeat":"https://github.githubassets.com/images/icons/emoji/unicode/1f493.png?v8","heartpulse":"https://github.githubassets.com/images/icons/emoji/unicode/1f497.png?v8","hearts":"https://github.githubassets.com/images/icons/emoji/unicode/2665.png?v8","heavy_check_mark":"https://github.githubassets.com/images/icons/emoji/unicode/2714.png?v8","heavy_division_sign":"https://github.githubassets.com/images/icons/emoji/unicode/2797.png?v8","heavy_dollar_sign":"https://github.githubassets.com/images/icons/emoji/unicode/1f4b2.png?v8","heavy_exclamation_mark":"https://github.githubassets.com/images/icons/emoji/unicode/2757.png?v8","heavy_heart_exclamation":"https://github.githubassets.com/images/icons/emoji/unicode/2763.png?v8","heavy_minus_sign":"https://github.githubassets.com/images/icons/emoji/unicode/2796.png?v8","heavy_multiplication_x":"https://github.githubassets.com/images/icons/emoji/unicode/2716.png?v8","heavy_plus_sign":"https://github.githubassets.com/images/icons/emoji/unicode/2795.png?v8","helicopter":"https://github.githubassets.com/images/icons/emoji/unicode/1f681.png?v8","herb":"https://github.githubassets.com/images/icons/emoji/unicode/1f33f.png?v8","hibiscus":"https://github.githubassets.com/images/icons/emoji/unicode/1f33a.png?v8","high_brightness":"https://github.githubassets.com/images/icons/emoji/unicode/1f506.png?v8","high_heel":"https://github.githubassets.com/images/icons/emoji/unicode/1f460.png?v8","hocho":"https://github.githubassets.com/images/icons/emoji/unicode/1f52a.png?v8","hole":"https://github.githubassets.com/images/icons/emoji/unicode/1f573.png?v8","honduras":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ed-1f1f3.png?v8","honey_pot":"https://github.githubassets.com/images/icons/emoji/unicode/1f36f.png?v8","honeybee":"https://github.githubassets.com/images/icons/emoji/unicode/1f41d.png?v8","hong_kong":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ed-1f1f0.png?v8","horse":"https://github.githubassets.com/images/icons/emoji/unicode/1f434.png?v8","horse_racing":"https://github.githubassets.com/images/icons/emoji/unicode/1f3c7.png?v8","hospital":"https://github.githubassets.com/images/icons/emoji/unicode/1f3e5.png?v8","hot_pepper":"https://github.githubassets.com/images/icons/emoji/unicode/1f336.png?v8","hotdog":"https://github.githubassets.com/images/icons/emoji/unicode/1f32d.png?v8","hotel":"https://github.githubassets.com/images/icons/emoji/unicode/1f3e8.png?v8","hotsprings":"https://github.githubassets.com/images/icons/emoji/unicode/2668.png?v8","hourglass":"https://github.githubassets.com/images/icons/emoji/unicode/231b.png?v8","hourglass_flowing_sand":"https://github.githubassets.com/images/icons/emoji/unicode/23f3.png?v8","house":"https://github.githubassets.com/images/icons/emoji/unicode/1f3e0.png?v8","house_with_garden":"https://github.githubassets.com/images/icons/emoji/unicode/1f3e1.png?v8","houses":"https://github.githubassets.com/images/icons/emoji/unicode/1f3d8.png?v8","hugs":"https://github.githubassets.com/images/icons/emoji/unicode/1f917.png?v8","hungary":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ed-1f1fa.png?v8","hurtrealbad":"https://github.githubassets.com/images/icons/emoji/hurtrealbad.png?v8","hushed":"https://github.githubassets.com/images/icons/emoji/unicode/1f62f.png?v8","ice_cream":"https://github.githubassets.com/images/icons/emoji/unicode/1f368.png?v8","ice_hockey":"https://github.githubassets.com/images/icons/emoji/unicode/1f3d2.png?v8","ice_skate":"https://github.githubassets.com/images/icons/emoji/unicode/26f8.png?v8","icecream":"https://github.githubassets.com/images/icons/emoji/unicode/1f366.png?v8","iceland":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ee-1f1f8.png?v8","id":"https://github.githubassets.com/images/icons/emoji/unicode/1f194.png?v8","ideograph_advantage":"https://github.githubassets.com/images/icons/emoji/unicode/1f250.png?v8","imp":"https://github.githubassets.com/images/icons/emoji/unicode/1f47f.png?v8","inbox_tray":"https://github.githubassets.com/images/icons/emoji/unicode/1f4e5.png?v8","incoming_envelope":"https://github.githubassets.com/images/icons/emoji/unicode/1f4e8.png?v8","india":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ee-1f1f3.png?v8","indonesia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ee-1f1e9.png?v8","information_desk_person":"https://github.githubassets.com/images/icons/emoji/unicode/1f481.png?v8","information_source":"https://github.githubassets.com/images/icons/emoji/unicode/2139.png?v8","innocent":"https://github.githubassets.com/images/icons/emoji/unicode/1f607.png?v8","interrobang":"https://github.githubassets.com/images/icons/emoji/unicode/2049.png?v8","iphone":"https://github.githubassets.com/images/icons/emoji/unicode/1f4f1.png?v8","iran":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ee-1f1f7.png?v8","iraq":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ee-1f1f6.png?v8","ireland":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ee-1f1ea.png?v8","isle_of_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ee-1f1f2.png?v8","israel":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ee-1f1f1.png?v8","it":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ee-1f1f9.png?v8","izakaya_lantern":"https://github.githubassets.com/images/icons/emoji/unicode/1f3ee.png?v8","jack_o_lantern":"https://github.githubassets.com/images/icons/emoji/unicode/1f383.png?v8","jamaica":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ef-1f1f2.png?v8","japan":"https://github.githubassets.com/images/icons/emoji/unicode/1f5fe.png?v8","japanese_castle":"https://github.githubassets.com/images/icons/emoji/unicode/1f3ef.png?v8","japanese_goblin":"https://github.githubassets.com/images/icons/emoji/unicode/1f47a.png?v8","japanese_ogre":"https://github.githubassets.com/images/icons/emoji/unicode/1f479.png?v8","jeans":"https://github.githubassets.com/images/icons/emoji/unicode/1f456.png?v8","jersey":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ef-1f1ea.png?v8","jordan":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ef-1f1f4.png?v8","joy":"https://github.githubassets.com/images/icons/emoji/unicode/1f602.png?v8","joy_cat":"https://github.githubassets.com/images/icons/emoji/unicode/1f639.png?v8","joystick":"https://github.githubassets.com/images/icons/emoji/unicode/1f579.png?v8","jp":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ef-1f1f5.png?v8","kaaba":"https://github.githubassets.com/images/icons/emoji/unicode/1f54b.png?v8","kazakhstan":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f0-1f1ff.png?v8","kenya":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f0-1f1ea.png?v8","key":"https://github.githubassets.com/images/icons/emoji/unicode/1f511.png?v8","keyboard":"https://github.githubassets.com/images/icons/emoji/unicode/2328.png?v8","keycap_ten":"https://github.githubassets.com/images/icons/emoji/unicode/1f51f.png?v8","kick_scooter":"https://github.githubassets.com/images/icons/emoji/unicode/1f6f4.png?v8","kimono":"https://github.githubassets.com/images/icons/emoji/unicode/1f458.png?v8","kiribati":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f0-1f1ee.png?v8","kiss":"https://github.githubassets.com/images/icons/emoji/unicode/1f48b.png?v8","kissing":"https://github.githubassets.com/images/icons/emoji/unicode/1f617.png?v8","kissing_cat":"https://github.githubassets.com/images/icons/emoji/unicode/1f63d.png?v8","kissing_closed_eyes":"https://github.githubassets.com/images/icons/emoji/unicode/1f61a.png?v8","kissing_heart":"https://github.githubassets.com/images/icons/emoji/unicode/1f618.png?v8","kissing_smiling_eyes":"https://github.githubassets.com/images/icons/emoji/unicode/1f619.png?v8","kiwi_fruit":"https://github.githubassets.com/images/icons/emoji/unicode/1f95d.png?v8","knife":"https://github.githubassets.com/images/icons/emoji/unicode/1f52a.png?v8","koala":"https://github.githubassets.com/images/icons/emoji/unicode/1f428.png?v8","koko":"https://github.githubassets.com/images/icons/emoji/unicode/1f201.png?v8","kosovo":"https://github.githubassets.com/images/icons/emoji/unicode/1f1fd-1f1f0.png?v8","kr":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f0-1f1f7.png?v8","kuwait":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f0-1f1fc.png?v8","kyrgyzstan":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f0-1f1ec.png?v8","label":"https://github.githubassets.com/images/icons/emoji/unicode/1f3f7.png?v8","lantern":"https://github.githubassets.com/images/icons/emoji/unicode/1f3ee.png?v8","laos":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f1-1f1e6.png?v8","large_blue_circle":"https://github.githubassets.com/images/icons/emoji/unicode/1f535.png?v8","large_blue_diamond":"https://github.githubassets.com/images/icons/emoji/unicode/1f537.png?v8","large_orange_diamond":"https://github.githubassets.com/images/icons/emoji/unicode/1f536.png?v8","last_quarter_moon":"https://github.githubassets.com/images/icons/emoji/unicode/1f317.png?v8","last_quarter_moon_with_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f31c.png?v8","latin_cross":"https://github.githubassets.com/images/icons/emoji/unicode/271d.png?v8","latvia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f1-1f1fb.png?v8","laughing":"https://github.githubassets.com/images/icons/emoji/unicode/1f606.png?v8","leaves":"https://github.githubassets.com/images/icons/emoji/unicode/1f343.png?v8","lebanon":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f1-1f1e7.png?v8","ledger":"https://github.githubassets.com/images/icons/emoji/unicode/1f4d2.png?v8","left_luggage":"https://github.githubassets.com/images/icons/emoji/unicode/1f6c5.png?v8","left_right_arrow":"https://github.githubassets.com/images/icons/emoji/unicode/2194.png?v8","leftwards_arrow_with_hook":"https://github.githubassets.com/images/icons/emoji/unicode/21a9.png?v8","lemon":"https://github.githubassets.com/images/icons/emoji/unicode/1f34b.png?v8","leo":"https://github.githubassets.com/images/icons/emoji/unicode/264c.png?v8","leopard":"https://github.githubassets.com/images/icons/emoji/unicode/1f406.png?v8","lesotho":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f1-1f1f8.png?v8","level_slider":"https://github.githubassets.com/images/icons/emoji/unicode/1f39a.png?v8","liberia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f1-1f1f7.png?v8","libra":"https://github.githubassets.com/images/icons/emoji/unicode/264e.png?v8","libya":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f1-1f1fe.png?v8","liechtenstein":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f1-1f1ee.png?v8","light_rail":"https://github.githubassets.com/images/icons/emoji/unicode/1f688.png?v8","link":"https://github.githubassets.com/images/icons/emoji/unicode/1f517.png?v8","lion":"https://github.githubassets.com/images/icons/emoji/unicode/1f981.png?v8","lips":"https://github.githubassets.com/images/icons/emoji/unicode/1f444.png?v8","lipstick":"https://github.githubassets.com/images/icons/emoji/unicode/1f484.png?v8","lithuania":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f1-1f1f9.png?v8","lizard":"https://github.githubassets.com/images/icons/emoji/unicode/1f98e.png?v8","lock":"https://github.githubassets.com/images/icons/emoji/unicode/1f512.png?v8","lock_with_ink_pen":"https://github.githubassets.com/images/icons/emoji/unicode/1f50f.png?v8","lollipop":"https://github.githubassets.com/images/icons/emoji/unicode/1f36d.png?v8","loop":"https://github.githubassets.com/images/icons/emoji/unicode/27bf.png?v8","loud_sound":"https://github.githubassets.com/images/icons/emoji/unicode/1f50a.png?v8","loudspeaker":"https://github.githubassets.com/images/icons/emoji/unicode/1f4e2.png?v8","love_hotel":"https://github.githubassets.com/images/icons/emoji/unicode/1f3e9.png?v8","love_letter":"https://github.githubassets.com/images/icons/emoji/unicode/1f48c.png?v8","low_brightness":"https://github.githubassets.com/images/icons/emoji/unicode/1f505.png?v8","luxembourg":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f1-1f1fa.png?v8","lying_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f925.png?v8","m":"https://github.githubassets.com/images/icons/emoji/unicode/24c2.png?v8","macau":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f2-1f1f4.png?v8","macedonia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f2-1f1f0.png?v8","madagascar":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f2-1f1ec.png?v8","mag":"https://github.githubassets.com/images/icons/emoji/unicode/1f50d.png?v8","mag_right":"https://github.githubassets.com/images/icons/emoji/unicode/1f50e.png?v8","mahjong":"https://github.githubassets.com/images/icons/emoji/unicode/1f004.png?v8","mailbox":"https://github.githubassets.com/images/icons/emoji/unicode/1f4eb.png?v8","mailbox_closed":"https://github.githubassets.com/images/icons/emoji/unicode/1f4ea.png?v8","mailbox_with_mail":"https://github.githubassets.com/images/icons/emoji/unicode/1f4ec.png?v8","mailbox_with_no_mail":"https://github.githubassets.com/images/icons/emoji/unicode/1f4ed.png?v8","malawi":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f2-1f1fc.png?v8","malaysia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f2-1f1fe.png?v8","maldives":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f2-1f1fb.png?v8","male_detective":"https://github.githubassets.com/images/icons/emoji/unicode/1f575.png?v8","mali":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f2-1f1f1.png?v8","malta":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f2-1f1f9.png?v8","man":"https://github.githubassets.com/images/icons/emoji/unicode/1f468.png?v8","man_artist":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f3a8.png?v8","man_astronaut":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f680.png?v8","man_cartwheeling":"https://github.githubassets.com/images/icons/emoji/unicode/1f938-2642.png?v8","man_cook":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f373.png?v8","man_dancing":"https://github.githubassets.com/images/icons/emoji/unicode/1f57a.png?v8","man_facepalming":"https://github.githubassets.com/images/icons/emoji/unicode/1f926-2642.png?v8","man_factory_worker":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f3ed.png?v8","man_farmer":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f33e.png?v8","man_firefighter":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f692.png?v8","man_health_worker":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-2695.png?v8","man_in_tuxedo":"https://github.githubassets.com/images/icons/emoji/unicode/1f935.png?v8","man_judge":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-2696.png?v8","man_juggling":"https://github.githubassets.com/images/icons/emoji/unicode/1f939-2642.png?v8","man_mechanic":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f527.png?v8","man_office_worker":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f4bc.png?v8","man_pilot":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-2708.png?v8","man_playing_handball":"https://github.githubassets.com/images/icons/emoji/unicode/1f93e-2642.png?v8","man_playing_water_polo":"https://github.githubassets.com/images/icons/emoji/unicode/1f93d-2642.png?v8","man_scientist":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f52c.png?v8","man_shrugging":"https://github.githubassets.com/images/icons/emoji/unicode/1f937-2642.png?v8","man_singer":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f3a4.png?v8","man_student":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f393.png?v8","man_teacher":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f3eb.png?v8","man_technologist":"https://github.githubassets.com/images/icons/emoji/unicode/1f468-1f4bb.png?v8","man_with_gua_pi_mao":"https://github.githubassets.com/images/icons/emoji/unicode/1f472.png?v8","man_with_turban":"https://github.githubassets.com/images/icons/emoji/unicode/1f473.png?v8","mandarin":"https://github.githubassets.com/images/icons/emoji/unicode/1f34a.png?v8","mans_shoe":"https://github.githubassets.com/images/icons/emoji/unicode/1f45e.png?v8","mantelpiece_clock":"https://github.githubassets.com/images/icons/emoji/unicode/1f570.png?v8","maple_leaf":"https://github.githubassets.com/images/icons/emoji/unicode/1f341.png?v8","marshall_islands":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f2-1f1ed.png?v8","martial_arts_uniform":"https://github.githubassets.com/images/icons/emoji/unicode/1f94b.png?v8","martinique":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f2-1f1f6.png?v8","mask":"https://github.githubassets.com/images/icons/emoji/unicode/1f637.png?v8","massage":"https://github.githubassets.com/images/icons/emoji/unicode/1f486.png?v8","massage_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f486-2642.png?v8","massage_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f486.png?v8","mauritania":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f2-1f1f7.png?v8","mauritius":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f2-1f1fa.png?v8","mayotte":"https://github.githubassets.com/images/icons/emoji/unicode/1f1fe-1f1f9.png?v8","meat_on_bone":"https://github.githubassets.com/images/icons/emoji/unicode/1f356.png?v8","medal_military":"https://github.githubassets.com/images/icons/emoji/unicode/1f396.png?v8","medal_sports":"https://github.githubassets.com/images/icons/emoji/unicode/1f3c5.png?v8","mega":"https://github.githubassets.com/images/icons/emoji/unicode/1f4e3.png?v8","melon":"https://github.githubassets.com/images/icons/emoji/unicode/1f348.png?v8","memo":"https://github.githubassets.com/images/icons/emoji/unicode/1f4dd.png?v8","men_wrestling":"https://github.githubassets.com/images/icons/emoji/unicode/1f93c-2642.png?v8","menorah":"https://github.githubassets.com/images/icons/emoji/unicode/1f54e.png?v8","mens":"https://github.githubassets.com/images/icons/emoji/unicode/1f6b9.png?v8","metal":"https://github.githubassets.com/images/icons/emoji/unicode/1f918.png?v8","metro":"https://github.githubassets.com/images/icons/emoji/unicode/1f687.png?v8","mexico":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f2-1f1fd.png?v8","micronesia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1eb-1f1f2.png?v8","microphone":"https://github.githubassets.com/images/icons/emoji/unicode/1f3a4.png?v8","microscope":"https://github.githubassets.com/images/icons/emoji/unicode/1f52c.png?v8","middle_finger":"https://github.githubassets.com/images/icons/emoji/unicode/1f595.png?v8","milk_glass":"https://github.githubassets.com/images/icons/emoji/unicode/1f95b.png?v8","milky_way":"https://github.githubassets.com/images/icons/emoji/unicode/1f30c.png?v8","minibus":"https://github.githubassets.com/images/icons/emoji/unicode/1f690.png?v8","minidisc":"https://github.githubassets.com/images/icons/emoji/unicode/1f4bd.png?v8","mobile_phone_off":"https://github.githubassets.com/images/icons/emoji/unicode/1f4f4.png?v8","moldova":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f2-1f1e9.png?v8","monaco":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f2-1f1e8.png?v8","money_mouth_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f911.png?v8","money_with_wings":"https://github.githubassets.com/images/icons/emoji/unicode/1f4b8.png?v8","moneybag":"https://github.githubassets.com/images/icons/emoji/unicode/1f4b0.png?v8","mongolia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f2-1f1f3.png?v8","monkey":"https://github.githubassets.com/images/icons/emoji/unicode/1f412.png?v8","monkey_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f435.png?v8","monorail":"https://github.githubassets.com/images/icons/emoji/unicode/1f69d.png?v8","montenegro":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f2-1f1ea.png?v8","montserrat":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f2-1f1f8.png?v8","moon":"https://github.githubassets.com/images/icons/emoji/unicode/1f314.png?v8","morocco":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f2-1f1e6.png?v8","mortar_board":"https://github.githubassets.com/images/icons/emoji/unicode/1f393.png?v8","mosque":"https://github.githubassets.com/images/icons/emoji/unicode/1f54c.png?v8","motor_boat":"https://github.githubassets.com/images/icons/emoji/unicode/1f6e5.png?v8","motor_scooter":"https://github.githubassets.com/images/icons/emoji/unicode/1f6f5.png?v8","motorcycle":"https://github.githubassets.com/images/icons/emoji/unicode/1f3cd.png?v8","motorway":"https://github.githubassets.com/images/icons/emoji/unicode/1f6e3.png?v8","mount_fuji":"https://github.githubassets.com/images/icons/emoji/unicode/1f5fb.png?v8","mountain":"https://github.githubassets.com/images/icons/emoji/unicode/26f0.png?v8","mountain_bicyclist":"https://github.githubassets.com/images/icons/emoji/unicode/1f6b5.png?v8","mountain_biking_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f6b5.png?v8","mountain_biking_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f6b5-2640.png?v8","mountain_cableway":"https://github.githubassets.com/images/icons/emoji/unicode/1f6a0.png?v8","mountain_railway":"https://github.githubassets.com/images/icons/emoji/unicode/1f69e.png?v8","mountain_snow":"https://github.githubassets.com/images/icons/emoji/unicode/1f3d4.png?v8","mouse":"https://github.githubassets.com/images/icons/emoji/unicode/1f42d.png?v8","mouse2":"https://github.githubassets.com/images/icons/emoji/unicode/1f401.png?v8","movie_camera":"https://github.githubassets.com/images/icons/emoji/unicode/1f3a5.png?v8","moyai":"https://github.githubassets.com/images/icons/emoji/unicode/1f5ff.png?v8","mozambique":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f2-1f1ff.png?v8","mrs_claus":"https://github.githubassets.com/images/icons/emoji/unicode/1f936.png?v8","muscle":"https://github.githubassets.com/images/icons/emoji/unicode/1f4aa.png?v8","mushroom":"https://github.githubassets.com/images/icons/emoji/unicode/1f344.png?v8","musical_keyboard":"https://github.githubassets.com/images/icons/emoji/unicode/1f3b9.png?v8","musical_note":"https://github.githubassets.com/images/icons/emoji/unicode/1f3b5.png?v8","musical_score":"https://github.githubassets.com/images/icons/emoji/unicode/1f3bc.png?v8","mute":"https://github.githubassets.com/images/icons/emoji/unicode/1f507.png?v8","myanmar":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f2-1f1f2.png?v8","nail_care":"https://github.githubassets.com/images/icons/emoji/unicode/1f485.png?v8","name_badge":"https://github.githubassets.com/images/icons/emoji/unicode/1f4db.png?v8","namibia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f3-1f1e6.png?v8","national_park":"https://github.githubassets.com/images/icons/emoji/unicode/1f3de.png?v8","nauru":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f3-1f1f7.png?v8","nauseated_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f922.png?v8","neckbeard":"https://github.githubassets.com/images/icons/emoji/neckbeard.png?v8","necktie":"https://github.githubassets.com/images/icons/emoji/unicode/1f454.png?v8","negative_squared_cross_mark":"https://github.githubassets.com/images/icons/emoji/unicode/274e.png?v8","nepal":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f3-1f1f5.png?v8","nerd_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f913.png?v8","netherlands":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f3-1f1f1.png?v8","neutral_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f610.png?v8","new":"https://github.githubassets.com/images/icons/emoji/unicode/1f195.png?v8","new_caledonia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f3-1f1e8.png?v8","new_moon":"https://github.githubassets.com/images/icons/emoji/unicode/1f311.png?v8","new_moon_with_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f31a.png?v8","new_zealand":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f3-1f1ff.png?v8","newspaper":"https://github.githubassets.com/images/icons/emoji/unicode/1f4f0.png?v8","newspaper_roll":"https://github.githubassets.com/images/icons/emoji/unicode/1f5de.png?v8","next_track_button":"https://github.githubassets.com/images/icons/emoji/unicode/23ed.png?v8","ng":"https://github.githubassets.com/images/icons/emoji/unicode/1f196.png?v8","ng_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f645-2642.png?v8","ng_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f645.png?v8","nicaragua":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f3-1f1ee.png?v8","niger":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f3-1f1ea.png?v8","nigeria":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f3-1f1ec.png?v8","night_with_stars":"https://github.githubassets.com/images/icons/emoji/unicode/1f303.png?v8","nine":"https://github.githubassets.com/images/icons/emoji/unicode/0039-20e3.png?v8","niue":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f3-1f1fa.png?v8","no_bell":"https://github.githubassets.com/images/icons/emoji/unicode/1f515.png?v8","no_bicycles":"https://github.githubassets.com/images/icons/emoji/unicode/1f6b3.png?v8","no_entry":"https://github.githubassets.com/images/icons/emoji/unicode/26d4.png?v8","no_entry_sign":"https://github.githubassets.com/images/icons/emoji/unicode/1f6ab.png?v8","no_good":"https://github.githubassets.com/images/icons/emoji/unicode/1f645.png?v8","no_good_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f645-2642.png?v8","no_good_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f645.png?v8","no_mobile_phones":"https://github.githubassets.com/images/icons/emoji/unicode/1f4f5.png?v8","no_mouth":"https://github.githubassets.com/images/icons/emoji/unicode/1f636.png?v8","no_pedestrians":"https://github.githubassets.com/images/icons/emoji/unicode/1f6b7.png?v8","no_smoking":"https://github.githubassets.com/images/icons/emoji/unicode/1f6ad.png?v8","non-potable_water":"https://github.githubassets.com/images/icons/emoji/unicode/1f6b1.png?v8","norfolk_island":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f3-1f1eb.png?v8","north_korea":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f0-1f1f5.png?v8","northern_mariana_islands":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f2-1f1f5.png?v8","norway":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f3-1f1f4.png?v8","nose":"https://github.githubassets.com/images/icons/emoji/unicode/1f443.png?v8","notebook":"https://github.githubassets.com/images/icons/emoji/unicode/1f4d3.png?v8","notebook_with_decorative_cover":"https://github.githubassets.com/images/icons/emoji/unicode/1f4d4.png?v8","notes":"https://github.githubassets.com/images/icons/emoji/unicode/1f3b6.png?v8","nut_and_bolt":"https://github.githubassets.com/images/icons/emoji/unicode/1f529.png?v8","o":"https://github.githubassets.com/images/icons/emoji/unicode/2b55.png?v8","o2":"https://github.githubassets.com/images/icons/emoji/unicode/1f17e.png?v8","ocean":"https://github.githubassets.com/images/icons/emoji/unicode/1f30a.png?v8","octocat":"https://github.githubassets.com/images/icons/emoji/octocat.png?v8","octopus":"https://github.githubassets.com/images/icons/emoji/unicode/1f419.png?v8","oden":"https://github.githubassets.com/images/icons/emoji/unicode/1f362.png?v8","office":"https://github.githubassets.com/images/icons/emoji/unicode/1f3e2.png?v8","oil_drum":"https://github.githubassets.com/images/icons/emoji/unicode/1f6e2.png?v8","ok":"https://github.githubassets.com/images/icons/emoji/unicode/1f197.png?v8","ok_hand":"https://github.githubassets.com/images/icons/emoji/unicode/1f44c.png?v8","ok_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f646-2642.png?v8","ok_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f646.png?v8","old_key":"https://github.githubassets.com/images/icons/emoji/unicode/1f5dd.png?v8","older_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f474.png?v8","older_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f475.png?v8","om":"https://github.githubassets.com/images/icons/emoji/unicode/1f549.png?v8","oman":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f4-1f1f2.png?v8","on":"https://github.githubassets.com/images/icons/emoji/unicode/1f51b.png?v8","oncoming_automobile":"https://github.githubassets.com/images/icons/emoji/unicode/1f698.png?v8","oncoming_bus":"https://github.githubassets.com/images/icons/emoji/unicode/1f68d.png?v8","oncoming_police_car":"https://github.githubassets.com/images/icons/emoji/unicode/1f694.png?v8","oncoming_taxi":"https://github.githubassets.com/images/icons/emoji/unicode/1f696.png?v8","one":"https://github.githubassets.com/images/icons/emoji/unicode/0031-20e3.png?v8","open_book":"https://github.githubassets.com/images/icons/emoji/unicode/1f4d6.png?v8","open_file_folder":"https://github.githubassets.com/images/icons/emoji/unicode/1f4c2.png?v8","open_hands":"https://github.githubassets.com/images/icons/emoji/unicode/1f450.png?v8","open_mouth":"https://github.githubassets.com/images/icons/emoji/unicode/1f62e.png?v8","open_umbrella":"https://github.githubassets.com/images/icons/emoji/unicode/2602.png?v8","ophiuchus":"https://github.githubassets.com/images/icons/emoji/unicode/26ce.png?v8","orange":"https://github.githubassets.com/images/icons/emoji/unicode/1f34a.png?v8","orange_book":"https://github.githubassets.com/images/icons/emoji/unicode/1f4d9.png?v8","orthodox_cross":"https://github.githubassets.com/images/icons/emoji/unicode/2626.png?v8","outbox_tray":"https://github.githubassets.com/images/icons/emoji/unicode/1f4e4.png?v8","owl":"https://github.githubassets.com/images/icons/emoji/unicode/1f989.png?v8","ox":"https://github.githubassets.com/images/icons/emoji/unicode/1f402.png?v8","package":"https://github.githubassets.com/images/icons/emoji/unicode/1f4e6.png?v8","page_facing_up":"https://github.githubassets.com/images/icons/emoji/unicode/1f4c4.png?v8","page_with_curl":"https://github.githubassets.com/images/icons/emoji/unicode/1f4c3.png?v8","pager":"https://github.githubassets.com/images/icons/emoji/unicode/1f4df.png?v8","paintbrush":"https://github.githubassets.com/images/icons/emoji/unicode/1f58c.png?v8","pakistan":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f5-1f1f0.png?v8","palau":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f5-1f1fc.png?v8","palestinian_territories":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f5-1f1f8.png?v8","palm_tree":"https://github.githubassets.com/images/icons/emoji/unicode/1f334.png?v8","panama":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f5-1f1e6.png?v8","pancakes":"https://github.githubassets.com/images/icons/emoji/unicode/1f95e.png?v8","panda_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f43c.png?v8","paperclip":"https://github.githubassets.com/images/icons/emoji/unicode/1f4ce.png?v8","paperclips":"https://github.githubassets.com/images/icons/emoji/unicode/1f587.png?v8","papua_new_guinea":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f5-1f1ec.png?v8","paraguay":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f5-1f1fe.png?v8","parasol_on_ground":"https://github.githubassets.com/images/icons/emoji/unicode/26f1.png?v8","parking":"https://github.githubassets.com/images/icons/emoji/unicode/1f17f.png?v8","part_alternation_mark":"https://github.githubassets.com/images/icons/emoji/unicode/303d.png?v8","partly_sunny":"https://github.githubassets.com/images/icons/emoji/unicode/26c5.png?v8","passenger_ship":"https://github.githubassets.com/images/icons/emoji/unicode/1f6f3.png?v8","passport_control":"https://github.githubassets.com/images/icons/emoji/unicode/1f6c2.png?v8","pause_button":"https://github.githubassets.com/images/icons/emoji/unicode/23f8.png?v8","paw_prints":"https://github.githubassets.com/images/icons/emoji/unicode/1f43e.png?v8","peace_symbol":"https://github.githubassets.com/images/icons/emoji/unicode/262e.png?v8","peach":"https://github.githubassets.com/images/icons/emoji/unicode/1f351.png?v8","peanuts":"https://github.githubassets.com/images/icons/emoji/unicode/1f95c.png?v8","pear":"https://github.githubassets.com/images/icons/emoji/unicode/1f350.png?v8","pen":"https://github.githubassets.com/images/icons/emoji/unicode/1f58a.png?v8","pencil":"https://github.githubassets.com/images/icons/emoji/unicode/1f4dd.png?v8","pencil2":"https://github.githubassets.com/images/icons/emoji/unicode/270f.png?v8","penguin":"https://github.githubassets.com/images/icons/emoji/unicode/1f427.png?v8","pensive":"https://github.githubassets.com/images/icons/emoji/unicode/1f614.png?v8","performing_arts":"https://github.githubassets.com/images/icons/emoji/unicode/1f3ad.png?v8","persevere":"https://github.githubassets.com/images/icons/emoji/unicode/1f623.png?v8","person_fencing":"https://github.githubassets.com/images/icons/emoji/unicode/1f93a.png?v8","person_frowning":"https://github.githubassets.com/images/icons/emoji/unicode/1f64d.png?v8","person_with_blond_hair":"https://github.githubassets.com/images/icons/emoji/unicode/1f471.png?v8","person_with_pouting_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f64e.png?v8","peru":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f5-1f1ea.png?v8","philippines":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f5-1f1ed.png?v8","phone":"https://github.githubassets.com/images/icons/emoji/unicode/260e.png?v8","pick":"https://github.githubassets.com/images/icons/emoji/unicode/26cf.png?v8","pig":"https://github.githubassets.com/images/icons/emoji/unicode/1f437.png?v8","pig2":"https://github.githubassets.com/images/icons/emoji/unicode/1f416.png?v8","pig_nose":"https://github.githubassets.com/images/icons/emoji/unicode/1f43d.png?v8","pill":"https://github.githubassets.com/images/icons/emoji/unicode/1f48a.png?v8","pineapple":"https://github.githubassets.com/images/icons/emoji/unicode/1f34d.png?v8","ping_pong":"https://github.githubassets.com/images/icons/emoji/unicode/1f3d3.png?v8","pisces":"https://github.githubassets.com/images/icons/emoji/unicode/2653.png?v8","pitcairn_islands":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f5-1f1f3.png?v8","pizza":"https://github.githubassets.com/images/icons/emoji/unicode/1f355.png?v8","place_of_worship":"https://github.githubassets.com/images/icons/emoji/unicode/1f6d0.png?v8","plate_with_cutlery":"https://github.githubassets.com/images/icons/emoji/unicode/1f37d.png?v8","play_or_pause_button":"https://github.githubassets.com/images/icons/emoji/unicode/23ef.png?v8","point_down":"https://github.githubassets.com/images/icons/emoji/unicode/1f447.png?v8","point_left":"https://github.githubassets.com/images/icons/emoji/unicode/1f448.png?v8","point_right":"https://github.githubassets.com/images/icons/emoji/unicode/1f449.png?v8","point_up":"https://github.githubassets.com/images/icons/emoji/unicode/261d.png?v8","point_up_2":"https://github.githubassets.com/images/icons/emoji/unicode/1f446.png?v8","poland":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f5-1f1f1.png?v8","police_car":"https://github.githubassets.com/images/icons/emoji/unicode/1f693.png?v8","policeman":"https://github.githubassets.com/images/icons/emoji/unicode/1f46e.png?v8","policewoman":"https://github.githubassets.com/images/icons/emoji/unicode/1f46e-2640.png?v8","poodle":"https://github.githubassets.com/images/icons/emoji/unicode/1f429.png?v8","poop":"https://github.githubassets.com/images/icons/emoji/unicode/1f4a9.png?v8","popcorn":"https://github.githubassets.com/images/icons/emoji/unicode/1f37f.png?v8","portugal":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f5-1f1f9.png?v8","post_office":"https://github.githubassets.com/images/icons/emoji/unicode/1f3e3.png?v8","postal_horn":"https://github.githubassets.com/images/icons/emoji/unicode/1f4ef.png?v8","postbox":"https://github.githubassets.com/images/icons/emoji/unicode/1f4ee.png?v8","potable_water":"https://github.githubassets.com/images/icons/emoji/unicode/1f6b0.png?v8","potato":"https://github.githubassets.com/images/icons/emoji/unicode/1f954.png?v8","pouch":"https://github.githubassets.com/images/icons/emoji/unicode/1f45d.png?v8","poultry_leg":"https://github.githubassets.com/images/icons/emoji/unicode/1f357.png?v8","pound":"https://github.githubassets.com/images/icons/emoji/unicode/1f4b7.png?v8","pout":"https://github.githubassets.com/images/icons/emoji/unicode/1f621.png?v8","pouting_cat":"https://github.githubassets.com/images/icons/emoji/unicode/1f63e.png?v8","pouting_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f64e-2642.png?v8","pouting_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f64e.png?v8","pray":"https://github.githubassets.com/images/icons/emoji/unicode/1f64f.png?v8","prayer_beads":"https://github.githubassets.com/images/icons/emoji/unicode/1f4ff.png?v8","pregnant_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f930.png?v8","previous_track_button":"https://github.githubassets.com/images/icons/emoji/unicode/23ee.png?v8","prince":"https://github.githubassets.com/images/icons/emoji/unicode/1f934.png?v8","princess":"https://github.githubassets.com/images/icons/emoji/unicode/1f478.png?v8","printer":"https://github.githubassets.com/images/icons/emoji/unicode/1f5a8.png?v8","puerto_rico":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f5-1f1f7.png?v8","punch":"https://github.githubassets.com/images/icons/emoji/unicode/1f44a.png?v8","purple_heart":"https://github.githubassets.com/images/icons/emoji/unicode/1f49c.png?v8","purse":"https://github.githubassets.com/images/icons/emoji/unicode/1f45b.png?v8","pushpin":"https://github.githubassets.com/images/icons/emoji/unicode/1f4cc.png?v8","put_litter_in_its_place":"https://github.githubassets.com/images/icons/emoji/unicode/1f6ae.png?v8","qatar":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f6-1f1e6.png?v8","question":"https://github.githubassets.com/images/icons/emoji/unicode/2753.png?v8","rabbit":"https://github.githubassets.com/images/icons/emoji/unicode/1f430.png?v8","rabbit2":"https://github.githubassets.com/images/icons/emoji/unicode/1f407.png?v8","racehorse":"https://github.githubassets.com/images/icons/emoji/unicode/1f40e.png?v8","racing_car":"https://github.githubassets.com/images/icons/emoji/unicode/1f3ce.png?v8","radio":"https://github.githubassets.com/images/icons/emoji/unicode/1f4fb.png?v8","radio_button":"https://github.githubassets.com/images/icons/emoji/unicode/1f518.png?v8","radioactive":"https://github.githubassets.com/images/icons/emoji/unicode/2622.png?v8","rage":"https://github.githubassets.com/images/icons/emoji/unicode/1f621.png?v8","rage1":"https://github.githubassets.com/images/icons/emoji/rage1.png?v8","rage2":"https://github.githubassets.com/images/icons/emoji/rage2.png?v8","rage3":"https://github.githubassets.com/images/icons/emoji/rage3.png?v8","rage4":"https://github.githubassets.com/images/icons/emoji/rage4.png?v8","railway_car":"https://github.githubassets.com/images/icons/emoji/unicode/1f683.png?v8","railway_track":"https://github.githubassets.com/images/icons/emoji/unicode/1f6e4.png?v8","rainbow":"https://github.githubassets.com/images/icons/emoji/unicode/1f308.png?v8","rainbow_flag":"https://github.githubassets.com/images/icons/emoji/unicode/1f3f3-1f308.png?v8","raised_back_of_hand":"https://github.githubassets.com/images/icons/emoji/unicode/1f91a.png?v8","raised_hand":"https://github.githubassets.com/images/icons/emoji/unicode/270b.png?v8","raised_hand_with_fingers_splayed":"https://github.githubassets.com/images/icons/emoji/unicode/1f590.png?v8","raised_hands":"https://github.githubassets.com/images/icons/emoji/unicode/1f64c.png?v8","raising_hand":"https://github.githubassets.com/images/icons/emoji/unicode/1f64b.png?v8","raising_hand_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f64b-2642.png?v8","raising_hand_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f64b.png?v8","ram":"https://github.githubassets.com/images/icons/emoji/unicode/1f40f.png?v8","ramen":"https://github.githubassets.com/images/icons/emoji/unicode/1f35c.png?v8","rat":"https://github.githubassets.com/images/icons/emoji/unicode/1f400.png?v8","record_button":"https://github.githubassets.com/images/icons/emoji/unicode/23fa.png?v8","recycle":"https://github.githubassets.com/images/icons/emoji/unicode/267b.png?v8","red_car":"https://github.githubassets.com/images/icons/emoji/unicode/1f697.png?v8","red_circle":"https://github.githubassets.com/images/icons/emoji/unicode/1f534.png?v8","registered":"https://github.githubassets.com/images/icons/emoji/unicode/00ae.png?v8","relaxed":"https://github.githubassets.com/images/icons/emoji/unicode/263a.png?v8","relieved":"https://github.githubassets.com/images/icons/emoji/unicode/1f60c.png?v8","reminder_ribbon":"https://github.githubassets.com/images/icons/emoji/unicode/1f397.png?v8","repeat":"https://github.githubassets.com/images/icons/emoji/unicode/1f501.png?v8","repeat_one":"https://github.githubassets.com/images/icons/emoji/unicode/1f502.png?v8","rescue_worker_helmet":"https://github.githubassets.com/images/icons/emoji/unicode/26d1.png?v8","restroom":"https://github.githubassets.com/images/icons/emoji/unicode/1f6bb.png?v8","reunion":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f7-1f1ea.png?v8","revolving_hearts":"https://github.githubassets.com/images/icons/emoji/unicode/1f49e.png?v8","rewind":"https://github.githubassets.com/images/icons/emoji/unicode/23ea.png?v8","rhinoceros":"https://github.githubassets.com/images/icons/emoji/unicode/1f98f.png?v8","ribbon":"https://github.githubassets.com/images/icons/emoji/unicode/1f380.png?v8","rice":"https://github.githubassets.com/images/icons/emoji/unicode/1f35a.png?v8","rice_ball":"https://github.githubassets.com/images/icons/emoji/unicode/1f359.png?v8","rice_cracker":"https://github.githubassets.com/images/icons/emoji/unicode/1f358.png?v8","rice_scene":"https://github.githubassets.com/images/icons/emoji/unicode/1f391.png?v8","right_anger_bubble":"https://github.githubassets.com/images/icons/emoji/unicode/1f5ef.png?v8","ring":"https://github.githubassets.com/images/icons/emoji/unicode/1f48d.png?v8","robot":"https://github.githubassets.com/images/icons/emoji/unicode/1f916.png?v8","rocket":"https://github.githubassets.com/images/icons/emoji/unicode/1f680.png?v8","rofl":"https://github.githubassets.com/images/icons/emoji/unicode/1f923.png?v8","roll_eyes":"https://github.githubassets.com/images/icons/emoji/unicode/1f644.png?v8","roller_coaster":"https://github.githubassets.com/images/icons/emoji/unicode/1f3a2.png?v8","romania":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f7-1f1f4.png?v8","rooster":"https://github.githubassets.com/images/icons/emoji/unicode/1f413.png?v8","rose":"https://github.githubassets.com/images/icons/emoji/unicode/1f339.png?v8","rosette":"https://github.githubassets.com/images/icons/emoji/unicode/1f3f5.png?v8","rotating_light":"https://github.githubassets.com/images/icons/emoji/unicode/1f6a8.png?v8","round_pushpin":"https://github.githubassets.com/images/icons/emoji/unicode/1f4cd.png?v8","rowboat":"https://github.githubassets.com/images/icons/emoji/unicode/1f6a3.png?v8","rowing_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f6a3.png?v8","rowing_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f6a3-2640.png?v8","ru":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f7-1f1fa.png?v8","rugby_football":"https://github.githubassets.com/images/icons/emoji/unicode/1f3c9.png?v8","runner":"https://github.githubassets.com/images/icons/emoji/unicode/1f3c3.png?v8","running":"https://github.githubassets.com/images/icons/emoji/unicode/1f3c3.png?v8","running_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f3c3.png?v8","running_shirt_with_sash":"https://github.githubassets.com/images/icons/emoji/unicode/1f3bd.png?v8","running_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f3c3-2640.png?v8","rwanda":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f7-1f1fc.png?v8","sa":"https://github.githubassets.com/images/icons/emoji/unicode/1f202.png?v8","sagittarius":"https://github.githubassets.com/images/icons/emoji/unicode/2650.png?v8","sailboat":"https://github.githubassets.com/images/icons/emoji/unicode/26f5.png?v8","sake":"https://github.githubassets.com/images/icons/emoji/unicode/1f376.png?v8","samoa":"https://github.githubassets.com/images/icons/emoji/unicode/1f1fc-1f1f8.png?v8","san_marino":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f8-1f1f2.png?v8","sandal":"https://github.githubassets.com/images/icons/emoji/unicode/1f461.png?v8","santa":"https://github.githubassets.com/images/icons/emoji/unicode/1f385.png?v8","sao_tome_principe":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f8-1f1f9.png?v8","satellite":"https://github.githubassets.com/images/icons/emoji/unicode/1f4e1.png?v8","satisfied":"https://github.githubassets.com/images/icons/emoji/unicode/1f606.png?v8","saudi_arabia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f8-1f1e6.png?v8","saxophone":"https://github.githubassets.com/images/icons/emoji/unicode/1f3b7.png?v8","school":"https://github.githubassets.com/images/icons/emoji/unicode/1f3eb.png?v8","school_satchel":"https://github.githubassets.com/images/icons/emoji/unicode/1f392.png?v8","scissors":"https://github.githubassets.com/images/icons/emoji/unicode/2702.png?v8","scorpion":"https://github.githubassets.com/images/icons/emoji/unicode/1f982.png?v8","scorpius":"https://github.githubassets.com/images/icons/emoji/unicode/264f.png?v8","scream":"https://github.githubassets.com/images/icons/emoji/unicode/1f631.png?v8","scream_cat":"https://github.githubassets.com/images/icons/emoji/unicode/1f640.png?v8","scroll":"https://github.githubassets.com/images/icons/emoji/unicode/1f4dc.png?v8","seat":"https://github.githubassets.com/images/icons/emoji/unicode/1f4ba.png?v8","secret":"https://github.githubassets.com/images/icons/emoji/unicode/3299.png?v8","see_no_evil":"https://github.githubassets.com/images/icons/emoji/unicode/1f648.png?v8","seedling":"https://github.githubassets.com/images/icons/emoji/unicode/1f331.png?v8","selfie":"https://github.githubassets.com/images/icons/emoji/unicode/1f933.png?v8","senegal":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f8-1f1f3.png?v8","serbia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f7-1f1f8.png?v8","seven":"https://github.githubassets.com/images/icons/emoji/unicode/0037-20e3.png?v8","seychelles":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f8-1f1e8.png?v8","shallow_pan_of_food":"https://github.githubassets.com/images/icons/emoji/unicode/1f958.png?v8","shamrock":"https://github.githubassets.com/images/icons/emoji/unicode/2618.png?v8","shark":"https://github.githubassets.com/images/icons/emoji/unicode/1f988.png?v8","shaved_ice":"https://github.githubassets.com/images/icons/emoji/unicode/1f367.png?v8","sheep":"https://github.githubassets.com/images/icons/emoji/unicode/1f411.png?v8","shell":"https://github.githubassets.com/images/icons/emoji/unicode/1f41a.png?v8","shield":"https://github.githubassets.com/images/icons/emoji/unicode/1f6e1.png?v8","shinto_shrine":"https://github.githubassets.com/images/icons/emoji/unicode/26e9.png?v8","ship":"https://github.githubassets.com/images/icons/emoji/unicode/1f6a2.png?v8","shipit":"https://github.githubassets.com/images/icons/emoji/shipit.png?v8","shirt":"https://github.githubassets.com/images/icons/emoji/unicode/1f455.png?v8","shit":"https://github.githubassets.com/images/icons/emoji/unicode/1f4a9.png?v8","shoe":"https://github.githubassets.com/images/icons/emoji/unicode/1f45e.png?v8","shopping":"https://github.githubassets.com/images/icons/emoji/unicode/1f6cd.png?v8","shopping_cart":"https://github.githubassets.com/images/icons/emoji/unicode/1f6d2.png?v8","shower":"https://github.githubassets.com/images/icons/emoji/unicode/1f6bf.png?v8","shrimp":"https://github.githubassets.com/images/icons/emoji/unicode/1f990.png?v8","sierra_leone":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f8-1f1f1.png?v8","signal_strength":"https://github.githubassets.com/images/icons/emoji/unicode/1f4f6.png?v8","singapore":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f8-1f1ec.png?v8","sint_maarten":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f8-1f1fd.png?v8","six":"https://github.githubassets.com/images/icons/emoji/unicode/0036-20e3.png?v8","six_pointed_star":"https://github.githubassets.com/images/icons/emoji/unicode/1f52f.png?v8","ski":"https://github.githubassets.com/images/icons/emoji/unicode/1f3bf.png?v8","skier":"https://github.githubassets.com/images/icons/emoji/unicode/26f7.png?v8","skull":"https://github.githubassets.com/images/icons/emoji/unicode/1f480.png?v8","skull_and_crossbones":"https://github.githubassets.com/images/icons/emoji/unicode/2620.png?v8","sleeping":"https://github.githubassets.com/images/icons/emoji/unicode/1f634.png?v8","sleeping_bed":"https://github.githubassets.com/images/icons/emoji/unicode/1f6cc.png?v8","sleepy":"https://github.githubassets.com/images/icons/emoji/unicode/1f62a.png?v8","slightly_frowning_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f641.png?v8","slightly_smiling_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f642.png?v8","slot_machine":"https://github.githubassets.com/images/icons/emoji/unicode/1f3b0.png?v8","slovakia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f8-1f1f0.png?v8","slovenia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f8-1f1ee.png?v8","small_airplane":"https://github.githubassets.com/images/icons/emoji/unicode/1f6e9.png?v8","small_blue_diamond":"https://github.githubassets.com/images/icons/emoji/unicode/1f539.png?v8","small_orange_diamond":"https://github.githubassets.com/images/icons/emoji/unicode/1f538.png?v8","small_red_triangle":"https://github.githubassets.com/images/icons/emoji/unicode/1f53a.png?v8","small_red_triangle_down":"https://github.githubassets.com/images/icons/emoji/unicode/1f53b.png?v8","smile":"https://github.githubassets.com/images/icons/emoji/unicode/1f604.png?v8","smile_cat":"https://github.githubassets.com/images/icons/emoji/unicode/1f638.png?v8","smiley":"https://github.githubassets.com/images/icons/emoji/unicode/1f603.png?v8","smiley_cat":"https://github.githubassets.com/images/icons/emoji/unicode/1f63a.png?v8","smiling_imp":"https://github.githubassets.com/images/icons/emoji/unicode/1f608.png?v8","smirk":"https://github.githubassets.com/images/icons/emoji/unicode/1f60f.png?v8","smirk_cat":"https://github.githubassets.com/images/icons/emoji/unicode/1f63c.png?v8","smoking":"https://github.githubassets.com/images/icons/emoji/unicode/1f6ac.png?v8","snail":"https://github.githubassets.com/images/icons/emoji/unicode/1f40c.png?v8","snake":"https://github.githubassets.com/images/icons/emoji/unicode/1f40d.png?v8","sneezing_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f927.png?v8","snowboarder":"https://github.githubassets.com/images/icons/emoji/unicode/1f3c2.png?v8","snowflake":"https://github.githubassets.com/images/icons/emoji/unicode/2744.png?v8","snowman":"https://github.githubassets.com/images/icons/emoji/unicode/26c4.png?v8","snowman_with_snow":"https://github.githubassets.com/images/icons/emoji/unicode/2603.png?v8","sob":"https://github.githubassets.com/images/icons/emoji/unicode/1f62d.png?v8","soccer":"https://github.githubassets.com/images/icons/emoji/unicode/26bd.png?v8","solomon_islands":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f8-1f1e7.png?v8","somalia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f8-1f1f4.png?v8","soon":"https://github.githubassets.com/images/icons/emoji/unicode/1f51c.png?v8","sos":"https://github.githubassets.com/images/icons/emoji/unicode/1f198.png?v8","sound":"https://github.githubassets.com/images/icons/emoji/unicode/1f509.png?v8","south_africa":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ff-1f1e6.png?v8","south_georgia_south_sandwich_islands":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ec-1f1f8.png?v8","south_sudan":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f8-1f1f8.png?v8","space_invader":"https://github.githubassets.com/images/icons/emoji/unicode/1f47e.png?v8","spades":"https://github.githubassets.com/images/icons/emoji/unicode/2660.png?v8","spaghetti":"https://github.githubassets.com/images/icons/emoji/unicode/1f35d.png?v8","sparkle":"https://github.githubassets.com/images/icons/emoji/unicode/2747.png?v8","sparkler":"https://github.githubassets.com/images/icons/emoji/unicode/1f387.png?v8","sparkles":"https://github.githubassets.com/images/icons/emoji/unicode/2728.png?v8","sparkling_heart":"https://github.githubassets.com/images/icons/emoji/unicode/1f496.png?v8","speak_no_evil":"https://github.githubassets.com/images/icons/emoji/unicode/1f64a.png?v8","speaker":"https://github.githubassets.com/images/icons/emoji/unicode/1f508.png?v8","speaking_head":"https://github.githubassets.com/images/icons/emoji/unicode/1f5e3.png?v8","speech_balloon":"https://github.githubassets.com/images/icons/emoji/unicode/1f4ac.png?v8","speedboat":"https://github.githubassets.com/images/icons/emoji/unicode/1f6a4.png?v8","spider":"https://github.githubassets.com/images/icons/emoji/unicode/1f577.png?v8","spider_web":"https://github.githubassets.com/images/icons/emoji/unicode/1f578.png?v8","spiral_calendar":"https://github.githubassets.com/images/icons/emoji/unicode/1f5d3.png?v8","spiral_notepad":"https://github.githubassets.com/images/icons/emoji/unicode/1f5d2.png?v8","spoon":"https://github.githubassets.com/images/icons/emoji/unicode/1f944.png?v8","squid":"https://github.githubassets.com/images/icons/emoji/unicode/1f991.png?v8","squirrel":"https://github.githubassets.com/images/icons/emoji/shipit.png?v8","sri_lanka":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f1-1f1f0.png?v8","st_barthelemy":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e7-1f1f1.png?v8","st_helena":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f8-1f1ed.png?v8","st_kitts_nevis":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f0-1f1f3.png?v8","st_lucia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f1-1f1e8.png?v8","st_pierre_miquelon":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f5-1f1f2.png?v8","st_vincent_grenadines":"https://github.githubassets.com/images/icons/emoji/unicode/1f1fb-1f1e8.png?v8","stadium":"https://github.githubassets.com/images/icons/emoji/unicode/1f3df.png?v8","star":"https://github.githubassets.com/images/icons/emoji/unicode/2b50.png?v8","star2":"https://github.githubassets.com/images/icons/emoji/unicode/1f31f.png?v8","star_and_crescent":"https://github.githubassets.com/images/icons/emoji/unicode/262a.png?v8","star_of_david":"https://github.githubassets.com/images/icons/emoji/unicode/2721.png?v8","stars":"https://github.githubassets.com/images/icons/emoji/unicode/1f320.png?v8","station":"https://github.githubassets.com/images/icons/emoji/unicode/1f689.png?v8","statue_of_liberty":"https://github.githubassets.com/images/icons/emoji/unicode/1f5fd.png?v8","steam_locomotive":"https://github.githubassets.com/images/icons/emoji/unicode/1f682.png?v8","stew":"https://github.githubassets.com/images/icons/emoji/unicode/1f372.png?v8","stop_button":"https://github.githubassets.com/images/icons/emoji/unicode/23f9.png?v8","stop_sign":"https://github.githubassets.com/images/icons/emoji/unicode/1f6d1.png?v8","stopwatch":"https://github.githubassets.com/images/icons/emoji/unicode/23f1.png?v8","straight_ruler":"https://github.githubassets.com/images/icons/emoji/unicode/1f4cf.png?v8","strawberry":"https://github.githubassets.com/images/icons/emoji/unicode/1f353.png?v8","stuck_out_tongue":"https://github.githubassets.com/images/icons/emoji/unicode/1f61b.png?v8","stuck_out_tongue_closed_eyes":"https://github.githubassets.com/images/icons/emoji/unicode/1f61d.png?v8","stuck_out_tongue_winking_eye":"https://github.githubassets.com/images/icons/emoji/unicode/1f61c.png?v8","studio_microphone":"https://github.githubassets.com/images/icons/emoji/unicode/1f399.png?v8","stuffed_flatbread":"https://github.githubassets.com/images/icons/emoji/unicode/1f959.png?v8","sudan":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f8-1f1e9.png?v8","sun_behind_large_cloud":"https://github.githubassets.com/images/icons/emoji/unicode/1f325.png?v8","sun_behind_rain_cloud":"https://github.githubassets.com/images/icons/emoji/unicode/1f326.png?v8","sun_behind_small_cloud":"https://github.githubassets.com/images/icons/emoji/unicode/1f324.png?v8","sun_with_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f31e.png?v8","sunflower":"https://github.githubassets.com/images/icons/emoji/unicode/1f33b.png?v8","sunglasses":"https://github.githubassets.com/images/icons/emoji/unicode/1f60e.png?v8","sunny":"https://github.githubassets.com/images/icons/emoji/unicode/2600.png?v8","sunrise":"https://github.githubassets.com/images/icons/emoji/unicode/1f305.png?v8","sunrise_over_mountains":"https://github.githubassets.com/images/icons/emoji/unicode/1f304.png?v8","surfer":"https://github.githubassets.com/images/icons/emoji/unicode/1f3c4.png?v8","surfing_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f3c4.png?v8","surfing_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f3c4-2640.png?v8","suriname":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f8-1f1f7.png?v8","sushi":"https://github.githubassets.com/images/icons/emoji/unicode/1f363.png?v8","suspect":"https://github.githubassets.com/images/icons/emoji/suspect.png?v8","suspension_railway":"https://github.githubassets.com/images/icons/emoji/unicode/1f69f.png?v8","swaziland":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f8-1f1ff.png?v8","sweat":"https://github.githubassets.com/images/icons/emoji/unicode/1f613.png?v8","sweat_drops":"https://github.githubassets.com/images/icons/emoji/unicode/1f4a6.png?v8","sweat_smile":"https://github.githubassets.com/images/icons/emoji/unicode/1f605.png?v8","sweden":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f8-1f1ea.png?v8","sweet_potato":"https://github.githubassets.com/images/icons/emoji/unicode/1f360.png?v8","swimmer":"https://github.githubassets.com/images/icons/emoji/unicode/1f3ca.png?v8","swimming_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f3ca.png?v8","swimming_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f3ca-2640.png?v8","switzerland":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e8-1f1ed.png?v8","symbols":"https://github.githubassets.com/images/icons/emoji/unicode/1f523.png?v8","synagogue":"https://github.githubassets.com/images/icons/emoji/unicode/1f54d.png?v8","syria":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f8-1f1fe.png?v8","syringe":"https://github.githubassets.com/images/icons/emoji/unicode/1f489.png?v8","taco":"https://github.githubassets.com/images/icons/emoji/unicode/1f32e.png?v8","tada":"https://github.githubassets.com/images/icons/emoji/unicode/1f389.png?v8","taiwan":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f9-1f1fc.png?v8","tajikistan":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f9-1f1ef.png?v8","tanabata_tree":"https://github.githubassets.com/images/icons/emoji/unicode/1f38b.png?v8","tangerine":"https://github.githubassets.com/images/icons/emoji/unicode/1f34a.png?v8","tanzania":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f9-1f1ff.png?v8","taurus":"https://github.githubassets.com/images/icons/emoji/unicode/2649.png?v8","taxi":"https://github.githubassets.com/images/icons/emoji/unicode/1f695.png?v8","tea":"https://github.githubassets.com/images/icons/emoji/unicode/1f375.png?v8","telephone":"https://github.githubassets.com/images/icons/emoji/unicode/260e.png?v8","telephone_receiver":"https://github.githubassets.com/images/icons/emoji/unicode/1f4de.png?v8","telescope":"https://github.githubassets.com/images/icons/emoji/unicode/1f52d.png?v8","tennis":"https://github.githubassets.com/images/icons/emoji/unicode/1f3be.png?v8","tent":"https://github.githubassets.com/images/icons/emoji/unicode/26fa.png?v8","thailand":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f9-1f1ed.png?v8","thermometer":"https://github.githubassets.com/images/icons/emoji/unicode/1f321.png?v8","thinking":"https://github.githubassets.com/images/icons/emoji/unicode/1f914.png?v8","thought_balloon":"https://github.githubassets.com/images/icons/emoji/unicode/1f4ad.png?v8","three":"https://github.githubassets.com/images/icons/emoji/unicode/0033-20e3.png?v8","thumbsdown":"https://github.githubassets.com/images/icons/emoji/unicode/1f44e.png?v8","thumbsup":"https://github.githubassets.com/images/icons/emoji/unicode/1f44d.png?v8","ticket":"https://github.githubassets.com/images/icons/emoji/unicode/1f3ab.png?v8","tickets":"https://github.githubassets.com/images/icons/emoji/unicode/1f39f.png?v8","tiger":"https://github.githubassets.com/images/icons/emoji/unicode/1f42f.png?v8","tiger2":"https://github.githubassets.com/images/icons/emoji/unicode/1f405.png?v8","timer_clock":"https://github.githubassets.com/images/icons/emoji/unicode/23f2.png?v8","timor_leste":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f9-1f1f1.png?v8","tipping_hand_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f481-2642.png?v8","tipping_hand_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f481.png?v8","tired_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f62b.png?v8","tm":"https://github.githubassets.com/images/icons/emoji/unicode/2122.png?v8","togo":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f9-1f1ec.png?v8","toilet":"https://github.githubassets.com/images/icons/emoji/unicode/1f6bd.png?v8","tokelau":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f9-1f1f0.png?v8","tokyo_tower":"https://github.githubassets.com/images/icons/emoji/unicode/1f5fc.png?v8","tomato":"https://github.githubassets.com/images/icons/emoji/unicode/1f345.png?v8","tonga":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f9-1f1f4.png?v8","tongue":"https://github.githubassets.com/images/icons/emoji/unicode/1f445.png?v8","top":"https://github.githubassets.com/images/icons/emoji/unicode/1f51d.png?v8","tophat":"https://github.githubassets.com/images/icons/emoji/unicode/1f3a9.png?v8","tornado":"https://github.githubassets.com/images/icons/emoji/unicode/1f32a.png?v8","tr":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f9-1f1f7.png?v8","trackball":"https://github.githubassets.com/images/icons/emoji/unicode/1f5b2.png?v8","tractor":"https://github.githubassets.com/images/icons/emoji/unicode/1f69c.png?v8","traffic_light":"https://github.githubassets.com/images/icons/emoji/unicode/1f6a5.png?v8","train":"https://github.githubassets.com/images/icons/emoji/unicode/1f68b.png?v8","train2":"https://github.githubassets.com/images/icons/emoji/unicode/1f686.png?v8","tram":"https://github.githubassets.com/images/icons/emoji/unicode/1f68a.png?v8","triangular_flag_on_post":"https://github.githubassets.com/images/icons/emoji/unicode/1f6a9.png?v8","triangular_ruler":"https://github.githubassets.com/images/icons/emoji/unicode/1f4d0.png?v8","trident":"https://github.githubassets.com/images/icons/emoji/unicode/1f531.png?v8","trinidad_tobago":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f9-1f1f9.png?v8","triumph":"https://github.githubassets.com/images/icons/emoji/unicode/1f624.png?v8","trolleybus":"https://github.githubassets.com/images/icons/emoji/unicode/1f68e.png?v8","trollface":"https://github.githubassets.com/images/icons/emoji/trollface.png?v8","trophy":"https://github.githubassets.com/images/icons/emoji/unicode/1f3c6.png?v8","tropical_drink":"https://github.githubassets.com/images/icons/emoji/unicode/1f379.png?v8","tropical_fish":"https://github.githubassets.com/images/icons/emoji/unicode/1f420.png?v8","truck":"https://github.githubassets.com/images/icons/emoji/unicode/1f69a.png?v8","trumpet":"https://github.githubassets.com/images/icons/emoji/unicode/1f3ba.png?v8","tshirt":"https://github.githubassets.com/images/icons/emoji/unicode/1f455.png?v8","tulip":"https://github.githubassets.com/images/icons/emoji/unicode/1f337.png?v8","tumbler_glass":"https://github.githubassets.com/images/icons/emoji/unicode/1f943.png?v8","tunisia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f9-1f1f3.png?v8","turkey":"https://github.githubassets.com/images/icons/emoji/unicode/1f983.png?v8","turkmenistan":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f9-1f1f2.png?v8","turks_caicos_islands":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f9-1f1e8.png?v8","turtle":"https://github.githubassets.com/images/icons/emoji/unicode/1f422.png?v8","tuvalu":"https://github.githubassets.com/images/icons/emoji/unicode/1f1f9-1f1fb.png?v8","tv":"https://github.githubassets.com/images/icons/emoji/unicode/1f4fa.png?v8","twisted_rightwards_arrows":"https://github.githubassets.com/images/icons/emoji/unicode/1f500.png?v8","two":"https://github.githubassets.com/images/icons/emoji/unicode/0032-20e3.png?v8","two_hearts":"https://github.githubassets.com/images/icons/emoji/unicode/1f495.png?v8","two_men_holding_hands":"https://github.githubassets.com/images/icons/emoji/unicode/1f46c.png?v8","two_women_holding_hands":"https://github.githubassets.com/images/icons/emoji/unicode/1f46d.png?v8","u5272":"https://github.githubassets.com/images/icons/emoji/unicode/1f239.png?v8","u5408":"https://github.githubassets.com/images/icons/emoji/unicode/1f234.png?v8","u55b6":"https://github.githubassets.com/images/icons/emoji/unicode/1f23a.png?v8","u6307":"https://github.githubassets.com/images/icons/emoji/unicode/1f22f.png?v8","u6708":"https://github.githubassets.com/images/icons/emoji/unicode/1f237.png?v8","u6709":"https://github.githubassets.com/images/icons/emoji/unicode/1f236.png?v8","u6e80":"https://github.githubassets.com/images/icons/emoji/unicode/1f235.png?v8","u7121":"https://github.githubassets.com/images/icons/emoji/unicode/1f21a.png?v8","u7533":"https://github.githubassets.com/images/icons/emoji/unicode/1f238.png?v8","u7981":"https://github.githubassets.com/images/icons/emoji/unicode/1f232.png?v8","u7a7a":"https://github.githubassets.com/images/icons/emoji/unicode/1f233.png?v8","uganda":"https://github.githubassets.com/images/icons/emoji/unicode/1f1fa-1f1ec.png?v8","uk":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ec-1f1e7.png?v8","ukraine":"https://github.githubassets.com/images/icons/emoji/unicode/1f1fa-1f1e6.png?v8","umbrella":"https://github.githubassets.com/images/icons/emoji/unicode/2614.png?v8","unamused":"https://github.githubassets.com/images/icons/emoji/unicode/1f612.png?v8","underage":"https://github.githubassets.com/images/icons/emoji/unicode/1f51e.png?v8","unicorn":"https://github.githubassets.com/images/icons/emoji/unicode/1f984.png?v8","united_arab_emirates":"https://github.githubassets.com/images/icons/emoji/unicode/1f1e6-1f1ea.png?v8","unlock":"https://github.githubassets.com/images/icons/emoji/unicode/1f513.png?v8","up":"https://github.githubassets.com/images/icons/emoji/unicode/1f199.png?v8","upside_down_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f643.png?v8","uruguay":"https://github.githubassets.com/images/icons/emoji/unicode/1f1fa-1f1fe.png?v8","us":"https://github.githubassets.com/images/icons/emoji/unicode/1f1fa-1f1f8.png?v8","us_virgin_islands":"https://github.githubassets.com/images/icons/emoji/unicode/1f1fb-1f1ee.png?v8","uzbekistan":"https://github.githubassets.com/images/icons/emoji/unicode/1f1fa-1f1ff.png?v8","v":"https://github.githubassets.com/images/icons/emoji/unicode/270c.png?v8","vanuatu":"https://github.githubassets.com/images/icons/emoji/unicode/1f1fb-1f1fa.png?v8","vatican_city":"https://github.githubassets.com/images/icons/emoji/unicode/1f1fb-1f1e6.png?v8","venezuela":"https://github.githubassets.com/images/icons/emoji/unicode/1f1fb-1f1ea.png?v8","vertical_traffic_light":"https://github.githubassets.com/images/icons/emoji/unicode/1f6a6.png?v8","vhs":"https://github.githubassets.com/images/icons/emoji/unicode/1f4fc.png?v8","vibration_mode":"https://github.githubassets.com/images/icons/emoji/unicode/1f4f3.png?v8","video_camera":"https://github.githubassets.com/images/icons/emoji/unicode/1f4f9.png?v8","video_game":"https://github.githubassets.com/images/icons/emoji/unicode/1f3ae.png?v8","vietnam":"https://github.githubassets.com/images/icons/emoji/unicode/1f1fb-1f1f3.png?v8","violin":"https://github.githubassets.com/images/icons/emoji/unicode/1f3bb.png?v8","virgo":"https://github.githubassets.com/images/icons/emoji/unicode/264d.png?v8","volcano":"https://github.githubassets.com/images/icons/emoji/unicode/1f30b.png?v8","volleyball":"https://github.githubassets.com/images/icons/emoji/unicode/1f3d0.png?v8","vs":"https://github.githubassets.com/images/icons/emoji/unicode/1f19a.png?v8","vulcan_salute":"https://github.githubassets.com/images/icons/emoji/unicode/1f596.png?v8","walking":"https://github.githubassets.com/images/icons/emoji/unicode/1f6b6.png?v8","walking_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f6b6.png?v8","walking_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f6b6-2640.png?v8","wallis_futuna":"https://github.githubassets.com/images/icons/emoji/unicode/1f1fc-1f1eb.png?v8","waning_crescent_moon":"https://github.githubassets.com/images/icons/emoji/unicode/1f318.png?v8","waning_gibbous_moon":"https://github.githubassets.com/images/icons/emoji/unicode/1f316.png?v8","warning":"https://github.githubassets.com/images/icons/emoji/unicode/26a0.png?v8","wastebasket":"https://github.githubassets.com/images/icons/emoji/unicode/1f5d1.png?v8","watch":"https://github.githubassets.com/images/icons/emoji/unicode/231a.png?v8","water_buffalo":"https://github.githubassets.com/images/icons/emoji/unicode/1f403.png?v8","watermelon":"https://github.githubassets.com/images/icons/emoji/unicode/1f349.png?v8","wave":"https://github.githubassets.com/images/icons/emoji/unicode/1f44b.png?v8","wavy_dash":"https://github.githubassets.com/images/icons/emoji/unicode/3030.png?v8","waxing_crescent_moon":"https://github.githubassets.com/images/icons/emoji/unicode/1f312.png?v8","waxing_gibbous_moon":"https://github.githubassets.com/images/icons/emoji/unicode/1f314.png?v8","wc":"https://github.githubassets.com/images/icons/emoji/unicode/1f6be.png?v8","weary":"https://github.githubassets.com/images/icons/emoji/unicode/1f629.png?v8","wedding":"https://github.githubassets.com/images/icons/emoji/unicode/1f492.png?v8","weight_lifting_man":"https://github.githubassets.com/images/icons/emoji/unicode/1f3cb.png?v8","weight_lifting_woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f3cb-2640.png?v8","western_sahara":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ea-1f1ed.png?v8","whale":"https://github.githubassets.com/images/icons/emoji/unicode/1f433.png?v8","whale2":"https://github.githubassets.com/images/icons/emoji/unicode/1f40b.png?v8","wheel_of_dharma":"https://github.githubassets.com/images/icons/emoji/unicode/2638.png?v8","wheelchair":"https://github.githubassets.com/images/icons/emoji/unicode/267f.png?v8","white_check_mark":"https://github.githubassets.com/images/icons/emoji/unicode/2705.png?v8","white_circle":"https://github.githubassets.com/images/icons/emoji/unicode/26aa.png?v8","white_flag":"https://github.githubassets.com/images/icons/emoji/unicode/1f3f3.png?v8","white_flower":"https://github.githubassets.com/images/icons/emoji/unicode/1f4ae.png?v8","white_large_square":"https://github.githubassets.com/images/icons/emoji/unicode/2b1c.png?v8","white_medium_small_square":"https://github.githubassets.com/images/icons/emoji/unicode/25fd.png?v8","white_medium_square":"https://github.githubassets.com/images/icons/emoji/unicode/25fb.png?v8","white_small_square":"https://github.githubassets.com/images/icons/emoji/unicode/25ab.png?v8","white_square_button":"https://github.githubassets.com/images/icons/emoji/unicode/1f533.png?v8","wilted_flower":"https://github.githubassets.com/images/icons/emoji/unicode/1f940.png?v8","wind_chime":"https://github.githubassets.com/images/icons/emoji/unicode/1f390.png?v8","wind_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f32c.png?v8","wine_glass":"https://github.githubassets.com/images/icons/emoji/unicode/1f377.png?v8","wink":"https://github.githubassets.com/images/icons/emoji/unicode/1f609.png?v8","wolf":"https://github.githubassets.com/images/icons/emoji/unicode/1f43a.png?v8","woman":"https://github.githubassets.com/images/icons/emoji/unicode/1f469.png?v8","woman_artist":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-1f3a8.png?v8","woman_astronaut":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-1f680.png?v8","woman_cartwheeling":"https://github.githubassets.com/images/icons/emoji/unicode/1f938-2640.png?v8","woman_cook":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-1f373.png?v8","woman_facepalming":"https://github.githubassets.com/images/icons/emoji/unicode/1f926-2640.png?v8","woman_factory_worker":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-1f3ed.png?v8","woman_farmer":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-1f33e.png?v8","woman_firefighter":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-1f692.png?v8","woman_health_worker":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-2695.png?v8","woman_judge":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-2696.png?v8","woman_juggling":"https://github.githubassets.com/images/icons/emoji/unicode/1f939-2640.png?v8","woman_mechanic":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-1f527.png?v8","woman_office_worker":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-1f4bc.png?v8","woman_pilot":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-2708.png?v8","woman_playing_handball":"https://github.githubassets.com/images/icons/emoji/unicode/1f93e-2640.png?v8","woman_playing_water_polo":"https://github.githubassets.com/images/icons/emoji/unicode/1f93d-2640.png?v8","woman_scientist":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-1f52c.png?v8","woman_shrugging":"https://github.githubassets.com/images/icons/emoji/unicode/1f937-2640.png?v8","woman_singer":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-1f3a4.png?v8","woman_student":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-1f393.png?v8","woman_teacher":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-1f3eb.png?v8","woman_technologist":"https://github.githubassets.com/images/icons/emoji/unicode/1f469-1f4bb.png?v8","woman_with_turban":"https://github.githubassets.com/images/icons/emoji/unicode/1f473-2640.png?v8","womans_clothes":"https://github.githubassets.com/images/icons/emoji/unicode/1f45a.png?v8","womans_hat":"https://github.githubassets.com/images/icons/emoji/unicode/1f452.png?v8","women_wrestling":"https://github.githubassets.com/images/icons/emoji/unicode/1f93c-2640.png?v8","womens":"https://github.githubassets.com/images/icons/emoji/unicode/1f6ba.png?v8","world_map":"https://github.githubassets.com/images/icons/emoji/unicode/1f5fa.png?v8","worried":"https://github.githubassets.com/images/icons/emoji/unicode/1f61f.png?v8","wrench":"https://github.githubassets.com/images/icons/emoji/unicode/1f527.png?v8","writing_hand":"https://github.githubassets.com/images/icons/emoji/unicode/270d.png?v8","x":"https://github.githubassets.com/images/icons/emoji/unicode/274c.png?v8","yellow_heart":"https://github.githubassets.com/images/icons/emoji/unicode/1f49b.png?v8","yemen":"https://github.githubassets.com/images/icons/emoji/unicode/1f1fe-1f1ea.png?v8","yen":"https://github.githubassets.com/images/icons/emoji/unicode/1f4b4.png?v8","yin_yang":"https://github.githubassets.com/images/icons/emoji/unicode/262f.png?v8","yum":"https://github.githubassets.com/images/icons/emoji/unicode/1f60b.png?v8","zambia":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ff-1f1f2.png?v8","zap":"https://github.githubassets.com/images/icons/emoji/unicode/26a1.png?v8","zero":"https://github.githubassets.com/images/icons/emoji/unicode/0030-20e3.png?v8","zimbabwe":"https://github.githubassets.com/images/icons/emoji/unicode/1f1ff-1f1fc.png?v8","zipper_mouth_face":"https://github.githubassets.com/images/icons/emoji/unicode/1f910.png?v8","zzz":"https://github.githubassets.com/images/icons/emoji/unicode/1f4a4.png?v8"}

  const TOKEN_KEY = 'hovercard-token'
  let token = localStorage.getItem(TOKEN_KEY)
  let platform =
    (typeof browser !== 'undefined' ? browser : window.chrome) || null

  const DEFAULT_OPTIONS = {
    delay: 200,
    readme: true,
    disableProjects: false,
    showSelf: false,
    side: 'top',
    theme: 'github'
  }

  let cardOptions = Object.assign({}, DEFAULT_OPTIONS)

  if (platform && platform.storage) {
    let storage = platform.storage.sync || platform.storage.local
    storage.get(
      Object.assign({}, DEFAULT_OPTIONS),
      ({ delay, readme, disableProjects, showSelf, side, theme }) => {
        delay = parseInt(delay, 10)
        delay = isNaN(delay) ? 200 : delay

        Object.assign(cardOptions, {
          delay,
          readme,
          disableProjects,
          showSelf,
          side,
          theme
        })

        applyTheme(theme)
        extract()
      }
    )
  } else {
    applyTheme(cardOptions.theme)
    extract()
  }

  function applyTheme(theme) {
    document.documentElement.classList.add(`ghh-theme-${theme}`)
  }

  function extractElem (context, el, strategy) {
    if (context && !context.contains(el)) {
      return
    }
    let elem = $(el)
    if (getExtracted(elem) || elem.is(BLACK_LIST_SELECTOR)) {
      // skip processed elements
      return
    }
    let target
    let username // {{user}}
    let repo // {{repo}}
    let fullRepo // {{user}}/{{repo}}
    let issue // {{issue}}
    let fullIssue // {{user}}/{{repo}}#{{issue}}
    let comment // {{comment}}
    let fullComment // {{user}}/{{repo}}:{{issue}}
    let commit // {{commit}}
    let fullCommit // {{user}}/{{repo}}@{{commit}}
    switch (strategy) {
      case EXTRACTOR.TEXT_USER: {
        username = trim(elem.text().replace(/[@/]/g, ''))
        target = $(`<span>${elem.text()}</span>`)
        elem.empty().append(target)
        break
      }
      case EXTRACTOR.TITLE_USER: {
        username = trim((elem.attr('title') || '').replace(/[@/]/g, ''))
        break
      }
      case EXTRACTOR.ALT_USER: {
        username = trim(
          (elem.attr('alt') || '').split(/\s+/)[0].replace(/[@/]/g, '')
        )
        break
      }
      case EXTRACTOR.HREF_USER: {
        username = trim((elem.attr('href') || '').replace(/[@/]/g, ''))
        break
      }
      case EXTRACTOR.TEXT_MY_REPO: {
        let repo = trim(elem.text())
        if (me && repo.indexOf('/') === -1) {
          fullRepo = `${me}/${repo}`
          break
        }
      }
      case EXTRACTOR.SLUG: {
        let slug = elem.text()
        let match = slug.match(SLUG_PATTERN)
        username = trim(match && match[1])
        repo = trim(match && match[2])
        issue = trim(match && match[3])
        commit = trim(match && match[4])
        if (username && repo) {
          fullRepo = username + '/' + repo

          // special case for code search highlight
          // save contents before replacing
          let contents = elem.find('em').length
            ? elem
                .contents()
                .map(function(i) {
                  let text =
                    i === 0
                      ? this.textContent.split('/')[1] || ''
                      : this.textContent
                  // whitelisting <em>s for safety
                  return this.nodeName.toLowerCase() === 'em'
                    ? `<em>${text}</em>`
                    : text
                })
                .toArray()
                .join('')
            : null

          if (issue) {
            elem.html(
              slug.replace('#' + issue, encodeHTML`#<span>${issue}</span>`)
            )
            slug = elem.html()
          }
          if (commit) {
            elem.html(
              slug.replace(
                '@' + commit,
                encodeHTML`@<span>${commit}</span>`
              )
            )
            slug = elem.html()
          }

          let repoContents = contents || repo // safe HTML or plain text
          if (
            (username === me || username === current) &&
            !cardOptions.showSelf
          ) {
            elem.html(
              slug.replace(
                fullRepo,
                encodeHTML`${username}/<span>` + repoContents + '</span>'
              )
            )
            markExtracted(
              elem.children().first(),
              EXTRACT_TYPE.REPO,
              fullRepo
            )
          } else {
            elem.html(
              slug.replace(
                fullRepo,
                encodeHTML`<span>${username}</span>/<span>` +
                  repoContents +
                  '</span>'
              )
            )
            markExtracted(
              elem.children().first(),
              EXTRACT_TYPE.USER,
              username
            )
            markExtracted(
              elem
                .children()
                .first()
                .next(),
              EXTRACT_TYPE.REPO,
              fullRepo
            )
          }
          if (issue) {
            markExtracted(
              elem.children().last(),
              EXTRACT_TYPE.ISSUE,
              fullRepo + '#' + issue
            )
          }
          if (commit) {
            markExtracted(
              elem.children().last(),
              EXTRACT_TYPE.COMMIT,
              fullRepo + '@' + commit
            )
          }

          // if not marked earlier, mark as nothing extracted
          if (!getExtracted(elem)) {
            markExtracted(elem)
          }
          elem = null
        }
        break
      }
      case EXTRACTOR.TEXT_NODE_URL: {
        let nodes = [...elem[0].childNodes]
        let textNode = nodes.find(node => trim(node.nodeValue))
        target = $(encodeHTML` <span>${textNode.nodeValue}</span>`)
        textNode.parentNode.replaceChild(target[0], textNode)
        markExtracted(elem)
      }
      case EXTRACTOR.URL: {
        target = elem
        elem = elem.closest('a')

        let href = elem.prop('href') // absolute path via prop
        if (href) {
          href = href.baseVal || href // support SVG elements

          try {
            let url = new URL(href)
            // skip local anchors
            if (
              `${url.host}${url.pathname}` ===
                `${location.host}${location.pathname}` &&
              !url.hash.match(/#issuecomment-/)
            ) {
              return
            }
          } catch (e) {
            return
          }

          let match = href.match(URL_USER_PATTERN)
          username = trim(match && (match[1] || match[2]))
          if (!username) {
            match = href.match(URL_REPO_PATTERN)
            username = trim(match && match[1])
            repo = trim(match && match[2])
          }
          if (!username) {
            match = href.match(URL_ISSUE_PATTERN)
            username = trim(match && match[1])
            repo = trim(match && match[2])
            issue = trim(match && match[3])
          }
          if (!username) {
            match = href.match(URL_COMMENT_PATTERN)
            username = trim(match && match[1])
            repo = trim(match && match[2])
            issue = trim(match && match[3])
            comment = trim(match && match[4])
          }
          if (!username) {
            match = href.match(URL_COMMIT_PATTERN)
            username = trim(match && match[1])
            repo = trim(match && match[2])
            commit = trim(match && match[3])
          }
          if (username) {
            if (
              GH_RESERVED_USER_NAMES.indexOf(username) !== -1 ||
              !GH_USER_NAME_PATTERN.test(username)
            ) {
              username = null
              repo = null
              issue = null
            }
          }
          if (repo) {
            repo = repo.replace(/\.git$/i, '')
            fullRepo = `${username}/${repo}`
            if (
              GH_RESERVED_REPO_NAMES.indexOf(repo) !== -1 ||
              !GH_REPO_NAME_PATTERN.test(repo)
            ) {
              fullRepo = null
              username = null
              issue = null
            }
          }
          if (issue) {
            fullIssue = `${username}/${repo}#${issue}`
          }
          if (comment) {
            fullComment = `${username}/${repo}:${comment}`
          }
          if (commit) {
            fullCommit = `${username}/${repo}@${commit}`
          }
          // skip hovercard on myself or current profile page owner
          if (
            (username === me || username === current) &&
            !cardOptions.showSelf &&
            !repo
          ) {
            username = null
          }
        }
        break
      }
      case EXTRACTOR.NEXT_TEXT_REPO: {
        fullRepo = getFullRepoFromAncestorLink(elem)
        repo = fullRepo.split('/')[1]
        let textNode = getNextTextNode(
          elem[0],
          elem[0].parentNode.parentNode
        )
        target = $(`<span>${repo}</span>`)
        if (fullRepo && textNode) {
          let parent = textNode.parentNode
          parent.replaceChild(target[0], textNode)
          parent.insertBefore(document.createTextNode(' '), target[0])
          markExtracted(elem)
        } else {
          elem = null
        }
        break
      }
      case EXTRACTOR.ANCESTOR_URL_REPO: {
        fullRepo = getFullRepoFromAncestorLink(elem)
        break
      }
      case EXTRACTOR.NEXT_LINK_TEXT_USER: {
        let link = elem.nextAll('a').eq(0)
        if (link) {
          username = trim(link.text().replace(/[@/]/g, ''))
        }
        break
      }
      case EXTRACTOR.TEXT_NODE_USER: {
        let nodes = [...elem[0].childNodes]
        let textNode = nodes.find(node => trim(node.nodeValue))

        if (textNode) {
          username = trim(textNode.nodeValue)
          let userElem = $(`<span>${textNode.nodeValue}</span>`)
          textNode.parentNode.replaceChild(userElem[0], textNode)
          markExtracted(elem)
          target = userElem
        }
        break
      }
      case EXTRACTOR.NEXT_TEXT_USER: {
        let textNode = getNextTextNode(
          elem[0],
          elem[0].parentNode.parentNode
        )
        username = textNode.nodeValue.replace(/[\s\\/]+/g, '')
        break
      }
      case EXTRACTOR.REPO_LIST_SLUG: {
        elem.find('.octicon-repo').insertBefore(elem.closest('a'))
        let slug = elem.text().replace(/\s+/g, '')
        let match = slug.match(SLUG_PATTERN)
        username = trim(match && match[1])
        repo = trim(match && match[2])
        if (username && repo) {
          fullRepo = username + '/' + repo

          elem.html(fixRepoSlug(elem.html()))
          let targets = elem.find('[data-ghh]')
          markExtracted(targets.eq(0), EXTRACT_TYPE.USER, username)
          markExtracted(targets.eq(1), EXTRACT_TYPE.REPO, fullRepo)
          targets.removeAttr('data-ghh')

          // if not marked earlier, mark as nothing extracted
          if (!getExtracted(elem)) {
            markExtracted(elem)
          }
          elem = null
        }
        break
      }
      default:
        break
    }

    // elem === null means already marked in extractors
    if (!elem) {
      return
    }

    target = target || elem
    if (fullCommit) {
      markExtracted(target, EXTRACT_TYPE.COMMIT, fullCommit)
    } else if (fullComment) {
      markExtracted(target, EXTRACT_TYPE.COMMENT, fullComment)
    } else if (fullIssue) {
      markExtracted(target, EXTRACT_TYPE.ISSUE, fullIssue)
    } else if (fullRepo) {
      markExtracted(target, EXTRACT_TYPE.REPO, fullRepo)
    } else if (username) {
      if (
        (username !== me && username !== current) ||
        cardOptions.showSelf
      ) {
        markExtracted(target, EXTRACT_TYPE.USER, username)
      } else {
        markExtracted(target)
      }
    }
    if (!username && !fullRepo && !fullIssue) {
      markExtracted(elem)
    }
  }
})
