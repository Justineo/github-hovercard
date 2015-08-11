var gulp = require('gulp');
var fs = require('fs');
var exec = require('child_process').exec;
var pack = JSON.parse(fs.readFileSync('./package.json', { encoding: 'utf8' }));
var version = pack.version;

gulp.task('copy-assets', function () {
  var replace = require('gulp-replace');
  return gulp.src('./src/*')
    .pipe(gulp.dest('./extensions/firefox/data'))
    .pipe(replace(/spinner.svg/, 'chrome-extension://__MSG_@@extension_id__/spinner.svg'))
    .pipe(gulp.dest('./extensions/chrome'));
});

gulp.task('pack-chrome-extension', ['copy-assets'], function (cb) {
  exec('find . -path \'*/.*\' -prune -o -type f -print | zip ../packed/github-hovercard.zip -@', {
    cwd: 'extensions/chrome'
  }, function (error, stdout, stderr) {
    if (error) {
      return cb(error);
    } else {
      var manifestPath = './extensions/chrome/manifest.json';
      var manifest = JSON.parse(fs.readFileSync(manifestPath, { encoding: 'utf8' }));
      manifest.version = version;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, '  '));
      cb();
    }
  });
});

gulp.task('pack-firefox-addon', ['copy-assets'], function (cb) {
  exec('jpm xpi', {
    cwd: 'extensions/firefox'
  }, function (error, stdout, stderr) {
    if (error) {
      return cb(error);
    } else {
      var fxPackPath = './extensions/firefox/package.json';
      var fxPack = JSON.parse(fs.readFileSync(fxPackPath, { encoding: 'utf8' }));
      fxPack.version = version;
      fs.writeFileSync(fxPackPath, JSON.stringify(fxPack, null, '  '));
      fs.renameSync('./extensions/firefox/@' + pack.name + '-' + version + '.xpi', './extensions/packed/' + pack.name + '.xpi');
      cb();
    }
  });
});

gulp.task('extensions', ['pack-chrome-extension', 'pack-firefox-addon']);
gulp.task('default', ['extensions']);
