// Timeline Scroll, Cinematic Loader and Interactions script for Messi Statue Showcase

(function () {
  'use strict';

  // ---- World Cup Era Configurations ----
  const ERA_ORDER = ['2026', '2022', '2018', '2014', '2010', '2006'];
  const ERA_CONFIGS = {
    '2006': { tournament: 'Germany' },
    '2010': { tournament: 'South Africa' },
    '2014': { tournament: 'Brazil' },
    '2018': { tournament: 'Russia' },
    '2022': { tournament: 'Qatar' },
    '2026': { tournament: 'North America' }
  };

  let currentEra = null;
  let currentModelKey = null;

  // ---- Apply jersey configuration for an era ----
  function applyEraConfig(year) {
    // Retained for tracking current active year in the viewer context
  }

  // ---- Update viewer badge ----
  function updateBadge(year) {
    const config = ERA_CONFIGS[year];
    if (!config) return;
    const badgeYear = document.getElementById('badge-year');
    const badgeTourney = document.getElementById('badge-tournament');
    if (badgeYear) badgeYear.textContent = year;
    if (badgeTourney) badgeTourney.textContent = config.tournament;
  }

  // ---- Update timeline progress ----
  function updateTimelineProgress(year) {
    const years = ERA_ORDER;
    const index = years.indexOf(year);
    const progress = (index / (years.length - 1)) * 100;
    const fill = document.getElementById('timeline-progress-fill');
    if (fill) fill.style.width = `${progress}%`;

    // Update dots
    document.querySelectorAll('.progress-dots .dot').forEach(dot => {
      dot.classList.toggle('active', dot.dataset.year === year);
      const dotYear = years.indexOf(dot.dataset.year);
      dot.classList.toggle('passed', dotYear <= index);
    });
  }

  // ---- Intersection Observer for scroll-driven changes ----
  function initScrollObserver() {
    const sections = document.querySelectorAll('.era-section');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.4) {
          const year = entry.target.dataset.year;
          if (year !== currentEra) {
            currentEra = year;

            // Update active section styling
            sections.forEach(s => s.classList.remove('active'));
            entry.target.classList.add('active');

            // Apply jersey configuration
            applyEraConfig(year);
            updateBadge(year);
            updateTimelineProgress(year);

            // Track era viewing event in Google Analytics
            if (typeof gtag === 'function') {
              gtag('event', 'view_era', {
                'event_category': 'Timeline Scroll',
                'event_label': year
              });
            }
          }
        }
      });
    }, {
      threshold: [0.4],
      rootMargin: '-10% 0px -10% 0px'
    });

    sections.forEach(section => observer.observe(section));
  }

  // ---- Timeline dot click navigation ----
  function initDotNavigation() {
    document.querySelectorAll('.progress-dots .dot').forEach(dot => {
      dot.addEventListener('click', () => {
        const year = dot.dataset.year;
        const target = document.getElementById(`era-${year}`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        // Track dot click event in Google Analytics
        if (typeof gtag === 'function') {
          gtag('event', 'select_era_dot', {
            'event_category': 'Timeline Navigation',
            'event_label': year
          });
        }
      });
    });
  }

  // ---- Hero scroll indicator ----
  function initScrollIndicator() {
    const indicator = document.getElementById('scroll-indicator');
    if (indicator) {
      indicator.addEventListener('click', () => {
        const timeline = document.getElementById('timeline');
        if (timeline) timeline.scrollIntoView({ behavior: 'smooth' });
        // Track main journey start event
        if (typeof gtag === 'function') {
          gtag('event', 'click_begin_journey', {
            'event_category': 'Engagement',
            'event_label': 'Hero Scroll Indicator'
          });
        }
      });
    }
  }

  // ---- Parallax on hero ----
  function initHeroParallax() {
    const hero = document.getElementById('hero');
    window.addEventListener('scroll', () => {
      const scrolled = window.scrollY;
      const heroHeight = hero?.offsetHeight || 800;

      // Toggle timeline-active class on body to fade-in timeline UI when timeline container enters viewport
      const timeline = document.getElementById('timeline');
      if (timeline) {
        const rect = timeline.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.65) {
          document.body.classList.add('timeline-active');
        } else {
          document.body.classList.remove('timeline-active');
        }
      }

      // Parallax for hero text
      if (scrolled < heroHeight) {
        const opacity = 1 - (scrolled / heroHeight);
        const translateY = scrolled * 0.3;
        const heroContent = hero?.querySelector('.hero-content');
        if (heroContent) {
          heroContent.style.opacity = Math.max(0, opacity);
          heroContent.style.transform = `translateY(${translateY}px)`;
        }
      }

      // Toggle creator-image-overlay class when the creator-section enters
      const creatorSec = document.querySelector('.creator-section');
      const creatorOverlay = document.getElementById('creator-image-overlay');
      if (creatorSec && creatorOverlay) {
        const rect = creatorSec.getBoundingClientRect();
        // Show overlay if the creator section enters the viewport
        if (rect.top < window.innerHeight * 0.7) {
          creatorOverlay.classList.add('active');
        } else {
          creatorOverlay.classList.remove('active');
        }

        // On mobile, hide the sticky 3D model container when scrolling below the creator section
        if (window.innerWidth <= 1024) {
          if (rect.bottom < window.innerHeight * 0.5) {
            document.body.classList.add('hide-viewer-mobile');
          } else {
            document.body.classList.remove('hide-viewer-mobile');
          }
        } else {
          document.body.classList.remove('hide-viewer-mobile');
        }
      }

      // Keep 3D viewer centered in its right-side column
      if (window.jerseyViewer) {
        window.jerseyViewer.updateScroll(0);
      }
    }, { passive: true });
  }

  // ---- Initialize everything after DOM ready and viewer loaded ----
  function init() {
    initScrollObserver();
    initDotNavigation();
    initScrollIndicator();
    initHeroParallax();

    // Apply initial era config once the viewer is ready
    const waitForViewer = setInterval(() => {
      if (window.jerseyViewer) {
        clearInterval(waitForViewer);

        // Small delay to let model finish loading
        setTimeout(() => {
          // Ensure container dimensions are correctly calculated
          window.dispatchEvent(new Event('resize'));

          currentEra = '2026';
          currentModelKey = 'v_neck_reglan'; // default from threeD-script
          applyEraConfig('2026');
          updateBadge('2026');
          updateTimelineProgress('2026');

          // Update initial 3D viewer horizontal scroll offset
          if (window.jerseyViewer) {
            const scrolled = window.scrollY;
            const heroHeight = document.getElementById('hero')?.offsetHeight || 800;
            window.jerseyViewer.updateScroll(Math.min(scrolled / heroHeight, 1.0));
          }
        }, 500);
      }
    }, 100);

    // Coordinated 4s / load transition
    let modelLoaded = false;
    let timerFinished = false;
    let transitionTriggered = false;

    setTimeout(() => {
      timerFinished = true;
      checkAndTriggerTransition();
    }, 4000);

    const checkModelLoadInterval = setInterval(() => {
      if (window.jerseyViewer && window.jerseyViewer.loadingState && window.jerseyViewer.loadingState.modelLoaded) {
        clearInterval(checkModelLoadInterval);
        modelLoaded = true;
        checkAndTriggerTransition();
      }
    }, 100);

    function checkAndTriggerTransition() {
      if (modelLoaded && timerFinished && !transitionTriggered) {
        transitionTriggered = true;
        triggerCinematicTransition();
      }
    }

    function triggerCinematicTransition() {
      // Force Three.js canvas to resize and fit the mobile/desktop container correctly
      window.dispatchEvent(new Event('resize'));

      // 1. Fade out the 2D image overlay
      const overlay = document.getElementById('transition-image-overlay');
      if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.transform = 'scale(1.05) translateZ(0)';
        overlay.style.filter = 'blur(10px)';
        setTimeout(() => {
          overlay.style.display = 'none';
        }, 1500);
      }

      // 2. Hide the canvas loading overlay
      if (window.hideCanvasLoader) {
        window.hideCanvasLoader();
      } else {
        const loader = document.getElementById('canvas-loading-overlay');
        if (loader) {
          loader.style.opacity = '0';
          setTimeout(() => { loader.style.visibility = 'hidden'; }, 500);
        }
      }

      // 3. Play 3D showcase animation after fading 2D out (1.5s) + showing 3D static for 1s (1.0s) = 2.5s total delay
      setTimeout(() => {
        if (window.jerseyViewer && window.jerseyViewer.playShowcaseAnimation) {
          window.jerseyViewer.playShowcaseAnimation();
        }
      }, 2500);
    }

    // Stats Counter Animation
    const statsNumbers = document.querySelectorAll('.stat-number');
    statsNumbers.forEach(num => {
      const target = +num.getAttribute('data-target');
      const duration = 1500; // 1.5 seconds

      // Delay starting counter to 2.0s to allow full transition and static viewing first
      setTimeout(() => {
        const startTime = performance.now();

        const animateCounter = (currentTime) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1.0);

          // Ease out quad
          const ease = progress * (2 - progress);
          const currentVal = Math.floor(ease * target);

          num.textContent = currentVal;

          if (progress < 1.0) {
            requestAnimationFrame(animateCounter);
          } else {
            num.textContent = target; // Ensure exact final value
          }
        };

        requestAnimationFrame(animateCounter);
      }, 2000);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// Loader helper overrides
window.hideCanvasLoader = function () {
  const loader = document.getElementById('canvas-loading-overlay');
  if (loader) {
    loader.style.opacity = '0';
    setTimeout(() => { loader.style.visibility = 'hidden'; }, 500);
  }
};
window.showCanvasLoader = function () {
  const loader = document.getElementById('canvas-loading-overlay');
  if (loader) {
    loader.style.opacity = '1';
    loader.style.visibility = 'visible';
  }
};

// ========== HERO REEL INTERACTION SCRIPT ==========
document.addEventListener('DOMContentLoaded', () => {
  // 1. Dynamic cloning to prevent empty spaces on large viewports
  const tracks = document.querySelectorAll('.hero-reel-track');
  tracks.forEach(track => {
    const originalCards = Array.from(track.children);
    if (originalCards.length === 0) return;

    const cardWidth = 254; // card width (230px) + gap (24px)
    const screenWidth = window.innerWidth;
    const targetWidth = screenWidth * 2.5; // Ensure track is at least 2.5x viewport width

    // Calculate the width of the initial cards in the HTML track
    const setWidth = originalCards.length * cardWidth;
    let setsCount = 1;
    while (setsCount * setWidth < targetWidth) {
      setsCount++;
    }

    // Ensure setsCount is even so translating by -50% shifts by integer sets
    if (setsCount % 2 !== 0) {
      setsCount++;
    }

    // We already have 1 set in HTML, so we append (setsCount - 1) sets
    for (let i = 1; i < setsCount; i++) {
      originalCards.forEach(card => {
        const clone = card.cloneNode(true);
        track.appendChild(clone);
      });
    }
  });

  // 2. Select all cards (including dynamic clones) for interaction binding
  const cards = document.querySelectorAll('.hero-reel-card');
  const likedStates = {};

  cards.forEach(card => {
    const id = card.dataset.cardId;
    likedStates[id] = false;
  });

  function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function updateCardLikes(id, isLiked) {
    likedStates[id] = isLiked;

    // Synchronize all duplicates in the 3 rows
    const peerCards = document.querySelectorAll(`.hero-reel-card[data-card-id="${id}"]`);
    peerCards.forEach(peer => {
      peer.classList.toggle('liked', isLiked);
      const likeBtn = peer.querySelector('.like-btn');
      const likesCountEl = peer.querySelector('.likes-count');
      if (likeBtn) {
        const icon = likeBtn.querySelector('.heart-icon');
        const originalLikes = parseInt(peer.dataset.likes || 0);

        if (isLiked) {
          icon.setAttribute('fill', '#FF3B30');
          icon.setAttribute('stroke', '#FF3B30');
          if (likesCountEl) likesCountEl.textContent = formatNumber(originalLikes + 1);
        } else {
          icon.setAttribute('fill', 'none');
          icon.setAttribute('stroke', 'currentColor');
          if (likesCountEl) likesCountEl.textContent = formatNumber(originalLikes);
        }
      }
    });
  }

  cards.forEach(card => {
    const cardId = card.dataset.cardId;
    const likeBtn = card.querySelector('.like-btn');
    const imgContainer = card.querySelector('.hero-reel-img-container');

    if (likeBtn) {
      likeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const nextState = !likedStates[cardId];
        updateCardLikes(cardId, nextState);

        if (nextState) {
          likeBtn.classList.add('pulse');
          setTimeout(() => likeBtn.classList.remove('pulse'), 300);
        }

        // Track reel like action in Google Analytics
        if (typeof gtag === 'function') {
          gtag('event', 'like_reel', {
            'event_category': 'Reels Engagement',
            'event_label': `Card ${cardId}`,
            'value': nextState ? 1 : 0
          });
        }
      });
    }

    if (imgContainer) {
      imgContainer.addEventListener('dblclick', () => {
        const nextState = true;
        updateCardLikes(cardId, nextState);

        // Pop the double-tap heart on this specific clicked card
        const heartPop = imgContainer.querySelector('.double-tap-heart');
        if (heartPop) {
          heartPop.classList.add('active');
          setTimeout(() => {
            heartPop.classList.remove('active');
          }, 800);
        }

        // Track double tap like action in Google Analytics
        if (typeof gtag === 'function') {
          gtag('event', 'double_tap_reel', {
            'event_category': 'Reels Engagement',
            'event_label': `Card ${cardId}`
          });
        }
      });
    }
  });

  // Lazy load deferred images with data-src only after page finishes loading
  window.addEventListener('load', () => {
    // Run with a slight delay so critical resources load first
    setTimeout(() => {
      const deferredImages = document.querySelectorAll('img[data-src]');

      if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const img = entry.target;
              img.src = img.dataset.src;
              img.removeAttribute('data-src');
              imageObserver.unobserve(img);
            }
          });
        }, { rootMargin: '200px 0px' });

        deferredImages.forEach(img => imageObserver.observe(img));
      } else {
        // Fallback for older browsers
        deferredImages.forEach(img => {
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
        });
      }
    }, 300);
  });

  // ========== DYNAMIC POLL & FAN CARD GENERATOR LOGIC ==========
  document.addEventListener('DOMContentLoaded', () => {
    // 1. World Cup Memory Poll Logic
    const pollContainer = document.getElementById('poll-options-container');
    const pollButtons = document.querySelectorAll('.poll-btn');

    // Default stats if none exist in localStorage
    const defaultPollStats = { '2022': 185, '2014': 76, '2018': 24, '2006': 42 };
    
    function getPollStats() {
      const saved = localStorage.getItem('messi_poll_stats');
      return saved ? JSON.parse(saved) : defaultPollStats;
    }

    function renderPollResults(stats, userVote = null) {
      const total = Object.values(stats).reduce((a, b) => a + b, 0);
      
      pollButtons.forEach(btn => {
        const era = btn.dataset.era;
        const votes = stats[era];
        const percentage = total > 0 ? Math.round((votes / total) * 100) : 0;
        
        const bar = btn.querySelector('.poll-bar');
        const percentText = btn.querySelector('.poll-percentage');
        
        if (bar) bar.style.width = `${percentage}%`;
        if (percentText) percentText.textContent = `${percentage}%`;
        
        // Highlight user's vote
        if (userVote === era) {
          btn.style.borderColor = 'var(--accent-gold)';
          btn.style.background = 'rgba(212, 175, 55, 0.05)';
        }
      });
      
      pollContainer.classList.add('voted');
    }

    // Initialize Poll State
    const hasVoted = localStorage.getItem('messi_poll_user_vote');
    const currentStats = getPollStats();

    if (hasVoted) {
      renderPollResults(currentStats, hasVoted);
    } else {
      pollButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const selectedEra = btn.dataset.era;
          localStorage.setItem('messi_poll_user_vote', selectedEra);
          
          // Increment stats
          const stats = getPollStats();
          stats[selectedEra] = (stats[selectedEra] || 0) + 1;
          localStorage.setItem('messi_poll_stats', JSON.stringify(stats));
          
          // Animate and render
          renderPollResults(stats, selectedEra);
          
          if (typeof gtag === 'function') {
            gtag('event', 'cast_poll_vote', {
              'event_category': 'Engagement',
              'event_label': selectedEra
            });
          }
        });
      });
    }

    // 2. Interactive Fan Card Canvas Generator
    const btnGenerate = document.getElementById('btn-generate-card');
    const inputName = document.getElementById('fan-name-input');
    const selectEra = document.getElementById('fan-era-select');
    const canvas = document.getElementById('fan-card-canvas');
    const actionsBox = document.getElementById('canvas-actions-container');
    const btnDownload = document.getElementById('btn-download-card');
    
    // Social share buttons
    const shareTwitter = document.getElementById('share-twitter');
    const shareWhatsapp = document.getElementById('share-whatsapp');

    if (btnGenerate && canvas) {
      const ctx = canvas.getContext('2d');

      btnGenerate.addEventListener('click', () => {
        const name = inputName.value.trim() || 'ALBICLESTE FAN';
        const era = selectEra.value;
        const eraLabels = {
          '2022': { title: 'QATAR 2022', desc: 'THE CORONATION · CHAMPION', color: '#75AADB' },
          '2014': { title: 'BRAZIL 2014', desc: 'THE RUNNER-UP · FINALIST', color: '#6CACE4' },
          '2018': { title: 'RUSSIA 2018', desc: 'THE DARKEST CHAPTER · R16', color: '#85BBE6' },
          '2006': { title: 'GERMANY 2006', desc: 'THE DEBUT · QUARTER-FINAL', color: '#75AADB' }
        };
        const config = eraLabels[era];

        // Draw Fan Card template
        canvas.style.display = 'block';
        actionsBox.style.display = 'flex';
        
        // Background
        ctx.fillStyle = '#0F2038'; // Deep blue primary
        ctx.fillRect(0, 0, 400, 560);

        // Golden Frame Borders
        ctx.strokeStyle = '#D4AF37';
        ctx.lineWidth = 6;
        ctx.strokeRect(15, 15, 370, 530);

        ctx.strokeStyle = '#D4AF37';
        ctx.lineWidth = 1;
        ctx.strokeRect(22, 22, 356, 516);

        // Top Header Star Icons
        ctx.font = '22px sans-serif';
        ctx.fillStyle = '#D4AF37';
        ctx.textAlign = 'center';
        ctx.fillText('★ ★ ★', 200, 55);

        // Center card photo slot with RedSands gradient mesh layout
        const grad = ctx.createLinearGradient(0, 80, 0, 340);
        grad.addColorStop(0, '#1E3557');
        grad.addColorStop(1, '#081223');
        ctx.fillStyle = grad;
        ctx.fillRect(40, 80, 320, 260);
        ctx.strokeRect(40, 80, 320, 260);

        // Draw stylized sun details (Sol de Mayo) behind text
        ctx.fillStyle = 'rgba(212, 175, 55, 0.08)';
        ctx.beginPath();
        ctx.arc(200, 210, 70, 0, Math.PI * 2);
        ctx.fill();

        // Print 'MESSI' watermarked silhouette indicator text
        ctx.font = '700 80px Outfit, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.textAlign = 'center';
        ctx.fillText('GOAT', 200, 230);

        // Draw card details
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '600 24px Outfit, sans-serif';
        ctx.fillText(name.toUpperCase(), 200, 385);

        // Gold divider
        ctx.fillStyle = '#D4AF37';
        ctx.fillRect(120, 405, 160, 2);

        // Era title details
        ctx.fillStyle = '#75AADB'; // Albiceleste Blue
        ctx.font = '700 16px Outfit, sans-serif';
        ctx.fillText(config.title, 200, 435);

        ctx.fillStyle = '#EBF2F7';
        ctx.font = '500 11px Outfit, sans-serif';
        ctx.fillText(config.desc, 200, 460);

        // Footer Brand watermark details
        ctx.font = '8px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillText('MESSI WORLD CUP FEATURETTE · 2006-2026', 200, 510);

        // 3. Set up action links
        // Download handler
        btnDownload.onclick = () => {
          const image = canvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.download = `${name.toLowerCase().replace(/\s+/g, '_')}_fan_card.png`;
          link.href = image;
          link.click();
        };

        // Twitter share builder
        const shareUrl = window.location.href;
        const twitterText = encodeURIComponent(`Check out my official personalized fan card for Messi's legendary World Cup journey! Generated my Albiceleste ID for the ${config.title} era here:`);
        shareTwitter.href = `https://twitter.com/intent/tweet?text=${twitterText}&url=${encodeURIComponent(shareUrl)}&hashtags=Messi,Albiceleste`;

        // WhatsApp share builder
        const whatsappText = encodeURIComponent(`Check out my Albiceleste Fan ID for the Messi World Cup journey! Generate yours here: ${shareUrl}`);
        shareWhatsapp.href = `https://api.whatsapp.com/send?text=${whatsappText}`;

        if (typeof gtag === 'function') {
          gtag('event', 'generate_fan_card', {
            'event_category': 'Personalization',
            'event_label': era,
            'value': name.length
          });
        }
      });
    }
  });
});
