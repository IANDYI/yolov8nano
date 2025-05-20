# YOLOv8n Real-time Object Detection Web App

This is a web application that performs real-time object detection using YOLOv8n. The application is optimized for Mac computers with Apple Silicon, utilizing Metal API for acceleration when available.

## Features

- Real-time object detection using YOLOv8n
- Metal API acceleration support for Apple Silicon Macs
- Live video feed with bounding boxes
- Object counting by class
- FPS monitoring for both video stream and model inference
- Modern, responsive UI

## Requirements

- Python 3.8 or higher
- macOS (optimized for Apple Silicon)
- Modern web browser with WebRTC support
- Camera access

## Installation

1. Clone this repository:
```bash
git clone <repository-url>
cd yolov8n
```

2. Create a virtual environment (recommended):
```bash
python -m venv venv
source venv/bin/activate  # On macOS/Linux
```

3. Install the required packages:
```bash
pip install -r requirements.txt
```

4. Download the YOLOv8n model (this will happen automatically on first run)

## Usage

1. Start the Flask server:
```bash
python app.py
```

2. Open your web browser and navigate to:
```
http://localhost:5000/static/index.html
```

3. Click the "Start Camera" button to begin object detection
4. Use the "Stop Camera" button to stop the detection

## Performance Notes

- The application is optimized for Apple Silicon Macs using Metal API
- If Metal is not available, it will fall back to CPU
- The frontend targets 30 FPS for the video stream
- Model inference FPS will depend on your hardware capabilities

## Troubleshooting

1. If you get a camera access error:
   - Make sure you've granted camera permissions to your browser
   - Check if another application is using the camera

2. If the model is running slowly:
   - Ensure you're using a Mac with Apple Silicon for Metal acceleration
   - Try closing other resource-intensive applications
   - Check if the model is using Metal by looking at the console output

3. If you see CORS errors:
   - Make sure you're accessing the application through `http://localhost:5000`
   - Check if the Flask server is running

## License

This project is licensed under the MIT License - see the LICENSE file for details. 