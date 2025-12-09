// Stack: Manages character customization settings with localStorage persistence and event emission.

const STORAGE_KEY = 'campfire_customization';

const DEFAULT_SETTINGS = {
    headColor: '#f5d8b4',
    bodyColor: '#7a8899',
    clothing: 'Torso1',
    faceImage: null
};

class CustomizationManager extends EventTarget {
    constructor() {
        super();
        this.settings = this._load();
    }

    get headColor() {
        return this.settings.headColor;
    }

    get bodyColor() {
        return this.settings.bodyColor;
    }

    get clothing() {
        return this.settings.clothing;
    }

    get faceImage() {
        return this.settings.faceImage;
    }

    setHeadColor(color) {
        if (this.settings.headColor !== color) {
            this.settings.headColor = color;
            this._save();
            this._emit('change', { field: 'headColor', value: color });
        }
    }

    setBodyColor(color) {
        if (this.settings.bodyColor !== color) {
            this.settings.bodyColor = color;
            this._save();
            this._emit('change', { field: 'bodyColor', value: color });
        }
    }

    setClothing(clothing) {
        if (this.settings.clothing !== clothing) {
            this.settings.clothing = clothing;
            this._save();
            this._emit('change', { field: 'clothing', value: clothing });
        }
    }

    setFaceImage(imageDataUrl) {
        this.settings.faceImage = imageDataUrl;
        this._save();
        this._emit('change', { field: 'faceImage', value: imageDataUrl });
    }

    clearFaceImage() {
        this.settings.faceImage = null;
        this._save();
        this._emit('change', { field: 'faceImage', value: null });
    }

    getSettings() {
        return { ...this.settings };
    }

    reset() {
        this.settings = { ...DEFAULT_SETTINGS };
        this._save();
        this._emit('reset', this.settings);
    }

    _load() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                return { ...DEFAULT_SETTINGS, ...parsed };
            }
        } catch (error) {
            console.warn('Failed to load customization settings:', error);
        }
        return { ...DEFAULT_SETTINGS };
    }

    _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
        } catch (error) {
            console.warn('Failed to save customization settings:', error);
        }
    }

    _emit(type, detail) {
        this.dispatchEvent(new CustomEvent(type, { detail }));
    }
}

export const customizationManager = new CustomizationManager();
