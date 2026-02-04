/**
 * Ghostwriter Pro - A typewriter application for reMarkable Paper Pro
 *
 * editor.cpp - Text editor core implementation
 *
 * Copyright (c) 2026 tobsai
 * Licensed under MIT License
 */

#include "editor.h"
#include <QFile>
#include <QTextStream>
#include <QFileInfo>
#include <QDebug>

Editor::Editor(QObject *parent)
    : QObject(parent)
    , m_cursorPosition(0)
    , m_modified(false)
    , m_fontSize(DEFAULT_FONT_SIZE)
{
}

QString Editor::content() const
{
    return m_content;
}

int Editor::cursorPosition() const
{
    return m_cursorPosition;
}

QString Editor::currentFile() const
{
    return m_currentFile;
}

bool Editor::isModified() const
{
    return m_modified;
}

int Editor::fontSize() const
{
    return m_fontSize;
}

void Editor::setContent(const QString &content)
{
    if (m_content != content) {
        addToHistory();
        m_content = content;
        m_cursorPosition = qMin(m_cursorPosition, m_content.length());
        emit contentChanged();
        markModified();
    }
}

void Editor::setCursorPosition(int position)
{
    position = qBound(0, position, m_content.length());
    if (m_cursorPosition != position) {
        m_cursorPosition = position;
        emit cursorPositionChanged();
    }
}

void Editor::setFontSize(int size)
{
    size = qBound(MIN_FONT_SIZE, size, MAX_FONT_SIZE);
    if (m_fontSize != size) {
        m_fontSize = size;
        emit fontSizeChanged();
    }
}

void Editor::newDocument()
{
    m_content.clear();
    m_cursorPosition = 0;
    m_currentFile.clear();
    m_modified = false;
    m_undoStack.clear();
    m_redoStack.clear();

    emit contentChanged();
    emit cursorPositionChanged();
    emit currentFileChanged();
    emit modifiedChanged();
}

bool Editor::loadDocument(const QString &filePath)
{
    QFile file(filePath);
    if (!file.open(QIODevice::ReadOnly | QIODevice::Text)) {
        emit errorOccurred(tr("Could not open file: %1").arg(filePath));
        return false;
    }

    QTextStream in(&file);
    in.setCodec("UTF-8");
    m_content = in.readAll();
    file.close();

    m_cursorPosition = 0;
    m_currentFile = filePath;
    m_modified = false;
    m_undoStack.clear();
    m_redoStack.clear();

    emit contentChanged();
    emit cursorPositionChanged();
    emit currentFileChanged();
    emit modifiedChanged();

    QFileInfo fileInfo(filePath);
    emit documentLoaded(fileInfo.fileName());

    return true;
}

bool Editor::saveDocument()
{
    if (m_currentFile.isEmpty()) {
        emit errorOccurred(tr("No file path specified"));
        return false;
    }
    return saveDocumentAs(m_currentFile);
}

bool Editor::saveDocumentAs(const QString &filePath)
{
    QFile file(filePath);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Text)) {
        emit errorOccurred(tr("Could not save file: %1").arg(filePath));
        return false;
    }

    QTextStream out(&file);
    out.setCodec("UTF-8");
    out << m_content;
    file.close();

    m_currentFile = filePath;
    m_modified = false;

    emit currentFileChanged();
    emit modifiedChanged();
    emit documentSaved();

    return true;
}

void Editor::insertText(const QString &text)
{
    if (text.isEmpty()) return;

    addToHistory();

    m_content.insert(m_cursorPosition, text);
    m_cursorPosition += text.length();

    emit contentChanged();
    emit cursorPositionChanged();
    markModified();
}

void Editor::deleteChar()
{
    if (m_cursorPosition >= m_content.length()) return;

    addToHistory();

    m_content.remove(m_cursorPosition, 1);

    emit contentChanged();
    markModified();
}

void Editor::backspace()
{
    if (m_cursorPosition <= 0) return;

    addToHistory();

    m_cursorPosition--;
    m_content.remove(m_cursorPosition, 1);

    emit contentChanged();
    emit cursorPositionChanged();
    markModified();
}

void Editor::newLine()
{
    insertText("\n");
}

void Editor::moveCursorLeft()
{
    if (m_cursorPosition > 0) {
        m_cursorPosition--;
        emit cursorPositionChanged();
    }
}

void Editor::moveCursorRight()
{
    if (m_cursorPosition < m_content.length()) {
        m_cursorPosition++;
        emit cursorPositionChanged();
    }
}

void Editor::moveCursorUp()
{
    // Find current line start
    int lineStart = m_content.lastIndexOf('\n', m_cursorPosition - 1) + 1;
    if (lineStart <= 0) return; // Already on first line

    // Find previous line start
    int prevLineStart = m_content.lastIndexOf('\n', lineStart - 2) + 1;

    // Calculate column in current line
    int column = m_cursorPosition - lineStart;

    // Calculate previous line length
    int prevLineLength = lineStart - 1 - prevLineStart;

    // Move to same column in previous line, or end if shorter
    m_cursorPosition = prevLineStart + qMin(column, prevLineLength);
    emit cursorPositionChanged();
}

void Editor::moveCursorDown()
{
    // Find next line start
    int nextLineStart = m_content.indexOf('\n', m_cursorPosition);
    if (nextLineStart == -1) return; // Already on last line
    nextLineStart++; // Move past the newline

    // Find current line start
    int lineStart = m_content.lastIndexOf('\n', m_cursorPosition - 1) + 1;

    // Calculate column in current line
    int column = m_cursorPosition - lineStart;

    // Find next line end
    int nextLineEnd = m_content.indexOf('\n', nextLineStart);
    if (nextLineEnd == -1) nextLineEnd = m_content.length();

    // Calculate next line length
    int nextLineLength = nextLineEnd - nextLineStart;

    // Move to same column in next line, or end if shorter
    m_cursorPosition = nextLineStart + qMin(column, nextLineLength);
    emit cursorPositionChanged();
}

void Editor::moveCursorToLineStart()
{
    int lineStart = m_content.lastIndexOf('\n', m_cursorPosition - 1) + 1;
    if (m_cursorPosition != lineStart) {
        m_cursorPosition = lineStart;
        emit cursorPositionChanged();
    }
}

void Editor::moveCursorToLineEnd()
{
    int lineEnd = m_content.indexOf('\n', m_cursorPosition);
    if (lineEnd == -1) lineEnd = m_content.length();
    if (m_cursorPosition != lineEnd) {
        m_cursorPosition = lineEnd;
        emit cursorPositionChanged();
    }
}

void Editor::undo()
{
    if (m_undoStack.isEmpty()) return;

    m_redoStack.append(m_content);
    m_content = m_undoStack.takeLast();
    m_cursorPosition = qMin(m_cursorPosition, m_content.length());

    emit contentChanged();
    emit cursorPositionChanged();
    markModified();
}

void Editor::redo()
{
    if (m_redoStack.isEmpty()) return;

    m_undoStack.append(m_content);
    m_content = m_redoStack.takeLast();
    m_cursorPosition = qMin(m_cursorPosition, m_content.length());

    emit contentChanged();
    emit cursorPositionChanged();
    markModified();
}

bool Editor::canUndo() const
{
    return !m_undoStack.isEmpty();
}

bool Editor::canRedo() const
{
    return !m_redoStack.isEmpty();
}

void Editor::increaseFontSize()
{
    setFontSize(m_fontSize + 2);
}

void Editor::decreaseFontSize()
{
    setFontSize(m_fontSize - 2);
}

void Editor::addToHistory()
{
    m_undoStack.append(m_content);
    if (m_undoStack.size() > MAX_HISTORY) {
        m_undoStack.removeFirst();
    }
    m_redoStack.clear();
}

void Editor::markModified()
{
    if (!m_modified) {
        m_modified = true;
        emit modifiedChanged();
    }
}
