document.addEventListener('DOMContentLoaded', () => {
    // --- Setup Screen Logic ---
    const setupScreen = document.getElementById('setup-screen');
    const showcaseScreen = document.getElementById('showcase-screen');
    const startBtn = document.getElementById('start-btn');
    const titleInput = document.getElementById('presentation-title-input');
    const titleDisplay = document.getElementById('presentation-title-display');
    const titleText = document.getElementById('presentation-title-text');
    const container = document.getElementById('video-inputs-container');
    const dropZone = document.getElementById('drop-zone');
    const globalFileInput = document.getElementById('global-file-input');
    const videoCountText = document.getElementById('video-count-text');
    
    let videoEntries = []; // Array of { id, file, url, played }
    let nextId = 0;
    const MAX_VIDEOS = 10;

    function updateUI() {
        videoCountText.textContent = `Added ${videoEntries.length}/${MAX_VIDEOS} videos`;
        
        // Disable file input if max is reached
        globalFileInput.disabled = videoEntries.length >= MAX_VIDEOS;
        if (videoEntries.length >= MAX_VIDEOS) {
            dropZone.style.opacity = '0.5';
            dropZone.style.cursor = 'not-allowed';
        } else {
            dropZone.style.opacity = '1';
            dropZone.style.cursor = 'pointer';
        }
        
        // Start is enabled if there is at least 1 video
        startBtn.disabled = videoEntries.length === 0;
    }
    
    function addFiles(files) {
        for (let file of files) {
            if (videoEntries.length >= MAX_VIDEOS) {
                alert(`Maximum of ${MAX_VIDEOS} videos reached.`);
                break;
            }
            if (!file.type.startsWith('video/')) continue;
            createVideoInputRow(file);
        }
    }

    // Drop Zone Event Listeners
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (videoEntries.length < MAX_VIDEOS) {
            dropZone.classList.add('drag-over');
        }
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files) {
            addFiles(e.dataTransfer.files);
        }
    });

    globalFileInput.addEventListener('change', (e) => {
        if (e.target.files) {
            addFiles(e.target.files);
            // DO NOT clear globalFileInput.value = ''; here! 
            // Clearing it destroys the underlying File Blob references in some browsers, breaking video playback.
        }
    });

    function createVideoInputRow(file) {
        const id = nextId++;
        const url = URL.createObjectURL(file);

        videoEntries.push({ id, file, url, played: false });
        
        const row = document.createElement('div');
        row.className = 'video-input-row';
        row.dataset.id = id;
        
        const filenameBadge = document.createElement('div');
        filenameBadge.className = 'filename-badge';
        filenameBadge.textContent = file.name;
        filenameBadge.title = file.name;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = 'X';

        removeBtn.addEventListener('click', () => {
            videoEntries = videoEntries.filter(v => v.id !== id);
            row.remove();
            updateUI();
        });

        row.appendChild(filenameBadge);
        row.appendChild(removeBtn);
        container.appendChild(row);
        
        updateUI();
    }
    
    // Title input enter logic
    titleInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // Prevent default new line behavior
            if (!startBtn.disabled) {
                startBtn.click();
            }
        }
    });
    
    // Start presentation
    startBtn.addEventListener('click', () => {
        setupScreen.classList.add('hidden');
        showcaseScreen.classList.remove('hidden');
        
        const title = titleInput.value.trim();
        if (title) {
            titleText.textContent = title;
            titleDisplay.classList.remove('hidden');
        }
        
        initCarousel();
    });


    // --- Showcase / Carousel Logic ---
    const scene = document.getElementById('scene');
    const playerOverlay = document.getElementById('player-overlay');
    const playerVideo = document.getElementById('player-video');

    // Click the playing video to pause/resume it.
    playerVideo.addEventListener('click', () => {
        if (playerVideo.paused) {
            playerVideo.play().catch(e => console.error('Playback failed:', e));
        } else {
            playerVideo.pause();
        }
    });

    let currentRotation = 0;
    let isSpinning = false;
    let spinRequestId = null;
    let videoElements = [];
    let radius = 600; // Radius of the 3D circle

    // Timeout IDs to clear on exit
    let selectTimeoutId = null;
    let zoomTimeoutId = null;
    let resumeTimeoutId = null;
    let nextSelectTimeoutId = null;

    // Exit Showcase Logic via ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !showcaseScreen.classList.contains('hidden')) {
            // Hide showcase, show setup
            showcaseScreen.classList.add('hidden');
            setupScreen.classList.remove('hidden');
            
            // Stop spinning and clear requestAnimationFrame
            isSpinning = false;
            if (spinRequestId) {
                cancelAnimationFrame(spinRequestId);
                spinRequestId = null;
            }
            
            // Clear all active timeouts
            clearTimeout(selectTimeoutId);
            clearTimeout(zoomTimeoutId);
            clearTimeout(resumeTimeoutId);
            clearTimeout(nextSelectTimeoutId);
            
            // Pause and reset all videos
            videoElements.forEach(v => {
                v.video.pause();
                v.video.onended = null;
            });

            // Tear down the fullscreen player
            playerVideo.onended = null;
            playerVideo.pause();
            playerVideo.removeAttribute('src');
            playerVideo.load();
            playerOverlay.classList.remove('active');

            // Reset DOM & state
            scene.innerHTML = '';
            videoElements = [];
            
            // Reset rotation and transition
            currentRotation = 0;
            scene.style.transition = 'none';
            scene.style.transform = `translateZ(0px) rotateY(0deg)`;
            
            // Hide overlays
            titleDisplay.classList.add('hidden');
        }
    });

    function initCarousel() {
        const numVideos = videoEntries.length;
        const anglePerVideo = 360 / numVideos;
        
        // Adjust radius based on number of videos to keep spacing decent
        // width / (2 * tan(PI/n))
        radius = Math.max(400, (600 / 2) / Math.tan(Math.PI / numVideos));
        if (numVideos === 1) radius = 0;
        else if (numVideos === 2) radius = 400;

        videoEntries.forEach((entry, i) => {
            const angle = i * anglePerVideo;
            entry.baseAngle = angle;
            
            const vContainer = document.createElement('div');
            vContainer.className = 'carousel-video-container';
            // Store the base transform so we can re-apply it after zoom out
            entry.baseTransform = `rotateY(${angle}deg) translateZ(${radius}px)`;
            vContainer.style.transform = entry.baseTransform;
            
            const video = document.createElement('video');
            video.src = entry.url;
            video.muted = true; // Often required to autoplay
            video.setAttribute('muted', 'true');
            video.defaultMuted = true;
            video.preload = 'auto';
            video.playsInline = true;
            
            // Toggle play/pause when clicking the zoomed-in video
            vContainer.addEventListener('click', () => {
                if (vContainer.classList.contains('zoomed-in')) {
                    if (video.paused) {
                        video.play().catch(e => console.error("Playback failed:", e));
                    } else {
                        video.pause();
                    }
                }
            });
            
            vContainer.appendChild(video);
            scene.appendChild(vContainer);
            
            videoElements.push({
                entry,
                container: vContainer,
                video,
                index: i
            });
        });
        
        // Start spinning
        startSpinning();
        
        // Schedule first selection after a short intro spin
        selectTimeoutId = setTimeout(selectNextVideo, 3000);
    }
    
    function startSpinning() {
        isSpinning = true;
        let lastTime = performance.now();
        
        function animate(time) {
            if (!isSpinning) return;
            const delta = time - lastTime;
            lastTime = time;
            
            // Spin at ~30 degrees per second
            currentRotation -= (30 * delta) / 1000; 
            scene.style.transform = `translateZ(-${radius}px) rotateY(${currentRotation}deg)`;
            
            spinRequestId = requestAnimationFrame(animate);
        }
        
        spinRequestId = requestAnimationFrame(animate);
    }
    
    function selectNextVideo() {
        const unplayed = videoElements.filter(v => !v.entry.played);
        
        if (unplayed.length === 0) {
            // All played. Reset or stop? Let's reset and keep going!
            videoElements.forEach(v => v.entry.played = false);
            selectTimeoutId = setTimeout(selectNextVideo, 3000); // Wait 3s before restarting cycle
            return;
        }
        
        // Pick random
        const selected = unplayed[Math.floor(Math.random() * unplayed.length)];
        selected.entry.played = true;
        
        // Stop spinning
        isSpinning = false;
        cancelAnimationFrame(spinRequestId);
        
        // Calculate target rotation to bring selected video to the front
        // Front means the item's angle + scene's rotation = 0, 360, etc.
        // scene target rotation = - item.baseAngle
        
        const targetBase = -selected.entry.baseAngle;
        
        // Find the nearest multiple of 360 to currentRotation
        const currentSpins = Math.round(currentRotation / 360);
        
        // We want it to spin at least a little bit (e.g. 1 full spin) before stopping
        let targetRotation = targetBase + (currentSpins - 1) * 360;
        
        // Ensure it always rotates in the negative direction (leftwards) for consistency
        if (targetRotation > currentRotation) {
            targetRotation -= 360;
        }
        
        currentRotation = targetRotation;
        
        // Apply rotation to scene via CSS transition
        scene.style.transition = 'transform 2s cubic-bezier(0.25, 1, 0.5, 1)';
        scene.style.transform = `translateZ(-${radius}px) rotateY(${currentRotation}deg)`;
        
        // Wait for rotation to finish, then zoom
        zoomTimeoutId = setTimeout(() => {
            zoomInAndPlay(selected);
        }, 2000);
    }
    
    function zoomInAndPlay(selected) {
        // Highlight the selected tile in the ring behind the player.
        videoElements.forEach(v => v.container.classList.remove('focused'));
        selected.container.classList.add('focused');

        // Hide the title header while a video plays so it doesn't cover anything.
        titleDisplay.classList.add('hidden');

        // Play the selected video in the dedicated fullscreen player. Its layout box
        // is 92vw x 92vh, so the browser renders the video at full size with NO upscaling
        // of a small tile -> the picture stays sharp regardless of how it was zoomed.
        playerVideo.src = selected.entry.url;
        playerVideo.currentTime = 0;
        playerOverlay.classList.add('active'); // triggers the CSS zoom-in animation
        playerVideo.play().catch(e => console.error("Playback failed:", e));

        // Listen for end
        playerVideo.onended = () => {
            playerVideo.onended = null;
            zoomOutAndResume(selected);
        };
    }

    function zoomOutAndResume(selected) {
        // Zoom the player back out.
        playerOverlay.classList.remove('active');
        selected.container.classList.remove('focused');

        // Wait for the zoom-out transition, then resume the carousel.
        resumeTimeoutId = setTimeout(() => {
            playerVideo.pause();
            playerVideo.removeAttribute('src');
            playerVideo.load(); // release the decoded frame

            // Remove scene transition so manual requestAnimationFrame doesn't fight it
            scene.style.transition = 'none';
            startSpinning();

            // Bring the title header back now that the carousel is spinning again
            // (only if a title was set).
            if (titleText.textContent.trim()) {
                titleDisplay.classList.remove('hidden');
            }

            // Schedule next selection
            nextSelectTimeoutId = setTimeout(selectNextVideo, 4000);
        }, 800); // matches the CSS player transition duration
    }
    
    // Add one initial row automatically
    createVideoInputRow();
});
