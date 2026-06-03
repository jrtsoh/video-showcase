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
    
    let videoEntries = []; // Array of { file: File, caption: string, id: number }
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
            // Reset input so the same files can be selected again if removed
            globalFileInput.value = ''; 
        }
    });

    function createVideoInputRow(file) {
        const id = nextId++;
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
        const url = URL.createObjectURL(file);
        
        videoEntries.push({ id, file, caption: nameWithoutExt, url, played: false });
        
        const row = document.createElement('div');
        row.className = 'video-input-row';
        row.dataset.id = id;
        
        const filenameBadge = document.createElement('div');
        filenameBadge.className = 'filename-badge';
        filenameBadge.textContent = file.name;
        filenameBadge.title = file.name;
        
        const captionInput = document.createElement('input');
        captionInput.type = 'text';
        captionInput.value = nameWithoutExt;
        captionInput.placeholder = 'Enter caption...';
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = 'X';
        
        captionInput.addEventListener('input', (e) => {
            const entry = videoEntries.find(v => v.id === id);
            if (entry) {
                entry.caption = e.target.value;
            }
        });
        
        removeBtn.addEventListener('click', () => {
            videoEntries = videoEntries.filter(v => v.id !== id);
            row.remove();
            updateUI();
        });
        
        row.appendChild(filenameBadge);
        row.appendChild(captionInput);
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
    const captionOverlay = document.getElementById('caption-overlay');
    const captionText = document.getElementById('caption-text');
    
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
            
            // Reset DOM & state
            scene.innerHTML = '';
            videoElements = [];
            
            // Reset rotation and transition
            currentRotation = 0;
            scene.style.transition = 'none';
            scene.style.transform = `translateZ(0px) rotateY(0deg)`;
            
            // Hide overlays
            captionOverlay.classList.add('hidden');
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
        // Highlight logic
        videoElements.forEach(v => v.container.classList.remove('focused'));
        selected.container.classList.add('focused', 'zoomed-in');
        
        // Calculate zoom transform
        // We need it to break out of the 3D circle and come straight to the camera.
        // We negate its base rotation and bring it forward.
        // Actually, since the scene is already rotated such that this item is facing front,
        // we can just scale it and translate Z relative to its container.
        
        // The container is at rotateY(A) translateZ(R).
        // To make it bigger and closer, we can increase scale and Z.
        // We adjusted translateZ and scale to ensure it fits nicely on all screens.
        selected.container.style.transform = `${selected.entry.baseTransform} translateZ(200px) scale(1.2)`;
        
        // Show caption
        if (selected.entry.caption) {
            captionText.textContent = selected.entry.caption;
            captionOverlay.classList.remove('hidden');
        }
        
        // Play video
        selected.video.currentTime = 0;
        selected.video.play().catch(e => console.error("Playback failed:", e));
        
        // Listen for end
        selected.video.onended = () => {
            selected.video.onended = null;
            zoomOutAndResume(selected);
        };
    }
    
    function zoomOutAndResume(selected) {
        // Hide caption
        captionOverlay.classList.add('hidden');
        
        // Revert zoom
        selected.container.classList.remove('zoomed-in', 'focused');
        selected.container.style.transform = selected.entry.baseTransform;
        
        // Wait for zoom out transition, then resume spin
        resumeTimeoutId = setTimeout(() => {
            // Remove scene transition so manual requestAnimationFrame doesn't fight it
            scene.style.transition = 'none';
            startSpinning();
            
            // Schedule next selection
            nextSelectTimeoutId = setTimeout(selectNextVideo, 4000);
        }, 1500); // 1.5s matches CSS transition duration
    }
    
    // Add one initial row automatically
    createVideoInputRow();
});
