import uuid
from django.db import models

class ChannelBatchTask(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('downloading', 'Downloading'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    channel_title = models.CharField(max_length=255, blank=True)
    channel_url = models.URLField(max_length=1024)
    thumbnail_url = models.URLField(max_length=1024, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    total_videos = models.IntegerField(default=0)
    completed_videos = models.IntegerField(default=0)
    zip_path = models.CharField(max_length=1024, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Batch {self.id} - {self.channel_title or self.channel_url}"


class DownloadTask(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('extracting', 'Extracting Metadata'),
        ('downloading', 'Downloading'),
        ('converting', 'Converting'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    video_id = models.CharField(max_length=50)
    title = models.CharField(max_length=255)
    thumbnail_url = models.URLField(max_length=1024, blank=True)
    duration = models.CharField(max_length=20, blank=True)
    format = models.CharField(max_length=10, choices=[('mp3', 'MP3'), ('mp4', 'MP4')])
    quality = models.CharField(max_length=20)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    progress = models.FloatField(default=0.0)
    speed = models.CharField(max_length=50, blank=True)
    eta = models.CharField(max_length=50, blank=True)
    file_size = models.CharField(max_length=50, blank=True)
    file_path = models.CharField(max_length=1024, blank=True)
    error_message = models.TextField(blank=True)
    batch = models.ForeignKey(
        ChannelBatchTask, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='tasks'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Task {self.id} - {self.title} ({self.format})"


class BlockedLink(models.Model):
    pattern = models.CharField(
        max_length=512, 
        unique=True, 
        help_text="YouTube URL, video ID, or channel name to block (case-insensitive check)"
    )
    reason = models.CharField(max_length=255, blank=True, help_text="Reason for blocking (optional)")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Blocked: {self.pattern}"


class WebsiteSettings(models.Model):
    site_name = models.CharField(max_length=100, default="Y2Convert")
    hero_title = models.CharField(max_length=255, default="YouTube to MP3 & MP4 Converter")
    hero_subtitle = models.TextField(
        default="Fast, secure and unlimited YouTube video downloader. Save single videos or entire channels with a single click."
    )
    footer_text = models.CharField(max_length=255, default="© 2026 Y2Convert. Built with Django and Python.")
    footer_credits = models.CharField(max_length=255, default="By Karanjot Singh")
    
    # Feature 1
    feature_1_title = models.CharField(max_length=100, default="High-Speed Downloads")
    feature_1_desc = models.TextField(
        default="Features asynchronous parallel downloading on the server backend to process videos and full playlists at maximum speed."
    )
    # Feature 2
    feature_2_title = models.CharField(max_length=100, default="Premium Quality")
    feature_2_desc = models.TextField(
        default="Extracts files in crystal-clear MP3 audio quality (up to 320kbps) and original high-definition MP4 video quality."
    )
    # Feature 3
    feature_3_title = models.CharField(max_length=100, default="Secure & Private")
    feature_3_desc = models.TextField(
        default="100% safe from malware, redirects, and annoying ads. We process everything in the background for a secure experience."
    )
    # Feature 4
    feature_4_title = models.CharField(max_length=100, default="Unlimited Converts")
    feature_4_desc = models.TextField(
        default="No limitations on conversions or file sizes. Convert as many single videos or entire channels as you want, completely free."
    )

    class Meta:
        verbose_name = "Website Settings"
        verbose_name_plural = "Website Settings"

    def __str__(self):
        return f"Website Settings - {self.site_name}"

