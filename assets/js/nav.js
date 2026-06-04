(function () {
  'use strict';

  const hamburger = document.querySelector('.nav-hamburger');
  const overlay   = document.querySelector('.nav-overlay');
  const closeBtn  = document.querySelector('.nav-overlay-close');

  if (hamburger && overlay) {
    hamburger.addEventListener('click', function () {
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    });
  }
  if (closeBtn && overlay) {
    closeBtn.addEventListener('click', function () {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    });
  }
  document.querySelectorAll('.nav-overlay-link').forEach(function (link) {
    link.addEventListener('click', function () {
      if (overlay) { overlay.classList.remove('open'); document.body.style.overflow = ''; }
    });
  });

  // Active nav item — matches body[data-section] to link[data-section]
  var section = document.body.dataset.section;
  if (section) {
    document.querySelectorAll('.nav-link[data-section="' + section + '"], .nav-overlay-link[data-section="' + section + '"]').forEach(function (el) {
      el.classList.add('active');
    });
  }

  // Value chain stage click
  document.querySelectorAll('.chain-stage').forEach(function (stage) {
    stage.addEventListener('click', function () {
      document.querySelectorAll('.chain-stage').forEach(function (s) { s.classList.remove('active'); });
      stage.classList.add('active');
    });
  });

})();
