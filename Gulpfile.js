var gulp = require('gulp');
var fs = require('fs');
var merge = require('merge-stream');
var exec = require('child_process').exec;
var pack = JSON.parse(fs.readFileSync('./package.json', { encoding: 'utf8' }));
var version = pack.version;

gulp.task('cp', function () {
  var replace = require('gulp-replace');
  var srcChrome = gulp.src('./src/*')
    .pipe(replace('__EMOJI_URL__', 'chrome.extension.getURL(\'emoji.json\')'))
    .pipe(replace(/spinner.svg/, 'chrome-extension://__MSG_@@extension_id__/spinner.svg'))
    .pipe(gulp.dest('./extensions/chrome'));
  var srcFirefox = gulp.src('./src/*')
    .pipe(replace('__EMOJI_URL__', 'self.options.emojiURL'))
    .pipe(gulp.dest('./extensions/firefox/data'));
  var assets = gulp.src('./assets/*')
    .pipe(gulp.dest('./extensions/firefox/data'))
    .pipe(gulp.dest('./extensions/chrome'));
  var icon = gulp.src('./icon.png')
    .pipe(gulp.dest('./extensions/firefox'))
    .pipe(gulp.dest('./extensions/chrome'));
  return merge(srcChrome, srcFirefox, assets, icon);
});

gulp.task('pack-chrome-extension', ['cp'], function (cb) {
  var manifestPath = './extensions/chrome/manifest.json';
  var manifest = JSON.parse(fs.readFileSync(manifestPath, { encoding: 'utf8' }));
  manifest.version = version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, '  '));
  exec('find . -path \'*/.*\' -prune -o -type f -print | zip ../packed/github-hovercard.zip -@', {
    cwd: 'extensions/chrome'
  }, function (error, stdout, stderr) {
    if (error) {
      return cb(error);
    } else {
      cb();
    }
  });
});

gulp.task('pack-firefox-addon', ['cp'], function (cb) {
  var fxPackPath = './extensions/firefox/package.json';
  var fxPack = JSON.parse(fs.readFileSync(fxPackPath, { encoding: 'utf8' }));
  fxPack.version = version;
  fs.writeFileSync(fxPackPath, JSON.stringify(fxPack, null, '  '));
  exec('jpm xpi', {
    cwd: 'extensions/firefox'
  }, function (error, stdout, stderr) {
    if (error) {
      return cb(error);
    } else {
      fs.renameSync('./extensions/firefox/@' + pack.name + '-' + version + '.xpi', './extensions/packed/' + pack.name + '.xpi');
      cb();
    }
  });
});

gulp.task('extensions', ['pack-chrome-extension', 'pack-firefox-addon']);
gulp.task('default', ['extensions']);
