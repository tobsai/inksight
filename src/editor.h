/**
 * Ghostwriter Pro - A typewriter application for reMarkable Paper Pro
 *
 * editor.h - Text editor core functionality
 *
 * Copyright (c) 2026 tobsai
 * Licensed under MIT License
 */

#ifndef EDITOR_H
#define EDITOR_H

#include <QObject>
#include <QString>
#include <QStringList>

/**
 * @brief The Editor class provides core text editing functionality.
 *
 * This class manages the document content, cursor position, and edit history.
 * It exposes properties and methods to QML for the user interface.
 */
class Editor : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QString content READ content WRITE setContent NOTIFY contentChanged)
    Q_PROPERTY(int cursorPosition READ cursorPosition WRITE setCursorPosition NOTIFY cursorPositionChanged)
    Q_PROPERTY(QString currentFile READ currentFile NOTIFY currentFileChanged)
    Q_PROPERTY(bool modified READ isModified NOTIFY modifiedChanged)
    Q_PROPERTY(int fontSize READ fontSize WRITE setFontSize NOTIFY fontSizeChanged)
    Q_PROPERTY(int selectionStart READ selectionStart WRITE setSelectionStart NOTIFY selectionChanged)
    Q_PROPERTY(int selectionEnd READ selectionEnd WRITE setSelectionEnd NOTIFY selectionChanged)
    Q_PROPERTY(bool hasSelection READ hasSelection NOTIFY selectionChanged)
    Q_PROPERTY(QString selectedText READ selectedText NOTIFY selectionChanged)

public:
    explicit Editor(QObject *parent = nullptr);

    // Property getters
    QString content() const;
    int cursorPosition() const;
    QString currentFile() const;
    bool isModified() const;
    int fontSize() const;
    int selectionStart() const;
    int selectionEnd() const;
    bool hasSelection() const;
    QString selectedText() const;

    // Property setters
    void setContent(const QString &content);
    void setCursorPosition(int position);
    void setFontSize(int size);
    void setSelectionStart(int position);
    void setSelectionEnd(int position);

public slots:
    // Document operations
    void newDocument();
    bool loadDocument(const QString &filePath);
    bool saveDocument();
    bool saveDocumentAs(const QString &filePath);

    // Edit operations
    void insertText(const QString &text);
    void deleteChar();
    void backspace();
    void newLine();

    // Cursor movement
    void moveCursorLeft();
    void moveCursorRight();
    void moveCursorUp();
    void moveCursorDown();
    void moveCursorToLineStart();
    void moveCursorToLineEnd();

    // Undo/Redo
    void undo();
    void redo();
    bool canUndo() const;
    bool canRedo() const;

    // Font size
    void increaseFontSize();
    void decreaseFontSize();

    // Selection
    void setSelection(int start, int end);
    void selectAll();
    void selectWord();
    void selectLine();
    void selectParagraph();
    void clearSelection();
    void extendSelectionLeft();
    void extendSelectionRight();
    void extendSelectionUp();
    void extendSelectionDown();
    void extendSelectionToLineStart();
    void extendSelectionToLineEnd();

signals:
    void contentChanged();
    void cursorPositionChanged();
    void currentFileChanged();
    void modifiedChanged();
    void fontSizeChanged();
    void selectionChanged();
    void documentSaved();
    void documentLoaded(const QString &fileName);
    void errorOccurred(const QString &message);

private:
    void addToHistory();
    void markModified();

    QString m_content;
    int m_cursorPosition;
    QString m_currentFile;
    bool m_modified;
    int m_fontSize;
    int m_selectionStart;
    int m_selectionEnd;

    // Undo/Redo stacks
    QStringList m_undoStack;
    QStringList m_redoStack;
    static const int MAX_HISTORY = 100;

    // Font size limits
    static const int MIN_FONT_SIZE = 12;
    static const int MAX_FONT_SIZE = 48;
    static const int DEFAULT_FONT_SIZE = 18;
};

#endif // EDITOR_H
