(function () {
  function normalize(path) {
    return path.replace(/\/index\.html$/, '/').replace(/\/$/, '');
  }
  var current = normalize(window.location.pathname);
  document.querySelectorAll('.site-header nav a[href]').forEach(function (link) {
    var target = new URL(link.href, window.location.href);
    var path = normalize(target.pathname);
    var section = /\/(vietnam-stories|notice|faq)$/.test(path);
    var exact = current === path;
    if (target.origin === window.location.origin && (exact || (section && current.startsWith(path + '/')))) {
      link.classList.add('is-current');
      link.setAttribute('aria-current', exact ? 'page' : 'location');
    }
  });
}());
