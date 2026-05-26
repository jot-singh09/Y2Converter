import os
import json
from pathlib import Path
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse, FileResponse, Http404
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings

from .models import DownloadTask, ChannelBatchTask, BlockedLink, WebsiteSettings
from .downloader import extract_metadata, start_download_task, format_eta


def get_website_settings():
    """
    Retrieves the first WebsiteSettings record.
    If none exists, creates a default one.
    """
    site_settings = WebsiteSettings.objects.first()
    if not site_settings:
        site_settings = WebsiteSettings.objects.create()
    return site_settings


def index_view(request):
    """
    Renders the main single-page application with settings context.
    """
    site_settings = get_website_settings()
    return render(request, 'downloader/index.html', {'settings': site_settings})



@csrf_exempt
def api_parse(request):
    """
    POST API to parse a YouTube URL and retrieve video or channel details.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Only POST method is allowed'}, status=405)

    try:
        data = json.loads(request.body)
        url = data.get('url', '').strip()
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON request'}, status=400)

    if not url:
        return JsonResponse({'error': 'YouTube URL is required'}, status=400)

    # Check blocked links
    for blocked in BlockedLink.objects.all():
        if blocked.pattern.lower() in url.lower():
            return JsonResponse({'error': 'This link is blocked by admin'}, status=403)


    try:
        # Extract metadata via yt-dlp
        info = extract_metadata(url)
        
        # Check if this is a playlist/channel
        if 'entries' in info:
            return JsonResponse({'error': 'Channel or playlist downloads are not supported. Please provide a single YouTube video link.'}, status=400)
        else:
            # It's a single video
            duration_sec = info.get('duration')
            duration_str = ""
            if duration_sec is not None:
                duration_str = format_eta(duration_sec)
                
            thumb = info.get('thumbnail', '')
            if not thumb and info.get('thumbnails'):
                thumb = info['thumbnails'][-1].get('url', '')

            return JsonResponse({
                'type': 'single',
                'video': {
                    'id': info.get('id'),
                    'title': info.get('title', 'Unknown Title'),
                    'thumbnail_url': thumb or "https://img.youtube.com/vi/{}/0.jpg".format(info.get('id', '')),
                    'duration': duration_str,
                }
            })
            
    except Exception as e:
        return JsonResponse({'error': f"Failed to parse URL: {str(e)}"}, status=400)


@csrf_exempt
def api_download(request):
    """
    POST API to trigger a download task.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Only POST method is allowed'}, status=405)

    try:
        data = json.loads(request.body)
        download_type = data.get('type')  # 'single' or 'channel'
        format_val = data.get('format', 'mp3')  # 'mp3' or 'mp4'
        quality_val = data.get('quality', '320kbps')  # audio bitrate or video quality
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON request'}, status=400)

    if download_type == 'single':
        video_data = data.get('video')
        if not video_data or not video_data.get('id'):
            return JsonResponse({'error': 'Video data with ID is required'}, status=400)
            
        video_id = video_data.get('id')
        video_url = f"https://www.youtube.com/watch?v={video_id}"
        # Validate against blocked links
        for blocked in BlockedLink.objects.all():
            if blocked.pattern.lower() in video_id.lower() or blocked.pattern.lower() in video_url.lower():
                return JsonResponse({'error': 'This link is blocked by admin'}, status=403)
            
        task = DownloadTask.objects.create(
            video_id=video_id,
            title=video_data.get('title', 'Unknown Title'),
            thumbnail_url=video_data.get('thumbnail_url', ''),
            duration=video_data.get('duration', ''),
            format=format_val,
            quality=quality_val,
            status='pending',
            progress=0.0
        )
        # Start download in a background thread
        start_download_task(task.id)
        
        return JsonResponse({
            'status': 'success',
            'task_id': str(task.id)
        })

    elif download_type == 'channel':
        return JsonResponse({'error': 'Channel downloads are not supported.'}, status=400)

        
    else:
        return JsonResponse({'error': 'Invalid download type'}, status=400)


def api_status_task(request, task_id):
    """
    GET API to retrieve the current status of an individual download task.
    """
    task = get_object_or_404(DownloadTask, pk=task_id)
    response_data = {
        'id': str(task.id),
        'video_id': task.video_id,
        'title': task.title,
        'format': task.format,
        'quality': task.quality,
        'status': task.status,
        'progress': task.progress,
        'speed': task.speed,
        'eta': task.eta,
        'file_size': task.file_size,
        'error_message': task.error_message,
        'download_url': f"/download/file/{task.id}/" if task.status == 'completed' else None
    }
    if task.status == 'failed':
        task.delete()
    return JsonResponse(response_data)


def api_status_batch(request, batch_id):
    """
    GET API to retrieve the current status of a channel batch download.
    """
    batch = get_object_or_404(ChannelBatchTask, pk=batch_id)
    tasks = batch.tasks.all().order_by('created_at')
    
    tasks_data = []
    for t in tasks:
        tasks_data.append({
            'id': str(t.id),
            'video_id': t.video_id,
            'title': t.title,
            'status': t.status,
            'progress': t.progress,
            'speed': t.speed,
            'eta': t.eta,
            'file_size': t.file_size,
            'download_url': f"/download/file/{t.id}/" if t.status == 'completed' else None,
            'error_message': t.error_message,
        })
        
    response_data = {
        'id': str(batch.id),
        'title': batch.channel_title,
        'status': batch.status,
        'total_videos': batch.total_videos,
        'completed_videos': batch.completed_videos,
        'zip_url': f"/download/zip/{batch.id}/" if batch.status == 'completed' and batch.zip_path else None,
        'tasks': tasks_data
    }
    
    if batch.status == 'failed':
        batch.tasks.all().delete()
        batch.delete()
        
    return JsonResponse(response_data)


def download_file(request, task_id):
    """
    Serves the downloaded single video/audio file to the client.
    """
    task = get_object_or_404(DownloadTask, pk=task_id)
    if task.status != 'completed' or not task.file_path:
        raise Http404("File download is not ready or has failed.")
        
    file_path = Path(task.file_path)
    if not file_path.exists():
        raise Http404("File does not exist on the server.")

    content_type = 'audio/mpeg' if task.format == 'mp3' else 'video/mp4'
    
    class DeletingFileResponse(FileResponse):
        def close(self):
            super().close()
            if file_path.exists():
                try:
                    os.remove(file_path)
                except Exception:
                    pass
            try:
                task.delete()
            except Exception:
                pass

    response = DeletingFileResponse(open(file_path, 'rb'), content_type=content_type)
    response['Content-Disposition'] = f'attachment; filename="{file_path.name}"'
    return response


def download_zip(request, batch_id):
    """
    Serves the combined zip archive for batch downloads.
    """
    batch = get_object_or_404(ChannelBatchTask, pk=batch_id)
    if batch.status != 'completed' or not batch.zip_path:
        raise Http404("Zip file is not ready or has failed.")
        
    zip_path = Path(batch.zip_path)
    if not zip_path.exists():
        raise Http404("Zip file does not exist on the server.")

    # Collect individual video files to clean up too
    task_file_paths = []
    for task in batch.tasks.all():
        if task.file_path:
            task_file_paths.append(Path(task.file_path))

    class DeletingZipResponse(FileResponse):
        def close(self):
            super().close()
            if zip_path.exists():
                try:
                    os.remove(zip_path)
                except Exception:
                    pass
            for fp in task_file_paths:
                if fp.exists():
                    try:
                        os.remove(fp)
                    except Exception:
                        pass
            try:
                batch.tasks.all().delete()
                batch.delete()
            except Exception:
                pass

    response = DeletingZipResponse(open(zip_path, 'rb'), content_type='application/zip')
    response['Content-Disposition'] = f'attachment; filename="{zip_path.name}"'
    return response

