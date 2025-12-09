// Stack: 2D character preview renderer on a canvas element.

const CANVAS_WIDTH = 200;
const CANVAS_HEIGHT = 280;

// Clothing textures cache
const clothingImages = new Map();

function loadClothingImage(clothingId) {
    if (clothingImages.has(clothingId)) {
        return Promise.resolve(clothingImages.get(clothingId));
    }
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            clothingImages.set(clothingId, img);
            resolve(img);
        };
        img.onerror = () => {
            resolve(null);
        };
        img.src = `/assets/characters/${clothingId}.png`;
    });
}

export class CharacterPreview {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.settings = {
            headColor: '#f5d8b4',
            bodyColor: '#7a8899',
            clothing: 'Torso1',
            faceImage: null
        };
        this.faceImageElement = null;
        this.clothingImageElement = null;
    }

    async updateSettings(newSettings) {
        const oldClothing = this.settings.clothing;
        const oldFace = this.settings.faceImage;

        this.settings = { ...this.settings, ...newSettings };

        // Load clothing image if changed
        if (this.settings.clothing !== oldClothing && this.settings.clothing && this.settings.clothing !== 'none') {
            this.clothingImageElement = await loadClothingImage(this.settings.clothing);
        } else if (this.settings.clothing === 'none') {
            this.clothingImageElement = null;
        }

        // Load face image if changed
        if (this.settings.faceImage !== oldFace) {
            if (this.settings.faceImage) {
                this.faceImageElement = await this._loadImage(this.settings.faceImage);
            } else {
                this.faceImageElement = null;
            }
        }

        this.render();
    }

    _loadImage(src) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = src;
        });
    }

    render() {
        const ctx = this.ctx;
        const w = CANVAS_WIDTH;
        const h = CANVAS_HEIGHT;

        // Clear
        ctx.clearRect(0, 0, w, h);

        // Background gradient
        const gradient = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, h / 2);
        gradient.addColorStop(0, 'rgba(30, 35, 50, 0.6)');
        gradient.addColorStop(1, 'rgba(10, 14, 24, 0.9)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);

        const centerX = w / 2;

        // Draw legs
        this._drawLimb(centerX - 18, 220, 14, 50, '#bfccd4');
        this._drawLimb(centerX + 18, 220, 14, 50, '#bfccd4');

        // Draw arms
        this._drawLimb(centerX - 48, 130, 11, 55, '#bfccd4');
        this._drawLimb(centerX + 48, 130, 11, 55, '#bfccd4');

        // Draw body/torso
        this._drawTorso(centerX, 140, 45, 80);

        // Draw head
        this._drawHead(centerX, 80, 38);

        // Draw clothing overlay if available
        if (this.clothingImageElement && this.settings.clothing !== 'none') {
            this._drawClothingOverlay(centerX, 140, 90, 100);
        }
    }

    _drawLimb(x, y, radius, length, color) {
        const ctx = this.ctx;
        ctx.fillStyle = color;
        ctx.beginPath();
        // Rounded capsule shape
        ctx.arc(x, y - length / 2 + radius, radius, Math.PI, 0);
        ctx.lineTo(x + radius, y + length / 2 - radius);
        ctx.arc(x, y + length / 2 - radius, radius, 0, Math.PI);
        ctx.closePath();
        ctx.fill();
    }

    _drawTorso(cx, cy, radiusX, height) {
        const ctx = this.ctx;
        const bodyColor = this.settings.bodyColor;

        // Draw as rounded rectangle/ellipse shape
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        // Top ellipse
        ctx.ellipse(cx, cy - height / 2 + radiusX * 0.8, radiusX * 0.85, radiusX * 0.6, 0, Math.PI, 0);
        // Sides
        ctx.lineTo(cx + radiusX, cy + height / 2 - radiusX * 0.5);
        // Bottom ellipse  
        ctx.ellipse(cx, cy + height / 2 - radiusX * 0.5, radiusX, radiusX * 0.6, 0, 0, Math.PI);
        ctx.closePath();
        ctx.fill();

        // Add subtle shading
        const shadeGradient = ctx.createLinearGradient(cx - radiusX, cy, cx + radiusX, cy);
        shadeGradient.addColorStop(0, 'rgba(0, 0, 0, 0.15)');
        shadeGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
        shadeGradient.addColorStop(1, 'rgba(0, 0, 0, 0.15)');
        ctx.fillStyle = shadeGradient;
        ctx.fill();
    }

    _drawHead(cx, cy, radius) {
        const ctx = this.ctx;
        const headColor = this.settings.headColor;

        // Base head circle
        ctx.fillStyle = headColor;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        // Add subtle shading
        const shadeGradient = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, 0, cx, cy, radius);
        shadeGradient.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
        shadeGradient.addColorStop(0.7, 'rgba(0, 0, 0, 0)');
        shadeGradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
        ctx.fillStyle = shadeGradient;
        ctx.fill();

        // Draw face image if available (front half only)
        if (this.faceImageElement) {
            ctx.save();
            ctx.beginPath();
            // Create circular mask for face
            ctx.arc(cx, cy, radius * 0.9, 0, Math.PI * 2);
            ctx.clip();

            // Draw face image centered
            const faceSize = radius * 1.8;
            ctx.drawImage(
                this.faceImageElement,
                cx - faceSize / 2,
                cy - faceSize / 2,
                faceSize,
                faceSize
            );
            ctx.restore();
        }
    }

    _drawClothingOverlay(cx, cy, width, height) {
        if (!this.clothingImageElement) return;

        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.drawImage(
            this.clothingImageElement,
            cx - width / 2,
            cy - height / 2,
            width,
            height
        );
        ctx.restore();
    }
}
