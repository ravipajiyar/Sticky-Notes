class Note {
    constructor(id, title, category, content, color, pinned, textColor, position, width, height) {
        this.id = id;
        this.title = title;
        this.category = category;
        this.content = content;
        this.color = color;
        this.pinned = pinned;
        this.textColor = textColor;
        this.position = position || { left: 0, top: 0 };
        this.width = width || '250px';
        this.height = height || '250px';
        this.element = null; // Will be set after creating the DOM element
    }
}

module.exports = Note;