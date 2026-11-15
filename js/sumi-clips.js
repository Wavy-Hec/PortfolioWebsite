// Project footage: the drone reel (four clips that play in turn) and the rows' "watch" clips.
(() => {
  'use strict';

  const S = window.SUMI;
  const saveData = navigator.connection && navigator.connection.saveData;
  const autoplay = !S.REDUCED && !saveData;
  // a link to a later section smooth-scrolls past the reel: it must stay on screen this long to start
  const DWELL_MS = 300;

  function setUpReel(reel) {
    const video = reel.querySelector('video');
    const hold = reel.querySelector('.hold');
    const steps = [...reel.querySelectorAll('.step')];
    let current = 0;
    let held = !autoplay;
    let onScreen = false;
    let dwellTimer = 0;

    function trackProgress() {
      const played = video.duration ? video.currentTime / video.duration : 0;
      steps[current].style.setProperty('--played', played.toFixed(3));
    }

    function sync() {
      hold.textContent = held ? 'Play' : 'Pause';
      if (onScreen && !held) {
        if (!video.src) load(current);
        // pause and a new clip reject a pending play() too; only refused autoplay holds the reel
        video.play().catch(error => {
          if (error.name !== 'NotAllowedError') return;
          held = true;
          sync();
        });
        S.add(trackProgress);
      } else {
        video.pause();
        S.remove(trackProgress);
      }
    }

    function load(index) {
      const step = steps[index];
      video.poster = `media/${step.dataset.clip}.jpg`;
      video.src = `media/${step.dataset.clip}.mp4`;
      video.width = step.dataset.w;
      video.height = step.dataset.h;
      video.setAttribute('aria-label', step.dataset.label);
    }

    function show(index) {
      steps[current].style.removeProperty('--played');
      steps[current].setAttribute('aria-pressed', 'false');
      current = index;
      steps[current].setAttribute('aria-pressed', 'true');
      load(current);
      sync();
    }

    steps.forEach((step, index) => {
      step.disabled = false;
      step.addEventListener('click', () => show(index));
    });
    video.addEventListener('ended', () => show((current + 1) % steps.length));
    hold.addEventListener('click', () => {
      held = !held;
      sync();
    });

    new IntersectionObserver(
      entries => {
        clearTimeout(dwellTimer);
        if (entries[entries.length - 1].isIntersecting) {
          dwellTimer = setTimeout(() => {
            onScreen = true;
            sync();
          }, DWELL_MS);
        } else {
          onScreen = false;
          sync();
        }
      },
      { threshold: 0.35 },
    ).observe(reel.querySelector('.screen'));

    video.poster = `media/${steps[0].dataset.clip}.jpg`;
    hold.textContent = held ? 'Play' : 'Pause';
    reel.classList.add('live');
  }

  // a clip opened on request plays even under reduced motion: the reader asked for it
  function setUpWatch(button) {
    const clip = document.getElementById(button.getAttribute('aria-controls'));
    const video = clip.querySelector('video');

    function play() {
      if (!video.src) {
        video.poster = video.dataset.poster;
        video.src = video.dataset.src;
      }
      video.play().catch(() => {});
    }

    button.hidden = false;
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      clip.hidden = !open;
      if (open) play();
      else video.pause();
    });

    new IntersectionObserver(entries => {
      if (!entries[entries.length - 1].isIntersecting) video.pause();
      else if (!clip.hidden) play();
    }).observe(clip);
  }

  const reel = document.querySelector('.reel');
  if (reel) setUpReel(reel);
  document.querySelectorAll('.watch').forEach(setUpWatch);
})();
