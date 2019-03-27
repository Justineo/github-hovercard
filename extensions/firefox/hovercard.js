$(() => {
  'use strict'

  const GH_DOMAIN = location.host

  const EXCLUDES = [
    '.tooltipster-base',
    '.tooltipster-sizer',
    '.timestamp',
    '.time',
    '.octotree_sidebar',
    'time-ago',
    'relative-time',
    '.user-status-container'
  ].join(',')

  const DEFAULT_TARGET = document.body

  function isExclude(target) {
    return (
      $(target).is(EXCLUDES) ||
      $(target).parents(EXCLUDES).length ||
      $(target).is(DEFAULT_TARGET)
    )
  }

  let isExtracting = false
  let observer = new MutationObserver(mutations => {
    if (isExtracting) {
      return
    }
    mutations.forEach(mutation => {
      if (mutation.type === 'childList') {
        let target = mutation.target
        if (!isExclude(target)) {
          extract(target)
        }
      }
    })
  })
  let observeConfig = {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true
  }
  observer.observe(DEFAULT_TARGET, observeConfig)

  let me = $('meta[name="user-login"]').attr('content')

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
    'case-studies'
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

  // Octicons in SVG
  const OCTICONS = {"alert":{"width":16,"height":16,"d":"M8.893 1.5c-.183-.31-.52-.5-.887-.5s-.703.19-.886.5L.138 13.499a.98.98 0 0 0 0 1.001c.193.31.53.501.886.501h13.964c.367 0 .704-.19.877-.5a1.03 1.03 0 0 0 .01-1.002L8.893 1.5zm.133 11.497H6.987v-2.003h2.039v2.003zm0-3.004H6.987V5.987h2.039v4.006z"},"arrow-right":{"width":10,"height":16,"d":"M10 8L4 3v3H0v4h4v3l6-5z"},"code":{"width":14,"height":16,"d":"M9.5 3L8 4.5 11.5 8 8 11.5 9.5 13 14 8 9.5 3zm-5 0L0 8l4.5 5L6 11.5 2.5 8 6 4.5 4.5 3z"},"diff":{"width":13,"height":16,"d":"M6 7h2v1H6v2H5V8H3V7h2V5h1v2zm-3 6h5v-1H3v1zM7.5 2L11 5.5V15c0 .55-.45 1-1 1H1c-.55 0-1-.45-1-1V3c0-.55.45-1 1-1h6.5zM10 6L7 3H1v12h9V6zM8.5 0H3v1h5l4 4v8h1V4.5L8.5 0z"},"git-commit":{"width":14,"height":16,"d":"M10.86 7c-.45-1.72-2-3-3.86-3-1.86 0-3.41 1.28-3.86 3H0v2h3.14c.45 1.72 2 3 3.86 3 1.86 0 3.41-1.28 3.86-3H14V7h-3.14zM7 10.2c-1.22 0-2.2-.98-2.2-2.2 0-1.22.98-2.2 2.2-2.2 1.22 0 2.2.98 2.2 2.2 0 1.22-.98 2.2-2.2 2.2z"},"git-pull-request":{"width":12,"height":16,"d":"M11 11.28V5c-.03-.78-.34-1.47-.94-2.06C9.46 2.35 8.78 2.03 8 2H7V0L4 3l3 3V4h1c.27.02.48.11.69.31.21.2.3.42.31.69v6.28A1.993 1.993 0 0 0 10 15a1.993 1.993 0 0 0 1-3.72zm-1 2.92c-.66 0-1.2-.55-1.2-1.2 0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2zM4 3c0-1.11-.89-2-2-2a1.993 1.993 0 0 0-1 3.72v6.56A1.993 1.993 0 0 0 2 15a1.993 1.993 0 0 0 1-3.72V4.72c.59-.34 1-.98 1-1.72zm-.8 10c0 .66-.55 1.2-1.2 1.2-.65 0-1.2-.55-1.2-1.2 0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2zM2 4.2C1.34 4.2.8 3.65.8 3c0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2z"},"info":{"width":14,"height":16,"d":"M6.3 5.69a.942.942 0 0 1-.28-.7c0-.28.09-.52.28-.7.19-.18.42-.28.7-.28.28 0 .52.09.7.28.18.19.28.42.28.7 0 .28-.09.52-.28.7a1 1 0 0 1-.7.3c-.28 0-.52-.11-.7-.3zM8 7.99c-.02-.25-.11-.48-.31-.69-.2-.19-.42-.3-.69-.31H6c-.27.02-.48.13-.69.31-.2.2-.3.44-.31.69h1v3c.02.27.11.5.31.69.2.2.42.31.69.31h1c.27 0 .48-.11.69-.31.2-.19.3-.42.31-.69H8V7.98v.01zM7 2.3c-3.14 0-5.7 2.54-5.7 5.68 0 3.14 2.56 5.7 5.7 5.7s5.7-2.55 5.7-5.7c0-3.15-2.56-5.69-5.7-5.69v.01zM7 .98c3.86 0 7 3.14 7 7s-3.14 7-7 7-7-3.12-7-7 3.14-7 7-7z"},"issue-closed":{"width":16,"height":16,"d":"M7 10h2v2H7v-2zm2-6H7v5h2V4zm1.5 1.5l-1 1L12 9l4-4.5-1-1L12 7l-1.5-1.5zM8 13.7A5.71 5.71 0 0 1 2.3 8c0-3.14 2.56-5.7 5.7-5.7 1.83 0 3.45.88 4.5 2.2l.92-.92A6.947 6.947 0 0 0 8 1C4.14 1 1 4.14 1 8s3.14 7 7 7 7-3.14 7-7l-1.52 1.52c-.66 2.41-2.86 4.19-5.48 4.19v-.01z"},"issue-opened":{"width":14,"height":16,"d":"M7 2.3c3.14 0 5.7 2.56 5.7 5.7s-2.56 5.7-5.7 5.7A5.71 5.71 0 0 1 1.3 8c0-3.14 2.56-5.7 5.7-5.7zM7 1C3.14 1 0 4.14 0 8s3.14 7 7 7 7-3.14 7-7-3.14-7-7-7zm1 3H6v5h2V4zm0 6H6v2h2v-2z"},"link":{"width":16,"height":16,"d":"M4 9h1v1H4c-1.5 0-3-1.69-3-3.5S2.55 3 4 3h4c1.45 0 3 1.69 3 3.5 0 1.41-.91 2.72-2 3.25V8.59c.58-.45 1-1.27 1-2.09C10 5.22 8.98 4 8 4H4c-.98 0-2 1.22-2 2.5S3 9 4 9zm9-3h-1v1h1c1 0 2 1.22 2 2.5S13.98 12 13 12H9c-.98 0-2-1.22-2-2.5 0-.83.42-1.64 1-2.09V6.25c-1.09.53-2 1.84-2 3.25C6 11.31 7.55 13 9 13h4c1.45 0 3-1.69 3-3.5S14.5 6 13 6z"},"location":{"width":12,"height":16,"d":"M6 0C2.69 0 0 2.5 0 5.5 0 10.02 6 16 6 16s6-5.98 6-10.5C12 2.5 9.31 0 6 0zm0 14.55C4.14 12.52 1 8.44 1 5.5 1 3.02 3.25 1 6 1c1.34 0 2.61.48 3.56 1.36.92.86 1.44 1.97 1.44 3.14 0 2.94-3.14 7.02-5 9.05zM8 5.5c0 1.11-.89 2-2 2-1.11 0-2-.89-2-2 0-1.11.89-2 2-2 1.11 0 2 .89 2 2z"},"organization":{"width":16,"height":16,"d":"M16 12.999c0 .439-.45 1-1 1H7.995c-.539 0-.994-.447-.995-.999H1c-.54 0-1-.561-1-1 0-2.634 3-4 3-4s.229-.409 0-1c-.841-.621-1.058-.59-1-3 .058-2.419 1.367-3 2.5-3s2.442.58 2.5 3c.058 2.41-.159 2.379-1 3-.229.59 0 1 0 1s1.549.711 2.42 2.088C9.196 9.369 10 8.999 10 8.999s.229-.409 0-1c-.841-.62-1.058-.59-1-3 .058-2.419 1.367-3 2.5-3s2.437.581 2.495 3c.059 2.41-.158 2.38-1 3-.229.59 0 1 0 1s3.005 1.366 3.005 4z"},"person":{"width":12,"height":16,"d":"M12 14.002a.998.998 0 0 1-.998.998H1.001A1 1 0 0 1 0 13.999V13c0-2.633 4-4 4-4s.229-.409 0-1c-.841-.62-.944-1.59-1-4 .173-2.413 1.867-3 3-3s2.827.586 3 3c-.056 2.41-.159 3.38-1 4-.229.59 0 1 0 1s4 1.367 4 4v1.002z"},"repo-forked":{"width":10,"height":16,"d":"M8 1a1.993 1.993 0 0 0-1 3.72V6L5 8 3 6V4.72A1.993 1.993 0 0 0 2 1a1.993 1.993 0 0 0-1 3.72V6.5l3 3v1.78A1.993 1.993 0 0 0 5 15a1.993 1.993 0 0 0 1-3.72V9.5l3-3V4.72A1.993 1.993 0 0 0 8 1zM2 4.2C1.34 4.2.8 3.65.8 3c0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2zm3 10c-.66 0-1.2-.55-1.2-1.2 0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2zm3-10c-.66 0-1.2-.55-1.2-1.2 0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2z"},"repo":{"width":12,"height":16,"d":"M4 9H3V8h1v1zm0-3H3v1h1V6zm0-2H3v1h1V4zm0-2H3v1h1V2zm8-1v12c0 .55-.45 1-1 1H6v2l-1.5-1.5L3 16v-2H1c-.55 0-1-.45-1-1V1c0-.55.45-1 1-1h10c.55 0 1 .45 1 1zm-1 10H1v2h2v-1h3v1h5v-2zm0-10H2v9h9V1z"},"git-branch":{"width":10,"height":16,"d":"M10 5c0-1.11-.89-2-2-2a1.993 1.993 0 0 0-1 3.72v.3c-.02.52-.23.98-.63 1.38-.4.4-.86.61-1.38.63-.83.02-1.48.16-2 .45V4.72a1.993 1.993 0 0 0-1-3.72C.88 1 0 1.89 0 3a2 2 0 0 0 1 1.72v6.56c-.59.35-1 .99-1 1.72 0 1.11.89 2 2 2 1.11 0 2-.89 2-2 0-.53-.2-1-.53-1.36.09-.06.48-.41.59-.47.25-.11.56-.17.94-.17 1.05-.05 1.95-.45 2.75-1.25S8.95 7.77 9 6.73h-.02C9.59 6.37 10 5.73 10 5zM2 1.8c.66 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2C1.35 4.2.8 3.65.8 3c0-.65.55-1.2 1.2-1.2zm0 12.41c-.66 0-1.2-.55-1.2-1.2 0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2zm6-8c-.66 0-1.2-.55-1.2-1.2 0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2z"},"tag":{"width":14,"height":16,"d":"M7.73 1.73C7.26 1.26 6.62 1 5.96 1H3.5C2.13 1 1 2.13 1 3.5v2.47c0 .66.27 1.3.73 1.77l6.06 6.06c.39.39 1.02.39 1.41 0l4.59-4.59a.996.996 0 0 0 0-1.41L7.73 1.73zM2.38 7.09c-.31-.3-.47-.7-.47-1.13V3.5c0-.88.72-1.59 1.59-1.59h2.47c.42 0 .83.16 1.13.47l6.14 6.13-4.73 4.73-6.13-6.15zM3.01 3h2v2H3V3h.01z"},"bookmark":{"width":10,"height":16,"d":"M9 0H1C.27 0 0 .27 0 1v15l5-3.09L10 16V1c0-.73-.27-1-1-1zm-.78 4.25L6.36 5.61l.72 2.16c.06.22-.02.28-.2.17L5 6.6 3.12 7.94c-.19.11-.25.05-.2-.17l.72-2.16-1.86-1.36c-.17-.16-.14-.23.09-.23l2.3-.03.7-2.16h.25l.7 2.16 2.3.03c.23 0 .27.08.09.23h.01z"},"star":{"width":14,"height":16,"d":"M14 6l-4.9-.64L7 1 4.9 5.36 0 6l3.6 3.26L2.67 14 7 11.67 11.33 14l-.93-4.74L14 6z"},"verified":{"width":16,"height":16,"d":"M16.65 7.507l-1.147-1.423a1.595 1.595 0 0 1-.33-.817l-.201-1.805a1.603 1.603 0 0 0-1.412-1.413l-1.806-.201a1.617 1.617 0 0 1-.828-.35L9.503.35a1.597 1.597 0 0 0-1.996 0L6.084 1.497c-.233.18-.51.297-.817.33l-1.805.201A1.603 1.603 0 0 0 2.049 3.44l-.201 1.805c-.032.319-.17.595-.35.829L.35 7.497a1.597 1.597 0 0 0 0 1.996l1.147 1.423c.18.233.297.51.33.817l.201 1.805a1.603 1.603 0 0 0 1.412 1.413l1.805.201c.319.032.595.17.829.35l1.423 1.148a1.597 1.597 0 0 0 1.996 0l1.423-1.147c.233-.18.51-.297.817-.33l1.805-.201a1.603 1.603 0 0 0 1.413-1.412l.201-1.806c.032-.318.17-.594.35-.828l1.148-1.423a1.597 1.597 0 0 0 0-1.996zm-9.737 5.246L3.196 9.036 4.79 7.443l2.124 2.124 5.309-5.309 1.593 1.646-6.902 6.849z"},"key":{"width":14,"height":16,"d":"M12.83 2.17C12.08 1.42 11.14 1.03 10 1c-1.13.03-2.08.42-2.83 1.17S6.04 3.86 6.01 5c0 .3.03.59.09.89L0 12v1l1 1h2l1-1v-1h1v-1h1v-1h2l1.09-1.11c.3.08.59.11.91.11 1.14-.03 2.08-.42 2.83-1.17S13.97 6.14 14 5c-.03-1.14-.42-2.08-1.17-2.83zM11 5.38c-.77 0-1.38-.61-1.38-1.38 0-.77.61-1.38 1.38-1.38.77 0 1.38.61 1.38 1.38 0 .77-.61 1.38-1.38 1.38z"},"check":{"width":12,"height":16,"d":"M12 5l-8 8-4-4 1.5-1.5L4 10l6.5-6.5L12 5z"},"primitive-dot":{"width":8,"height":16,"d":"M0 8c0-2.2 1.8-4 4-4s4 1.8 4 4-1.8 4-4 4-4-1.8-4-4z"},"comment":{"width":16,"height":16,"d":"M14 1H2c-.55 0-1 .45-1 1v8c0 .55.45 1 1 1h2v3.5L7.5 11H14c.55 0 1-.45 1-1V2c0-.55-.45-1-1-1zm0 9H7l-2 2v-2H2V2h12v8z"},"comment-discussion":{"width":16,"height":16,"d":"M15 1H6c-.55 0-1 .45-1 1v2H1c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h1v3l3-3h4c.55 0 1-.45 1-1V9h1l3 3V9h1c.55 0 1-.45 1-1V2c0-.55-.45-1-1-1zM9 11H4.5L3 12.5V11H1V5h4v3c0 .55.45 1 1 1h3v2zm6-3h-2v1.5L11.5 8H6V2h9v6z"},"clock":{"width":14,"height":16,"d":"M8 8h3v2H7c-.55 0-1-.45-1-1V4h2v4zM7 2.3c3.14 0 5.7 2.56 5.7 5.7s-2.56 5.7-5.7 5.7A5.71 5.71 0 0 1 1.3 8c0-3.14 2.56-5.7 5.7-5.7zM7 1C3.14 1 0 4.14 0 8s3.14 7 7 7 7-3.14 7-7-3.14-7-7-7z"},"jersey":{"width":14,"height":16,"d":"M4.5 6l-.5.5v5l.5.5h2l.5-.5v-5L6.5 6h-2zM6 11H5V7h1v4zm6.27-7.25C12.05 2.37 11.96 1.12 12 0H9.02c0 .27-.13.48-.39.69-.25.2-.63.3-1.13.3-.5 0-.88-.09-1.13-.3-.23-.2-.36-.42-.36-.69H3c.05 1.13-.03 2.38-.25 3.75C2.55 5.13 1.95 5.88 1 6v9c.02.27.11.48.31.69.2.21.42.3.69.31h11c.27-.02.48-.11.69-.31.21-.2.3-.42.31-.69V6c-.95-.13-1.53-.88-1.75-2.25h.02zM13 15H2V7c.89-.5 1.48-1.25 1.72-2.25S4.03 2.5 4 1h1c-.02.78.16 1.47.52 2.06.36.58 1.02.89 2 .94.98-.02 1.64-.33 2-.94.36-.59.5-1.28.48-2.06h1c.02 1.42.13 2.55.33 3.38.2.81.69 2 1.67 2.63v8V15zM8.5 6l-.5.5v5l.5.5h2l.5-.5v-5l-.5-.5h-2zm1.5 5H9V7h1v4z"},"request-changes":{"width":16,"height":15,"d":"M0 1a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7.5L4 15.5V12H1a1 1 0 0 1-1-1V1zm1 0v10h4v2l2-2h8V1H1zm7.5 3h2v1h-2v2h-1V5h-2V4h2V2h1v2zm2 5h-5V8h5v1z"},"rocket":{"width":16,"height":16,"d":"M12.17 3.83c-.27-.27-.47-.55-.63-.88-.16-.31-.27-.66-.34-1.02-.58.33-1.16.7-1.73 1.13-.58.44-1.14.94-1.69 1.48-.7.7-1.33 1.81-1.78 2.45H3L0 10h3l2-2c-.34.77-1.02 2.98-1 3l1 1c.02.02 2.23-.64 3-1l-2 2v3l3-3v-3c.64-.45 1.75-1.09 2.45-1.78.55-.55 1.05-1.13 1.47-1.7.44-.58.81-1.16 1.14-1.72-.36-.08-.7-.19-1.03-.34a3.39 3.39 0 0 1-.86-.63zM16 0s-.09.38-.3 1.06c-.2.7-.55 1.58-1.06 2.66-.7-.08-1.27-.33-1.66-.72-.39-.39-.63-.94-.7-1.64C13.36.84 14.23.48 14.92.28 15.62.08 16 0 16 0z"}}

  function getIcon(type, scale = 1) {
    let icon = OCTICONS[type]
    return `<svg class="octicon" width="${icon.width *
      scale}" height="${icon.height * scale}"
      viewBox="0 0 ${icon.width} ${icon.height}"><path d="${icon.d}" /></svg>`
  }

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
                ? '{{#starredByMe}}<button class="ghh-aux" data-action="unstar" data-args="{{owner}}/{{repo}}">{{{icons.star}}} Unstar{{/starredByMe}}{{^starredByMe}}<button class="ghh-primary" data-action="star" data-args="{{owner}}/{{repo}}">{{{icons.star}}} Star{{/starredByMe}}</button>'
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
          <p>
            <input class="ghh-token form-control" type="text" placeholder="Paste access token here..." size="40">
            <button class="btn btn-primary ghh-save">Save</button>
            <button class="btn ghh-cancel">Cancel</button>
          </p>
        </form>
      </div>`
  }

  const CREATE_TOKEN_PATH = `//${GH_DOMAIN}/settings/tokens/new?scopes=repo,user:follow`
  const EDIT_TOKEN_PATH = `//${GH_DOMAIN}/settings/tokens`
  const IS_ENTERPRISE = GH_DOMAIN !== 'github.com'
  const API_PREFIX = IS_ENTERPRISE
    ? `//${GH_DOMAIN}/api/v3`
    : `//api.${GH_DOMAIN}`
  const SITE_PREFIX = `//${GH_DOMAIN}/`

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
    return String.fromCodePoint(parseInt(unicode, 16))
  }

  function replaceEmoji(text) {
    return text.replace(/:([a-z0-9+\-_]+):/gi, (match, key) => {
      let url = EMOJI_MAP[key]
      if (!url) {
        return match
      }
      let [, unicode] = url.match(/unicode\/([0-9a-z]+).png/) || []
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
          star: getIcon('star', 0.75)
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
            icon: getIcon('request-changes', 0.75),
            type: 'alert',
            desc: 'requested changes'
          },
          APPROVED: {
            icon: getIcon('check', 0.75),
            type: 'success',
            desc: 'approved these changes'
          },
          PENDING: {
            icon: getIcon('primitive-dot', 0.75),
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
          verified: `<svg class="octicon" width="16" height="16"
          viewBox="0 0 18 18"><path d="${OCTICONS.verified.d}" /></svg>`
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
  let tokenForm = $(CARD_TPL.form)
  let tokenField = tokenForm.find('.ghh-token')
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
    .on('wheel', '.ghh-readme, .ghh-issue-body, .ghh-commit-body', function(e) {
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

    isExtracting = true

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

    let selectors = Object.keys(STRATEGIES)
    selectors.forEach(selector => {
      let strategy = STRATEGIES[selector]
      let elems = $(selector)
      elems.each(function() {
        if (context && !context.contains(this)) {
          return
        }
        let elem = $(this)
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
      })
    })

    setTimeout(() => {
      isExtracting = false
    }, 0)

    let tipSelector = Object.keys(EXTRACT_TYPE)
      .map(key => EXTRACT_TYPE[key])
      .map(getTypeClass)
      .map(className => `.${className}`)
      .join(',')

    let tipped = $(tipSelector)
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
          elem.tooltipster('content', getCardHTML(type, raw))
        } else {
          if (raw && type === EXTRACT_TYPE.USER) {
            let subject = getHovercardSubject() || {}
            // '@' for contextless
            let subjectSlug = subject ? `${subject.type}:${subject.id}` : '@'
            if (cache.hovercard[value] && cache.hovercard[value][subjectSlug]) {
              Object.assign(raw, {
                hovercard: cache.hovercard[value][subjectSlug]
              })
              elem.tooltipster('content', getCardHTML(type, raw))
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
                                  getCardHTML(type, raw)
                                )
                              }
                            })
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
                                  getCardHTML(type, raw)
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
                                  getCardHTML(type, raw)
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
                            elem.tooltipster('content', getCardHTML(type, raw))
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
                            elem.tooltipster('content', getCardHTML(type, raw))
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
                            elem.tooltipster('content', getCardHTML(type, raw))
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
                            elem.tooltipster('content', getCardHTML(type, raw))
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
                            elem.tooltipster('content', getCardHTML(type, raw))
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
                            elem.tooltipster('content', getCardHTML(type, raw))
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
                        elem.tooltipster('content', getCardHTML(type, raw))
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

                      elem.tooltipster('content', getCardHTML(type, raw))
                    })

                    return
                  }
                }

                elem.tooltipster('content', getCardHTML(type, raw))
              })
              .fail(handleError)
          }
          request()
        }
      },
      interactive: true
    })

    $('body').on('keydown', e => {
      if (e.key.toLowerCase() !== 'h') {
        return
      }

      let tippedTarget
      let target = $(e.target)
      if (target.is(tipSelector)) {
        tippedTarget = target
      } else {
        tippedTarget = target.find(tipSelector).eq(0)
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
          content: `${getIcon('star', 0.75)} Unstar`
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

    // Listen for future mutations but not ones happens
    // in current extraction process
    setTimeout(() => {
      isExtracting = false
    }, 0)
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
})
