from django.contrib import admin
from .models import ChannelBatchTask, DownloadTask, BlockedLink, WebsiteSettings

@admin.register(ChannelBatchTask)
class ChannelBatchTaskAdmin(admin.ModelAdmin):
    list_display = ('channel_title', 'status', 'total_videos', 'completed_videos', 'created_at')
    list_filter = ('status',)
    search_fields = ('channel_title', 'channel_url')
    readonly_fields = ('created_at',)

@admin.register(DownloadTask)
class DownloadTaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'status', 'format', 'quality', 'progress', 'created_at')
    list_filter = ('status', 'format', 'quality')
    search_fields = ('title', 'video_id')
    readonly_fields = ('created_at', 'file_size')
    date_hierarchy = 'created_at'

@admin.register(BlockedLink)
class BlockedLinkAdmin(admin.ModelAdmin):
    list_display = ('pattern', 'reason', 'created_at')
    search_fields = ('pattern', 'reason')

@admin.register(WebsiteSettings)
class WebsiteSettingsAdmin(admin.ModelAdmin):
    list_display = ('site_name', 'hero_title', 'footer_credits')

    def has_add_permission(self, request):
        # Allow adding settings only if none exist
        if WebsiteSettings.objects.exists():
            return False
        return True

    def has_delete_permission(self, request, obj=None):
        # Do not allow deleting settings once created
        return False
