const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 8000;

// Setup directories
const mediaDir = path.join(__dirname, 'media');
const downloadsDir = path.join(mediaDir, 'downloads');
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

// Load settings.json
let settings = {};
try {
    settings = JSON.parse(fs.readFileSync(path.join(__dirname, 'settings.json'), 'utf8'));
} catch (err) {
    console.error('Error loading settings.json, creating fallback defaults:', err);
    settings = {
        site_name: "Y2Convert",
        hero_title: "YouTube to <span class=\"gradient-text\">MP3 & MP4</span> Converter",
        hero_subtitle: "Fast, secure and unlimited YouTube video downloader. Save single videos or entire channels with a single click.",
        footer_text: "© 2026 Y2Convert. Built with Node.js and Express.",
        footer_credits: "By Karanjot Singh",
        features: [
            {
                title: "High-Speed Downloads",
                desc: "Features asynchronous parallel downloading on the server backend to process videos and full playlists at maximum speed."
            },
            {
                title: "Premium Quality",
                desc: "Extracts files in crystal-clear MP3 audio quality (up to 320kbps) and original high-definition MP4 video quality."
            },
            {
                title: "Secure & Private",
                desc: "100% safe from malware, redirects, and annoying ads. We process everything in the background for a secure experience."
            },
            {
                title: "Unlimited Converts",
                desc: "No limitations on conversions or file sizes. Convert as many single videos or entire channels as you want, completely free."
            }
        ],
        blocked_links: [
            {
                pattern: "dQw4w9WgXcQ",
                reason: "Rick Roll test blocking"
            }
        ]
    };
}

// In-memory tasks store
const tasks = {};

// Helper: format duration in seconds to MM:SS or H:MM:SS
function formatDuration(seconds) {
    if (seconds === null || seconds === undefined || isNaN(seconds)) return '';
    const secs = parseInt(seconds, 10);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const parts = [];
    if (h > 0) {
        parts.push(h.toString().padStart(2, '0'));
    }
    parts.push(m.toString().padStart(2, '0'));
    parts.push(s.toString().padStart(2, '0'));
    return parts.join(':');
}

// Helper: Format bytes to human readable string
function formatSize(bytes) {
    if (bytes === null || bytes === undefined || isNaN(bytes)) return "Unknown";
    let count = parseFloat(bytes);
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let idx = 0;
    while (count >= 1024.0 && idx < units.length - 1) {
        count /= 1024.0;
        idx++;
    }
    return `${count.toFixed(2)} ${units[idx]}`;
}

// Helper: run yt-dlp with cookie-fallback retry
function runYtDlp(args, onData, onError, onClose) {
    const ytDlpCmd = fs.existsSync('/home/karan/.local/bin/yt-dlp') ? '/home/karan/.local/bin/yt-dlp' : 'yt-dlp';
    const child = spawn(ytDlpCmd, args);
    let stderrData = '';

    child.stdout.on('data', (data) => {
        if (onData) onData(data.toString());
    });

    child.stderr.on('data', (data) => {
        stderrData += data.toString();
        if (onError) onError(data.toString());
    });

    child.on('close', (code) => {
        if (code !== 0) {
            const cookieIdx = args.indexOf('--cookies');
            if (cookieIdx !== -1) {
                console.warn(`yt-dlp failed with cookies (code ${code}), retrying without cookies...`);
                const newArgs = args.filter((_, idx) => idx !== cookieIdx && idx !== cookieIdx + 1);
                return runYtDlp(newArgs, onData, onError, onClose);
            }
        }
        if (onClose) onClose(code, stderrData);
    });

    return child;
}

// Configure Express
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Root Route
app.get('/', (req, res) => {
    res.render('index', { settings });
});

// API: Parse Video Link
app.post('/api/parse/', (req, res) => {
    const url = req.body.url ? req.body.url.trim() : '';
    if (!url) return res.status(400).json({ error: 'YouTube URL is required' });

    // Validate against blocked links
    for (const blocked of settings.blocked_links) {
        if (url.toLowerCase().includes(blocked.pattern.toLowerCase())) {
            return res.status(403).json({ error: 'This link is blocked by admin' });
        }
    }

    const args = ['--dump-json', '--flat-playlist', '--no-warnings', '--quiet', '--skip-download'];
    
    // Add cookies if cookies.txt exists
    const cookiesPath = path.join(__dirname, 'cookies.txt');
    if (fs.existsSync(cookiesPath)) {
        args.push('--cookies', cookiesPath);
    }
    
    args.push(
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        '--socket-timeout', '30'
    );
    
    args.push(url);

    let stdoutData = '';

    runYtDlp(args,
        (data) => { stdoutData += data; },
        null,
        (code, stderrData) => {
            if (code !== 0) {
                console.error(`yt-dlp failed with exit code ${code}: ${stderrData}`);
                return res.status(400).json({ error: `Failed to parse URL: ${stderrData || 'Unknown error'}` });
            }

            try {
                const info = JSON.parse(stdoutData);
                
                // Check if playlist/channel
                if (info.entries || info._type === 'playlist') {
                    return res.status(400).json({ error: 'Channel or playlist downloads are not supported. Please provide a single YouTube video link.' });
                }

                const durationSec = info.duration;
                const durationStr = formatDuration(durationSec);
                
                let thumb = info.thumbnail || '';
                if (!thumb && info.thumbnails && info.thumbnails.length > 0) {
                    thumb = info.thumbnails[info.thumbnails.length - 1].url || '';
                }

                return res.json({
                    type: 'single',
                    video: {
                        id: info.id,
                        title: info.title || 'Unknown Title',
                        thumbnail_url: thumb || `https://img.youtube.com/vi/${info.id}/0.jpg`,
                        duration: durationStr
                    }
                });
            } catch (err) {
                console.error('Failed to parse stdout json:', err);
                return res.status(400).json({ error: `Failed to parse URL: invalid metadata returned.` });
            }
        }
    );
});

// API: Start Download
app.post('/api/download/', (req, res) => {
    const downloadType = req.body.type;
    const formatVal = req.body.format || 'mp3';
    const qualityVal = req.body.quality || '320kbps';

    if (downloadType !== 'single') {
        return res.status(400).json({ error: 'Channel downloads are not supported.' });
    }

    const videoData = req.body.video;
    if (!videoData || !videoData.id) {
        return res.status(400).json({ error: 'Video data with ID is required' });
    }

    const videoId = videoData.id;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Validate blocked links
    for (const blocked of settings.blocked_links) {
        if (videoId.toLowerCase().includes(blocked.pattern.toLowerCase()) || videoUrl.toLowerCase().includes(blocked.pattern.toLowerCase())) {
            return res.status(403).json({ error: 'This link is blocked by admin' });
        }
    }

    // Create task
    const taskId = crypto.randomUUID();
    tasks[taskId] = {
        id: taskId,
        video_id: videoId,
        title: videoData.title || 'Unknown Title',
        thumbnail_url: videoData.thumbnail_url || '',
        duration: videoData.duration || '',
        format: formatVal,
        quality: qualityVal,
        status: 'pending',
        progress: 0.0,
        speed: '',
        eta: '',
        file_size: '',
        file_path: '',
        error_message: '',
        created_at: new Date()
    };

    // Trigger download asynchronously
    startDownloadTask(taskId);

    return res.json({
        status: 'success',
        task_id: taskId
    });
});

// API: Get Status
app.get('/api/status/task/:task_id/', (req, res) => {
    const task = tasks[req.params.task_id];
    if (!task) {
        return res.status(404).json({ error: 'Task not found' });
    }

    const responseData = {
        id: task.id,
        video_id: task.video_id,
        title: task.title,
        format: task.format,
        quality: task.quality,
        status: task.status,
        progress: task.progress,
        speed: task.speed,
        eta: task.eta,
        file_size: task.file_size,
        error_message: task.error_message,
        download_url: task.status === 'completed' ? `/download/file/${task.id}/` : null
    };

    // If task failed, delete from memory after client gets notice
    if (task.status === 'failed') {
        delete tasks[task.id];
    }

    return res.json(responseData);
});

// API: Download file and delete
app.get('/download/file/:task_id/', (req, res) => {
    const task = tasks[req.params.task_id];
    if (!task || task.status !== 'completed' || !task.file_path) {
        return res.status(404).send('File download is not ready or has failed.');
    }

    if (!fs.existsSync(task.file_path)) {
        return res.status(404).send('File does not exist on the server.');
    }

    const cleanTitle = task.title.replace(/[^a-zA-Z0-9 \-_]/g, '').trim() || task.video_id;
    const ext = task.format === 'mp3' ? 'mp3' : 'mp4';
    const clientFilename = `${cleanTitle}.${ext}`;

    res.download(task.file_path, clientFilename, (err) => {
        // Clean up from disk
        try {
            if (fs.existsSync(task.file_path)) {
                fs.unlinkSync(task.file_path);
            }
        } catch (e) {
            console.error('Error unlinking downloaded file:', e);
        }
        // Clean up from memory
        delete tasks[req.params.task_id];
    });
});

// Stub routes for batch channels
app.get('/api/status/batch/:batch_id/', (req, res) => {
    return res.status(400).json({ error: 'Channel downloads are not supported.' });
});
app.get('/download/zip/:batch_id/', (req, res) => {
    return res.status(400).send('Channel downloads are not supported.');
});

// Background Download Worker
function startDownloadTask(taskId) {
    const task = tasks[taskId];
    if (!task) return;

    task.status = 'extracting';

    const ext = task.format === 'mp3' ? 'mp3' : 'mp4';
    const outputFilename = `${taskId}_${task.video_id}.${ext}`;
    const outputPath = path.join(downloadsDir, outputFilename);
    task.file_path = outputPath;

    const args = [];

    // Cookies
    const cookiesPath = path.join(__dirname, 'cookies.txt');
    if (fs.existsSync(cookiesPath)) {
        args.push('--cookies', cookiesPath);
    }

    // Common arguments
    args.push(
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        '--socket-timeout', '30'
    );

    // Output template
    const outtmpl = path.join(downloadsDir, `${taskId}_${task.video_id}.%(ext)s`);
    args.push('-o', outtmpl);

    // FFMpeg location
    const ffmpegPath = path.join(__dirname, 'bin', 'ffmpeg');
    args.push('--ffmpeg-location', ffmpegPath);

    // Progress updates
    args.push('--newline');

    // Format specific config
    if (task.format === 'mp3') {
        args.push(
            '--format', 'bestaudio/best',
            '--extract-audio',
            '--audio-format', 'mp3',
            '--audio-quality', task.quality.replace('kbps', '')
        );
    } else {
        args.push(
            '--format', 'bestvideo+bestaudio/best',
            '--merge-output-format', 'mp4'
        );
    }

    // Video URL
    args.push(`https://www.youtube.com/watch?v=${task.video_id}`);

    runYtDlp(args,
        (data) => {
            const lines = data.split('\n');
            for (const rawLine of lines) {
                const line = rawLine.trim();
                
                if (line.includes('[download]') && line.includes('%')) {
                    task.status = 'downloading';
                    
                    // Extract percentage
                    const pctMatch = line.match(/(\d+(?:\.\d+)?)%/);
                    if (pctMatch) {
                        task.progress = parseFloat(pctMatch[1]);
                    }
                    
                    // Extract speed
                    const speedMatch = line.match(/at\s+(\S+)/);
                    if (speedMatch) {
                        task.speed = speedMatch[1];
                    }
                    
                    // Extract ETA
                    const etaMatch = line.match(/ETA\s+(\S+)/);
                    if (etaMatch) {
                        task.eta = etaMatch[1];
                    }

                    // Extract size
                    const sizeMatch = line.match(/of\s+(\S+)/);
                    if (sizeMatch) {
                        task.file_size = sizeMatch[1];
                    }
                } else if (line.includes('[ExtractAudio]') || line.includes('[Merger]')) {
                    task.status = 'converting';
                    task.progress = 100.0;
                    task.speed = '';
                    task.eta = '';
                }
            }
        },
        (errData) => {
            console.error(`[yt-dlp worker stderr]: ${errData.trim()}`);
        },
        (code, stderrData) => {
            if (code === 0) {
                // Success! Double check if file exists
                if (!fs.existsSync(outputPath)) {
                    try {
                        const files = fs.readdirSync(downloadsDir);
                        const matchedFile = files.find(f => f.startsWith(`${taskId}_${task.video_id}.`));
                        if (matchedFile) {
                            task.file_path = path.join(downloadsDir, matchedFile);
                        } else {
                            throw new Error('Downloaded file not found.');
                        }
                    } catch (err) {
                        task.status = 'failed';
                        task.error_message = 'Downloaded file could not be located on disk.';
                        return;
                    }
                }

                // Get file stats
                try {
                    const stats = fs.statSync(task.file_path);
                    task.file_size = formatSize(stats.size);
                } catch (err) {
                    // Ignore
                }

                task.status = 'completed';
                task.progress = 100.0;
            } else {
                task.status = 'failed';
                task.error_message = `yt-dlp exited with code ${code}: ${stderrData}`;
            }
        }
    );
}

// Helper: Get Wifi/LAN IP address
function getWifiIp() {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && !alias.internal) {
                return alias.address;
            }
        }
    }
    return '127.0.0.1';
}

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    const wifiIp = getWifiIp();
    console.log(`Server is running on:`);
    console.log(`  - Local:   http://localhost:${PORT}`);
    console.log(`  - Network: http://${wifiIp}:${PORT}`);
});
