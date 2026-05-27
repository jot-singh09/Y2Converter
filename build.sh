#!/usr/bin/env bash
# Exit immediately if a command exits with a non-zero status.
set -o errexit

echo "Starting build process..."

# Install node dependencies
npm install

# Create bin directory if not exists
mkdir -p bin

# Check and download static FFmpeg & FFprobe binaries
if [ ! -f "bin/ffmpeg" ] || [ ! -f "bin/ffprobe" ]; then
  echo "Static FFmpeg binaries not found in bin/. Downloading static release for Linux amd64..."
  wget -q https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
  tar -xf ffmpeg-release-amd64-static.tar.xz
  
  # Find the extracted directory name dynamically
  EXTRACTED_DIR=$(find . -maxdepth 1 -type d -name "ffmpeg-*-amd64-static" | head -n 1)
  
  if [ -d "$EXTRACTED_DIR" ]; then
    mv "$EXTRACTED_DIR/ffmpeg" bin/
    mv "$EXTRACTED_DIR/ffprobe" bin/
    rm -rf "$EXTRACTED_DIR"
    chmod +x bin/ffmpeg bin/ffprobe
    echo "FFmpeg static binaries successfully downloaded and set up."
  else
    echo "Failed to find extracted FFmpeg directory."
    exit 1
  fi
  rm -f ffmpeg-release-amd64-static.tar.xz
else
  echo "Static FFmpeg binaries already cached in bin/."
fi

echo "Build process completed successfully!"
