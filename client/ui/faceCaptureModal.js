// Stack: Modal for capturing face image from camera or file upload with circular mask.

export class FaceCaptureModal {
    constructor() {
        this.modal = null;
        this.video = null;
        this.stream = null;
        this.resolveCallback = null;
        this.rejectCallback = null;
    }

    /**
     * Open modal for face capture.
     * @param {'camera' | 'upload'} mode - 'camera' for webcam, 'upload' for file picker
     * @returns {Promise<string | null>} Base64 image data URL or null if cancelled
     */
    async open(mode = 'camera') {
        return new Promise((resolve, reject) => {
            this.resolveCallback = resolve;
            this.rejectCallback = reject;

            if (mode === 'upload') {
                this._handleFileUpload();
            } else {
                this._createModal();
                this._startCamera();
            }
        });
    }

    _handleFileUpload() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (event) => {
            const file = event.target.files?.[0];
            if (!file) {
                this.resolveCallback?.(null);
                return;
            }

            try {
                const dataUrl = await this._fileToDataUrl(file);
                const croppedImage = await this._cropToCircle(dataUrl);
                this.resolveCallback?.(croppedImage);
            } catch (error) {
                console.error('Failed to process image:', error);
                this.resolveCallback?.(null);
            }
        };
        input.click();
    }

    _fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    _createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'face-capture-modal';
        this.modal.innerHTML = `
      <div class="face-capture-content">
        <h2>Capture Your Face</h2>
        <p class="hint">Position your face within the circle</p>
        <div class="face-capture-preview">
          <video autoplay playsinline muted></video>
          <div class="face-mask"></div>
          <div class="camera-loading">Starting camera...</div>
        </div>
        <div class="face-capture-actions">
          <button type="button" data-action="capture" class="primary" disabled>📸 Capture</button>
          <button type="button" data-action="cancel">Cancel</button>
        </div>
      </div>
    `;

        this.video = this.modal.querySelector('video');
        this.captureButton = this.modal.querySelector('[data-action="capture"]');
        this.loadingIndicator = this.modal.querySelector('.camera-loading');

        this.captureButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this._captureFrame();
        });

        this.modal.querySelector('[data-action="cancel"]').addEventListener('click', (e) => {
            e.stopPropagation();
            this._close();
            this.resolveCallback?.(null);
        });

        // Prevent clicking on content from closing modal
        this.modal.querySelector('.face-capture-content').addEventListener('click', (e) => {
            e.stopPropagation();
        });

        document.body.appendChild(this.modal);
    }

    async _startCamera() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } }
            });
            if (this.video && this.stream) {
                this.video.srcObject = this.stream;
                // Wait for video to be ready
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    if (this.loadingIndicator) {
                        this.loadingIndicator.style.display = 'none';
                    }
                    if (this.captureButton) {
                        this.captureButton.disabled = false;
                    }
                };
            }
        } catch (error) {
            console.error('Camera access denied:', error);
            if (this.loadingIndicator) {
                this.loadingIndicator.textContent = 'Camera access denied';
            }
            // Don't immediately close - let user click cancel
        }
    }

    async _captureFrame() {
        if (!this.video) return;

        const canvas = document.createElement('canvas');
        const size = 256;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            this._close();
            this.resolveCallback?.(null);
            return;
        }

        // Calculate center crop from video
        const vw = this.video.videoWidth;
        const vh = this.video.videoHeight;
        const cropSize = Math.min(vw, vh);
        const sx = (vw - cropSize) / 2;
        const sy = (vh - cropSize) / 2;

        // Draw cropped video frame
        ctx.drawImage(this.video, sx, sy, cropSize, cropSize, 0, 0, size, size);

        // Apply circular mask
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = size;
        tempCanvas.height = size;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
            tempCtx.beginPath();
            tempCtx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
            tempCtx.closePath();
            tempCtx.clip();
            tempCtx.drawImage(canvas, 0, 0);

            const dataUrl = tempCanvas.toDataURL('image/png');
            this._close();
            this.resolveCallback?.(dataUrl);
        }
    }

    async _cropToCircle(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const size = 256;
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve(dataUrl);
                    return;
                }

                // Calculate center crop
                const cropSize = Math.min(img.width, img.height);
                const sx = (img.width - cropSize) / 2;
                const sy = (img.height - cropSize) / 2;

                // Create circular mask
                ctx.beginPath();
                ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();

                // Draw cropped image
                ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, size, size);

                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => resolve(dataUrl);
            img.src = dataUrl;
        });
    }

    _close() {
        if (this.stream) {
            this.stream.getTracks().forEach((track) => track.stop());
            this.stream = null;
        }
        if (this.modal && this.modal.parentElement) {
            this.modal.parentElement.removeChild(this.modal);
            this.modal = null;
        }
        this.video = null;
    }
}

export const faceCaptureModal = new FaceCaptureModal();
