// Project footage: the drone reel (four clips that play in turn) and the rows' "watch" clips.
(() => {
  'use strict';

  const S = window.SUMI;
  const saveData = navigator.connection && navigator.connection.saveData;
  const autoplay = !S.REDUCED && !saveData;

  function setUpReel(reel) {
    const video = reel.querySelector('video');
    const hold = reel.querySelector('.hold');
    const steps = [...reel.querySelectorAll('.step')];
    let current = 0;
    let held = !autoplay;
    let onScreen = false;

    // under reduced motion the line over the current step stays whole instead of filling
    function trackProgress() {
      const played = video.duration ? video.currentTime / video.duration : 0;
      steps[current].style.setProperty('--played', played.toFixed(3));
    }

    function sync() {
      const shouldPlay = onScreen && !held;
      hold.textContent = held ? 'Play' : 'Pause';
      if (shouldPlay) {
        if (!video.src) load(current);
        video.play().catch(() => {});
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

    steps.forEach((step, index) => step.addEventListener('click', () => show(index)));
    video.addEventListener('ended', () => show((current + 1) % steps.length));
    hold.addEventListener('click', () => {
      held = !held;
      sync();
    });

    new IntersectionObserver(
      entries => {
        onScreen = entries[entries.length - 1].isIntersecting;
        sync();
      },
      { threshold: 0.35 },
    ).observe(reel.querySelector('.screen'));

    reel.classList.add('live');
    hold.textContent = held ? 'Play' : 'Pause';
  }

  function setUpWatch(button) {
    const clip = document.getElementById(button.getAttribute('aria-controls'));
    const video = clip.querySelector('video');
    if (!autoplay) video.controls = true;

    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      clip.hidden = !open;
      if (open && autoplay) video.play().catch(() => {});
      if (!open) video.pause();
    });

    new IntersectionObserver(entries => {
      if (!entries[entries.length - 1].isIntersecting) video.pause();
      else if (!clip.hidden && autoplay) video.play().catch(() => {});
    }).observe(clip);
  }

  const reel = document.querySelector('.reel');
  if (reel) setUpReel(reel);
  document.querySelectorAll('.watch').forEach(setUpWatch);
})();
