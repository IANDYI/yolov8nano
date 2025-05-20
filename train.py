import torch
from ultralytics import YOLO

# Load a pretrained YOLOv8n model
model = YOLO('yolov8n.pt')

# Train the model on the rose dataset
results = model.train(
    data='dataset/roses/data.yaml',
    epochs=100,  # number of training epochs
    imgsz=640,   # image size
    batch=16,    # batch size
    name='rose_detector',  # experiment name
    patience=20,  # early stopping patience
    save=True,   # save best model
    device='mps' if torch.backends.mps.is_available() else 'cpu'  # use Metal if available
) 