import torch
from ultralytics import YOLO

# Load a pretrained YOLOv8n model
model = YOLO('yolov8n.pt')

# Train the model on the rose dataset
if torch.backends.mps.is_available():
    device = 'mps'
    print("Using MPS")
else:
    device = 'cpu'
    print("Using CPU") # Or whatever device you intend as a fallback

results = model.train(
    data='dataset/roses/data.yaml',
    epochs=100,
    imgsz=640,
    batch=16,
    name='rose_detector',
    patience=20,
    save=True,
    device=device  # Pass the determined device
)
