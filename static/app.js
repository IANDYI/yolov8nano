class ObjectDetector {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Create a separate canvas for downscaled detection
        this.detectionCanvas = document.createElement('canvas');
        this.detectionCtx = this.detectionCanvas.getContext('2d');
        // Set detection canvas to 640x480
        this.detectionCanvas.width = 640;
        this.detectionCanvas.height = 480;
        
        this.startButton = document.getElementById('startButton');
        this.stopButton = document.getElementById('stopButton');
        this.cameraFpsElement = document.getElementById('cameraFps');
        this.inferenceFpsElement = document.getElementById('inferenceFps');
        this.countsElement = document.getElementById('counts');
        
        // Set initial video element properties
        this.video.setAttribute('playsinline', '');
        this.video.setAttribute('autoplay', '');
        this.video.style.display = 'block';
        this.video.style.width = '100%';
        this.video.style.height = '100%';
        
        this.stream = null;
        this.isProcessing = false;
        this.lastFrameTime = 0;
        this.frameCount = 0;
        this.cameraFps = 0;
        this.fpsUpdateInterval = 1000;
        this.lastFpsUpdate = 0;
        
        // Store the latest detections
        this.latestDetections = [];
        this.isDrawingVideo = false;
        
        // Add frame timing control
        this.lastDetectionTime = 0;
        this.detectionInterval = 1000 / 30; // 30 FPS for detection
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        this.startButton.addEventListener('click', () => this.startCamera());
        this.stopButton.addEventListener('click', () => this.stopCamera());
    }
    
    async startCamera() {
        try {
            console.log('Requesting camera access...');
            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                }
            };
            console.log('Camera constraints:', constraints);
            
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('Camera stream obtained:', this.stream);
            
            // Log available video tracks
            const videoTracks = this.stream.getVideoTracks();
            console.log('Available video tracks:', videoTracks);
            if (videoTracks.length > 0) {
                console.log('Selected video track settings:', videoTracks[0].getSettings());
            }
            
            // Set up video element
            this.video.srcObject = this.stream;
            
            // Wait for video to be ready
            await new Promise((resolve, reject) => {
                this.video.onloadedmetadata = () => {
                    console.log('Video metadata loaded:', {
                        width: this.video.videoWidth,
                        height: this.video.videoHeight,
                        readyState: this.video.readyState
                    });
                    resolve();
                };
                this.video.onerror = (error) => {
                    console.error('Video element error:', error);
                    reject(error);
                };
            });
            
            // Start playing
            try {
                await this.video.play();
                console.log('Video playback started successfully');
            } catch (playError) {
                console.error('Error playing video:', playError);
                throw playError;
            }
            
            // Set canvas size
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
            console.log('Canvas size set to:', this.canvas.width, 'x', this.canvas.height);
            
            // Verify video is playing
            console.log('Video element state:', {
                paused: this.video.paused,
                ended: this.video.ended,
                readyState: this.video.readyState,
                currentTime: this.video.currentTime,
                srcObject: this.video.srcObject ? 'set' : 'not set'
            });
            
            this.startButton.disabled = true;
            this.stopButton.disabled = false;
            
            this.startProcessing();
        } catch (error) {
            console.error('Error in startCamera:', error);
            alert('Error accessing camera: ' + error.message);
        }
    }
    
    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        this.video.srcObject = null;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.startButton.disabled = false;
        this.stopButton.disabled = true;
        
        this.isProcessing = false;
        this.isDrawingVideo = false;
        this.frameCount = 0;
        this.cameraFps = 0;
        this.cameraFpsElement.textContent = '0';
        this.inferenceFpsElement.textContent = '0';
        this.countsElement.innerHTML = '';
        this.latestDetections = [];
    }
    
    async startProcessing() {
        this.isProcessing = true;
        this.lastFrameTime = performance.now();
        this.lastFpsUpdate = this.lastFrameTime;
        this.frameCount = 0;
        
        // Start the video drawing loop
        this.isDrawingVideo = true;
        this.drawVideoLoop();
        
        // Start the detection processing loop
        while (this.isProcessing) {
            await this.processFrame();
        }
    }
    
    drawVideoLoop() {
        if (!this.isDrawingVideo) return;
        
        const currentTime = performance.now();
        
        // Draw the current video frame
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        
        // Draw the latest detections on top
        this.drawDetections(this.latestDetections);
        
        // Update FPS counter
        this.frameCount++;
        if (currentTime - this.lastFpsUpdate >= this.fpsUpdateInterval) {
            this.cameraFps = Math.round((this.frameCount * 1000) / (currentTime - this.lastFpsUpdate));
            this.cameraFpsElement.textContent = this.cameraFps;
            this.frameCount = 0;
            this.lastFpsUpdate = currentTime;
        }
        
        // Request next frame
        requestAnimationFrame(() => this.drawVideoLoop());
    }
    
    async processFrame() {
        if (!this.isProcessing) return;
        
        const currentTime = performance.now();
        const timeSinceLastDetection = currentTime - this.lastDetectionTime;
        
        // Only process a new frame if enough time has passed (30 FPS)
        if (timeSinceLastDetection < this.detectionInterval) {
            // Wait for the remaining time
            await new Promise(resolve => 
                setTimeout(resolve, this.detectionInterval - timeSinceLastDetection)
            );
            return this.processFrame();
        }
        
        try {
            // Draw the current video frame to the detection canvas at 640x480
            this.detectionCtx.drawImage(this.video, 0, 0, this.detectionCanvas.width, this.detectionCanvas.height);
            
            // Convert the downscaled frame to base64
            const imageData = this.detectionCanvas.toDataURL('image/jpeg', 0.8);
            
            const response = await fetch('/detect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ image: imageData })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Update inference FPS
                this.inferenceFpsElement.textContent = data.inference_fps;
                
                // Scale the detection coordinates back to the display resolution
                const scaleX = this.canvas.width / this.detectionCanvas.width;
                const scaleY = this.canvas.height / this.detectionCanvas.height;
                
                // Scale the detections to match the display resolution
                const scaledDetections = data.detections.map(detection => ({
                    ...detection,
                    bbox: detection.bbox.map((coord, index) => 
                        index % 2 === 0 ? coord * scaleX : coord * scaleY
                    )
                }));
                
                // Store the scaled detections
                this.latestDetections = scaledDetections;
                
                // Update counts
                this.updateCounts(data.counts);
            }
        } catch (error) {
            console.error('Error processing frame:', error);
        }
        
        // Update the last detection time
        this.lastDetectionTime = performance.now();
    }
    
    drawDetections(detections) {
        // Draw each detection
        detections.forEach(detection => {
            const [x1, y1, x2, y2] = detection.bbox;
            const width = x2 - x1;
            const height = y2 - y1;
            
            // Draw bounding box with a thicker line
            this.ctx.strokeStyle = '#00ff00';
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(x1, y1, width, height);
            
            // Draw label background with semi-transparency
            const label = `${detection.class} ${Math.round(detection.confidence * 100)}%`;
            this.ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
            this.ctx.font = '16px Arial';
            const textWidth = this.ctx.measureText(label).width;
            this.ctx.fillRect(x1, y1 - 20, textWidth + 4, 20);
            
            // Draw label text
            this.ctx.fillStyle = '#000000';
            this.ctx.fillText(label, x1 + 2, y1 - 5);
        });
    }
    
    updateCounts(counts) {
        this.countsElement.innerHTML = '';
        
        Object.entries(counts).forEach(([className, count]) => {
            const countItem = document.createElement('div');
            countItem.className = 'count-item';
            countItem.innerHTML = `
                <span class="class-name">${className}</span>
                <span class="count">${count}</span>
            `;
            this.countsElement.appendChild(countItem);
        });
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new ObjectDetector();
}); 