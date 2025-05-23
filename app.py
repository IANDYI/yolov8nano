from flask import Flask, request, jsonify
from flask_cors import CORS
from ultralytics import YOLO
import numpy as np
import cv2
import base64
import time
import torch
from collections import defaultdict

app = Flask(__name__)
CORS(app)

# Initialize YOLOv8n model
model = YOLO('runs/detect/rose_detector/weights/best.pt')  # Use the custom rose detector

# Check if Metal is available
device = 'mps' if torch.backends.mps.is_available() else 'cpu'
model.to(device)

# Global variables for FPS calculation and rose tracking
last_inference_time = 0
inference_fps = 0
next_rose_id = 1
active_roses = {}  # Dictionary to store active roses and their last seen position
inactive_roses = {}  # Dictionary to store recently inactive roses and their last known position
last_update_time = time.time()
ROSE_TIMEOUT = 2.0  # Time in seconds after which a rose is considered inactive
INACTIVE_TIMEOUT = 5.0  # Time in seconds after which an inactive rose is forgotten

def compute_iou(box1, box2):
    """Compute IoU between two bounding boxes."""
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])
    
    intersection = max(0, x2 - x1) * max(0, y2 - y1)
    box1_area = (box1[2] - box1[0]) * (box1[3] - box1[1])
    box2_area = (box2[2] - box2[0]) * (box2[3] - box2[1])
    union = box1_area + box2_area - intersection
    
    return intersection / union if union > 0 else 0

def update_rose_tracking(detections, iou_threshold=0.5):
    """Update rose tracking and assign IDs to new roses."""
    global next_rose_id, active_roses, inactive_roses, last_update_time
    current_time = time.time()
    
    # Move inactive roses to inactive_roses dictionary
    for rose_id, data in list(active_roses.items()):
        if current_time - data['last_seen'] >= ROSE_TIMEOUT:
            inactive_roses[rose_id] = {
                'bbox': data['bbox'],
                'last_seen': data['last_seen']
            }
            del active_roses[rose_id]
    
    # Remove roses that have been inactive for too long
    inactive_roses = {rose_id: data for rose_id, data in inactive_roses.items() 
                     if current_time - data['last_seen'] < INACTIVE_TIMEOUT}
    
    # Sort detections by confidence score
    sorted_detections = sorted(detections, key=lambda x: x['confidence'], reverse=True)
    tracked_detections = []
    used = [False] * len(sorted_detections)
    
    # First, try to match with active roses
    for i, det in enumerate(sorted_detections):
        if used[i]:
            continue
            
        best_iou = 0
        best_rose_id = None
        
        # Find the best matching active rose
        for rose_id, rose_data in active_roses.items():
            iou = compute_iou(det['bbox'], rose_data['bbox'])
            if iou > iou_threshold and iou > best_iou:
                best_iou = iou
                best_rose_id = rose_id
        
        if best_rose_id is not None:
            # Update existing active rose
            det['rose_id'] = best_rose_id
            active_roses[best_rose_id] = {
                'bbox': det['bbox'],
                'last_seen': current_time
            }
            used[i] = True
            tracked_detections.append(det)
            continue
        
        # If no match with active roses, try matching with inactive roses
        for rose_id, rose_data in inactive_roses.items():
            iou = compute_iou(det['bbox'], rose_data['bbox'])
            if iou > iou_threshold and iou > best_iou:
                best_iou = iou
                best_rose_id = rose_id
        
        if best_rose_id is not None:
            # Reactivate inactive rose
            det['rose_id'] = best_rose_id
            active_roses[best_rose_id] = {
                'bbox': det['bbox'],
                'last_seen': current_time
            }
            del inactive_roses[best_rose_id]
            used[i] = True
            tracked_detections.append(det)
    
    # Assign new IDs to unmatched detections
    for i, det in enumerate(sorted_detections):
        if not used[i]:
            det['rose_id'] = next_rose_id
            active_roses[next_rose_id] = {
                'bbox': det['bbox'],
                'last_seen': current_time
            }
            next_rose_id += 1
            tracked_detections.append(det)
    
    last_update_time = current_time
    return tracked_detections

@app.route('/detect', methods=['POST'])
def detect():
    global last_inference_time, inference_fps
    
    try:
        # Get the base64 encoded image from the request
        data = request.json
        image_data = data['image'].split(',')[1]
        image_bytes = base64.b64decode(image_data)
        
        # Convert to numpy array
        nparr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        # Calculate inference FPS
        current_time = time.time()
        if last_inference_time > 0:
            inference_fps = 1 / (current_time - last_inference_time)
        last_inference_time = current_time
        
        # Perform inference
        results = model(frame, verbose=False)[0]
        
        # Process results
        detections = []
        for box in results.boxes:
            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
            confidence = float(box.conf[0].cpu().numpy())
            # Only include detections with confidence >= 60%
            if confidence >= 0.4:
                class_id = int(box.cls[0].cpu().numpy())
                class_name = results.names[class_id]
                
                detections.append({
                    'bbox': [float(x1), float(y1), float(x2), float(y2)],
                    'confidence': confidence,
                    'class': class_name
                })
        
        # Update rose tracking and get tracked detections
        tracked_detections = update_rose_tracking(detections)
        
        # Get total unique roses (active + recently inactive)
        total_count = len(active_roses) + len(inactive_roses)
        
        return jsonify({
            'success': True,
            'detections': tracked_detections,  # Return detections with rose IDs
            'counts': {'rose': total_count},  # Return total count of unique roses
            'inference_fps': round(inference_fps, 2)
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True) 