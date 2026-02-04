/**
 * Ghostwriter Pro - A typewriter application for reMarkable Paper Pro
 *
 * aitransform.cpp - AI text transformation coordinator implementation
 *
 * Copyright (c) 2026 tobsai
 * Licensed under MIT License
 */

#include "aitransform.h"
#include "editor.h"
#include <QDebug>

AITransform::AITransform(QObject *parent)
    : QObject(parent)
    , m_editor(nullptr)
    , m_config(new AIConfig(this))
    , m_client(new AIClient(this))
    , m_renderer(new MermaidRenderer(this))
    , m_selectionStart(-1)
    , m_selectionEnd(-1)
    , m_lastResultIsMermaid(false)
    , m_busy(false)
{
    // Wire up client
    m_client->setConfig(m_config);
    
    connect(m_client, &AIClient::transformComplete,
            this, &AITransform::onTransformComplete);
    connect(m_client, &AIClient::transformError,
            this, &AITransform::onTransformError);
    connect(m_client, &AIClient::busyChanged,
            this, &AITransform::busyChanged);
    connect(m_client, &AIClient::statusMessageChanged, this, [this]() {
        setStatusMessage(m_client->statusMessage());
    });
    
    // Wire up renderer
    connect(m_renderer, &MermaidRenderer::renderComplete,
            this, &AITransform::onRenderComplete);
    connect(m_renderer, &MermaidRenderer::renderError,
            this, &AITransform::onRenderError);
    
    // Config changes
    connect(m_config, &AIConfig::configChanged,
            this, &AITransform::configChanged);
}

void AITransform::setEditor(Editor *editor)
{
    m_editor = editor;
}

void AITransform::setConfigDirectory(const QString &path)
{
    m_config->setConfigDirectory(path);
    m_renderer->setCacheDirectory(path);
}

bool AITransform::isBusy() const
{
    return m_client->isBusy() || m_renderer->isRendering();
}

bool AITransform::hasSelection() const
{
    return m_selectionStart >= 0 && m_selectionEnd > m_selectionStart;
}

QString AITransform::selectedText() const
{
    return m_selectedText;
}

QString AITransform::statusMessage() const
{
    return m_statusMessage;
}

bool AITransform::isConfigured() const
{
    return m_config->isConfigured();
}

QVariantList AITransform::promptTemplates() const
{
    return m_config->promptTemplatesVariant();
}

QString AITransform::lastResult() const
{
    return m_lastResult;
}

bool AITransform::lastResultIsMermaid() const
{
    return m_lastResultIsMermaid;
}

QString AITransform::lastMermaidImagePath() const
{
    return m_lastMermaidImagePath;
}

void AITransform::setStatusMessage(const QString &message)
{
    if (m_statusMessage != message) {
        m_statusMessage = message;
        emit statusMessageChanged();
    }
}

void AITransform::setSelection(int start, int end)
{
    if (!m_editor) return;
    
    // Validate bounds
    QString content = m_editor->content();
    start = qBound(0, start, content.length());
    end = qBound(0, end, content.length());
    
    if (start > end) {
        qSwap(start, end);
    }
    
    m_selectionStart = start;
    m_selectionEnd = end;
    m_selectedText = content.mid(start, end - start);
    
    emit selectionChanged();
}

void AITransform::clearSelection()
{
    m_selectionStart = -1;
    m_selectionEnd = -1;
    m_selectedText.clear();
    emit selectionChanged();
}

void AITransform::transform(const QString &promptTemplateId, const QString &customPrompt)
{
    if (!hasSelection()) {
        emit showError("No text selected");
        return;
    }
    
    if (!isConfigured()) {
        emit showSettings();
        return;
    }
    
    // Hide palette and start transform
    emit hidePromptPalette();
    
    m_client->transform(m_selectedText, promptTemplateId, customPrompt);
}

void AITransform::cancel()
{
    m_client->cancel();
    m_renderer->cancel();
    setStatusMessage("");
}

void AITransform::onTransformComplete(const AIResponse &response)
{
    m_lastResult = response.content;
    m_lastResultIsMermaid = response.isMermaid;
    m_lastMermaidCode = response.mermaidCode;
    m_lastMermaidImagePath.clear();
    
    emit resultChanged();
    
    if (response.isMermaid && !response.mermaidCode.isEmpty()) {
        // Render the Mermaid diagram
        setStatusMessage("Rendering diagram...");
        m_renderer->render(response.mermaidCode, "svg");
    } else {
        // Show text result directly
        emit showResult(m_lastResult, false, QString());
        emit transformComplete();
    }
}

void AITransform::onTransformError(const QString &error)
{
    setStatusMessage("");
    emit showError(error);
}

void AITransform::onRenderComplete(const QString &imagePath)
{
    setStatusMessage("");
    m_lastMermaidImagePath = imagePath;
    emit resultChanged();
    emit showResult(m_lastResult, true, imagePath);
    emit transformComplete();
}

void AITransform::onRenderError(const QString &error)
{
    setStatusMessage("");
    
    // Fall back to text representation of Mermaid
    if (!m_lastMermaidCode.isEmpty()) {
        QString textFallback = m_renderer->renderToText(m_lastMermaidCode);
        m_lastResult = textFallback;
        m_lastResultIsMermaid = false;
        emit resultChanged();
        emit showResult(m_lastResult, false, QString());
        emit transformComplete();
    } else {
        emit showError("Diagram rendering failed: " + error);
    }
}

void AITransform::acceptResult()
{
    replaceSelection();
}

void AITransform::replaceSelection()
{
    if (!m_editor || !hasSelection() || m_lastResult.isEmpty()) return;
    
    // Get current content
    QString content = m_editor->content();
    
    // Replace selection
    QString before = content.left(m_selectionStart);
    QString after = content.mid(m_selectionEnd);
    
    // For Mermaid with image, insert markdown image reference or the code block
    QString insertText;
    if (m_lastResultIsMermaid && !m_lastMermaidImagePath.isEmpty()) {
        // Insert as markdown image and code block
        insertText = QString("![diagram](%1)\n\n```mermaid\n%2\n```")
            .arg(m_lastMermaidImagePath, m_lastMermaidCode);
    } else {
        insertText = m_lastResult;
    }
    
    m_editor->setContent(before + insertText + after);
    m_editor->setCursorPosition(m_selectionStart + insertText.length());
    
    // Clear state
    clearSelection();
    m_lastResult.clear();
    m_lastMermaidCode.clear();
    m_lastMermaidImagePath.clear();
    m_lastResultIsMermaid = false;
    emit resultChanged();
}

void AITransform::insertAfterSelection()
{
    if (!m_editor || !hasSelection() || m_lastResult.isEmpty()) return;
    
    QString content = m_editor->content();
    
    // Insert after selection
    QString before = content.left(m_selectionEnd);
    QString after = content.mid(m_selectionEnd);
    
    // Add separator
    QString insertText = "\n\n" + m_lastResult;
    
    if (m_lastResultIsMermaid && !m_lastMermaidImagePath.isEmpty()) {
        insertText = QString("\n\n![diagram](%1)\n\n```mermaid\n%2\n```")
            .arg(m_lastMermaidImagePath, m_lastMermaidCode);
    }
    
    m_editor->setContent(before + insertText + after);
    m_editor->setCursorPosition(m_selectionEnd + insertText.length());
    
    // Clear state
    clearSelection();
    m_lastResult.clear();
    m_lastMermaidCode.clear();
    m_lastMermaidImagePath.clear();
    m_lastResultIsMermaid = false;
    emit resultChanged();
}

void AITransform::discardResult()
{
    m_lastResult.clear();
    m_lastMermaidCode.clear();
    m_lastMermaidImagePath.clear();
    m_lastResultIsMermaid = false;
    emit resultChanged();
}

void AITransform::openSettings()
{
    emit showSettings();
}
