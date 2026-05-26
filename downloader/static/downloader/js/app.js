document.addEventListener('DOMContentLoaded', () => {
    // --- Initialize Lucide Icons ---
    lucide.createIcons();

    // --- DOM Elements ---
    const htmlNode = document.documentElement;
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const moonIcon = themeToggleBtn.querySelector('.moon-icon');
    const sunIcon = themeToggleBtn.querySelector('.sun-icon');
    
    const youtubeUrlInput = document.getElementById('youtube-url-input');
    const pasteBtn = document.getElementById('paste-btn');
    const fetchMetaBtn = document.getElementById('fetch-meta-btn');
    const errorMsgBox = document.getElementById('error-message-box');
    const errorText = document.getElementById('error-text');
    const loadingSpinnerBox = document.getElementById('loading-spinner-box');
    
    // Panels
    const panelInput = document.getElementById('panel-input');
    const panelOptions = document.getElementById('panel-options');
    const panelProgress = document.getElementById('panel-progress');
    const panelDownload = document.getElementById('panel-download');
    
    // Steppers
    const stepInd1 = document.getElementById('step-ind-1');
    const stepInd2 = document.getElementById('step-ind-2');
    const stepInd3 = document.getElementById('step-ind-3');
    const stepInd4 = document.getElementById('step-ind-4');
    
    const stepLine1 = document.getElementById('step-line-1');
    const stepLine2 = document.getElementById('step-line-2');
    const stepLine3 = document.getElementById('step-line-3');
    
    // Options Panel Elements
    const previewThumbnail = document.getElementById('preview-thumbnail');
    const previewDuration = document.getElementById('preview-duration');
    const previewTitle = document.getElementById('preview-title');
    const formatButtons = document.querySelectorAll('.format-btn');
    const qualitySelect = document.getElementById('quality-select');
    const backToInputBtn = document.getElementById('back-to-input-btn');
    const startConvertBtn = document.getElementById('start-convert-btn');
    
    // Channel Specific Options
    const channelVideosWrapper = document.getElementById('channel-videos-wrapper');
    const channelTitleDisplay = document.getElementById('channel-title-display');
    const channelVideosList = document.getElementById('channel-videos-list');
    const selectAllToggle = document.getElementById('select-all-toggle');
    const selectedCountLabel = document.getElementById('selected-count-label');
    
    // Progress Panel Elements
    const progressHeader = document.getElementById('progress-header');
    const singleProgressView = document.getElementById('single-progress-view');
    const progressVideoThumb = document.getElementById('progress-video-thumb');
    const progressVideoTitle = document.getElementById('progress-video-title');
    const progressFmt = document.getElementById('progress-fmt');
    const progressQual = document.getElementById('progress-qual');
    const progressSpeed = document.getElementById('progress-speed');
    const progressEta = document.getElementById('progress-eta');
    const progressBarFill = document.getElementById('progress-bar-fill');
    const progressStatusText = document.getElementById('progress-status-text');
    const progressPercentText = document.getElementById('progress-percent-text');
    
    // Batch Progress Elements
    const batchProgressView = document.getElementById('batch-progress-view');
    const batchMasterProgressFill = document.getElementById('batch-master-progress-fill');
    const batchProgressCount = document.getElementById('batch-progress-count');
    const batchItemsProgressList = document.getElementById('batch-items-progress-list');
    
    // Success Panel Elements
    const singleDownloadCard = document.getElementById('single-download-card');
    const downloadFileIcon = document.getElementById('download-file-icon');
    const downloadFileTitle = document.getElementById('download-file-title');
    const downloadFileSpecs = document.getElementById('download-file-specs');
    const primaryDownloadLink = document.getElementById('primary-download-link');
    
    // Batch Success Elements
    const batchDownloadCard = document.getElementById('batch-download-card');
    const batchDownloadTitle = document.getElementById('batch-download-title');
    const batchDownloadSpecs = document.getElementById('batch-download-specs');
    const batchZipDownloadLink = document.getElementById('batch-zip-download-link');
    const batchIndividualDownloadList = document.getElementById('batch-individual-download-list');
    
    const convertAnotherBtn = document.getElementById('convert-another-btn');

    // --- State Variables ---
    let currentMetadata = null; // Holds parsed single or channel metadata
    let selectedFormat = 'mp3'; // 'mp3' or 'mp4'
    let selectedQuality = '320kbps';
    let pollingIntervalId = null;
    let selectedChannelVideoIds = [];

    // --- Theme Switcher ---
    // Load persisted theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    htmlNode.setAttribute('data-theme', savedTheme);
    updateThemeUI(savedTheme);

    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = htmlNode.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        htmlNode.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeUI(newTheme);
    });

    function updateThemeUI(theme) {
        if (theme === 'dark') {
            moonIcon.classList.add('hidden');
            sunIcon.classList.remove('hidden');
        } else {
            sunIcon.classList.add('hidden');
            moonIcon.classList.remove('hidden');
        }
    }

    // --- Navigation & Stepper Transitions ---
    function setStep(stepNum) {
        // Reset steps
        const stepIndicators = [stepInd1, stepInd2, stepInd3, stepInd4];
        const stepLines = [stepLine1, stepLine2, stepLine3];
        
        stepIndicators.forEach((ind, index) => {
            if (index + 1 < stepNum) {
                ind.className = 'step step-completed';
            } else if (index + 1 === stepNum) {
                ind.className = 'step step-active';
            } else {
                ind.className = 'step';
            }
        });

        stepLines.forEach((line, index) => {
            if (index + 1 < stepNum) {
                line.className = 'step-line step-line-active';
            } else {
                line.className = 'step-line';
            }
        });

        // Toggle Panels
        const panels = [panelInput, panelOptions, panelProgress, panelDownload];
        panels.forEach((p, idx) => {
            if (idx + 1 === stepNum) {
                p.classList.add('active-panel');
            } else {
                p.classList.remove('active-panel');
            }
        });
        
        // Refresh icons if new panels loaded
        lucide.createIcons();
    }

    // --- Paste Button logic ---
    pasteBtn.addEventListener('click', async () => {
        try {
            if (navigator.clipboard && navigator.clipboard.readText) {
                const text = await navigator.clipboard.readText();
                youtubeUrlInput.value = text;
                showError(false);
            } else {
                // Fallback: focus input and prompt manual paste
                youtubeUrlInput.value = '';
                youtubeUrlInput.focus();
                // Try execCommand fallback
                try {
                    document.execCommand('paste');
                } catch(e) {
                    // Show helpful message on mobile
                    showError(true, 'Paste not available automatically. Please long-press the input field and tap "Paste".');
                }
            }
        } catch (err) {
            // Clipboard API blocked (common on mobile/HTTP)
            youtubeUrlInput.value = '';
            youtubeUrlInput.focus();
            showError(true, 'Auto-paste blocked by browser. Please long-press the input field and tap "Paste".');
        }
    });

    // --- Fetch Metadata (Step 1 -> 2) ---
    fetchMetaBtn.addEventListener('click', () => {
        const url = youtubeUrlInput.value.trim();
        if (!url) {
            showError(true, "Please paste a valid YouTube URL first.");
            return;
        }

        // Show loading spinner
        showError(false);
        showLoading(true);

        fetch('/api/parse/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: url })
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { throw new Error(err.error || 'Failed to parse URL') });
            }
            return response.json();
        })
        .then(data => {
            showLoading(false);
            currentMetadata = data;
            
            // Set up configurations based on metadata type
            setupOptionsPanel();
            setStep(2);
        })
        .catch(err => {
            showLoading(false);
            showError(true, err.message || "Failed to extract metadata. Please make sure the link is correct.");
        });
    });

    function showError(show, text = "") {
        if (show) {
            errorText.textContent = text;
            errorMsgBox.classList.remove('hidden');
        } else {
            errorMsgBox.classList.add('hidden');
        }
    }

    function showLoading(show) {
        if (show) {
            loadingSpinnerBox.classList.remove('hidden');
            fetchMetaBtn.disabled = true;
        } else {
            loadingSpinnerBox.classList.add('hidden');
            fetchMetaBtn.disabled = false;
        }
    }

    // --- Format / Quality Controls (Step 2) ---
    formatButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            formatButtons.forEach(b => b.classList.remove('active'));
            const currentBtn = e.currentTarget;
            currentBtn.classList.add('active');
            
            selectedFormat = currentBtn.getAttribute('data-format');
            updateQualityDropdown(selectedFormat);
        });
    });

    function updateQualityDropdown(format) {
        qualitySelect.innerHTML = '';
        if (format === 'mp3') {
            qualitySelect.innerHTML = `
                <option value="320kbps">320kbps (Best Audio)</option>
                <option value="256kbps">256kbps (High Quality)</option>
                <option value="192kbps">192kbps (Medium Quality)</option>
                <option value="128kbps">128kbps (Standard Audio)</option>
            `;
            selectedQuality = '320kbps';
        } else {
            qualitySelect.innerHTML = `
                <option value="best">1080p / Best Quality</option>
                <option value="720p">720p (High Quality)</option>
                <option value="480p">480p (Medium Quality)</option>
                <option value="360p">360p (Low Quality)</option>
            `;
            selectedQuality = 'best';
        }
    }

    qualitySelect.addEventListener('change', (e) => {
        selectedQuality = e.target.value;
    });

    // --- Setup Options Step (Step 2) Layout ---
    function setupOptionsPanel() {
        if (!currentMetadata) return;

        // Reset format selector to MP3 default
        selectedFormat = 'mp3';
        formatButtons.forEach(b => {
            if (b.getAttribute('data-format') === 'mp3') b.classList.add('active');
            else b.classList.remove('active');
        });
        updateQualityDropdown('mp3');

        if (currentMetadata.type === 'single') {
            // Setup Single Video Preview
            const video = currentMetadata.video;
            previewThumbnail.src = video.thumbnail_url;
            previewDuration.textContent = video.duration || '00:00';
            previewDuration.classList.remove('hidden');
            previewTitle.textContent = video.title;
            
            channelVideosWrapper.classList.add('hidden');
        } else {
            // Setup Channel Playlist Preview
            const channel = currentMetadata.channel;
            const firstVideo = channel.videos[0];
            
            previewThumbnail.src = channel.thumbnail_url || (firstVideo ? firstVideo.thumbnail_url : '');
            previewDuration.classList.add('hidden');
            previewTitle.textContent = channel.title;
            
            // Populate Video list checkboxes
            channelTitleDisplay.textContent = channel.title;
            
            // Re-render list
            channelVideosList.innerHTML = '';
            selectedChannelVideoIds = [];
            
            channel.videos.forEach(vid => {
                selectedChannelVideoIds.push(vid.id); // select by default
                
                const row = document.createElement('div');
                row.className = 'channel-video-row';
                row.dataset.id = vid.id;
                
                row.innerHTML = `
                    <input type="checkbox" class="row-checkbox" checked>
                    <img src="${vid.thumbnail_url}" alt="Thumbnail" class="row-thumb">
                    <span class="row-title">${vid.title}</span>
                    <span class="row-duration">${vid.duration || ''}</span>
                `;
                
                // Toggle checkbox on row click
                row.addEventListener('click', (e) => {
                    if (e.target.tagName === 'INPUT') return; // let checkbox fire naturally
                    const checkbox = row.querySelector('.row-checkbox');
                    checkbox.checked = !checkbox.checked;
                    updateCheckedState(vid.id, checkbox.checked);
                });
                
                // Toggle checkbox changes directly
                row.querySelector('.row-checkbox').addEventListener('change', (e) => {
                    updateCheckedState(vid.id, e.target.checked);
                });
                
                channelVideosList.appendChild(row);
            });
            
            updateChannelCountsDisplay();
            channelVideosWrapper.classList.remove('hidden');
        }
    }

    function updateCheckedState(videoId, checked) {
        if (checked) {
            if (!selectedChannelVideoIds.includes(videoId)) selectedChannelVideoIds.push(videoId);
        } else {
            selectedChannelVideoIds = selectedChannelVideoIds.filter(id => id !== videoId);
        }
        updateChannelCountsDisplay();
    }

    function updateChannelCountsDisplay() {
        const total = currentMetadata.channel.videos.length;
        const selected = selectedChannelVideoIds.length;
        selectedCountLabel.textContent = `Selected: ${selected} / ${total} videos`;
        
        if (selected === 0) {
            selectAllToggle.textContent = "Select All";
        } else {
            selectAllToggle.textContent = "Deselect All";
        }
    }

    // Select All / Deselect All trigger
    selectAllToggle.addEventListener('click', () => {
        const total = currentMetadata.channel.videos.length;
        const selected = selectedChannelVideoIds.length;
        const checkBoxes = channelVideosList.querySelectorAll('.row-checkbox');
        
        if (selected > 0) {
            // Deselect all
            checkBoxes.forEach(cb => cb.checked = false);
            selectedChannelVideoIds = [];
        } else {
            // Select all
            checkBoxes.forEach(cb => cb.checked = true);
            selectedChannelVideoIds = currentMetadata.channel.videos.map(v => v.id);
        }
        updateChannelCountsDisplay();
    });

    backToInputBtn.addEventListener('click', () => {
        setStep(1);
    });

    // --- Trigger Download Conversion (Step 2 -> 3) ---
    startConvertBtn.addEventListener('click', () => {
        if (!currentMetadata) return;

        let payload = {
            type: currentMetadata.type,
            format: selectedFormat,
            quality: selectedQuality
        };

        if (currentMetadata.type === 'single') {
            payload.video = currentMetadata.video;
            
            // Set up Progress Panel visuals
            progressHeader.textContent = "Converting File...";
            progressVideoThumb.src = currentMetadata.video.thumbnail_url;
            progressVideoTitle.textContent = currentMetadata.video.title;
            progressFmt.textContent = selectedFormat.toUpperCase();
            progressQual.textContent = selectedQuality;
            progressSpeed.textContent = '-';
            progressEta.textContent = '-';
            progressBarFill.style.width = '0%';
            progressStatusText.textContent = "Spawning worker task...";
            progressPercentText.textContent = "0%";
            
            singleProgressView.classList.remove('hidden');
            batchProgressView.classList.add('hidden');
        } else {
            // Channel Download
            if (selectedChannelVideoIds.length === 0) {
                alert("Please select at least one video to download.");
                return;
            }
            payload.channel = currentMetadata.channel;
            payload.video_ids = selectedChannelVideoIds;

            // Setup Progress Panel visuals for batch
            progressHeader.textContent = `Batch Converting ${selectedChannelVideoIds.length} Videos...`;
            batchProgressCount.textContent = `Completed: 0 / ${selectedChannelVideoIds.length}`;
            batchMasterProgressFill.style.width = '0%';
            
            // Setup items list
            batchItemsProgressList.innerHTML = '';
            
            // Filter videos that are selected
            const selectedVideos = currentMetadata.channel.videos.filter(v => selectedChannelVideoIds.includes(v.id));
            selectedVideos.forEach(v => {
                const itemRow = document.createElement('div');
                itemRow.className = 'batch-item-progress-row';
                itemRow.id = `batch-progress-row-${v.id}`;
                itemRow.innerHTML = `
                    <div class="batch-item-meta">
                        <span class="batch-item-title">${v.title}</span>
                        <span class="batch-item-status" id="batch-item-status-${v.id}">Pending...</span>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" id="batch-item-bar-${v.id}" style="width: 0%"></div>
                    </div>
                `;
                batchItemsProgressList.appendChild(itemRow);
            });
            
            singleProgressView.classList.add('hidden');
            batchProgressView.classList.remove('hidden');
        }

        setStep(3);

        // Call backend API to trigger
        fetch('/api/download/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        })
        .then(response => {
            if (!response.ok) throw new Error('Download trigger failed');
            return response.json();
        })
        .then(data => {
            if (data.status === 'success') {
                if (currentMetadata.type === 'single') {
                    startPollingSingle(data.task_id);
                } else {
                    startPollingBatch(data.batch_id);
                }
            }
        })
        .catch(err => {
            alert("Failed to start download. Error: " + err.message);
            setStep(2);
        });
    });

    // --- Single Video Polling ---
    function startPollingSingle(taskId) {
        if (pollingIntervalId) clearInterval(pollingIntervalId);

        pollingIntervalId = setInterval(() => {
            fetch(`/api/status/task/${taskId}/`)
            .then(res => res.json())
            .then(task => {
                // Update UI based on status
                let statusLabel = "Processing...";
                if (task.status === 'extracting') statusLabel = "Extracting video audio stream...";
                else if (task.status === 'downloading') statusLabel = "Downloading stream...";
                else if (task.status === 'converting') statusLabel = "Transcoding files...";

                progressStatusText.textContent = statusLabel;
                progressPercentText.textContent = `${task.progress}%`;
                progressBarFill.style.width = `${task.progress}%`;
                progressSpeed.textContent = task.speed || '-';
                progressEta.textContent = task.eta || '-';

                if (task.status === 'completed') {
                    clearInterval(pollingIntervalId);
                    setupSuccessSingle(task);
                    setStep(4);
                } else if (task.status === 'failed') {
                    clearInterval(pollingIntervalId);
                    alert("Download Task Failed: " + (task.error_message || "Unknown error"));
                    setStep(2);
                }
            })
            .catch(err => {
                console.error("Polling error:", err);
            });
        }, 1000);
    }

    function setupSuccessSingle(task) {
        singleDownloadCard.classList.remove('hidden');
        batchDownloadCard.classList.add('hidden');
        
        // Update file icon
        if (task.format === 'mp3') {
            downloadFileIcon.className = "file-icon";
            downloadFileIcon.setAttribute('data-lucide', 'file-audio');
        } else {
            downloadFileIcon.className = "file-icon";
            downloadFileIcon.setAttribute('data-lucide', 'file-video');
        }
        
        downloadFileTitle.textContent = `${task.title}.${task.format}`;
        downloadFileSpecs.textContent = `${task.quality} • ${task.file_size || 'Size Unknown'}`;
        primaryDownloadLink.href = task.download_url;
        primaryDownloadLink.download = `${task.title}.${task.format}`;
        
        lucide.createIcons();
    }

    // --- Batch Channel Polling ---
    function startPollingBatch(batchId) {
        if (pollingIntervalId) clearInterval(pollingIntervalId);

        pollingIntervalId = setInterval(() => {
            fetch(`/api/status/batch/${batchId}/`)
            .then(res => res.json())
            .then(batch => {
                // Calculate master progress percent
                const total = batch.total_videos;
                const completed = batch.completed_videos;
                
                let finishedTasks = 0;
                batch.tasks.forEach(t => {
                    if (t.status === 'completed' || t.status === 'failed') {
                        finishedTasks++;
                    }
                });

                const percent = total > 0 ? Math.round((finishedTasks / total) * 100) : 0;
                batchProgressCount.textContent = `Completed: ${completed} / ${total} (${percent}%)`;
                batchMasterProgressFill.style.width = `${percent}%`;

                // Update individual item progress bars
                batch.tasks.forEach(t => {
                    const row = document.getElementById(`batch-progress-row-${t.video_id}`);
                    if (!row) return;

                    const bar = row.querySelector('.progress-bar-fill');
                    const statusText = row.querySelector('.batch-item-status');

                    bar.style.width = `${t.progress}%`;
                    
                    let statusLabel = `${t.progress}%`;
                    statusText.className = 'batch-item-status';

                    if (t.status === 'completed') {
                        statusLabel = "Completed";
                        statusText.classList.add('completed');
                    } else if (t.status === 'failed') {
                        statusLabel = "Failed";
                        statusText.classList.add('failed');
                    } else if (t.status === 'converting') {
                        statusLabel = "Converting...";
                    } else if (t.status === 'extracting') {
                        statusLabel = "Extracting...";
                    } else if (t.status === 'downloading' && t.speed) {
                        statusLabel = `${t.progress}% (${t.speed})`;
                    }
                    
                    statusText.textContent = statusLabel;
                });

                if (batch.status === 'completed') {
                    clearInterval(pollingIntervalId);
                    setupSuccessBatch(batch);
                    setStep(4);
                } else if (batch.status === 'failed') {
                    clearInterval(pollingIntervalId);
                    alert("Batch download failed entirely.");
                    setStep(2);
                }
            })
            .catch(err => {
                console.error("Batch polling error:", err);
            });
        }, 1000);
    }

    function setupSuccessBatch(batch) {
        singleDownloadCard.classList.add('hidden');
        batchDownloadCard.classList.remove('hidden');

        batchDownloadTitle.textContent = `${batch.title}_videos.zip`;
        
        // Count successful downloads
        const successes = batch.tasks.filter(t => t.status === 'completed').length;
        batchDownloadSpecs.textContent = `Contains ${successes} successfully converted files.`;
        batchZipDownloadLink.href = batch.zip_url;

        // Render individual file downloads
        batchIndividualDownloadList.innerHTML = '';
        
        batch.tasks.forEach(t => {
            const row = document.createElement('div');
            row.className = 'batch-individual-row';
            
            if (t.status === 'completed') {
                const ext = t.format;
                row.innerHTML = `
                    <span class="batch-individual-title">${t.title}.${ext}</span>
                    <a href="${t.download_url}" class="batch-individual-btn" download="${t.title}.${ext}">
                        <i data-lucide="download" style="width: 14px; height: 14px;"></i> Download
                    </a>
                `;
            } else {
                row.innerHTML = `
                    <span class="batch-individual-title" style="opacity: 0.5;">${t.title}</span>
                    <button class="batch-individual-btn failed" disabled>Failed</button>
                `;
            }
            batchIndividualDownloadList.appendChild(row);
        });

        lucide.createIcons();
    }

    // --- Reset / Convert Another (Step 4 -> 1) ---
    convertAnotherBtn.addEventListener('click', () => {
        youtubeUrlInput.value = '';
        currentMetadata = null;
        selectedChannelVideoIds = [];
        if (pollingIntervalId) clearInterval(pollingIntervalId);
        
        setStep(1);
    });
});
