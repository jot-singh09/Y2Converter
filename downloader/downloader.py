import os
import time
import zipfile
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import django
from django.conf import settings
from django.utils import timezone
import yt_dlp

# Define paths
BASE_DIR = Path(settings.BASE_DIR)
FFMPEG_PATH = str(BASE_DIR / 'bin' / 'ffmpeg')
DOWNLOADS_DIR = BASE_DIR / 'media' / 'downloads'
COOKIES_PATH = BASE_DIR / 'cookies.txt'

# Ensure downloads directory exists
os.makedirs(DOWNLOADS_DIR, exist_ok=True)


def get_common_yt_dlp_options():
    """
    Returns common yt-dlp options for bypassing YouTube bot detection.
    Includes cookies support and user-agent spoofing.
    """
    opts = {
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        'socket_timeout': 30,
    }
    # If cookies.txt exists, use it for authentication
    if COOKIES_PATH.exists():
        opts['cookiefile'] = str(COOKIES_PATH)
    return opts

# Thread Pool for background downloads (maximum 3 concurrent downloads for speed vs stability)
executor = ThreadPoolExecutor(max_workers=3)


def get_yt_dlp_options(task, output_template):
    """
    Returns options dictionary for yt-dlp based on format (MP3 vs MP4) and quality.
    """
    options = get_common_yt_dlp_options()
    options.update({
        'outtmpl': output_template,
        'ffmpeg_location': FFMPEG_PATH,
        'quiet': True,
        'no_warnings': True,
        'noprogress': True,
    })

    if task.format == 'mp3':
        options.update({
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': task.quality.replace('kbps', ''),
            }],
        })
    else:  # mp4
        # Use flexible format selection with multiple fallbacks
        options.update({
            'format': 'bestvideo+bestaudio/best',
            'merge_output_format': 'mp4',
        })

    return options


def format_size(bytes_count):
    if bytes_count is None:
        return "Unknown"
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_count < 1024.0:
            return f"{bytes_count:.2f} {unit}"
        bytes_count /= 1024.0
    return f"{bytes_count:.2f} TB"


def format_speed(bytes_per_second):
    if bytes_per_second is None:
        return ""
    return f"{format_size(bytes_per_second)}/s"


def format_eta(seconds):
    if seconds is None:
        return ""
    mins, secs = divmod(int(seconds), 60)
    hours, mins = divmod(mins, 60)
    if hours > 0:
        return f"{hours:02d}:{mins:02d}:{secs:02d}"
    return f"{mins:02d}:{secs:02d}"


def extract_metadata(url):
    """
    Extracts metadata from a YouTube URL.
    Uses --flat-playlist for channel links to run extremely fast.
    """
    ydl_opts = get_common_yt_dlp_options()
    ydl_opts.update({
        'extract_flat': 'in_playlist',
        'ffmpeg_location': FFMPEG_PATH,
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
    })
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        return info


def run_download_thread(task_id):
    """
    Function executed in the background thread.
    Downloads the video and converts it using yt-dlp.
    """
    # Import locally to avoid circular imports during setup
    from .models import DownloadTask, ChannelBatchTask
    
    # Refresh Django DB connection for thread safety
    django.db.connections.close_all()
    
    try:
        task = DownloadTask.objects.get(pk=task_id)
    except DownloadTask.DoesNotExist:
        return

    task.status = 'extracting'
    task.save()

    output_filename = f"{task_id}_{task.video_id}.%(ext)s"
    output_template = str(DOWNLOADS_DIR / output_filename)

    last_db_update = 0

    def progress_hook(d):
        nonlocal last_db_update
        
        # Keep DB updates throttled to at most once per 0.5s to avoid locking sqlite
        current_time = time.time()
        should_update_db = (current_time - last_db_update) > 0.5

        if d['status'] == 'downloading':
            downloaded = d.get('downloaded_bytes', 0)
            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            
            progress_pct = 0.0
            if total > 0:
                progress_pct = round((downloaded / total) * 100, 1)

            speed_str = format_speed(d.get('speed'))
            eta_str = format_eta(d.get('eta'))
            size_str = format_size(total)

            if should_update_db or progress_pct >= 99.9:
                DownloadTask.objects.filter(pk=task_id).update(
                    status='downloading',
                    progress=progress_pct,
                    speed=speed_str,
                    eta=eta_str,
                    file_size=size_str
                )
                last_db_update = current_time

        elif d['status'] == 'finished':
            DownloadTask.objects.filter(pk=task_id).update(
                status='converting',
                progress=100.0,
                speed='',
                eta=''
            )
            last_db_update = current_time

    # Set up download options
    ydl_opts = get_yt_dlp_options(task, output_template)
    ydl_opts['progress_hooks'] = [progress_hook]

    try:
        # Perform download
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # yt-dlp will trigger the download
            video_url = f"https://www.youtube.com/watch?v={task.video_id}"
            info_dict = ydl.extract_info(video_url, download=True)
            
            # Retrieve final file path
            ext = 'mp3' if task.format == 'mp3' else 'mp4'
            final_path = str(DOWNLOADS_DIR / f"{task_id}_{task.video_id}.{ext}")
            
            # Check if file exists. Under some merges it might be different, let's verify
            if not os.path.exists(final_path):
                # Search for any file matching task_id in the downloads dir
                matches = list(DOWNLOADS_DIR.glob(f"{task_id}_{task.video_id}.*"))
                if matches:
                    final_path = str(matches[0])
                else:
                    raise FileNotFoundError("Downloaded file could not be located on disk.")
            
            # Save success state
            # Get actual file size
            if os.path.exists(final_path):
                actual_size = os.path.getsize(final_path)
                task.file_size = format_size(actual_size)
            
            task.status = 'completed'
            task.file_path = final_path
            task.progress = 100.0
            task.save()
            
    except Exception as e:
        task.status = 'failed'
        task.error_message = str(e)
        task.save()

    # Update Batch status if this task is part of a batch
    if task.batch_id:
        check_and_update_batch(task.batch_id)


def check_and_update_batch(batch_id):
    """
    Checks the status of all child tasks in a batch.
    If all are done, zips them together and marks the batch completed.
    """
    from .models import DownloadTask, ChannelBatchTask
    django.db.connections.close_all()
    
    try:
        batch = ChannelBatchTask.objects.get(pk=batch_id)
    except ChannelBatchTask.DoesNotExist:
        return

    tasks = batch.tasks.all()
    total = tasks.count()
    completed = tasks.filter(status='completed').count()
    failed = tasks.filter(status='failed').count()

    # Update counts
    batch.completed_videos = completed
    
    if completed + failed >= total:
        # All tasks are finished!
        if completed > 0:
            # Let's create a ZIP archive of all successfully downloaded files
            zip_filename = f"batch_{batch_id}.zip"
            zip_file_path = DOWNLOADS_DIR / zip_filename
            
            try:
                with zipfile.ZipFile(zip_file_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                    for task in tasks.filter(status='completed'):
                        if task.file_path and os.path.exists(task.file_path):
                            # Add file to zip using its clean title as filename
                            ext = Path(task.file_path).suffix
                            # Clean up title for filename
                            clean_title = "".join([c if c.isalnum() or c in [' ', '-', '_'] else '' for c in task.title]).strip()
                            clean_title = clean_title or task.video_id
                            arcname = f"{clean_title}{ext}"
                            zipf.write(task.file_path, arcname=arcname)
                
                batch.zip_path = str(zip_file_path)
                batch.status = 'completed'
            except Exception as e:
                batch.status = 'failed'
        else:
            batch.status = 'failed'
    else:
        batch.status = 'downloading'
        
    batch.save()


def start_download_task(task_id):
    """
    Submits a download task to the background thread pool.
    """
    executor.submit(run_download_thread, task_id)
