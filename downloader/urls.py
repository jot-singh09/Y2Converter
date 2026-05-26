from django.urls import path
from . import views

urlpatterns = [
    path('', views.index_view, name='index'),
    path('api/parse/', views.api_parse, name='api_parse'),
    path('api/download/', views.api_download, name='api_download'),
    path('api/status/task/<uuid:task_id>/', views.api_status_task, name='api_status_task'),
    path('api/status/batch/<uuid:batch_id>/', views.api_status_batch, name='api_status_batch'),
    path('download/file/<uuid:task_id>/', views.download_file, name='download_file'),
    path('download/zip/<uuid:batch_id>/', views.download_zip, name='download_zip'),
]
